import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { FilterPreferencesService } from './filter-preferences.service'
import {
  FilterPreferencesDto,
  UpdateFilterPreferencesDto,
  CategoryAssociationDto,
} from './dto'
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
        jointAccounts: [],
        hiddenExpenseCategories: [],
        hiddenIncomeCategories: [],
        categoryAssociations: [],
        isPanelExpanded: true,
      }
    }

    return {
      jointAccounts: prefs.jointAccounts,
      hiddenExpenseCategories: prefs.hiddenExpenseCategories,
      hiddenIncomeCategories: prefs.hiddenIncomeCategories,
      categoryAssociations:
        prefs.categoryAssociations as unknown as CategoryAssociationDto[],
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
      jointAccounts: prefs.jointAccounts,
      hiddenExpenseCategories: prefs.hiddenExpenseCategories,
      hiddenIncomeCategories: prefs.hiddenIncomeCategories,
      categoryAssociations:
        prefs.categoryAssociations as unknown as CategoryAssociationDto[],
      isPanelExpanded: prefs.isPanelExpanded,
    }
  }
}
