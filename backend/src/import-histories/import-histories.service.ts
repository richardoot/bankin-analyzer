import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ImportStatus } from '../generated/prisma'
import type { ImportHistory } from '../generated/prisma'

export interface StartImportData {
  totalInFile: number
  fileName?: string | undefined
}

export interface FinalizeImportData {
  transactionsImported: number
  categoriesCreated: number
  duplicatesSkipped: number
  dateRangeStart: Date
  dateRangeEnd: Date
  accounts: string[]
}

export interface CreateImportHistoryData {
  transactionsImported: number
  categoriesCreated: number
  duplicatesSkipped: number
  totalInFile: number
  dateRangeStart: Date
  dateRangeEnd: Date
  accounts: string[]
  fileName?: string | undefined
}

@Injectable()
export class ImportHistoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByUser(userId: string): Promise<ImportHistory[]> {
    return this.prisma.importHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findById(id: string, userId: string): Promise<ImportHistory | null> {
    return this.prisma.importHistory.findFirst({
      where: { id, userId },
    })
  }

  async getLatestImportDate(userId: string): Promise<Date | null> {
    const latest = await this.prisma.importHistory.findFirst({
      where: { userId },
      orderBy: { dateRangeEnd: 'desc' },
      select: { dateRangeEnd: true },
    })
    return latest?.dateRangeEnd ?? null
  }

  async startImport(
    userId: string,
    data: StartImportData
  ): Promise<ImportHistory> {
    return this.prisma.importHistory.create({
      data: {
        userId,
        totalInFile: data.totalInFile,
        fileName: data.fileName ?? null,
        status: ImportStatus.IN_PROGRESS,
      },
    })
  }

  async finalizeImport(
    id: string,
    userId: string,
    data: FinalizeImportData
  ): Promise<ImportHistory> {
    const existing = await this.findById(id, userId)
    if (!existing) {
      throw new NotFoundException(`Import history ${id} not found`)
    }

    return this.prisma.importHistory.update({
      where: { id },
      data: {
        transactionsImported: data.transactionsImported,
        categoriesCreated: data.categoriesCreated,
        duplicatesSkipped: data.duplicatesSkipped,
        dateRangeStart: data.dateRangeStart,
        dateRangeEnd: data.dateRangeEnd,
        accounts: data.accounts,
        status: ImportStatus.COMPLETED,
      },
    })
  }

  async markAsFailed(id: string, userId: string): Promise<ImportHistory> {
    const existing = await this.findById(id, userId)
    if (!existing) {
      throw new NotFoundException(`Import history ${id} not found`)
    }

    return this.prisma.importHistory.update({
      where: { id },
      data: { status: ImportStatus.FAILED },
    })
  }

  async deleteImport(id: string, userId: string): Promise<void> {
    const existing = await this.findById(id, userId)
    if (!existing) {
      throw new NotFoundException(`Import history ${id} not found`)
    }

    // Delete transactions linked to this import first
    await this.prisma.transaction.deleteMany({
      where: { importHistoryId: id, userId },
    })

    // Then delete the import history
    await this.prisma.importHistory.delete({
      where: { id },
    })

    // Clean up orphan categories and accounts
    await this.cleanupOrphans(userId)
  }

  /**
   * Clean up categories and accounts that no longer have any transactions.
   * Also cleans up related data:
   * - CategoryAssociations (handled by DB cascade)
   * - Budgets (handled by DB cascade)
   * - FilterPreferences hidden category arrays (manual cleanup)
   */
  private async cleanupOrphans(userId: string): Promise<void> {
    // Find and clean up orphan categories
    const orphanCategories = await this.findOrphanCategories(userId)

    if (orphanCategories.length > 0) {
      // Clean up FilterPreferences before deleting categories
      await this.removeFromFilterPreferences(
        userId,
        orphanCategories.map(c => c.name)
      )

      // Delete orphan categories (cascades to CategoryAssociations and Budgets)
      await this.prisma.category.deleteMany({
        where: {
          id: { in: orphanCategories.map(c => c.id) },
        },
      })
    }

    // Find and delete orphan accounts
    const orphanAccounts = await this.findOrphanAccounts(userId)

    if (orphanAccounts.length > 0) {
      await this.prisma.account.deleteMany({
        where: {
          id: { in: orphanAccounts.map(a => a.id) },
        },
      })
    }
  }

  /**
   * Find categories that have no transactions
   */
  private async findOrphanCategories(
    userId: string
  ): Promise<Array<{ id: string; name: string }>> {
    const categories = await this.prisma.category.findMany({
      where: { userId },
      include: {
        _count: {
          select: { transactions: true },
        },
      },
    })

    return categories
      .filter(c => c._count.transactions === 0)
      .map(c => ({ id: c.id, name: c.name }))
  }

  /**
   * Find accounts that have no transactions
   */
  private async findOrphanAccounts(
    userId: string
  ): Promise<Array<{ id: string; name: string }>> {
    const accounts = await this.prisma.account.findMany({
      where: { userId },
      include: {
        _count: {
          select: { transactions: true },
        },
      },
    })

    return accounts
      .filter(a => a._count.transactions === 0)
      .map(a => ({ id: a.id, name: a.name }))
  }

  /**
   * Remove category names from FilterPreferences hidden arrays
   */
  private async removeFromFilterPreferences(
    userId: string,
    categoryNames: string[]
  ): Promise<void> {
    const prefs = await this.prisma.filterPreferences.findUnique({
      where: { userId },
    })

    if (!prefs) return

    const namesToRemove = new Set(categoryNames)

    const updatedHiddenExpense = prefs.hiddenExpenseCategories.filter(
      name => !namesToRemove.has(name)
    )
    const updatedHiddenIncome = prefs.hiddenIncomeCategories.filter(
      name => !namesToRemove.has(name)
    )
    const updatedGlobalHiddenExpense =
      prefs.globalHiddenExpenseCategories.filter(
        name => !namesToRemove.has(name)
      )
    const updatedGlobalHiddenIncome = prefs.globalHiddenIncomeCategories.filter(
      name => !namesToRemove.has(name)
    )

    // Only update if something changed
    if (
      updatedHiddenExpense.length !== prefs.hiddenExpenseCategories.length ||
      updatedHiddenIncome.length !== prefs.hiddenIncomeCategories.length ||
      updatedGlobalHiddenExpense.length !==
        prefs.globalHiddenExpenseCategories.length ||
      updatedGlobalHiddenIncome.length !==
        prefs.globalHiddenIncomeCategories.length
    ) {
      await this.prisma.filterPreferences.update({
        where: { userId },
        data: {
          hiddenExpenseCategories: updatedHiddenExpense,
          hiddenIncomeCategories: updatedHiddenIncome,
          globalHiddenExpenseCategories: updatedGlobalHiddenExpense,
          globalHiddenIncomeCategories: updatedGlobalHiddenIncome,
        },
      })
    }
  }

  async create(
    userId: string,
    data: CreateImportHistoryData
  ): Promise<ImportHistory> {
    return this.prisma.importHistory.create({
      data: {
        userId,
        transactionsImported: data.transactionsImported,
        categoriesCreated: data.categoriesCreated,
        duplicatesSkipped: data.duplicatesSkipped,
        totalInFile: data.totalInFile,
        dateRangeStart: data.dateRangeStart,
        dateRangeEnd: data.dateRangeEnd,
        accounts: data.accounts,
        fileName: data.fileName ?? null,
        status: ImportStatus.COMPLETED,
      },
    })
  }
}
