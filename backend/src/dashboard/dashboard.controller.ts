import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { DashboardService } from './dashboard.service'
import { DashboardFiltersDto, DashboardSummaryDto } from './dto'
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
}
