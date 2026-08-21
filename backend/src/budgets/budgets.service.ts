import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import {
  PENDING_CREDIT_SCALED,
  RECEIVED_CREDIT_SCALED,
  REIMBURSEMENT_CREDIT_JOINS,
  netAmountSql,
  reimbursementCreditCtes,
} from '../reimbursements/reimbursement-credit.sql'
import type {
  BudgetStatisticsResponseDto,
  BudgetStatisticsFiltersDto,
  CategoryAverageDto,
  SubcategoryAverageDto,
} from './dto'

/**
 * Lower bound of the UTC day `value` falls in. Accepts a `YYYY-MM-DD` string
 * or a full ISO timestamp.
 */
function startOfUtcDay(value: string | Date): Date {
  const d = new Date(value)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/** Upper bound (inclusive) of the UTC day `value` falls in. */
function endOfUtcDay(value: string | Date): Date {
  const d = new Date(value)
  d.setUTCHours(23, 59, 59, 999)
  return d
}

interface AggregatedTransactionRow {
  category_id: string
  category_name: string
  category_icon: string | null
  type: string
  subcategory: string
  /** True when the transaction carries at least one tag flagged exceptional. */
  is_exceptional: boolean
  transaction_count: number
  /** Already net of whichever deductions the filters asked for. */
  total_amount: number
  /** Cash received against the expenses in this group, for reporting. */
  received_credit: number
  /** Still owed on them, for reporting. */
  pending_credit: number
}

/** Debt still owed on an expense that falls outside the statistics window. */
interface OutOfPeriodPendingRow {
  category_id: string
  pending_amount: number
}

interface MonthlyBreakdownRow {
  category_id: string
  type: string
  year_month: string
  is_exceptional: boolean
  monthly_amount: number
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
    // Transaction dates are calendar days anchored at UTC midnight, so the
    // bounds must span whole UTC days. Without the upper extension a plan
    // ending on the 31st drops every transaction of the 31st itself.
    const startDate = startOfUtcDay(filters.startDate)
    const endDate = endOfUtcDay(filters.endDate)
    const shouldDeductReimbursements = filters.deductReimbursements !== false
    const shouldDeductPending = filters.deductPendingReimbursements === true
    const shouldIncludeMonthly = filters.includeMonthlyBreakdown === true
    const includeAllPending = filters.includeAllPendingReimbursements === true

    // Calculate period in months
    const periodMonths = this.calculateMonthsDiff(startDate, endDate)

    // Same rule as the dashboard, from the same module: the deduction is
    // applied per transaction inside the aggregation, so the rows come back
    // net and `CategoryAssociation` takes no part in the calculation.
    const netAmount = netAmountSql({
      deductReceived: shouldDeductReimbursements,
      deductPending: shouldDeductPending,
    })

    const [rows, monthlyRows, outOfPeriodPendingRows] = await Promise.all([
      this.prisma.$queryRaw<AggregatedTransactionRow[]>(Prisma.sql`
        WITH exceptional_tx AS (
          SELECT DISTINCT tt.transaction_id
          FROM app.transaction_tags tt
          JOIN app.tags tg ON tg.id = tt.tag_id
          WHERE tg.user_id = ${userId} AND tg.is_exceptional = true
        ),
        ${reimbursementCreditCtes(userId)}
        SELECT
          t.category_id,
          c.name AS category_name,
          c.icon AS category_icon,
          t.type::text AS type,
          COALESCE(t.subcategory, '') AS subcategory,
          (et.transaction_id IS NOT NULL) AS is_exceptional,
          COUNT(*)::int AS transaction_count,
          SUM(${netAmount})::float AS total_amount,
          SUM(${RECEIVED_CREDIT_SCALED})::float AS received_credit,
          SUM(${PENDING_CREDIT_SCALED})::float AS pending_credit
        FROM app.transactions t
        JOIN app.categories c ON c.id = t.category_id
        LEFT JOIN app.accounts a ON a.id = t.account_id
        LEFT JOIN exceptional_tx et ON et.transaction_id = t.id
        ${REIMBURSEMENT_CREDIT_JOINS}
        WHERE t.user_id = ${userId}
          AND t.date >= ${startDate}
          AND t.date <= ${endDate}
          AND t.category_id IS NOT NULL
          AND COALESCE(a.is_excluded_from_budget, false) = false
          AND c.is_excluded_from_budget = false
        GROUP BY t.category_id, c.name, c.icon, t.type, COALESCE(t.subcategory, ''), (et.transaction_id IS NOT NULL)
      `),
      shouldIncludeMonthly
        ? this.prisma.$queryRaw<MonthlyBreakdownRow[]>(Prisma.sql`
            WITH exceptional_tx AS (
              SELECT DISTINCT tt.transaction_id
              FROM app.transaction_tags tt
              JOIN app.tags tg ON tg.id = tt.tag_id
              WHERE tg.user_id = ${userId} AND tg.is_exceptional = true
            ),
            ${reimbursementCreditCtes(userId)}
            SELECT
              t.category_id,
              t.type::text AS type,
              TO_CHAR(t.date, 'YYYY-MM') AS year_month,
              (et.transaction_id IS NOT NULL) AS is_exceptional,
              SUM(${netAmount})::float AS monthly_amount
            FROM app.transactions t
            JOIN app.categories c ON c.id = t.category_id
            LEFT JOIN app.accounts a ON a.id = t.account_id
            LEFT JOIN exceptional_tx et ON et.transaction_id = t.id
            ${REIMBURSEMENT_CREDIT_JOINS}
            WHERE t.user_id = ${userId}
              AND t.date >= ${startDate}
              AND t.date <= ${endDate}
              AND t.category_id IS NOT NULL
              AND COALESCE(a.is_excluded_from_budget, false) = false
              AND c.is_excluded_from_budget = false
            GROUP BY t.category_id, t.type, TO_CHAR(t.date, 'YYYY-MM'), (et.transaction_id IS NOT NULL)
            ORDER BY t.category_id, TO_CHAR(t.date, 'YYYY-MM')
          `)
        : Promise.resolve([]),
      // Debts on expenses outside the window, keyed by the expense's own
      // category — the deduction anchors on the spending now, so no category
      // mapping is involved. Only fetched when the caller asks for it.
      shouldDeductPending && includeAllPending
        ? this.prisma.$queryRaw<OutOfPeriodPendingRow[]>(Prisma.sql`
            SELECT
              t.category_id,
              SUM(
                (claims.claimed - claims.credited) / COALESCE(a.divisor, 1)
              )::float AS pending_amount
            FROM (
              SELECT
                r.transaction_id,
                r.amount AS claimed,
                COALESCE((
                  SELECT SUM(p.amount) FROM app.reimbursement_payments p
                  WHERE p.reimbursement_id = r.id
                ), 0) AS credited
              FROM app.reimbursement_requests r
              WHERE r.user_id = ${userId}
            ) claims
            JOIN app.transactions t ON t.id = claims.transaction_id
            JOIN app.categories c ON c.id = t.category_id
            LEFT JOIN app.accounts a ON a.id = t.account_id
            WHERE claims.claimed > claims.credited
              AND (t.date < ${startDate} OR t.date > ${endDate})
              AND COALESCE(a.is_excluded_from_budget, false) = false
              AND c.is_excluded_from_budget = false
            GROUP BY t.category_id
          `)
        : Promise.resolve([] as OutOfPeriodPendingRow[]),
    ])

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

    // Expense carried by exceptional-tagged transactions, per category, net of
    // reimbursements — the credit travelled with the tagged transaction itself,
    // so a refunded holiday reduces this share and nothing else.
    const netExceptionalByCategory = new Map<string, number>()

    // Since `is_exceptional` joined the GROUP BY, a (category, subcategory)
    // pair can now come back on two rows — accumulate instead of overwriting.
    const addSubcategory = (
      subcategories: Map<string, { total: number; count: number }>,
      subcategory: string,
      amount: number,
      count: number
    ): void => {
      const existing = subcategories.get(subcategory)
      if (existing) {
        existing.total += amount
        existing.count += count
      } else {
        subcategories.set(subcategory, { total: amount, count })
      }
    }

    for (const row of rows) {
      const categoryId = row.category_id
      const subcategory = row.subcategory
      const amount = row.total_amount
      const count = row.transaction_count

      if (row.type === 'EXPENSE') {
        totalExpenses += amount

        if (row.is_exceptional) {
          netExceptionalByCategory.set(
            categoryId,
            (netExceptionalByCategory.get(categoryId) ?? 0) + amount
          )
        }

        const existing = expenseMap.get(categoryId)
        if (existing) {
          existing.total += amount
          existing.count += count
          addSubcategory(existing.subcategories, subcategory, amount, count)
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
        // No category is diverted wholesale any more. `amount` already excludes
        // the cash this transaction paid back, so a transfer mixing salary and
        // a refund contributes the salary and nothing else — where the previous
        // model had to drop the entire category or keep all of it.
        totalIncome += amount

        const existing = incomeMap.get(categoryId)
        if (existing) {
          existing.total += amount
          existing.count += count
          addSubcategory(existing.subcategories, subcategory, amount, count)
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

    // Received and still-owed credit per expense category, taken straight
    // from the aggregation: both travelled with the transactions they belong
    // to, so no second query and no category mapping are involved.
    const pendingByExpenseCategory = new Map<string, number>()
    for (const row of rows) {
      if (row.type !== 'EXPENSE') continue
      if (shouldDeductReimbursements) {
        reimbursementsByExpenseCategory.set(
          row.category_id,
          (reimbursementsByExpenseCategory.get(row.category_id) ?? 0) +
            row.received_credit
        )
      }
      if (shouldDeductPending) {
        pendingByExpenseCategory.set(
          row.category_id,
          (pendingByExpenseCategory.get(row.category_id) ?? 0) +
            row.pending_credit
        )
      }
    }

    // Build monthly breakdown maps (keyed by category_id → sorted monthly amounts)
    // Deductions from reimbursements and pending are applied per-month to match the toggles.
    const monthlyByCategory = new Map<string, number[]>()
    const everydayMonthlyByCategory = new Map<string, number[]>()
    const allMonths: string[] = []
    if (shouldIncludeMonthly) {
      // Generate all year-month keys in the period. UTC throughout, to match
      // the `TO_CHAR(t.date, 'YYYY-MM')` keys the SQL above produces — local
      // getters would drift by a month on servers west of UTC.
      const cursor = new Date(
        Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1)
      )
      while (cursor <= endDate) {
        const ym = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`
        allMonths.push(ym)
        cursor.setUTCMonth(cursor.getUTCMonth() + 1)
      }

      // Group monthly rows by type:category_id → month → amount. Rows are now
      // also split on `is_exceptional`, so months must be accumulated.
      const rawMap = new Map<string, Map<string, number>>()
      const rawExceptionalMap = new Map<string, Map<string, number>>()
      for (const row of monthlyRows) {
        const key = `${row.type}:${row.category_id}`
        if (!rawMap.has(key)) {
          rawMap.set(key, new Map())
        }
        const target = rawMap.get(key)!
        target.set(
          row.year_month,
          (target.get(row.year_month) ?? 0) + row.monthly_amount
        )

        if (row.type === 'EXPENSE' && row.is_exceptional) {
          if (!rawExceptionalMap.has(key)) {
            rawExceptionalMap.set(key, new Map())
          }
          const exceptional = rawExceptionalMap.get(key)!
          exceptional.set(
            row.year_month,
            (exceptional.get(row.year_month) ?? 0) + row.monthly_amount
          )
        }
      }

      // The monthly rows are already net — the same per-transaction credit the
      // category totals used — so there is nothing left to subtract here, and
      // no `Math.max(0, …)` to swallow a month where a delayed refund exceeds
      // what was spent.
      for (const [key, monthMap] of rawMap) {
        if (!key.startsWith('EXPENSE:')) continue
        const catId = key.split(':')[1] ?? key
        const exceptionalMonths = rawExceptionalMap.get(key)

        const amounts: number[] = []
        const everydayAmounts: number[] = []
        for (const m of allMonths) {
          const net = monthMap.get(m) ?? 0
          amounts.push(this.round(net))
          // Exact, not pro rata: the exceptional share is the sum of the
          // netted exceptional transactions of that month.
          everydayAmounts.push(
            this.round(net - (exceptionalMonths?.get(m) ?? 0))
          )
        }
        monthlyByCategory.set(catId, amounts)
        everydayMonthlyByCategory.set(catId, everydayAmounts)
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

    // Already deducted inside the aggregation; these totals are reported, not
    // applied. Subtracting again here would double-count.
    let totalReimbursements = 0
    for (const amount of reimbursementsByExpenseCategory.values()) {
      totalReimbursements += amount
    }
    let totalPendingReimbursements = 0
    for (const amount of pendingByExpenseCategory.values()) {
      totalPendingReimbursements += amount
    }

    // Debts whose expense falls outside the window. They have no row in the
    // aggregation to attach to, so `includeAllPendingReimbursements` — meant
    // for sizing a future plan against money still owed today — needs its own
    // pass. Applied only to categories the period actually shows, exactly as
    // before.
    if (shouldDeductPending && includeAllPending) {
      for (const row of outOfPeriodPendingRows) {
        const expenseData = expenseMap.get(row.category_id)
        if (!expenseData) continue
        expenseData.total -= row.pending_amount
        totalExpenses -= row.pending_amount
        totalPendingReimbursements += row.pending_amount
        pendingByExpenseCategory.set(
          row.category_id,
          (pendingByExpenseCategory.get(row.category_id) ?? 0) +
            row.pending_amount
        )
      }
    }

    // Net expense carried by exceptional events, accumulated while building
    // the category DTOs below.
    let totalExceptionalExpenses = 0

    // Convert to response format with averages and subcategories
    const expensesByCategory: CategoryAverageDto[] = Array.from(
      expenseMap.values()
    )
      .map(e => {
        // Subcategory totals are exact: each carries the credit of its own
        // transactions. Sharing the deduction out pro rata used to move money
        // between subcategories that had been refunded nothing.
        const subcategories: SubcategoryAverageDto[] = Array.from(
          e.subcategories.entries()
        )
          .map(([subcategory, data]) => ({
            subcategory,
            totalAmount: this.round(data.total),
            transactionCount: data.count,
            averagePerMonth: this.round(data.total / periodMonths),
          }))
          .sort((a, b) => b.totalAmount - a.totalAmount)

        // Both shares are sums of netted transactions, so the split is exact
        // rather than a ratio taken on gross and re-applied to net.
        const exceptionalAmount =
          netExceptionalByCategory.get(e.categoryId) ?? 0
        const everydayAmount = e.total - exceptionalAmount
        totalExceptionalExpenses += exceptionalAmount

        const result: CategoryAverageDto = {
          categoryId: e.categoryId,
          categoryName: e.categoryName,
          categoryIcon: e.categoryIcon,
          totalAmount: this.round(e.total),
          transactionCount: e.count,
          averagePerMonth: this.round(e.total / periodMonths),
          exceptionalAmount: this.round(exceptionalAmount),
          everydayAmount: this.round(everydayAmount),
          // Divided by the plain period, exactly like averagePerMonth: a
          // category no event ever touched must read identically in both.
          everydayAveragePerMonth: this.round(everydayAmount / periodMonths),
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
          const everydayMonthly = everydayMonthlyByCategory.get(e.categoryId)
          if (everydayMonthly) {
            result.everydayMonthlyAmounts = everydayMonthly
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
      totalExceptionalExpenses: this.round(totalExceptionalExpenses),
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
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth()) +
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
