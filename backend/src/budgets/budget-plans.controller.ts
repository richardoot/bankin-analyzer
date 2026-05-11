import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { BudgetPlansService } from './budget-plans.service'
import {
  BudgetPlanResponseDto,
  BudgetPlanSummaryDto,
  CreateBudgetPlanDto,
  UpdateBudgetPlanDto,
} from './dto'
import { CurrentUser, SupabaseGuard } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('budget-plans')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('budget-plans')
export class BudgetPlansController {
  constructor(private readonly service: BudgetPlansService) {}

  @Get()
  @ApiOperation({ summary: 'List all budget plans for the current user' })
  @ApiResponse({ status: 200, type: [BudgetPlanSummaryDto] })
  findAll(@CurrentUser() user: User): Promise<BudgetPlanSummaryDto[]> {
    return this.service.findAllForUser(user.id)
  }

  @Get('current')
  @ApiOperation({
    summary: 'Get the budget plan whose range covers today (or null)',
  })
  @ApiResponse({ status: 200, type: BudgetPlanResponseDto })
  findCurrent(
    @CurrentUser() user: User
  ): Promise<BudgetPlanResponseDto | null> {
    return this.service.findCurrentForUser(user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single budget plan by id' })
  @ApiResponse({ status: 200, type: BudgetPlanResponseDto })
  findOne(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<BudgetPlanResponseDto> {
    return this.service.findOne(user.id, id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new budget plan' })
  @ApiResponse({ status: 201, type: BudgetPlanResponseDto })
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateBudgetPlanDto
  ): Promise<BudgetPlanResponseDto> {
    return this.service.create(user.id, dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a budget plan (name, dates, entries)' })
  @ApiResponse({ status: 200, type: BudgetPlanResponseDto })
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateBudgetPlanDto
  ): Promise<BudgetPlanResponseDto> {
    return this.service.update(user.id, id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a budget plan' })
  @ApiResponse({ status: 204 })
  delete(@CurrentUser() user: User, @Param('id') id: string): Promise<void> {
    return this.service.delete(user.id, id)
  }
}
