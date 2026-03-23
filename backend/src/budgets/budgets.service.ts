import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TransactionType } from '../generated/prisma'
import type {
  BudgetResponseDto,
  BudgetStatisticsResponseDto,
  BudgetStatisticsFiltersDto,
  CategoryAverageDto,
  SubcategoryAverageDto,
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

    // Fetch user accounts to get divisors
    const userAccounts = await this.prisma.account.findMany({
      where: { userId },
    })
    const accountDivisors = new Map(userAccounts.map(a => [a.name, a.divisor]))
    const excludedFromBudgetAccounts = new Set(
      userAccounts.filter(a => a.isExcludedFromBudget).map(a => a.name)
    )

    // Calculate period in months
    const periodMonths = this.calculateMonthsDiff(startDate, endDate)

    // Fetch category associations to identify reimbursement income categories
    const associations = await this.prisma.categoryAssociation.findMany({
      where: { userId },
      include: {
        expenseCategory: true,
        incomeCategory: true,
      },
    })
    const reimbursementCategoryIds = new Set(
      associations.map(a => a.incomeCategoryId)
    )
    // Map income category ID to expense category ID for reimbursement tracking
    const incomeCategoryToExpenseCategory = new Map(
      associations.map(a => [a.incomeCategoryId, a.expenseCategoryId])
    )

    // Fetch transactions within the date range
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
      },
      include: { category: true },
    })

    // Aggregate expenses by category and subcategory
    const expenseMap = new Map<
      string,
      {
        categoryId: string
        categoryName: string
        total: number
        count: number
        subcategories: Map<string, { total: number; count: number }>
      }
    >()
    const incomeMap = new Map<
      string,
      {
        categoryId: string
        categoryName: string
        total: number
        count: number
        subcategories: Map<string, { total: number; count: number }>
      }
    >()

    let totalExpenses = 0
    let totalIncome = 0

    // Track reimbursements by expense category
    const reimbursementsByExpenseCategory = new Map<string, number>()

    for (const tx of transactions) {
      // Skip transactions without category
      if (!tx.category || !tx.categoryId) continue

      // Skip transactions from accounts excluded from budget
      if (excludedFromBudgetAccounts.has(tx.account)) continue

      const categoryId = tx.categoryId
      const subcategory = tx.subcategory ?? ''
      const amount = Number(tx.amount)
      // Get divisor from account settings (defaults to 1 if not found)
      const divisor = accountDivisors.get(tx.account) ?? 1
      const adjustedAmount = amount / divisor

      if (tx.type === TransactionType.EXPENSE) {
        const absAmount = Math.abs(adjustedAmount)
        totalExpenses += absAmount

        const existing = expenseMap.get(categoryId)
        if (existing) {
          existing.total += absAmount
          existing.count += 1
          // Track subcategory
          const subExisting = existing.subcategories.get(subcategory)
          if (subExisting) {
            subExisting.total += absAmount
            subExisting.count += 1
          } else {
            existing.subcategories.set(subcategory, {
              total: absAmount,
              count: 1,
            })
          }
        } else {
          const subcategories = new Map<
            string,
            { total: number; count: number }
          >()
          subcategories.set(subcategory, { total: absAmount, count: 1 })
          expenseMap.set(categoryId, {
            categoryId,
            categoryName: tx.category.name,
            total: absAmount,
            count: 1,
            subcategories,
          })
        }
      } else {
        // Track reimbursements by expense category before excluding
        if (reimbursementCategoryIds.has(categoryId)) {
          const expenseCategoryId =
            incomeCategoryToExpenseCategory.get(categoryId)
          if (expenseCategoryId) {
            const current =
              reimbursementsByExpenseCategory.get(expenseCategoryId) ?? 0
            reimbursementsByExpenseCategory.set(
              expenseCategoryId,
              current + adjustedAmount
            )
          }
          continue
        }

        totalIncome += adjustedAmount

        const existing = incomeMap.get(categoryId)
        if (existing) {
          existing.total += adjustedAmount
          existing.count += 1
          // Track subcategory
          const subExisting = existing.subcategories.get(subcategory)
          if (subExisting) {
            subExisting.total += adjustedAmount
            subExisting.count += 1
          } else {
            existing.subcategories.set(subcategory, {
              total: adjustedAmount,
              count: 1,
            })
          }
        } else {
          const subcategories = new Map<
            string,
            { total: number; count: number }
          >()
          subcategories.set(subcategory, { total: adjustedAmount, count: 1 })
          incomeMap.set(categoryId, {
            categoryId,
            categoryName: tx.category.name,
            total: adjustedAmount,
            count: 1,
            subcategories,
          })
        }
      }
    }

    // Deduct reimbursements from expense categories and update totalExpenses
    // Store gross totals for proportional subcategory deduction
    const categoryGrossTotals = new Map<string, number>()
    for (const [categoryId, data] of expenseMap) {
      categoryGrossTotals.set(categoryId, data.total)
    }

    for (const [
      expenseCategoryId,
      reimbursement,
    ] of reimbursementsByExpenseCategory) {
      const expenseData = expenseMap.get(expenseCategoryId)
      if (expenseData) {
        const deduction = Math.min(expenseData.total, reimbursement)
        expenseData.total = Math.max(0, expenseData.total - reimbursement)
        totalExpenses -= deduction
      }
    }

    // Convert to response format with averages and subcategories
    const expensesByCategory: CategoryAverageDto[] = Array.from(
      expenseMap.values()
    )
      .map(e => {
        // Get gross total and reimbursement for proportional distribution
        const grossTotal = categoryGrossTotals.get(e.categoryId) ?? e.total
        const reimbursement =
          reimbursementsByExpenseCategory.get(e.categoryId) ?? 0

        // Convert subcategories map to array with proportional reimbursement deduction
        const subcategories: SubcategoryAverageDto[] = Array.from(
          e.subcategories.entries()
        )
          .map(([subcategory, data]) => {
            // Calculate proportion of this subcategory relative to gross total
            const proportion = grossTotal > 0 ? data.total / grossTotal : 0
            // Apply proportional reimbursement deduction
            const proportionalReimbursement = reimbursement * proportion
            const netTotal = Math.max(0, data.total - proportionalReimbursement)

            return {
              subcategory,
              totalAmount: this.round(netTotal),
              transactionCount: data.count,
              averagePerMonth: this.round(netTotal / periodMonths),
            }
          })
          .sort((a, b) => b.totalAmount - a.totalAmount)

        const result: CategoryAverageDto = {
          categoryId: e.categoryId,
          categoryName: e.categoryName,
          totalAmount: this.round(e.total),
          transactionCount: e.count,
          averagePerMonth: this.round(e.total / periodMonths),
        }
        if (subcategories.length > 0) {
          result.subcategories = subcategories
        }
        return result
      })
      .sort((a, b) => b.totalAmount - a.totalAmount)

    const incomeByCategory: CategoryAverageDto[] = Array.from(
      incomeMap.values()
    )
      .map(i => {
        // Convert subcategories map to array, sorted by amount descending
        const subcategories: SubcategoryAverageDto[] = Array.from(
          i.subcategories.entries()
        )
          .map(([subcategory, data]) => ({
            subcategory,
            totalAmount: this.round(data.total),
            transactionCount: data.count,
            averagePerMonth: this.round(data.total / periodMonths),
          }))
          .sort((a, b) => b.totalAmount - a.totalAmount)

        const result: CategoryAverageDto = {
          categoryId: i.categoryId,
          categoryName: i.categoryName,
          totalAmount: this.round(i.total),
          transactionCount: i.count,
          averagePerMonth: this.round(i.total / periodMonths),
        }
        if (subcategories.length > 0) {
          result.subcategories = subcategories
        }
        return result
      })
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
