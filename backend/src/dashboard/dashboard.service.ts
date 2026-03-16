import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TransactionType } from '../generated/prisma'
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

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    userId: string,
    filters: DashboardFiltersDto
  ): Promise<DashboardSummaryDto> {
    const jointAccountsSet = new Set(filters.jointAccounts ?? [])
    const hiddenExpenseCategoriesSet = new Set(
      filters.hiddenExpenseCategories ?? []
    )
    const hiddenIncomeCategoriesSet = new Set(
      filters.hiddenIncomeCategories ?? []
    )

    // Fetch category associations from database
    const dbAssociations = await this.prisma.categoryAssociation.findMany({
      where: { userId },
      include: {
        expenseCategory: true,
        incomeCategory: true,
      },
    })

    // Convert DB associations to name-based associations
    const categoryAssociations = dbAssociations.map(a => ({
      expenseCategory: a.expenseCategory.name,
      incomeCategory: a.incomeCategory.name,
    }))

    // Build a set of income categories used as reimbursements
    const reimbursementIncomeCategories = new Set(
      categoryAssociations.map(a => a.incomeCategory)
    )

    // Fetch all transactions with category for this user
    const transactions = await this.prisma.transaction.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { date: 'desc' },
    })

    // Build aggregation data structures
    const monthlyMap = new Map<
      string,
      { expenses: number; income: number; reimbursements: number }
    >()
    const expenseByCategoryMap = new Map<string, number>()
    const incomeByCategoryMap = new Map<string, number>()
    const reimbursementsByExpenseCategory = new Map<string, number>()
    const allExpenseCategories = new Set<string>()
    const allIncomeCategories = new Set<string>()
    const availableAccounts = new Set<string>()

    for (const tx of transactions) {
      const categoryName = tx.category?.name ?? 'Autre'
      const amount = Number(tx.amount)
      const isJointAccount = jointAccountsSet.has(tx.account)
      const divisor = isJointAccount ? 2 : 1
      const adjustedAmount = amount / divisor

      // Track all accounts
      if (tx.account) availableAccounts.add(tx.account)

      // Track all categories (even hidden ones for filter panel)
      if (tx.type === TransactionType.EXPENSE) {
        allExpenseCategories.add(categoryName)
      } else {
        allIncomeCategories.add(categoryName)
      }

      // Calculate reimbursements (income categories associated with expense categories)
      // Track by expense category for category chart, and by month for monthly chart
      if (tx.type === TransactionType.INCOME) {
        const assoc = categoryAssociations.find(
          a => a.incomeCategory === categoryName
        )
        if (assoc) {
          // Track reimbursements by expense category
          const current =
            reimbursementsByExpenseCategory.get(assoc.expenseCategory) ?? 0
          reimbursementsByExpenseCategory.set(
            assoc.expenseCategory,
            current + adjustedAmount
          )

          // Track reimbursements by month
          const date = new Date(tx.date)
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          const monthData = monthlyMap.get(monthKey) ?? {
            expenses: 0,
            income: 0,
            reimbursements: 0,
          }
          monthData.reimbursements += adjustedAmount
          monthlyMap.set(monthKey, monthData)
        }
      }

      // Skip hidden categories for aggregations
      if (
        tx.type === TransactionType.EXPENSE &&
        hiddenExpenseCategoriesSet.has(categoryName)
      ) {
        continue
      }
      if (
        tx.type === TransactionType.INCOME &&
        hiddenIncomeCategoriesSet.has(categoryName)
      ) {
        continue
      }
      // Skip income categories used as reimbursements from income totals
      if (
        tx.type === TransactionType.INCOME &&
        reimbursementIncomeCategories.has(categoryName)
      ) {
        continue
      }

      // Monthly aggregation
      const date = new Date(tx.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const monthData = monthlyMap.get(monthKey) ?? {
        expenses: 0,
        income: 0,
        reimbursements: 0,
      }

      if (tx.type === TransactionType.EXPENSE) {
        monthData.expenses += Math.abs(adjustedAmount)
      } else {
        monthData.income += adjustedAmount
      }
      monthlyMap.set(monthKey, monthData)

      // Category aggregation
      if (tx.type === TransactionType.EXPENSE) {
        const current = expenseByCategoryMap.get(categoryName) ?? 0
        expenseByCategoryMap.set(
          categoryName,
          current + Math.abs(adjustedAmount)
        )
      } else {
        const current = incomeByCategoryMap.get(categoryName) ?? 0
        incomeByCategoryMap.set(categoryName, current + adjustedAmount)
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
      const netExpenses = Math.max(0, data.expenses - data.reimbursements)

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

    // Calculate totals (use netExpenses for total)
    const totalExpenses =
      Math.round(monthlyData.reduce((sum, d) => sum + d.netExpenses, 0) * 100) /
      100
    const totalIncome =
      Math.round(monthlyData.reduce((sum, d) => sum + d.income, 0) * 100) / 100

    return {
      monthlyData,
      expensesByCategory,
      incomeByCategory,
      totalExpenses,
      totalIncome,
      allExpenseCategories: Array.from(allExpenseCategories).sort(),
      allIncomeCategories: Array.from(allIncomeCategories).sort(),
      availableAccounts: Array.from(availableAccounts).sort(),
    }
  }
}
