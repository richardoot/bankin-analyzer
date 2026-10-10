import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { RecurrencesService } from './recurrences.service'
import {
  LinkTransactionDto,
  MarkTransactionRecurringDto,
  RenameRecurrenceDto,
  RecurrenceListDto,
  SetRecurrenceDecisionDto,
} from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('recurrences')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('recurrences')
export class RecurrencesController {
  constructor(private readonly recurrencesService: RecurrencesService) {}

  @Get()
  @ApiOperation({
    summary: 'Recurring charges detected in the expenses, with their totals',
  })
  @ApiResponse({ status: 200, type: RecurrenceListDto })
  async list(@CurrentUser() user: User): Promise<RecurrenceListDto> {
    return this.recurrencesService.list(user.id)
  }

  @Put('decisions')
  @ApiOperation({
    summary: 'Confirm or dismiss a recurring charge, then recompute',
  })
  @ApiResponse({ status: 200, type: RecurrenceListDto })
  async setDecision(
    @CurrentUser() user: User,
    @Body() dto: SetRecurrenceDecisionDto
  ): Promise<RecurrenceListDto> {
    return this.recurrencesService.setDecision(user.id, dto)
  }

  @Post('from-transaction')
  @ApiOperation({
    summary:
      'Mark one expense as a recurring charge on a given rhythm, then recompute',
  })
  @ApiResponse({ status: 201, type: RecurrenceListDto })
  async markTransaction(
    @CurrentUser() user: User,
    @Body() dto: MarkTransactionRecurringDto
  ): Promise<RecurrenceListDto> {
    return this.recurrencesService.markTransaction(user.id, dto)
  }

  @Put('name')
  @ApiOperation({
    summary: 'Name a recurring charge; an empty name goes back to its labels',
  })
  @ApiResponse({ status: 200, type: RecurrenceListDto })
  async rename(
    @CurrentUser() user: User,
    @Body() dto: RenameRecurrenceDto
  ): Promise<RecurrenceListDto> {
    return this.recurrencesService.rename(user.id, dto)
  }

  @Post('links')
  @ApiOperation({
    summary: 'Attach an expense by hand to a recurring charge, then recompute',
  })
  @ApiResponse({ status: 201, type: RecurrenceListDto })
  async link(
    @CurrentUser() user: User,
    @Body() dto: LinkTransactionDto
  ): Promise<RecurrenceListDto> {
    return this.recurrencesService.link(user.id, dto)
  }

  @Delete('links/:transactionId')
  @ApiOperation({ summary: 'Detach an expense from its recurring charge' })
  @ApiResponse({ status: 200, type: RecurrenceListDto })
  async unlink(
    @CurrentUser() user: User,
    @Param('transactionId') transactionId: string
  ): Promise<RecurrenceListDto> {
    return this.recurrencesService.unlink(user.id, transactionId)
  }

  @Delete('subscriptions/:id')
  @ApiOperation({
    summary:
      'Forget a subscription: a dismissal taken back, or a followed one without a series',
  })
  @ApiResponse({ status: 200, type: RecurrenceListDto })
  async deleteSubscription(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<RecurrenceListDto> {
    return this.recurrencesService.deleteSubscription(user.id, id)
  }
}
