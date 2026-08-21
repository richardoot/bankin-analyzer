import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger'
import { SettlementsService } from './settlements.service'
import {
  CreateSettlementDto,
  SettlementResponseDto,
  SettlementSuggestionDto,
  TransactionAvailableAmountDto,
} from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('settlements')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all settlements for the current user',
  })
  @ApiResponse({ status: 200, type: [SettlementResponseDto] })
  @ApiQuery({
    name: 'personId',
    required: false,
    description: 'Filter by person ID',
  })
  async findAll(
    @CurrentUser() user: User,
    @Query('personId') personId?: string
  ): Promise<SettlementResponseDto[]> {
    return this.settlementsService.findAll(user.id, personId)
  }

  // Declared before `:id`, or Nest would read "suggestions" as a settlement id.
  @Get('suggestions')
  @ApiOperation({
    summary: 'Incoming transfers that look like they repay someone',
    description:
      'Ranks unsettled income transactions against outstanding debts, using ' +
      'the payer name in the bank wording, the category pairing and the ' +
      'amount. Advisory only: nothing is written, and each suggestion carries ' +
      'the reasons it was made so the user can judge it.',
  })
  @ApiResponse({ status: 200, type: [SettlementSuggestionDto] })
  async suggest(@CurrentUser() user: User): Promise<SettlementSuggestionDto[]> {
    return this.settlementsService.suggest(user.id)
  }

  @Get('transaction/:transactionId/available-amount')
  @ApiOperation({
    summary: 'Get available amount for an income transaction',
  })
  @ApiResponse({ status: 200, type: TransactionAvailableAmountDto })
  async getAvailableAmount(
    @CurrentUser() user: User,
    @Param('transactionId') transactionId: string
  ): Promise<TransactionAvailableAmountDto> {
    return this.settlementsService.getAvailableAmount(transactionId, user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a settlement by ID' })
  @ApiResponse({ status: 200, type: SettlementResponseDto })
  async findOne(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<SettlementResponseDto> {
    return this.settlementsService.findOne(id, user.id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new settlement' })
  @ApiResponse({ status: 201, type: SettlementResponseDto })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateSettlementDto
  ): Promise<SettlementResponseDto> {
    return this.settlementsService.create(user.id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a settlement (reverse the payment)' })
  @ApiResponse({ status: 204 })
  async delete(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<void> {
    await this.settlementsService.delete(id, user.id)
  }
}
