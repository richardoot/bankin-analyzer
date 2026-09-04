/**
 * The bank sync as HTTP.
 *
 * Every route is scoped to the caller: a connection, a link and a transaction
 * all belong to one user, and none of them is reachable by id alone.
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { User } from '../generated/prisma'
import { BankSyncService } from './bank-sync.service'
import type {
  ConnectionView,
  DiscoveredAccount,
  SyncOutcome,
} from './bank-sync.service'
import {
  CompleteAuthorizationDto,
  StartAuthorizationDto,
  UpdateBankAccountLinkDto,
} from './dto/bank-sync.dto'

@ApiTags('bank-sync')
@ApiBearerAuth()
@Controller('bank-sync')
@UseGuards(SupabaseGuard)
export class BankSyncController {
  constructor(private readonly bankSync: BankSyncService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Whether this server can sync at all',
    description:
      'A backend whose owner has not configured Enable Banking serves ' +
      'everything else normally; the interface asks this before offering to ' +
      'connect a bank.',
  })
  status(): { configured: boolean } {
    return { configured: this.bankSync.isConfigured() }
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
    @Body() dto: CompleteAuthorizationDto
  ): Promise<ConnectionView> {
    return this.bankSync.completeAuthorization(user.id, dto.code)
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

  @Post('connections/:id/sync')
  @ApiOperation({
    summary: 'Read the bank now',
    description:
      'Refuses rather than fails when the bank will not answer: a lapsed ' +
      'consent asks for a reconnection, an exhausted daily quota says so.',
  })
  sync(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<SyncOutcome> {
    return this.bankSync.sync(user.id, id)
  }
}
