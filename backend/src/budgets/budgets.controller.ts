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
