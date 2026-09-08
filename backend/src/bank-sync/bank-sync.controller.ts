/**
 * The bank sync as HTTP.
 *
 * Every route is scoped to the caller: a connection, a link and a transaction
 * all belong to one user, and none of them is reachable by id alone.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import type { Request } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { User } from '../generated/prisma'
import { BankSyncService } from './bank-sync.service'
import {
  EnableBankingCredentialsService,
  InvalidEnableBankingCredentialsError,
} from './enable-banking-credentials.service'
import type {
  BankSyncRunSummary,
  ConnectionView,
  DiscoveredAccount,
  ReassignmentOutcome,
  SyncOutcome,
  UndoRunOutcome,
} from './bank-sync.service'
import type { PsuContext } from './enable-banking.client'
import {
  CompleteAuthorizationDto,
  ReassignLinkDto,
  SaveEnableBankingCredentialDto,
  StartAuthorizationDto,
  UpdateBankAccountLinkDto,
} from './dto/bank-sync.dto'

/**
 * The shape of what `FileInterceptor` hands a handler. `@types/multer` is not
 * a dependency of this backend, and a `.pem` upload needs nothing else it
 * would provide.
 */
interface UploadedPemFile {
  buffer: Buffer
  originalname: string
  size: number
}

/**
 * Who is at the keyboard, told to the bank as `Psu-*` headers.
 *
 * A data read carrying them is "the user is present" and escapes PSD2's
 * four-unattended-reads-a-day; without them, even a button press counts as a
 * background fetch. `req.ip` is the real client behind the proxy — main.ts
 * sets `trust proxy`.
 */
function psuOf(req: Request): PsuContext {
  return {
    ...(req.ip ? { ipAddress: req.ip } : {}),
    ...(req.headers['user-agent']
      ? { userAgent: req.headers['user-agent'] }
      : {}),
  }
}

@ApiTags('bank-sync')
@ApiBearerAuth()
@Controller('bank-sync')
@UseGuards(SupabaseGuard)
export class BankSyncController {
  constructor(
    private readonly bankSync: BankSyncService,
    private readonly credentials: EnableBankingCredentialsService
  ) {}

  @Get('status')
  @ApiOperation({
    summary: 'Whether this user can sync at all',
    description:
      'False until this user has configured their own Enable Banking ' +
      'application; the interface asks this before offering to connect a ' +
      'bank.',
  })
  async status(@CurrentUser() user: User): Promise<{ configured: boolean }> {
    return { configured: await this.bankSync.isConfigured(user.id) }
  }

  @Get('credentials')
  @ApiOperation({
    summary: "This user's own Enable Banking application, if any",
    description:
      'Never returns the private key — only whether one is set up, and the ' +
      'application id, which the Control Panel already shows in plain text.',
  })
  async credentialStatus(
    @CurrentUser() user: User
  ): Promise<{ applicationId: string | null }> {
    const own = await this.credentials.hasOwnCredentials(user.id)
    return { applicationId: own?.applicationId ?? null }
  }

