import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { BudgetsService } from './budgets.service'
import {
  BudgetResponseDto,
  BudgetStatisticsResponseDto,
  UpsertBudgetsDto,
  BudgetStatisticsFiltersDto,
} from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('budgets')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all budgets for the current user' })
  @ApiResponse({ status: 200, type: [BudgetResponseDto] })
  async findAll(@CurrentUser() user: User): Promise<BudgetResponseDto[]> {
    return this.budgetsService.findAllByUser(user.id)
  }

  @Post()
  @ApiOperation({ summary: 'Create or update budgets (batch upsert)' })
  @ApiResponse({ status: 200, type: [BudgetResponseDto] })
  async upsert(
    @CurrentUser() user: User,
    @Body() dto: UpsertBudgetsDto
  ): Promise<BudgetResponseDto[]> {
    return this.budgetsService.upsertMany(user.id, dto.budgets)
  }

  @Post('statistics')
  @ApiOperation({
    summary: 'Get budget statistics (average expenses/income by category)',
    description:
      'Returns expense and income totals aggregated by category over the given date range, ' +
      'with per-month averages. Expenses from accounts with a divisor (e.g. joint accounts) ' +
      'are divided accordingly, and accounts flagged isExcludedFromBudget are excluded.\n\n' +
      '**Reimbursement deduction** (deductReimbursements, default true): income transactions ' +
      'in categories linked to an expense category via CategoryAssociation are treated as ' +
      'reimbursements and deducted from the corresponding expense category total.\n\n' +
      '**Pending reimbursement deduction** (deductPendingReimbursements, default false): ' +
      'the remaining amount (amount - amountReceived) of PENDING/PARTIAL ReimbursementRequests ' +
      'whose linked transaction falls within the date range is also deducted from the ' +
      'corresponding expense category total.',
  })
  @ApiResponse({ status: 200, type: BudgetStatisticsResponseDto })
  async getStatistics(
    @CurrentUser() user: User,
    @Body() filters: BudgetStatisticsFiltersDto
  ): Promise<BudgetStatisticsResponseDto> {
    return this.budgetsService.getStatistics(user.id, filters)
  }

  @Delete(':categoryId')
  @ApiOperation({ summary: 'Delete a budget by category ID' })
  @ApiResponse({ status: 200 })
  async delete(
    @CurrentUser() user: User,
    @Param('categoryId') categoryId: string
  ): Promise<void> {
    await this.budgetsService.delete(user.id, categoryId)
  }
}
