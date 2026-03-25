import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type {
  DashboardFiltersDto,
  DashboardSummaryDto,
  MonthlyDataDto,
  CategoryDataDto,
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
  category_name: string
  type: string
  total_amount: number
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

    const hiddenExpenseCategoriesSet = new Set(
      filters.hiddenExpenseCategories ?? []
    )
    const hiddenIncomeCategoriesSet = new Set(
      filters.hiddenIncomeCategories ?? []
    )

    // Fetch aggregated data, accounts list, and category associations in parallel
    const [rows, accountRows, dbAssociations] = await Promise.all([
      // Query 1: Aggregation by month + category + type (excludes stats-excluded accounts)
      this.prisma.$queryRaw<DashboardAggregatedRow[]>(Prisma.sql`
        SELECT
          TO_CHAR(t.date, 'YYYY-MM') AS month_key,
          COALESCE(c.name, 'Autre') AS category_name,
          t.type::text AS type,
          SUM(
            CASE WHEN t.type = 'EXPENSE'
              THEN ABS(t.amount::numeric) / COALESCE(a.divisor, 1)
              ELSE t.amount::numeric / COALESCE(a.divisor, 1)
            END
          )::float AS total_amount
        FROM app.transactions t
        LEFT JOIN app.categories c ON c.id = t.category_id
        LEFT JOIN app.accounts a ON a.name = t.account AND a.user_id = t.user_id
        WHERE t.user_id = ${userId}
          AND t.date >= ${startDate}
          AND t.date <= ${endDate}
          AND COALESCE(a.is_excluded_from_stats, false) = false
        GROUP BY TO_CHAR(t.date, 'YYYY-MM'), COALESCE(c.name, 'Autre'), t.type
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
    const expenseByCategoryMap = new Map<string, number>()
    const incomeByCategoryMap = new Map<string, number>()
    const reimbursementsByExpenseCategory = new Map<string, number>()

    for (const row of rows) {
      const categoryName = row.category_name
      const amount = row.total_amount

      // Handle reimbursement income: track by expense category and by month
      if (row.type === 'INCOME') {
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
      if (
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
        const current = expenseByCategoryMap.get(categoryName) ?? 0
        expenseByCategoryMap.set(categoryName, current + amount)
      } else {
        const current = incomeByCategoryMap.get(categoryName) ?? 0
        incomeByCategoryMap.set(categoryName, current + amount)
      }
    }

    // Deduct reimbursements from expense categories
    for (const [
      expenseCategory,
      reimbursement,
    ] of reimbursementsByExpenseCategory) {
      const current = expenseByCategoryMap.get(expenseCategory) ?? 0
      expenseByCategoryMap.set(
        expenseCategory,
        Math.max(0, current - reimbursement)
      )
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

      // Net expenses = gross expenses - reimbursements for this month
      const netExpenses = data.expenses - data.reimbursements

      return {
        month,
        label: `${MONTH_LABELS[monthNum] ?? monthNum} ${year}`,
        expenses: Math.round(data.expenses * 100) / 100,
        netExpenses: Math.round(netExpenses * 100) / 100,
        income: Math.round(data.income * 100) / 100,
      }
    })

    // Sort categories by amount descending
    const expensesByCategory: CategoryDataDto[] = Array.from(
      expenseByCategoryMap.entries()
    )
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100,
      }))

    const incomeByCategory: CategoryDataDto[] = Array.from(
      incomeByCategoryMap.entries()
    )
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100,
      }))

    // Calculate totals from category data
    const totalExpenses =
      Math.round(
        expensesByCategory.reduce((sum, cat) => sum + cat.amount, 0) * 100
      ) / 100
    const totalIncome =
      Math.round(
        incomeByCategory.reduce((sum, cat) => sum + cat.amount, 0) * 100
      ) / 100

    return {
      monthlyData,
      expensesByCategory,
      incomeByCategory,
      totalExpenses,
      totalIncome,
      allExpenseCategories: Array.from(allExpenseCategories).sort(),
      allIncomeCategories: Array.from(allIncomeCategories).sort(),
      availableAccounts: accountRows.map(r => r.account),
    }
  }
}