  @Put('credentials')
  // Kept in memory, never written to disk — and bounded: an RSA .pem is
  // ~2 KB, so 16 KB is generous, and without a ceiling any authenticated
  // caller could buffer gigabytes into this process's memory.
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 16 * 1024, files: 1 } })
  )
  @ApiOperation({
    summary: 'Save this user’s Enable Banking application',
    description:
      'The application id, plus the .pem private key downloaded once from ' +
      'the Control Panel. Rejected outright if the key cannot actually sign ' +
      'a request, before anything is stored.',
  })
  async saveCredentials(
    @CurrentUser() user: User,
    @Body() dto: SaveEnableBankingCredentialDto,
    @UploadedFile() file?: UploadedPemFile
  ): Promise<{ applicationId: string | null }> {
    if (!file) {
      throw new BadRequestException('The .pem private key file is required.')
    }
    try {
      await this.credentials.save(
        user.id,
        dto.applicationId,
        file.buffer.toString('utf8')
      )
    } catch (error) {
      if (error instanceof InvalidEnableBankingCredentialsError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }
    return { applicationId: dto.applicationId }
  }

  @Delete('credentials')
  @ApiOperation({
    summary: 'Remove this user’s Enable Banking application',
    description:
      'This user cannot sync again until they configure another one — ' +
      'there is no server default to fall back to.',
  })
  async removeCredentials(@CurrentUser() user: User): Promise<void> {
    await this.credentials.remove(user.id)
  }

  @Get('aspsps')
  @ApiOperation({
    summary: 'The banks that can be connected',
    description:
      'Beta implementations are flagged rather than withheld: a bank absent ' +
      'from the list with no explanation is worse than one shown with a ' +
      'caveat.',
  })
  banks(
    @CurrentUser() user: User,
    @Query('country') country?: string
  ): Promise<
    {
      name: string
      country: string
      beta: boolean
      logo: string | null
    }[]
  > {
    return this.bankSync.listBanks(user.id, country ?? 'FR')
  }

  @Get('connections')
  @ApiOperation({ summary: 'The banks connected, and what each would do now' })
  list(@CurrentUser() user: User): Promise<ConnectionView[]> {
    return this.bankSync.listConnections(user.id)
  }

  @Get('connections/:id')
  @ApiOperation({ summary: 'One bank, its accounts and their proposals' })
  one(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<ConnectionView> {
    return this.bankSync.viewConnection(user.id, id)
  }

  @Get('needs-review')
  @ApiOperation({
    summary: 'Accounts still carrying a row a sync claimed and then lost',
    description:
      'A row cleared to "aucun", or a correction still pending on the ' +
      'other side of a swap, stays real money on a real account — this ' +
      'says which accounts have some, and how many.',
  })
  needsReview(
    @CurrentUser() user: User
  ): Promise<{ accountId: string; accountLabel: string; count: number }[]> {
    return this.bankSync.needsReview(user.id)
  }

  @Get('runs')
  @ApiOperation({
    summary: 'Every sync this user has run, most recent first',
    description:
      'The same idea as the CSV import history: what a run wrote, and — ' +
      'once undone — that it was.',
  })
  listRuns(@CurrentUser() user: User): Promise<BankSyncRunSummary[]> {
    return this.bankSync.listRuns(user.id)
  }

  @Post('runs/:id/undo/preview')
  @ApiOperation({
    summary: 'What undoing a run would do, without doing it',
  })
  previewUndoRun(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<UndoRunOutcome> {
    return this.bankSync.previewUndoRun(user.id, id)
  }

  @Post('runs/:id/undo')
  @ApiOperation({
    summary: 'Undo a sync run',
    description:
      'Deletes what it inserted, unlinks what it only claimed — restoring ' +
      'a CSV row to exactly how it stood before, never deleting it. A row ' +
      'that has since gained a reimbursement, a tag, a settlement or a ' +
      'payment is left alone rather than taken silently.',
  })
  undoRun(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<UndoRunOutcome> {
    return this.bankSync.undoRun(user.id, id)
  }

  @Post('connections')
  @ApiOperation({
    summary: 'Begin authorising a bank',
    description:
      'Returns the URL the user must visit. Nothing is recorded until they ' +
      'come back with a code — an authorization abandoned halfway leaves no ' +
      'half-made connection behind.',
  })
  start(
    @CurrentUser() user: User,
    @Body() dto: StartAuthorizationDto
  ): Promise<{ url: string; state: string }> {
    return this.bankSync.startAuthorization(user.id, {
      aspspName: dto.aspspName,
      country: dto.country ?? 'FR',
      redirectUrl: dto.redirectUrl,
    })
  }

  @Post('connections/callback')
  @ApiOperation({
    summary: 'Finish authorising, and discover the accounts',
    description:
      'Reads each account’s name, IBAN and ISO 20022 type and stores them. ' +
      'Nothing is ingested: every account arrives switched off, which is the ' +
      'defence against a card account being read beside the account it ' +
      'settles onto.',
  })
  complete(
    @CurrentUser() user: User,
    @Body() dto: CompleteAuthorizationDto,
    @Req() req: Request
  ): Promise<ConnectionView> {
    return this.bankSync.completeAuthorization(
      user.id,
      dto.code,
      dto.state,
      psuOf(req)
    )
  }

  @Patch('links/:id')
  @ApiOperation({
    summary: 'Say what a bank account is, and whether to read it',
  })
  updateLink(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountLinkDto
  ): Promise<DiscoveredAccount> {
    return this.bankSync.updateLink(user.id, id, {
      ...(dto.accountId !== undefined && { accountId: dto.accountId }),
      ...(dto.isIngested !== undefined && { isIngested: dto.isIngested }),
    })
  }

  @Post('links/:id/reassignment/preview')
  @ApiOperation({
    summary: 'What correcting a link would do, without doing it',
    description:
      'A past sync may already have written under the wrong account. This ' +
      'reports what fixing that would move, merge, unlink or leave alone — ' +
      'nothing is written.',
  })
  previewReassignment(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ReassignLinkDto
  ): Promise<ReassignmentOutcome> {
    return this.bankSync.previewLinkReassignment(user.id, id, dto.accountId)
  }

  @Post('links/:id/reassignment')
  @ApiOperation({
    summary: 'Correct which account a bank account is',
    description:
      'Beyond redirecting the next sync: an inserted transaction under the ' +
      'old account is reconciled against the corrected one, and a CSV row ' +
      'claimed there by coincidence loses the reference it never earned. A ' +
      'row that has since gained a tag, a reimbursement, a settlement or a ' +
      'payment is left alone rather than merged away.',
  })
  reassignLink(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ReassignLinkDto
  ): Promise<ReassignmentOutcome> {
    return this.bankSync.reassignLink(user.id, id, dto.accountId)
  }

  @Post('connections/:id/sync')
  @ApiOperation({
    summary: 'Read the bank now',
    description:
      'Refuses rather than fails when the bank will not answer: a lapsed ' +
      'consent asks for a reconnection, an exhausted daily quota says so.',
  })
  sync(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Req() req: Request
  ): Promise<SyncOutcome> {
    return this.bankSync.sync(user.id, id, psuOf(req))
  }
}
