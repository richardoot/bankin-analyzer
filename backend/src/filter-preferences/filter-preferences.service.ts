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
      },
    })
  }
}
