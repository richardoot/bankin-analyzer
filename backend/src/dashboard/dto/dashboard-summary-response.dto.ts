import { ApiProperty } from '@nestjs/swagger'

export class MonthlyDataDto {
  /** Month key in format YYYY-MM */
  month!: string

  /** Display label (e.g., "Jan 2024") */
  label!: string

  /** Total expenses for the month (absolute value) */
  expenses!: number

  /** Net expenses for the month (expenses minus reimbursements from associated income categories) */
  netExpenses!: number

  /** Total income for the month */
  income!: number
}

export class SubcategoryDataDto {
  /** Subcategory name (empty string if none) */
  subcategory!: string

  /** Subcategory icon emoji (when the subcategory is linked to a Subcategory record) */
  icon?: string | null

  /** Total amount for the subcategory over the period */
  amount!: number

  /** Number of transactions */
  transactionCount!: number

  /** Average per month for the subcategory */
  averagePerMonth!: number
}

export class CategoryDataDto {
  /** Category id (only when includeCategoryBreakdown is true) */
  categoryId?: string

  /** Category name */
  category!: string

  /** Total amount for this category (after reimbursement deductions when applicable) */
  amount!: number

  /** Category icon emoji */
  icon?: string | null

  /** Number of transactions (only when includeCategoryBreakdown is true) */
  transactionCount?: number

  /** Average per month (only when includeCategoryBreakdown is true) */
  averagePerMonth?: number

  /** Per-month amounts in chronological order matching monthLabels (only when includeCategoryBreakdown is true) */
  monthlyAmounts?: number[]

  /** Subcategory breakdown for this category (only when includeCategoryBreakdown is true) */
  @ApiProperty({ type: [SubcategoryDataDto] })
  subcategories?: SubcategoryDataDto[]

  /** Amount deducted via received reimbursements (only when includeCategoryBreakdown is true) */
  reimbursement?: number

  /** Amount deducted via pending reimbursements (only when includeCategoryBreakdown is true) */
  pendingReimbursement?: number
}

export class DashboardSummaryDto {
  /** Monthly breakdown */
  @ApiProperty({ type: [MonthlyDataDto] })
  monthlyData!: MonthlyDataDto[]

  /** Expenses by category */
  @ApiProperty({ type: [CategoryDataDto] })
  expensesByCategory!: CategoryDataDto[]

  /** Income by category */
  @ApiProperty({ type: [CategoryDataDto] })
  incomeByCategory!: CategoryDataDto[]

  /** Total expenses (after reimbursement deductions) */
  totalExpenses!: number

  /** Total income (excluding reimbursement categories) */
  totalIncome!: number

  /** All available expense categories */
  @ApiProperty({ type: [String] })
  allExpenseCategories!: string[]

  /** All available income categories */
  @ApiProperty({ type: [String] })
  allIncomeCategories!: string[]

  /** All available account names */
  @ApiProperty({ type: [String] })
  availableAccounts!: string[]

  /** Number of months in the period (only when includeCategoryBreakdown is true) */
  periodMonths?: number

  /** Month labels matching CategoryDataDto.monthlyAmounts indexes (only when includeCategoryBreakdown is true) */
  @ApiProperty({ type: [String], required: false })
  monthLabels?: string[]
}
