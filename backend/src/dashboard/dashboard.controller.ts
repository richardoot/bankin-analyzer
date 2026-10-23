import { Controller, Post, Body, UseGuards, Get, Query } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { DashboardService } from './dashboard.service'
import {
  DashboardFiltersDto,
  DashboardMonthDto,
  DashboardMonthQueryDto,
  DashboardSummaryDto,
} from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Post('summary')
  @ApiOperation({ summary: 'Get aggregated dashboard summary with filters' })
  @ApiResponse({ status: 200, type: DashboardSummaryDto })
  async getSummary(
    @CurrentUser() user: User,
    @Body() filters: DashboardFiltersDto
  ): Promise<DashboardSummaryDto> {
    return this.dashboardService.getSummary(user.id, filters)
  }

  @Get('month')
  @ApiOperation({
    summary:
      'The current month to date against the habit (the median of the six closed months before it): spent, income, what is still to come, what is left',
  })
  @ApiResponse({ status: 200, type: DashboardMonthDto })
  @ApiResponse({ status: 400, description: 'A malformed parameter' })
  async getMonth(
    @CurrentUser() user: User,
    @Query() query: DashboardMonthQueryDto
  ): Promise<DashboardMonthDto> {
    return this.dashboardService.getMonth(user.id, query)
  }
}
