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
        jointAccounts: dto.jointAccounts ?? [],
        hiddenExpenseCategories: dto.hiddenExpenseCategories ?? [],
        hiddenIncomeCategories: dto.hiddenIncomeCategories ?? [],
        categoryAssociations: [], // Deprecated: use CategoryAssociation table
        isPanelExpanded: dto.isPanelExpanded ?? true,
      },
      update: {
        ...(dto.jointAccounts !== undefined && {
          jointAccounts: dto.jointAccounts,
        }),
        ...(dto.hiddenExpenseCategories !== undefined && {
          hiddenExpenseCategories: dto.hiddenExpenseCategories,
        }),
        ...(dto.hiddenIncomeCategories !== undefined && {
          hiddenIncomeCategories: dto.hiddenIncomeCategories,
        }),
        ...(dto.isPanelExpanded !== undefined && {
          isPanelExpanded: dto.isPanelExpanded,
        }),
      },
    })
  }
}
