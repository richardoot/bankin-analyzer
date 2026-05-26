import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type {
  BudgetStatisticsResponseDto,
  BudgetStatisticsFiltersDto,
  CategoryAverageDto,
  SubcategoryAverageDto,
} from './dto'

interface AggregatedTransactionRow {
  category_id: string
  category_name: string
  category_icon: string | null
  type: string
  subcategory: string
  transaction_count: number
  total_amount: number
}

interface PendingReimbursementRow {
  category_id: string
  pending_amount: number
}

interface MonthlyBreakdownRow {
  category_id: string
  type: string
  year_month: string
  monthly_amount: number
}

interface MonthlyPendingRow {
  category_id: string
  year_month: string
  pending_amount: number
}

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const shouldDeductReimbursements = filters.deductReimbursements !== false
    const shouldDeductPending = filters.deductPendingReimbursements === true
    const shouldIncludeMonthly = filters.includeMonthlyBreakdown === true
    const includeAllPending = filters.includeAllPendingReimbursements === true

    // Calculate period in months
    const periodMonths = this.calculateMonthsDiff(startDate, endDate)

    // Fetch aggregated transactions, category associations, and optionally
    // pending reimbursements + monthly breakdown — all in parallel.
    const [rows, associations, pendingRows, monthlyRows, monthlyPendingRows] =
      await Promise.all([
        this.prisma.$queryRaw<AggregatedTransactionRow[]>(Prisma.sql`
        SELECT
          t.category_id,
          c.name AS category_name,
          c.icon AS category_icon,
          t.type::text AS type,
          COALESCE(t.subcategory, '') AS subcategory,
          COUNT(*)::int AS transaction_count,
          SUM(
            CASE WHEN t.type = 'EXPENSE'
              THEN ABS(t.amount::numeric) / COALESCE(a.divisor, 1)
              ELSE t.amount::numeric / COALESCE(a.divisor, 1)
            END
          )::float AS total_amount
        FROM app.transactions t
        JOIN app.categories c ON c.id = t.category_id
        LEFT JOIN app.accounts a ON a.id = t.account_id
        WHERE t.user_id = ${userId}
          AND t.date >= ${startDate}
          AND t.date <= ${endDate}
          AND t.category_id IS NOT NULL
          AND COALESCE(a.is_excluded_from_budget, false) = false
        GROUP BY t.category_id, c.name, c.icon, t.type, COALESCE(t.subcategory, '')
      `),
        this.prisma.categoryAssociation.findMany({
          where: { userId },
          include: {
            expenseCategory: true,
            incomeCategory: true,
          },
        }),
        shouldDeductPending
          ? this.prisma.$queryRaw<PendingReimbursementRow[]>(Prisma.sql`
            SELECT
              rr.category_id,
              SUM(
                (rr.amount::numeric - rr.amount_received::numeric) / COALESCE(a.divisor, 1)
              )::float AS pending_amount
            FROM app.reimbursement_requests rr
            JOIN app.transactions t ON t.id = rr.transaction_id
            LEFT JOIN app.accounts a ON a.id = t.account_id
            WHERE rr.user_id = ${userId}
              AND rr.status IN ('PENDING', 'PARTIAL')
              ${
                includeAllPending
                  ? Prisma.empty
                  : Prisma.sql`AND t.date >= ${startDate} AND t.date <= ${endDate}`
              }
              AND COALESCE(a.is_excluded_from_budget, false) = false
            GROUP BY rr.category_id
          `)
          : Promise.resolve([]),
        shouldIncludeMonthly
          ? this.prisma.$queryRaw<MonthlyBreakdownRow[]>(Prisma.sql`
            SELECT
              t.category_id,
              t.type::text AS type,
              TO_CHAR(t.date, 'YYYY-MM') AS year_month,
              SUM(
                CASE WHEN t.type = 'EXPENSE'
                  THEN ABS(t.amount::numeric) / COALESCE(a.divisor, 1)
                  ELSE t.amount::numeric / COALESCE(a.divisor, 1)
                END
              )::float AS monthly_amount
            FROM app.transactions t
            JOIN app.categories c ON c.id = t.category_id
            LEFT JOIN app.accounts a ON a.id = t.account_id
            WHERE t.user_id = ${userId}
              AND t.date >= ${startDate}
              AND t.date <= ${endDate}
              AND t.category_id IS NOT NULL
              AND COALESCE(a.is_excluded_from_budget, false) = false
            GROUP BY t.category_id, t.type, TO_CHAR(t.date, 'YYYY-MM')
            ORDER BY t.category_id, TO_CHAR(t.date, 'YYYY-MM')
          `)
          : Promise.resolve([]),
        shouldIncludeMonthly && shouldDeductPending
          ? this.prisma.$queryRaw<MonthlyPendingRow[]>(Prisma.sql`
            SELECT
              rr.category_id,
              TO_CHAR(t.date, 'YYYY-MM') AS year_month,
              SUM(
                (rr.amount::numeric - rr.amount_received::numeric) / COALESCE(a.divisor, 1)
              )::float AS pending_amount
            FROM app.reimbursement_requests rr
            JOIN app.transactions t ON t.id = rr.transaction_id
            LEFT JOIN app.accounts a ON a.id = t.account_id
            WHERE rr.user_id = ${userId}
              AND rr.status IN ('PENDING', 'PARTIAL')
              ${
                includeAllPending
                  ? Prisma.empty
                  : Prisma.sql`AND t.date >= ${startDate} AND t.date <= ${endDate}`
              }
              AND COALESCE(a.is_excluded_from_budget, false) = false
            GROUP BY rr.category_id, TO_CHAR(t.date, 'YYYY-MM')
          `)
          : Promise.resolve([]),
      ])

    // Build reimbursement lookup maps
    const reimbursementCategoryIds = new Set(
      associations.map(a => a.incomeCategoryId)
    )
    const incomeCategoryToExpenseCategory = new Map(
      associations.map(a => [a.incomeCategoryId, a.expenseCategoryId])
    )

    // Process aggregated rows into maps
    const expenseMap = new Map<
      string,
      {
        categoryId: string
        categoryName: string
        categoryIcon: string | null
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
        categoryIcon: string | null
        total: number
        count: number
        subcategories: Map<string, { total: number; count: number }>
      }
    >()

    let totalExpenses = 0
    let totalIncome = 0

    // Track received reimbursements by expense category
    const reimbursementsByExpenseCategory = new Map<string, number>()

    for (const row of rows) {
      const categoryId = row.category_id
      const subcategory = row.subcategory
      const amount = row.total_amount
      const count = row.transaction_count

      if (row.type === 'EXPENSE') {
        totalExpenses += amount

        const existing = expenseMap.get(categoryId)
        if (existing) {
          existing.total += amount
          existing.count += count
          existing.subcategories.set(subcategory, { total: amount, count })
        } else {
          const subcategories = new Map<
            string,
            { total: number; count: number }
          >()
          subcategories.set(subcategory, { total: amount, count })
          expenseMap.set(categoryId, {
            categoryId,
            categoryName: row.category_name,
            categoryIcon: row.category_icon,
            total: amount,
            count,
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
              current + amount
            )
          }
          continue
        }

        totalIncome += amount

        const existing = incomeMap.get(categoryId)
        if (existing) {
          existing.total += amount
          existing.count += count
          existing.subcategories.set(subcategory, { total: amount, count })
        } else {
          const subcategories = new Map<
            string,
            { total: number; count: number }
          >()
          subcategories.set(subcategory, { total: amount, count })
          incomeMap.set(categoryId, {
            categoryId,
            categoryName: row.category_name,
            categoryIcon: row.category_icon,
            total: amount,
            count,
            subcategories,
          })
        }
      }
    }

    // Build pending reimbursements map (keyed by expense category)
    const pendingByExpenseCategory = new Map<string, number>()
    for (const row of pendingRows) {
      const expenseCategoryId = incomeCategoryToExpenseCategory.get(
        row.category_id
      )
      if (expenseCategoryId) {
        const current = pendingByExpenseCategory.get(expenseCategoryId) ?? 0
        pendingByExpenseCategory.set(
          expenseCategoryId,
          current + row.pending_amount
        )
      }
    }

    // Build monthly breakdown maps (keyed by category_id → sorted monthly amounts)
    // Deductions from reimbursements and pending are applied per-month to match the toggles.
    const monthlyByCategory = new Map<string, number[]>()
    const allMonths: string[] = []
    if (shouldIncludeMonthly) {
      // Generate all year-month keys in the period
      const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
      while (cursor <= endDate) {
        const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
        allMonths.push(ym)
        cursor.setMonth(cursor.getMonth() + 1)
      }

      // Group monthly rows by type:category_id → month → amount
      const rawMap = new Map<string, Map<string, number>>()
      for (const row of monthlyRows) {
        const key = `${row.type}:${row.category_id}`
        if (!rawMap.has(key)) {
          rawMap.set(key, new Map())
        }
        rawMap.get(key)!.set(row.year_month, row.monthly_amount)
      }

      // Build monthly reimbursement deductions per expense category per month
      // reimbursementCategoryIds is the set of income category IDs that are reimbursement categories
      // incomeCategoryToExpenseCategory maps income cat → expense cat
      const monthlyReimbByExpenseCat = new Map<string, Map<string, number>>()
      if (shouldDeductReimbursements) {
        for (const [key, monthMap] of rawMap) {
          if (!key.startsWith('INCOME:')) continue
          const incomeCatId = key.split(':')[1] ?? key
          if (!reimbursementCategoryIds.has(incomeCatId)) continue
          const expCatId = incomeCategoryToExpenseCategory.get(incomeCatId)
          if (!expCatId) continue
          if (!monthlyReimbByExpenseCat.has(expCatId)) {
            monthlyReimbByExpenseCat.set(expCatId, new Map())
          }
          const target = monthlyReimbByExpenseCat.get(expCatId)!
          for (const [month, amount] of monthMap) {
            target.set(month, (target.get(month) ?? 0) + amount)
          }
        }
      }

      // Build monthly pending deductions per expense category per month
      const monthlyPendingByExpenseCat = new Map<string, Map<string, number>>()
      if (shouldDeductPending) {
        for (const row of monthlyPendingRows) {
          const expCatId = incomeCategoryToExpenseCategory.get(row.category_id)
          if (!expCatId) continue
          if (!monthlyPendingByExpenseCat.has(expCatId)) {
            monthlyPendingByExpenseCat.set(expCatId, new Map())
          }
          const target = monthlyPendingByExpenseCat.get(expCatId)!
          target.set(
            row.year_month,
            (target.get(row.year_month) ?? 0) + row.pending_amount
          )
        }
      }

      // Build final expense monthly arrays with deductions applied
      for (const [key, monthMap] of rawMap) {
        if (!key.startsWith('EXPENSE:')) continue
        const catId = key.split(':')[1] ?? key
        const reimbMonths = monthlyReimbByExpenseCat.get(catId)
        const pendingMonths = monthlyPendingByExpenseCat.get(catId)

        const amounts = allMonths.map(m => {
          let val = monthMap.get(m) ?? 0
          if (reimbMonths) {
            val = Math.max(0, val - (reimbMonths.get(m) ?? 0))
          }
          if (pendingMonths) {
            val = Math.max(0, val - (pendingMonths.get(m) ?? 0))
          }
          return this.round(val)
        })
        monthlyByCategory.set(catId, amounts)
      }

      // Income monthly arrays (no deduction applied)
      for (const [key, monthMap] of rawMap) {
        if (!key.startsWith('INCOME:')) continue
        const amounts = allMonths.map(m => this.round(monthMap.get(m) ?? 0))
        monthlyByCategory.set(key, amounts)
      }
    }

    // Store gross totals for proportional subcategory deduction
    const categoryGrossTotals = new Map<string, number>()
    for (const [categoryId, data] of expenseMap) {
      categoryGrossTotals.set(categoryId, data.total)
    }

    // Deduct received reimbursements from expense categories
    let totalReimbursements = 0
    if (shouldDeductReimbursements) {
      for (const [
        expenseCategoryId,
        reimbursement,
      ] of reimbursementsByExpenseCategory) {
        const expenseData = expenseMap.get(expenseCategoryId)
        if (expenseData) {
          const deduction = Math.min(expenseData.total, reimbursement)
          expenseData.total = Math.max(0, expenseData.total - reimbursement)
          totalExpenses -= deduction
          totalReimbursements += deduction
        }
      }
    }

    // Deduct pending reimbursements from expense categories
    let totalPendingReimbursements = 0
    if (shouldDeductPending) {
      for (const [
        expenseCategoryId,
        pendingAmount,
      ] of pendingByExpenseCategory) {
        const expenseData = expenseMap.get(expenseCategoryId)
        if (expenseData) {
          const deduction = Math.min(expenseData.total, pendingAmount)
          expenseData.total = Math.max(0, expenseData.total - pendingAmount)
          totalExpenses -= deduction
          totalPendingReimbursements += deduction
        }
      }
    }

    // Total deduction per category (received + pending) for proportional subcategory split
    const totalDeductionByCategory = new Map<string, number>()
    for (const [catId] of expenseMap) {
      const received = shouldDeductReimbursements
        ? (reimbursementsByExpenseCategory.get(catId) ?? 0)
        : 0
      const pending = shouldDeductPending
        ? (pendingByExpenseCategory.get(catId) ?? 0)
        : 0
      totalDeductionByCategory.set(catId, received + pending)
    }

    // Convert to response format with averages and subcategories
    const expensesByCategory: CategoryAverageDto[] = Array.from(
      expenseMap.values()
    )
      .map(e => {
        const grossTotal = categoryGrossTotals.get(e.categoryId) ?? e.total
        const deduction = totalDeductionByCategory.get(e.categoryId) ?? 0

        // Convert subcategories map to array with proportional deduction
        const subcategories: SubcategoryAverageDto[] = Array.from(
          e.subcategories.entries()
        )
          .map(([subcategory, data]) => {
            const proportion = grossTotal > 0 ? data.total / grossTotal : 0
            const proportionalDeduction = deduction * proportion
            const netTotal = Math.max(0, data.total - proportionalDeduction)

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
          categoryIcon: e.categoryIcon,
          totalAmount: this.round(e.total),
          transactionCount: e.count,
          averagePerMonth: this.round(e.total / periodMonths),
        }

        const receivedReimb = shouldDeductReimbursements
          ? (reimbursementsByExpenseCategory.get(e.categoryId) ?? 0)
          : 0
        const pendingReimb = shouldDeductPending
          ? (pendingByExpenseCategory.get(e.categoryId) ?? 0)
          : 0
        if (receivedReimb > 0) {
          result.reimbursement = this.round(receivedReimb)
        }
        if (pendingReimb > 0) {
          result.pendingReimbursement = this.round(pendingReimb)
        }

        if (shouldIncludeMonthly) {
          const monthly = monthlyByCategory.get(e.categoryId)
          if (monthly) {
            result.monthlyAmounts = monthly
          }
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
          categoryIcon: i.categoryIcon,
          totalAmount: this.round(i.total),
          transactionCount: i.count,
          averagePerMonth: this.round(i.total / periodMonths),
        }
        if (shouldIncludeMonthly) {
          const monthly = monthlyByCategory.get(`INCOME:${i.categoryId}`)
          if (monthly) {
            result.monthlyAmounts = monthly
          }
        }
        if (subcategories.length > 0) {
          result.subcategories = subcategories
        }
        return result
      })
      .sort((a, b) => b.totalAmount - a.totalAmount)

    const response: BudgetStatisticsResponseDto = {
      periodMonths,
      expensesByCategory,
      incomeByCategory,
      totalExpenses: this.round(totalExpenses),
      totalIncome: this.round(totalIncome),
      averageMonthlyExpenses: this.round(totalExpenses / periodMonths),
      averageMonthlyIncome: this.round(totalIncome / periodMonths),
    }

    if (totalReimbursements > 0) {
      response.totalReimbursements = this.round(totalReimbursements)
    }
    if (totalPendingReimbursements > 0) {
      response.totalPendingReimbursements = this.round(
        totalPendingReimbursements
      )
    }
    if (shouldIncludeMonthly && allMonths.length > 0) {
      response.monthLabels = allMonths
    }

    return response
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
