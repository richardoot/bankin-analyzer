import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { FilterPreferencesService } from './filter-preferences.service'
import { FilterPreferencesDto, UpdateFilterPreferencesDto } from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('filter-preferences')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('filter-preferences')
export class FilterPreferencesController {
  constructor(private readonly service: FilterPreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Get user filter preferences' })
  @ApiResponse({ status: 200, type: FilterPreferencesDto })
  async get(@CurrentUser() user: User): Promise<FilterPreferencesDto> {
    const prefs = await this.service.findByUser(user.id)

    if (!prefs) {
      return {
        hiddenExpenseCategoryIds: [],
        hiddenIncomeCategoryIds: [],
        globalHiddenExpenseCategoryIds: [],
        globalHiddenIncomeCategoryIds: [],
        isPanelExpanded: true,
      }
    }

    return {
      hiddenExpenseCategoryIds: prefs.hiddenExpenseCategoryIds,
      hiddenIncomeCategoryIds: prefs.hiddenIncomeCategoryIds,
      globalHiddenExpenseCategoryIds: prefs.globalHiddenExpenseCategoryIds,
      globalHiddenIncomeCategoryIds: prefs.globalHiddenIncomeCategoryIds,
      isPanelExpanded: prefs.isPanelExpanded,
    }
  }

  @Put()
  @ApiOperation({ summary: 'Update user filter preferences' })
  @ApiResponse({ status: 200, type: FilterPreferencesDto })
  async update(
    @CurrentUser() user: User,
    @Body() dto: UpdateFilterPreferencesDto
  ): Promise<FilterPreferencesDto> {
    const prefs = await this.service.upsert(user.id, dto)

    return {
      hiddenExpenseCategoryIds: prefs.hiddenExpenseCategoryIds,
      hiddenIncomeCategoryIds: prefs.hiddenIncomeCategoryIds,
      globalHiddenExpenseCategoryIds: prefs.globalHiddenExpenseCategoryIds,
      globalHiddenIncomeCategoryIds: prefs.globalHiddenIncomeCategoryIds,
      isPanelExpanded: prefs.isPanelExpanded,
    }
  }
}
