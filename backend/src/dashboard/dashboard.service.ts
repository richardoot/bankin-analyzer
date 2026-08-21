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
import { UNCATEGORIZED_CATEGORY_ID } from './dto'
import type {
  DashboardFiltersDto,
  DashboardSummaryDto,
  MonthlyDataDto,
  CategoryDataDto,
  CategoryOptionDto,
  SubcategoryDataDto,
  ExceptionalEventDto,
} from './dto'

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan',
  '02': 'Fév',
  '03': 'Mar',
  '04': 'Avr',
  '05': 'Mai',
  '06': 'Juin',
  '07': 'Juil',
  '08': 'Août',
  '09': 'Sep',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Déc',
}

/**
 * Id a row is filtered and listed under. Transactions with no category share
 * the sentinel bucket, which the filter panel can hide like any other.
 */
function categoryKeyOf(categoryId: string | null): string {
  return categoryId ?? UNCATEGORIZED_CATEGORY_ID
}

/** Category options for the filter panel, alphabetical as before. */
function toSortedOptions(byId: Map<string, string>): CategoryOptionDto[] {
  return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name, 'fr')
  )
}

interface DashboardAggregatedRow {
  month_key: string
  category_id: string | null
  category_name: string
  category_icon: string | null
  type: string
  subcategory: string
  subcategory_icon: string | null
  is_exceptional: boolean
  transaction_count: number
  /** Already net of whichever deductions the filters asked for. */
  total_amount: number
  /** Cash received against the expenses in this group, for reporting. */
  received_credit: number
  /** Still owed on them, for reporting. */
  pending_credit: number
}

interface ExceptionalEventRow {
  id: string
  name: string
  color: string | null
  icon: string | null
  amount: number
}

