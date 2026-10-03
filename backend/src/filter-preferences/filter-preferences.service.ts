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
        hiddenExpenseCategoryIds: dto.hiddenExpenseCategoryIds ?? [],
        hiddenIncomeCategoryIds: dto.hiddenIncomeCategoryIds ?? [],
        globalHiddenExpenseCategoryIds:
          dto.globalHiddenExpenseCategoryIds ?? [],
        globalHiddenIncomeCategoryIds: dto.globalHiddenIncomeCategoryIds ?? [],
        isPanelExpanded: dto.isPanelExpanded ?? true,
        importCategoriesFromFile: dto.importCategoriesFromFile ?? true,
        deductPendingReimbursements: dto.deductPendingReimbursements ?? true,
      },
      update: {
        ...(dto.hiddenExpenseCategoryIds !== undefined && {
          hiddenExpenseCategoryIds: dto.hiddenExpenseCategoryIds,
        }),
        ...(dto.hiddenIncomeCategoryIds !== undefined && {
          hiddenIncomeCategoryIds: dto.hiddenIncomeCategoryIds,
        }),
        ...(dto.globalHiddenExpenseCategoryIds !== undefined && {
          globalHiddenExpenseCategoryIds: dto.globalHiddenExpenseCategoryIds,
        }),
        ...(dto.globalHiddenIncomeCategoryIds !== undefined && {
          globalHiddenIncomeCategoryIds: dto.globalHiddenIncomeCategoryIds,
        }),
        ...(dto.isPanelExpanded !== undefined && {
          isPanelExpanded: dto.isPanelExpanded,
        }),
        ...(dto.importCategoriesFromFile !== undefined && {
          importCategoriesFromFile: dto.importCategoriesFromFile,
        }),
        ...(dto.deductPendingReimbursements !== undefined && {
          deductPendingReimbursements: dto.deductPendingReimbursements,
        }),
      },
    })
  }

  /**
   * What the dashboard and the budget do with a debt still owed when the
   * request does not say: the user's preference, on by default. A user who
   * never saved any preference has no row, and gets the default.
   */
  async deductsPendingByDefault(userId: string): Promise<boolean> {
    const prefs = await this.prisma.filterPreferences.findUnique({
      where: { userId },
      select: { deductPendingReimbursements: true },
    })
    return prefs?.deductPendingReimbursements ?? true
  }
}
