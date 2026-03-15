import { ApiProperty } from '@nestjs/swagger'

export class MonthlyDataDto {
  @ApiProperty({ description: 'Month key in format YYYY-MM' })
  month!: string

  @ApiProperty({ description: 'Display label (e.g., "Jan 2024")' })
  label!: string

  @ApiProperty({ description: 'Total expenses for the month (absolute value)' })
  expenses!: number

  @ApiProperty({ description: 'Total income for the month' })
  income!: number
}

export class CategoryDataDto {
  @ApiProperty({ description: 'Category name' })
  category!: string

  @ApiProperty({ description: 'Total amount for this category' })
  amount!: number
}

export class DashboardSummaryDto {
  @ApiProperty({ type: [MonthlyDataDto], description: 'Monthly breakdown' })
  monthlyData!: MonthlyDataDto[]

  @ApiProperty({ type: [CategoryDataDto], description: 'Expenses by category' })
  expensesByCategory!: CategoryDataDto[]

  @ApiProperty({ type: [CategoryDataDto], description: 'Income by category' })
  incomeByCategory!: CategoryDataDto[]

  @ApiProperty({
    description: 'Total expenses (after reimbursement deductions)',
  })
  totalExpenses!: number

  @ApiProperty({
    description: 'Total income (excluding reimbursement categories)',
  })
  totalIncome!: number

  @ApiProperty({
    type: [String],
    description: 'All available expense categories',
  })
  allExpenseCategories!: string[]

  @ApiProperty({
    type: [String],
    description: 'All available income categories',
  })
  allIncomeCategories!: string[]

  @ApiProperty({ type: [String], description: 'All available account names' })
  availableAccounts!: string[]
}
