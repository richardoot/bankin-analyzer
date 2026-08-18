import { ApiProperty } from '@nestjs/swagger'

/**
 * Id used for transactions carrying no category. Not a real Category row, but
 * the filter panel lists that bucket and must be able to address it — hence a
 * sentinel rather than the "Autre" label, which a real category could bear.
 */
export const UNCATEGORIZED_CATEGORY_ID = '__uncategorized__'

/** A category as offered in the filter panel: addressed by id, shown by name. */
export class CategoryOptionDto {
  /** Category id, or `UNCATEGORIZED_CATEGORY_ID` */
  id!: string

  /** Display name */
  name!: string
}

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

  /** Share of `expenses` carried by transactions tagged as exceptional */
  exceptionalExpenses!: number

  /** `netExpenses` minus the exceptional share — the everyday lifestyle */
  everydayNetExpenses!: number
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
  /** Category id, or `UNCATEGORIZED_CATEGORY_ID` for uncategorized rows */
  categoryId!: string

  /** Category name, for display only */
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

  /**
   * Share of `amount` carried by transactions tagged as exceptional (holidays,
   * birthdays…). Reimbursement deductions are split pro rata between the
   * everyday and exceptional shares so that a holiday refunded by friends does
   * not shrink the everyday baseline.
   */
  exceptionalAmount?: number

  /** `amount - exceptionalAmount`: the recurring, predictable part */
  everydayAmount?: number

  /**
   * Everyday amount over the same number of months as `averagePerMonth`, so a
   * category untouched by any event reads identically in both modes. This is
   * the figure to budget on.
   */
  everydayAveragePerMonth?: number

  /** Per-month everyday amounts, matching monthLabels indexes */
  everydayMonthlyAmounts?: number[]
}

/** One exceptional event overlapping the dashboard period. */
export class ExceptionalEventDto {
  id!: string
  name!: string
  color!: string | null
  icon!: string | null

  /** Expenses tagged with this event inside the period */
  amount!: number
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

  /** All expense categories present over the period, hidden ones included */
  @ApiProperty({ type: [CategoryOptionDto] })
  allExpenseCategories!: CategoryOptionDto[]

  /** All income categories present over the period, hidden ones included */
  @ApiProperty({ type: [CategoryOptionDto] })
  allIncomeCategories!: CategoryOptionDto[]

  /** All available account names */
  @ApiProperty({ type: [String] })
  availableAccounts!: string[]

  /** Number of months in the period (only when includeCategoryBreakdown is true) */
  periodMonths?: number

  /** Month labels matching CategoryDataDto.monthlyAmounts indexes (only when includeCategoryBreakdown is true) */
  @ApiProperty({ type: [String], required: false })
  monthLabels?: string[]

  /** Total expenses tagged as exceptional over the period */
  totalExceptionalExpenses!: number

  /** Events overlapping the period, biggest first */
  @ApiProperty({ type: [ExceptionalEventDto] })
  exceptionalEvents!: ExceptionalEventDto[]
}
