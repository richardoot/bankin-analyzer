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

export class CategoryDataDto {
  /** Category name */
  category!: string

  /** Total amount for this category */
  amount!: number

  /** Category icon emoji */
  icon?: string | null
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
}
