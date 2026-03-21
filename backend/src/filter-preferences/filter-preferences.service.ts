import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { FilterPreferences } from '../generated/prisma'
import { UpdateFilterPreferencesDto } from './dto'

@Injectable()
export class FilterPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(userId: string): Promise<FilterPreferences | null> {
    return this.prisma.filterPreferences.findUnique({
      where: { userId },
    })
  }

  async upsert(
    userId: string,
    dto: UpdateFilterPreferencesDto
  ): Promise<FilterPreferences> {
    return this.prisma.filterPreferences.upsert({
      where: { userId },
      create: {
        userId,
        hiddenExpenseCategories: dto.hiddenExpenseCategories ?? [],
        hiddenIncomeCategories: dto.hiddenIncomeCategories ?? [],
        globalHiddenExpenseCategories: dto.globalHiddenExpenseCategories ?? [],
        globalHiddenIncomeCategories: dto.globalHiddenIncomeCategories ?? [],
        isPanelExpanded: dto.isPanelExpanded ?? true,
      },
      update: {
        ...(dto.hiddenExpenseCategories !== undefined && {
          hiddenExpenseCategories: dto.hiddenExpenseCategories,
        }),
        ...(dto.hiddenIncomeCategories !== undefined && {
          hiddenIncomeCategories: dto.hiddenIncomeCategories,
        }),
        ...(dto.globalHiddenExpenseCategories !== undefined && {
          globalHiddenExpenseCategories: dto.globalHiddenExpenseCategories,
        }),
        ...(dto.globalHiddenIncomeCategories !== undefined && {
          globalHiddenIncomeCategories: dto.globalHiddenIncomeCategories,
        }),
        ...(dto.isPanelExpanded !== undefined && {
          isPanelExpanded: dto.isPanelExpanded,
        }),
      },
    })
  }
}
