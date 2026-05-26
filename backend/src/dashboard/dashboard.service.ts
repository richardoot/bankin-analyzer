import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type {
  DashboardFiltersDto,
  DashboardSummaryDto,
  MonthlyDataDto,
  CategoryDataDto,
  SubcategoryDataDto,
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

interface DashboardAggregatedRow {
  month_key: string
  category_id: string | null
  category_name: string
  category_icon: string | null
  type: string
  subcategory: string
  subcategory_icon: string | null
  transaction_count: number
  total_amount: number
}

interface AccountRow {
  account: string
}

interface MonthlyPendingRow {
  category_id: string
  category_name: string
  month_key: string
  pending_amount: number
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

    const hiddenExpenseCategoriesSet = new Set(
      filters.hiddenExpenseCategories ?? []
    )
    const hiddenIncomeCategoriesSet = new Set(
      filters.hiddenIncomeCategories ?? []
    )

    const shouldDeductReimbursements = filters.deductReimbursements !== false
    const shouldDeductPending = filters.deductPendingReimbursements === true
    const shouldIncludeBreakdown = filters.includeCategoryBreakdown === true

    // Fetch aggregated data, accounts list, category associations, and
    // (optionally) pending reimbursements in parallel.
    const [rows, accountRows, dbAssociations, pendingRows] = await Promise.all([
      // Query 1: Aggregation by month + category + subcategory + type
      // (excludes stats-excluded accounts).
      this.prisma.$queryRaw<DashboardAggregatedRow[]>(Prisma.sql`
        SELECT
          TO_CHAR(t.date, 'YYYY-MM') AS month_key,
          c.id AS category_id,
          COALESCE(c.name, 'Autre') AS category_name,
          c.icon AS category_icon,
          t.type::text AS type,
          COALESCE(t.subcategory, '') AS subcategory,
          sc.icon AS subcategory_icon,
          COUNT(*)::int AS transaction_count,
          SUM(
            CASE WHEN t.type = 'EXPENSE'
              THEN ABS(t.amount::numeric) / COALESCE(a.divisor, 1)
              ELSE t.amount::numeric / COALESCE(a.divisor, 1)
            END
          )::float AS total_amount
        FROM app.transactions t
        LEFT JOIN app.categories c ON c.id = t.category_id
        LEFT JOIN app.subcategories sc ON sc.id = t.subcategory_id
        LEFT JOIN app.accounts a ON a.id = t.account_id
        WHERE t.user_id = ${userId}
          AND t.date >= ${startDate}
          AND t.date <= ${endDate}
          AND COALESCE(a.is_excluded_from_stats, false) = false
        GROUP BY TO_CHAR(t.date, 'YYYY-MM'), c.id, COALESCE(c.name, 'Autre'), c.icon, t.type, COALESCE(t.subcategory, ''), sc.icon
      `),
      // Query 2: Distinct accounts (including excluded from stats, for filter panel)
      this.prisma.$queryRaw<AccountRow[]>(Prisma.sql`
        SELECT DISTINCT t.account
        FROM app.transactions t
        WHERE t.user_id = ${userId}
          AND t.date >= ${startDate}
          AND t.date <= ${endDate}
          AND t.account IS NOT NULL
        ORDER BY t.account
      `),
      // Query 3: Category associations (unchanged)
      this.prisma.categoryAssociation.findMany({
        where: { userId },
        include: {
          expenseCategory: true,
          incomeCategory: true,
        },
      }),
      // Query 4: Pending reimbursements per month per category (only when toggle on)
      shouldDeductPending
        ? this.prisma.$queryRaw<MonthlyPendingRow[]>(Prisma.sql`
            SELECT
              rr.category_id,
              c.name AS category_name,
              TO_CHAR(t.date, 'YYYY-MM') AS month_key,
              SUM(
                (rr.amount::numeric - rr.amount_received::numeric) / COALESCE(a.divisor, 1)
              )::float AS pending_amount
            FROM app.reimbursement_requests rr
            JOIN app.transactions t ON t.id = rr.transaction_id
            JOIN app.categories c ON c.id = rr.category_id
            LEFT JOIN app.accounts a ON a.id = t.account_id
            WHERE rr.user_id = ${userId}
              AND rr.status IN ('PENDING', 'PARTIAL')
              AND t.date >= ${startDate}
              AND t.date <= ${endDate}
              AND COALESCE(a.is_excluded_from_stats, false) = false
            GROUP BY rr.category_id, c.name, TO_CHAR(t.date, 'YYYY-MM')
          `)
        : Promise.resolve([] as MonthlyPendingRow[]),
    ])

    // Convert DB associations to name-based associations
    const categoryAssociations = dbAssociations.map(a => ({
      expenseCategory: a.expenseCategory.name,
      incomeCategory: a.incomeCategory.name,
    }))

    // Build a set of income categories used as reimbursements
    const reimbursementIncomeCategories = new Set(
      categoryAssociations.map(a => a.incomeCategory)
    )

    // Extract all categories from aggregated rows (before filtering hidden ones)
    const allExpenseCategories = new Set<string>()
    const allIncomeCategories = new Set<string>()

    for (const row of rows) {
      if (row.type === 'EXPENSE') {
        allExpenseCategories.add(row.category_name)
      } else {
        allIncomeCategories.add(row.category_name)
      }
    }

    // Build aggregation data structures
    const monthlyMap = new Map<
      string,
      { expenses: number; income: number; reimbursements: number }
    >()
    const expenseByCategoryMap = new Map<
      string,
      { amount: number; icon: string | null }
    >()
    const incomeByCategoryMap = new Map<
      string,
      { amount: number; icon: string | null }
    >()
    const reimbursementsByExpenseCategory = new Map<string, number>()

    // Breakdown structures (only populated when shouldIncludeBreakdown is true)
    const categoryIdByName = new Map<string, string>()
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
    const reimbByExpenseCategoryByMonth = new Map<string, Map<string, number>>()

    for (const row of rows) {
      const categoryName = row.category_name
      const amount = row.total_amount

      // Handle reimbursement income: track by expense category and by month
      // Only when the deductReimbursements toggle is on. Otherwise these
      // rows are treated as regular income.
      if (shouldDeductReimbursements && row.type === 'INCOME') {
        const assoc = categoryAssociations.find(
          a => a.incomeCategory === categoryName
        )
        if (assoc) {
          // Track reimbursements by expense category
          const current =
            reimbursementsByExpenseCategory.get(assoc.expenseCategory) ?? 0
          reimbursementsByExpenseCategory.set(
            assoc.expenseCategory,
            current + amount
          )

          // Track reimbursements by month
          const monthData = monthlyMap.get(row.month_key) ?? {
            expenses: 0,
            income: 0,
            reimbursements: 0,
          }
          monthData.reimbursements += amount
          monthlyMap.set(row.month_key, monthData)

          // Track reimbursements per-month per-expense-category (for breakdown)
          if (shouldIncludeBreakdown) {
            let m = reimbByExpenseCategoryByMonth.get(assoc.expenseCategory)
            if (!m) {
              m = new Map<string, number>()
              reimbByExpenseCategoryByMonth.set(assoc.expenseCategory, m)
            }
            m.set(row.month_key, (m.get(row.month_key) ?? 0) + amount)
          }
          continue
        }
      }

      // Skip hidden categories for aggregations
      if (
        row.type === 'EXPENSE' &&
        hiddenExpenseCategoriesSet.has(categoryName)
      ) {
        continue
      }
      if (
        row.type === 'INCOME' &&
        hiddenIncomeCategoriesSet.has(categoryName)
      ) {
        continue
      }
      // Skip income categories used as reimbursements from income totals
      // (only when the deductReimbursements toggle is on)
      if (
        shouldDeductReimbursements &&
        row.type === 'INCOME' &&
        reimbursementIncomeCategories.has(categoryName)
      ) {
        continue
      }

      // Monthly aggregation
      const monthData = monthlyMap.get(row.month_key) ?? {
        expenses: 0,
        income: 0,
        reimbursements: 0,
      }

      if (row.type === 'EXPENSE') {
        monthData.expenses += amount
      } else {
        monthData.income += amount
      }
      monthlyMap.set(row.month_key, monthData)

      // Category aggregation
      if (row.type === 'EXPENSE') {
        const current = expenseByCategoryMap.get(categoryName)
        expenseByCategoryMap.set(categoryName, {
          amount: (current?.amount ?? 0) + amount,
          icon: current?.icon ?? row.category_icon,
        })
      } else {
        const current = incomeByCategoryMap.get(categoryName)
        incomeByCategoryMap.set(categoryName, {
          amount: (current?.amount ?? 0) + amount,
          icon: current?.icon ?? row.category_icon,
        })
      }

      // Breakdown aggregation (per-month + per-subcategory by category)
      if (shouldIncludeBreakdown) {
        if (row.category_id && !categoryIdByName.has(categoryName)) {
          categoryIdByName.set(categoryName, row.category_id)
        }
        const monthlyTarget =
          row.type === 'EXPENSE'
            ? expenseMonthlyByCategory
            : incomeMonthlyByCategory
        let monthMap = monthlyTarget.get(categoryName)
        if (!monthMap) {
          monthMap = new Map<string, number>()
          monthlyTarget.set(categoryName, monthMap)
        }
        monthMap.set(row.month_key, (monthMap.get(row.month_key) ?? 0) + amount)

        const subcatTarget =
          row.type === 'EXPENSE'
            ? expenseSubcatByCategory
            : incomeSubcatByCategory
        let subMap = subcatTarget.get(categoryName)
        if (!subMap) {
          subMap = new Map<
            string,
            { total: number; count: number; icon: string | null }
          >()
          subcatTarget.set(categoryName, subMap)
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

    // Deduct reimbursements from expense categories
    for (const [
      expenseCategory,
      reimbursement,
    ] of reimbursementsByExpenseCategory) {
      const current = expenseByCategoryMap.get(expenseCategory)
      expenseByCategoryMap.set(expenseCategory, {
        amount: Math.max(0, (current?.amount ?? 0) - reimbursement),
        icon: current?.icon ?? null,
      })
    }

    // Aggregate pending reimbursements by expense category name and by month.
    // pendingRows are keyed by expense category id; map to name via dbAssociations
    // (the rr.category_id IS the expense category id) — but we joined on
    // app.categories so each row already carries the name.
    const pendingByExpenseCategoryName = new Map<string, number>()
    const pendingByMonth = new Map<string, number>()
    const pendingByExpenseCategoryByMonth = new Map<
      string,
      Map<string, number>
    >()
    for (const row of pendingRows) {
      const current = pendingByExpenseCategoryName.get(row.category_name) ?? 0
      pendingByExpenseCategoryName.set(
        row.category_name,
        current + row.pending_amount
      )
      const monthCurrent = pendingByMonth.get(row.month_key) ?? 0
      pendingByMonth.set(row.month_key, monthCurrent + row.pending_amount)

      if (shouldIncludeBreakdown) {
        let m = pendingByExpenseCategoryByMonth.get(row.category_name)
        if (!m) {
          m = new Map<string, number>()
          pendingByExpenseCategoryByMonth.set(row.category_name, m)
        }
        m.set(row.month_key, (m.get(row.month_key) ?? 0) + row.pending_amount)
      }
    }

    // Deduct pending reimbursements from expense categories (toggle-gated:
    // pendingRows is empty when shouldDeductPending is false).
    for (const [
      expenseCategoryName,
      pendingAmount,
    ] of pendingByExpenseCategoryName) {
      const current = expenseByCategoryMap.get(expenseCategoryName)
      expenseByCategoryMap.set(expenseCategoryName, {
        amount: Math.max(0, (current?.amount ?? 0) - pendingAmount),
        icon: current?.icon ?? null,
      })
    }

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
      }

      // Net expenses = gross expenses - received reimbursements - pending reimbursements.
      // Allow negative values (when deductions exceed expenses for the month).
      const pending = pendingByMonth.get(month) ?? 0
      const netExpenses = data.expenses - data.reimbursements - pending

      return {
        month,
        label: `${MONTH_LABELS[monthNum] ?? monthNum} ${year}`,
        expenses: Math.round(data.expenses * 100) / 100,
        netExpenses: Math.round(netExpenses * 100) / 100,
        income: Math.round(data.income * 100) / 100,
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
      category: string,
      data: { amount: number; icon: string | null }
    ): CategoryDataDto {
      const dto: CategoryDataDto = {
        category,
        amount: round(data.amount),
        icon: data.icon,
      }
      if (!shouldIncludeBreakdown) return dto

      const id = categoryIdByName.get(category)
      if (id) dto.categoryId = id

      const monthMap =
        expenseMonthlyByCategory.get(category) ?? new Map<string, number>()
      const reimbMonths = reimbByExpenseCategoryByMonth.get(category)
      const pendingMonths = pendingByExpenseCategoryByMonth.get(category)

      // Allow negative values for months where deductions exceed expenses
      // (e.g. a delayed reimbursement received in a month with no spending).
      dto.monthlyAmounts = breakdownMonthLabels.map(m => {
        let v = monthMap.get(m) ?? 0
        if (reimbMonths) v -= reimbMonths.get(m) ?? 0
        if (pendingMonths) v -= pendingMonths.get(m) ?? 0
        return round(v)
      })

      const gross = Array.from(monthMap.values()).reduce((s, v) => s + v, 0)
      const recvDeduction = shouldDeductReimbursements
        ? (reimbursementsByExpenseCategory.get(category) ?? 0)
        : 0
      const pendDeduction = shouldDeductPending
        ? (pendingByExpenseCategoryName.get(category) ?? 0)
        : 0
      const totalDeduction = recvDeduction + pendDeduction

      const subMap =
        expenseSubcatByCategory.get(category) ??
        new Map<string, { total: number; count: number; icon: string | null }>()
      const subcategories: SubcategoryDataDto[] = Array.from(subMap.entries())
        .map(([subcategory, sd]) => {
          const proportion = gross > 0 ? sd.total / gross : 0
          const proportionalDeduction = totalDeduction * proportion
          const netTotal = Math.max(0, sd.total - proportionalDeduction)
          const dto: SubcategoryDataDto = {
            subcategory,
            amount: round(netTotal),
            transactionCount: sd.count,
            averagePerMonth: round(netTotal / periodMonthsCount),
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
      if (recvDeduction > 0) dto.reimbursement = round(recvDeduction)
      if (pendDeduction > 0) dto.pendingReimbursement = round(pendDeduction)

      return dto
    }

    function buildIncomeCategoryDto(
      category: string,
      data: { amount: number; icon: string | null }
    ): CategoryDataDto {
      const dto: CategoryDataDto = {
        category,
        amount: round(data.amount),
        icon: data.icon,
      }
      if (!shouldIncludeBreakdown) return dto

      const id = categoryIdByName.get(category)
      if (id) dto.categoryId = id

      const monthMap =
        incomeMonthlyByCategory.get(category) ?? new Map<string, number>()
      dto.monthlyAmounts = breakdownMonthLabels.map(m =>
        round(monthMap.get(m) ?? 0)
      )

      const subMap =
        incomeSubcatByCategory.get(category) ??
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
      .map(([category, data]) => buildExpenseCategoryDto(category, data))

    const incomeByCategory: CategoryDataDto[] = Array.from(
      incomeByCategoryMap.entries()
    )
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([category, data]) => buildIncomeCategoryDto(category, data))

    // Calculate totals from category data
    const totalExpenses =
      Math.round(
        expensesByCategory.reduce((sum, cat) => sum + cat.amount, 0) * 100
      ) / 100
    const totalIncome =
      Math.round(
        incomeByCategory.reduce((sum, cat) => sum + cat.amount, 0) * 100
      ) / 100

    const response: DashboardSummaryDto = {
      monthlyData,
      expensesByCategory,
      incomeByCategory,
      totalExpenses,
      totalIncome,
      allExpenseCategories: Array.from(allExpenseCategories).sort(),
      allIncomeCategories: Array.from(allIncomeCategories).sort(),
      availableAccounts: accountRows.map(r => r.account),
    }

    if (shouldIncludeBreakdown) {
      response.periodMonths = periodMonthsCount
      response.monthLabels = breakdownMonthLabels
    }

    return response
  }
}
