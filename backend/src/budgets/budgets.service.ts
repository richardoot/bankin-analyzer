import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TransactionType } from '../generated/prisma'
import type {
  BudgetResponseDto,
  BudgetStatisticsResponseDto,
  BudgetStatisticsFiltersDto,
  CategoryAverageDto,
  CreateBudgetDto,
} from './dto'

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all budgets for a user
   */
  async findAllByUser(userId: string): Promise<BudgetResponseDto[]> {
    const budgets = await this.prisma.budget.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { category: { name: 'asc' } },
    })

    return budgets.map(b => ({
      id: b.id,
      categoryId: b.categoryId,
      categoryName: b.category.name,
      amount: Number(b.amount),
    }))
  }

  /**
   * Upsert a single budget (create or update)
   */
  async upsert(
    userId: string,
    dto: CreateBudgetDto
  ): Promise<BudgetResponseDto> {
    const budget = await this.prisma.budget.upsert({
      where: {
        userId_categoryId: { userId, categoryId: dto.categoryId },
      },
      create: {
        userId,
        categoryId: dto.categoryId,
        amount: dto.amount,
      },
      update: {
        amount: dto.amount,
      },
      include: { category: true },
    })

    return {
      id: budget.id,
      categoryId: budget.categoryId,
      categoryName: budget.category.name,
      amount: Number(budget.amount),
    }
  }

  /**
   * Upsert multiple budgets at once
   */
  async upsertMany(
    userId: string,
    dtos: CreateBudgetDto[]
  ): Promise<BudgetResponseDto[]> {
    const results: BudgetResponseDto[] = []

    for (const dto of dtos) {
      const result = await this.upsert(userId, dto)
      results.push(result)
    }

    return results
  }

  /**
   * Delete a budget by category ID
   */
  async delete(userId: string, categoryId: string): Promise<void> {
    await this.prisma.budget.deleteMany({
      where: { userId, categoryId },
    })
  }

  /**
   * Get statistics for budget planning:
   * - Average expenses by category
   * - Average income by category (excluding reimbursement income)
   */
  async getStatistics(
    userId: string,
    filters: BudgetStatisticsFiltersDto
  ): Promise<BudgetStatisticsResponseDto> {
    const startDate = new Date(filters.startDate)
    const endDate = new Date(filters.endDate)
    const jointAccountsSet = new Set(filters.jointAccounts ?? [])

    // Calculate period in months
    const periodMonths = this.calculateMonthsDiff(startDate, endDate)

    // Fetch category associations to identify reimbursement income categories
    const associations = await this.prisma.categoryAssociation.findMany({
      where: { userId },
      select: { incomeCategoryId: true },
    })
    const reimbursementCategoryIds = new Set(
      associations.map(a => a.incomeCategoryId)
    )

    // Fetch transactions within the date range
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
      },
      include: { category: true },
    })

    // Aggregate expenses by category
    const expenseMap = new Map<
      string,
      { categoryId: string; categoryName: string; total: number; count: number }
    >()
    const incomeMap = new Map<
      string,
      { categoryId: string; categoryName: string; total: number; count: number }
    >()

    let totalExpenses = 0
    let totalIncome = 0

    for (const tx of transactions) {
      // Skip transactions without category
      if (!tx.category || !tx.categoryId) continue

      const categoryId = tx.categoryId
      const amount = Number(tx.amount)
      const isJointAccount = jointAccountsSet.has(tx.account)
      const adjustedAmount = isJointAccount ? amount / 2 : amount

      if (tx.type === TransactionType.EXPENSE) {
        const absAmount = Math.abs(adjustedAmount)
        totalExpenses += absAmount

        const existing = expenseMap.get(categoryId)
        if (existing) {
          existing.total += absAmount
          existing.count += 1
        } else {
          expenseMap.set(categoryId, {
            categoryId,
            categoryName: tx.category.name,
            total: absAmount,
            count: 1,
          })
        }
      } else {
        // Exclude reimbursement income categories
        if (reimbursementCategoryIds.has(categoryId)) {
          continue
        }

        totalIncome += adjustedAmount

        const existing = incomeMap.get(categoryId)
        if (existing) {
          existing.total += adjustedAmount
          existing.count += 1
        } else {
          incomeMap.set(categoryId, {
            categoryId,
            categoryName: tx.category.name,
            total: adjustedAmount,
            count: 1,
          })
        }
      }
    }

    // Convert to response format with averages
    const expensesByCategory: CategoryAverageDto[] = Array.from(
      expenseMap.values()
    )
      .map(e => ({
        categoryId: e.categoryId,
        categoryName: e.categoryName,
        totalAmount: this.round(e.total),
        transactionCount: e.count,
        averagePerMonth: this.round(e.total / periodMonths),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount)

    const incomeByCategory: CategoryAverageDto[] = Array.from(
      incomeMap.values()
    )
      .map(i => ({
        categoryId: i.categoryId,
        categoryName: i.categoryName,
        totalAmount: this.round(i.total),
        transactionCount: i.count,
        averagePerMonth: this.round(i.total / periodMonths),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount)

    return {
      periodMonths,
      expensesByCategory,
      incomeByCategory,
      totalExpenses: this.round(totalExpenses),
      totalIncome: this.round(totalIncome),
      averageMonthlyExpenses: this.round(totalExpenses / periodMonths),
      averageMonthlyIncome: this.round(totalIncome / periodMonths),
    }
  }

  /**
   * Calculate the number of months between two dates
   */
  private calculateMonthsDiff(start: Date, end: Date): number {
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()) +
      1 // Include both start and end months

    return Math.max(1, months)
  }

  /**
   * Round to 2 decimal places
   */
  private round(value: number): number {
    return Math.round(value * 100) / 100
  }
}