interface AccountRow {
  account: string
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    userId: string,
    filters: DashboardFiltersDto
  ): Promise<DashboardSummaryDto> {
    // Use sentinel dates when no filter is provided
    const startDate = filters.startDate
      ? new Date(filters.startDate)
      : new Date('1970-01-01')
    const endDate = filters.endDate
      ? new Date(filters.endDate)
      : new Date('2099-12-31')

    // Hidden categories are addressed by id, so a rename never un-hides one.
    const hiddenExpenseCategoryIdsSet = new Set(
      filters.hiddenExpenseCategoryIds ?? []
    )
    const hiddenIncomeCategoryIdsSet = new Set(
      filters.hiddenIncomeCategoryIds ?? []
    )

    const shouldDeductReimbursements = filters.deductReimbursements !== false
    const shouldDeductPending = filters.deductPendingReimbursements === true
    const shouldIncludeBreakdown = filters.includeCategoryBreakdown === true

    // The deduction is applied inside the aggregation, per transaction, so the
    // rows come back already net. There is nothing left to subtract afterwards
    // and, in particular, nothing left to clamp at zero.
    const netAmount = netAmountSql({
      deductReceived: shouldDeductReimbursements,
      deductPending: shouldDeductPending,
    })

    // Fetch aggregated data, the accounts list and the exceptional events.
    // `CategoryAssociation` no longer takes part: it was the only thing
    // linking a refund to a category, and the link is now the transaction.
    const [rows, accountRows, eventRows] = await Promise.all([
      // Query 1: Aggregation by month + category + subcategory + type
      // (excludes stats-excluded accounts).
      this.prisma.$queryRaw<DashboardAggregatedRow[]>(Prisma.sql`
        WITH exceptional_tx AS (
          SELECT DISTINCT tt.transaction_id
          FROM app.transaction_tags tt
          JOIN app.tags tg ON tg.id = tt.tag_id
          WHERE tg.user_id = ${userId} AND tg.is_exceptional = true
        ),
        ${reimbursementCreditCtes(userId)}
        SELECT
          TO_CHAR(t.date, 'YYYY-MM') AS month_key,
          c.id AS category_id,
          COALESCE(c.name, 'Autre') AS category_name,
          c.icon AS category_icon,
          t.type::text AS type,
          COALESCE(t.subcategory, '') AS subcategory,
          sc.icon AS subcategory_icon,
          (et.transaction_id IS NOT NULL) AS is_exceptional,
          COUNT(*)::int AS transaction_count,
          -- Net of reimbursements, computed per transaction so the credit
          -- lands on the exact category, subcategory and account that carried
          -- the spending.
          SUM(${netAmount})::float AS total_amount,
          SUM(${RECEIVED_CREDIT_SCALED})::float AS received_credit,
          SUM(${PENDING_CREDIT_SCALED})::float AS pending_credit
        FROM app.transactions t
        LEFT JOIN app.categories c ON c.id = t.category_id
        LEFT JOIN app.subcategories sc ON sc.id = t.subcategory_id
        LEFT JOIN app.accounts a ON a.id = t.account_id
        LEFT JOIN exceptional_tx et ON et.transaction_id = t.id
        ${REIMBURSEMENT_CREDIT_JOINS}
        WHERE t.user_id = ${userId}
          AND t.date >= ${startDate}
          AND t.date <= ${endDate}
          AND COALESCE(a.is_excluded_from_stats, false) = false
        GROUP BY TO_CHAR(t.date, 'YYYY-MM'), c.id, COALESCE(c.name, 'Autre'), c.icon, t.type, COALESCE(t.subcategory, ''), sc.icon, (et.transaction_id IS NOT NULL)
      `),
      // Query 2: Distinct account names (including excluded from stats, for
      // filter panel). Sourced from the Account relation since the legacy
      // string column on transactions has been dropped.
      this.prisma.$queryRaw<AccountRow[]>(Prisma.sql`
        SELECT DISTINCT a.name AS account
        FROM app.transactions t
        JOIN app.accounts a ON a.id = t.account_id
        WHERE t.user_id = ${userId}
          AND t.date >= ${startDate}
          AND t.date <= ${endDate}
        ORDER BY a.name
      `),
      // Query 3: exceptional events overlapping the period, so the dashboard
      // can name what the exceptional share is made of.
      this.prisma.$queryRaw<ExceptionalEventRow[]>(Prisma.sql`
        SELECT
          tg.id,
          tg.name,
          tg.color,
          tg.icon,
          SUM(ABS(t.amount::numeric) / COALESCE(a.divisor, 1))::float AS amount
        FROM app.tags tg
        JOIN app.transaction_tags tt ON tt.tag_id = tg.id
        JOIN app.transactions t ON t.id = tt.transaction_id
        LEFT JOIN app.accounts a ON a.id = t.account_id
        WHERE tg.user_id = ${userId}
          AND tg.is_exceptional = true
          AND t.type = 'EXPENSE'
          AND t.date >= ${startDate}
          AND t.date <= ${endDate}
          AND COALESCE(a.is_excluded_from_stats, false) = false
        GROUP BY tg.id, tg.name, tg.color, tg.icon
        ORDER BY amount DESC
      `),
    ])

    // Extract all categories from aggregated rows (before filtering hidden
    // ones), keyed by the id the filter panel will send back.
    const allExpenseCategories = new Map<string, string>()
    const allIncomeCategories = new Map<string, string>()

    // Display name for every id the response may mention. Every id now comes
    // from a transaction the aggregation already returned — a deduction can no
    // longer name a category that carries no spending of its own, because it
    // travels with the expense it repays.
    const categoryNameById = new Map<string, string>([
      [UNCATEGORIZED_CATEGORY_ID, 'Autre'],
    ])

    for (const row of rows) {
      const target =
        row.type === 'EXPENSE' ? allExpenseCategories : allIncomeCategories
      target.set(categoryKeyOf(row.category_id), row.category_name)
      categoryNameById.set(categoryKeyOf(row.category_id), row.category_name)
    }

    // Build aggregation data structures
    const monthlyMap = new Map<
      string,
      {
        expenses: number
        income: number
        reimbursements: number
        exceptionalExpenses: number
      }
    >()
    /**
     * Net exceptional expenses per category. Net, not gross: the credit is
     * attached to the very transaction that carries the tag, so a holiday
     * refunded by friends reduces the exceptional share exactly instead of
     * being spread over the category by a ratio.
     */
    const exceptionalExpenseByCategory = new Map<string, number>()
    const expenseByCategoryMap = new Map<
      string,
      { amount: number; icon: string | null }
    >()
    const incomeByCategoryMap = new Map<
      string,
      { amount: number; icon: string | null }
    >()
    /** Cash actually deducted per expense category, for reporting only. */
    const reimbursementsByExpenseCategory = new Map<string, number>()
    /** Still-owed amount deducted per expense category, for reporting only. */
    const pendingByExpenseCategory = new Map<string, number>()

    // Breakdown structures (only populated when shouldIncludeBreakdown is true)
    const expenseMonthlyByCategory = new Map<string, Map<string, number>>()
    const incomeMonthlyByCategory = new Map<string, Map<string, number>>()
    const expenseSubcatByCategory = new Map<
      string,
      Map<string, { total: number; count: number; icon: string | null }>
    >()
    const incomeSubcatByCategory = new Map<
      string,
      Map<string, { total: number; count: number; icon: string | null }>
    >()
    /** Gross exceptional expenses per category and per month. */
    const expenseExceptionalMonthlyByCategory = new Map<
      string,
      Map<string, number>
    >()

    for (const row of rows) {
      const categoryKey = categoryKeyOf(row.category_id)
      const amount = row.total_amount
      const received = shouldDeductReimbursements ? row.received_credit : 0
      const pending = shouldDeductPending ? row.pending_credit : 0

      // Skip hidden categories for aggregations
      if (
        row.type === 'EXPENSE' &&
        hiddenExpenseCategoryIdsSet.has(categoryKey)
      ) {
        continue
      }
      if (
        row.type === 'INCOME' &&
        hiddenIncomeCategoryIdsSet.has(categoryKey)
      ) {
        continue
      }

      // Monthly aggregation. `amount` is already net, so an income transfer
      // that repaid a debt contributes only the part that was not a refund —
      // a 550 EUR transfer covering 50 EUR of expenses counts 500 as income
      // instead of vanishing from the income side altogether.
      const monthData = monthlyMap.get(row.month_key) ?? {
        expenses: 0,
        income: 0,
        reimbursements: 0,
        exceptionalExpenses: 0,
      }

      if (row.type === 'EXPENSE') {
        monthData.expenses += amount
        monthData.reimbursements += received + pending
        if (row.is_exceptional) monthData.exceptionalExpenses += amount
      } else {
        monthData.income += amount
      }
      monthlyMap.set(row.month_key, monthData)

      // Category aggregation
      if (row.type === 'EXPENSE') {
        const current = expenseByCategoryMap.get(categoryKey)
        expenseByCategoryMap.set(categoryKey, {
          amount: (current?.amount ?? 0) + amount,
          icon: current?.icon ?? row.category_icon,
        })
        reimbursementsByExpenseCategory.set(
          categoryKey,
          (reimbursementsByExpenseCategory.get(categoryKey) ?? 0) + received
        )
        pendingByExpenseCategory.set(
          categoryKey,
          (pendingByExpenseCategory.get(categoryKey) ?? 0) + pending
        )
        if (row.is_exceptional) {
          exceptionalExpenseByCategory.set(
            categoryKey,
            (exceptionalExpenseByCategory.get(categoryKey) ?? 0) + amount
          )
        }
      } else {
        const current = incomeByCategoryMap.get(categoryKey)
        incomeByCategoryMap.set(categoryKey, {
          amount: (current?.amount ?? 0) + amount,
          icon: current?.icon ?? row.category_icon,
        })
      }

      // Breakdown aggregation (per-month + per-subcategory by category)
      if (shouldIncludeBreakdown) {
        const monthlyTarget =
          row.type === 'EXPENSE'
            ? expenseMonthlyByCategory
            : incomeMonthlyByCategory
        let monthMap = monthlyTarget.get(categoryKey)
        if (!monthMap) {
          monthMap = new Map<string, number>()
          monthlyTarget.set(categoryKey, monthMap)
        }
        monthMap.set(row.month_key, (monthMap.get(row.month_key) ?? 0) + amount)

        if (row.type === 'EXPENSE' && row.is_exceptional) {
          let excMonthMap = expenseExceptionalMonthlyByCategory.get(categoryKey)
          if (!excMonthMap) {
            excMonthMap = new Map<string, number>()
            expenseExceptionalMonthlyByCategory.set(categoryKey, excMonthMap)
          }
          excMonthMap.set(
            row.month_key,
            (excMonthMap.get(row.month_key) ?? 0) + amount
          )
        }

        const subcatTarget =
          row.type === 'EXPENSE'
            ? expenseSubcatByCategory
            : incomeSubcatByCategory
        let subMap = subcatTarget.get(categoryKey)
        if (!subMap) {
          subMap = new Map<
            string,
            { total: number; count: number; icon: string | null }
          >()
          subcatTarget.set(categoryKey, subMap)
        }
        const subKey = row.subcategory ?? ''
        const subCurrent = subMap.get(subKey) ?? {
          total: 0,
          count: 0,
          icon: null,
        }
        subMap.set(subKey, {
          total: subCurrent.total + amount,
          count: subCurrent.count + (row.transaction_count ?? 0),
          icon: subCurrent.icon ?? row.subcategory_icon ?? null,
        })
      }
    }

    // No deduction pass here any more. The rows arrived net, category by
    // category and subcategory by subcategory, so there is nothing to subtract
    // and — crucially — nothing to clamp: the credit is bounded by the debts
    // recorded against each transaction, themselves capped at what it cost.
    // The `Math.max(0, …)` that used to guard these loops silently swallowed
    // whatever a category-level deduction overshot by.

    // Sort months and build monthly data with reimbursement deductions
    const sortedMonths = Array.from(monthlyMap.keys()).sort()

    const monthlyData: MonthlyDataDto[] = sortedMonths.map(month => {
      const parts = month.split('-')
      const year = parts[0] ?? ''
      const monthNum = parts[1] ?? '01'
      const data = monthlyMap.get(month) ?? {
        expenses: 0,
        income: 0,
        reimbursements: 0,
        exceptionalExpenses: 0,
      }

      // `expenses` is already net; the gross is it plus what was deducted.
      // Both shares are exact now — the exceptional part is the sum of the
      // netted exceptional transactions, not a ratio taken on gross amounts
      // and re-applied to a net total.
      const netExpenses = data.expenses
      const grossExpenses = data.expenses + data.reimbursements

      return {
        month,
        label: `${MONTH_LABELS[monthNum] ?? monthNum} ${year}`,
        expenses: Math.round(grossExpenses * 100) / 100,
        netExpenses: Math.round(netExpenses * 100) / 100,
        income: Math.round(data.income * 100) / 100,
        exceptionalExpenses: Math.round(data.exceptionalExpenses * 100) / 100,
        everydayNetExpenses:
          Math.round((netExpenses - data.exceptionalExpenses) * 100) / 100,
      }
    })

    // Build breakdown month labels (full range when start/end are explicit,
    // otherwise the union of months actually present in the rows)
    let breakdownMonthLabels: string[] = []
    let periodMonthsCount = 1
    if (shouldIncludeBreakdown) {
      if (filters.startDate && filters.endDate) {
        const cursor = new Date(
          startDate.getFullYear(),
          startDate.getMonth(),
          1
        )
        while (cursor <= endDate) {
          const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
          breakdownMonthLabels.push(ym)
          cursor.setMonth(cursor.getMonth() + 1)
        }
      } else {
        breakdownMonthLabels = sortedMonths.slice()
      }
      periodMonthsCount = Math.max(1, breakdownMonthLabels.length)
    }

    const round = (v: number) => Math.round(v * 100) / 100

    function buildExpenseCategoryDto(
      categoryId: string,
      data: { amount: number; icon: string | null }
    ): CategoryDataDto {
      const dto: CategoryDataDto = {
        categoryId,
        category: categoryNameById.get(categoryId) ?? 'Autre',
        amount: round(data.amount),
        icon: data.icon,
      }
      if (!shouldIncludeBreakdown) return dto

      // Already net, month by month: the credit travelled with the expense it
      // repays, so a month can legitimately come out negative when a delayed
      // refund lands where nothing was spent.
      const monthMap =
        expenseMonthlyByCategory.get(categoryId) ?? new Map<string, number>()
      dto.monthlyAmounts = breakdownMonthLabels.map(m =>
        round(monthMap.get(m) ?? 0)
      )

      const recvDeduction = shouldDeductReimbursements
        ? (reimbursementsByExpenseCategory.get(categoryId) ?? 0)
        : 0
      const pendDeduction = shouldDeductPending
        ? (pendingByExpenseCategory.get(categoryId) ?? 0)
        : 0

      // Subcategory totals are exact, not shared out. The deduction used to be
      // spread pro rata over every subcategory of the category, because a
      // category-level credit could not say which one it repaid: 600 EUR back
      // on the dentist took 120 EUR off the pharmacy, which had been refunded
      // nothing.
      const subMap =
        expenseSubcatByCategory.get(categoryId) ??
        new Map<string, { total: number; count: number; icon: string | null }>()
      const subcategories: SubcategoryDataDto[] = Array.from(subMap.entries())
        .map(([subcategory, sd]) => {
          const dto: SubcategoryDataDto = {
            subcategory,
            amount: round(sd.total),
            transactionCount: sd.count,
            averagePerMonth: round(sd.total / periodMonthsCount),
          }
          if (sd.icon) dto.icon = sd.icon
          return dto
        })
        .sort((a, b) => b.amount - a.amount)

      const totalCount = Array.from(subMap.values()).reduce(
        (s, sd) => s + sd.count,
        0
      )

      dto.transactionCount = totalCount
      dto.averagePerMonth = round(data.amount / periodMonthsCount)

      // Everyday / exceptional split, exact. Both shares are sums of netted
      // transactions, so a refunded holiday reduces the exceptional side and
      // nothing else — no ratio, no leakage into the everyday baseline.
      const exceptionalAmount =
        exceptionalExpenseByCategory.get(categoryId) ?? 0
      const everydayAmount = data.amount - exceptionalAmount

      dto.exceptionalAmount = round(exceptionalAmount)
      dto.everydayAmount = round(everydayAmount)
      // Divided by the plain period, exactly like averagePerMonth: a category
      // untouched by any event must read identically in both modes. Shrinking
      // the divisor by the event days would move *every* category, and would be
      // plainly wrong for the fixed ones — rent, insurance and subscriptions are
      // still debited while their owner is away.
      dto.everydayAveragePerMonth = round(everydayAmount / periodMonthsCount)

      const excMonthMap = expenseExceptionalMonthlyByCategory.get(categoryId)
      dto.everydayMonthlyAmounts = breakdownMonthLabels.map((m, i) => {
        const net = dto.monthlyAmounts?.[i] ?? 0
        return round(net - (excMonthMap?.get(m) ?? 0))
      })

      if (subcategories.length > 0) dto.subcategories = subcategories
      if (recvDeduction > 0) dto.reimbursement = round(recvDeduction)
      if (pendDeduction > 0) dto.pendingReimbursement = round(pendDeduction)

      return dto
    }

    function buildIncomeCategoryDto(
      categoryId: string,
      data: { amount: number; icon: string | null }
    ): CategoryDataDto {
      const dto: CategoryDataDto = {
        categoryId,
        category: categoryNameById.get(categoryId) ?? 'Autre',
        amount: round(data.amount),
        icon: data.icon,
      }
      if (!shouldIncludeBreakdown) return dto

      const monthMap =
        incomeMonthlyByCategory.get(categoryId) ?? new Map<string, number>()
      dto.monthlyAmounts = breakdownMonthLabels.map(m =>
        round(monthMap.get(m) ?? 0)
      )

      const subMap =
        incomeSubcatByCategory.get(categoryId) ??
        new Map<string, { total: number; count: number; icon: string | null }>()
      const subcategories: SubcategoryDataDto[] = Array.from(subMap.entries())
        .map(([subcategory, sd]) => {
          const dto: SubcategoryDataDto = {
            subcategory,
            amount: round(sd.total),
            transactionCount: sd.count,
            averagePerMonth: round(sd.total / periodMonthsCount),
          }
          if (sd.icon) dto.icon = sd.icon
          return dto
        })
        .sort((a, b) => b.amount - a.amount)

      const totalCount = Array.from(subMap.values()).reduce(
        (s, sd) => s + sd.count,
        0
      )

      dto.transactionCount = totalCount
      dto.averagePerMonth = round(data.amount / periodMonthsCount)
      if (subcategories.length > 0) dto.subcategories = subcategories

      return dto
    }

    // Sort categories by amount descending
    const expensesByCategory: CategoryDataDto[] = Array.from(
      expenseByCategoryMap.entries()
    )
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([categoryId, data]) => buildExpenseCategoryDto(categoryId, data))

    const incomeByCategory: CategoryDataDto[] = Array.from(
      incomeByCategoryMap.entries()
    )
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([categoryId, data]) => buildIncomeCategoryDto(categoryId, data))

    // Calculate totals from category data
    const totalExpenses =
      Math.round(
        expensesByCategory.reduce((sum, cat) => sum + cat.amount, 0) * 100
      ) / 100
    const totalIncome =
      Math.round(
        incomeByCategory.reduce((sum, cat) => sum + cat.amount, 0) * 100
      ) / 100

    const totalExceptionalExpenses =
      Math.round(
        expensesByCategory.reduce(
          (sum, cat) => sum + (cat.exceptionalAmount ?? 0),
          0
        ) * 100
      ) / 100

    const exceptionalEvents: ExceptionalEventDto[] = (eventRows ?? []).map(
      r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        icon: r.icon,
        amount: Math.round((r.amount ?? 0) * 100) / 100,
      })
    )

    const response: DashboardSummaryDto = {
      monthlyData,
      expensesByCategory,
      incomeByCategory,
      totalExpenses,
      totalIncome,
      allExpenseCategories: toSortedOptions(allExpenseCategories),
      allIncomeCategories: toSortedOptions(allIncomeCategories),
      availableAccounts: accountRows.map(r => r.account),
      totalExceptionalExpenses,
      exceptionalEvents,
    }

    if (shouldIncludeBreakdown) {
      response.periodMonths = periodMonthsCount
      response.monthLabels = breakdownMonthLabels
    }

    return response
  }
}
