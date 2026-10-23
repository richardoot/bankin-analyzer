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

  /**
   * `netExpenses` minus the exceptional share — the everyday lifestyle — with
   * each smoothed purchase traded for its slices.
   */
  everydayNetExpenses!: number

  /**
   * Slices of smoothed purchases in `everydayNetExpenses`. Only on a month a
   * smoothed purchase touches.
   */
  amortizedExpenses?: number
}

export class SubcategoryDataDto {
  /**
   * The subcategory this line sums, or null for the category's rows filed
   * under none — what a link to the line's transactions names.
   */
  @ApiProperty({ type: String, nullable: true })
  subcategoryId!: string | null

  /** Subcategory name, read off the subcategory (empty string if none) */
  subcategory!: string

  /** Subcategory icon emoji (when the subcategory is linked to a Subcategory record) */
  icon?: string | null

  /** Total amount for the subcategory over the period */
  amount!: number

  /** Number of transactions */
  transactionCount!: number

  /** Average per month for the subcategory */
  averagePerMonth!: number

  /**
   * Everyday counterpart of `amount`: exceptional rows out, smoothed
   * purchases spread into their slices. Only on a line a smoothed purchase
   * touches this period.
   */
  everydayAmount?: number

  /** `everydayAmount` per month. Same presence rule. */
  everydayAveragePerMonth?: number

  /** Slices of smoothed purchases falling in the period. Same presence rule. */
  amortizedAmount?: number
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

  /**
   * `amount - exceptionalAmount`, the recurring, predictable part, with each
   * smoothed purchase traded for its slices falling in the period.
   */
  everydayAmount?: number

  /**
   * Everyday amount over the same number of months as `averagePerMonth`, so a
   * category untouched by any event reads identically in both modes. This is
   * the figure to budget on.
   */
  everydayAveragePerMonth?: number

  /** Per-month everyday amounts, matching monthLabels indexes */
  everydayMonthlyAmounts?: number[]

  /**
   * Per-month share carried by exceptional events, matching monthLabels
   * indexes: the raw event transactions of each month, never derived from
   * `everydayMonthlyAmounts` (smoothed slices would skew a subtraction). Sums
   * to `exceptionalAmount`. Same presence rule as `exceptionalAmount`.
   */
  exceptionalMonthlyAmounts?: number[]

  /**
   * Slices of smoothed purchases in `everydayAmount` — the « dont X €
   * lissés ». Only with the breakdown and when one touches the category.
   */
  amortizedAmount?: number

  /** Same, per month, matching monthLabels. Same presence rule. */
  amortizedMonthlyAmounts?: number[]
}

/** One exceptional event overlapping the dashboard period. */
export class ExceptionalEventDto {
  id!: string
  name!: string
  color!: string | null
  icon!: string | null

  /** Expenses tagged with this event inside the period, net as the totals are */
  amount!: number
}

/**
 * One tag family over the current calendar year, in event basis: a line
 * belongs to the year its dated tag starts in, to its own year without one,
 * and counts once in the family whatever number of its tags it carries.
 */
export class TagFamilyOfYearDto {
  id!: string
  name!: string
  color!: string | null
  icon!: string | null

  /** The calendar year read, in Paris. */
  year!: number

  /**
   * Expenses of the family for the year: gross (ABS), divided by the account
   * divisor, stats-excluded accounts ignored — the family analysis's rules.
   */
  spent!: number

  /**
   * The family's expenses per event year, under the same rules, one entry
   * per calendar year with expenses up to the current one (whose `spent` is
   * `spent`), oldest first.
   */
  spentByYear!: { year: number; spent: number }[]

  /** The family's envelope per year, null when none was decided. */
  annualBudget!: number | null

  /** `annualBudget - spent`, negative when over; null without an envelope. */
  remaining!: number | null

  /** Expenses and income of the family for the year, each line once. */
  transactionCount!: number

  /** The family's tags carrying at least one of those lines. */
  tagCount!: number
}

/**
 * Expenses read through the two attributes of their subcategory: constrained
 * (essential) or chosen (pleasure), running on its own (committed) or
 * following the user (variable). A row filed at the category alone takes the
 * category's defaults; a row of a legacy category, or an uncategorized one,
 * carries neither and lands in `unknown*` — visible, so the migration's
 * progress reads off the dashboard.
 */
export class SpendingStructureDto {
  essential!: number

  pleasure!: number

  unknownNature!: number

  committed!: number

  variable!: number

  unknownRhythm!: number

  /**
   * The part of `committed` made of lines of a detected recurrence —
   * subscriptions and other charges that come back on their own.
   */
  recurring!: number

  /** The three buckets of each axis sum to this. */
  total!: number
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

  /** All expense categories present over the period */
  @ApiProperty({ type: [CategoryOptionDto] })
  allExpenseCategories!: CategoryOptionDto[]

  /** All income categories present over the period */
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

  /**
   * The user's tag families with expenses in the current calendar year (in
   * Paris, whatever the period asked), biggest first. Empty without one.
   */
  @ApiProperty({ type: [TagFamilyOfYearDto] })
  tagFamiliesOfYear!: TagFamilyOfYearDto[]

  /**
   * Real expenses of that calendar year — every expense, exceptional ones
   * included, net of reimbursements as the filters ask, stats-excluded
   * accounts ignored: what `totalExpenses` reads over the year. The share of
   * a family is its `spent` over this. Null when `tagFamiliesOfYear` is empty.
   */
  realExpensesOfYear!: number | null

  /**
   * Exceptional expenses of that calendar year — the expenses paid that year
   * carrying an exceptional tag, net as `realExpensesOfYear`, stats-excluded
   * accounts ignored. The share of a family in the year's exceptional is its
   * `spent` over this. Null when `tagFamiliesOfYear` is empty.
   */
  exceptionalExpensesOfYear!: number | null

  /** The period as it was: every expense, exceptional ones included. */
  spendingStructure!: SpendingStructureDto

  /** The lifestyle: the same reading without the exceptional share. */
  everydaySpendingStructure!: SpendingStructureDto

  /**
   * Money that left the everyday accounts towards savings — transfers filed
   * under the savings and investment categories, on the accounts the stats
   * cover, net of withdrawals. The leg on a savings account excluded from
   * the stats is not counted, which is what keeps one transfer from counting
   * twice while the two legs are not yet matched.
   *
   * Informational: where some of the money went, not what was saved. No
   * rate reads it — a transfer moved in one lump would read a month at
   * 122 %. The savings are `savings`.
   */
  savingsTransfers!: number

  /**
   * What is still owed to the user: every reimbursement request not yet
   * settled, what was claimed less what came back or was written off. A
   * stock at the time of the call, not bounded by the period, and in full
   * euros. It is what the pending deduction takes off the spending, shown so
   * that money advanced to someone leaves the expenses without leaving sight.
   */
  pendingReceivables!: number

  /**
   * What the period kept: the income less every expense (exceptional ones
   * too), net of reimbursements as the filters ask, joint divisor and
   * stats-excluded accounts applied — the months' `income − netExpenses`,
   * summed unrounded and rounded once to the cent, so it can sit a cent or
   * two from `totalIncome − totalExpenses`, whose categories are each
   * rounded. Negative on a period in deficit.
   */
  savings!: number

  /** `savings / totalIncome`, null when there is no income. Negative in deficit. */
  savingsRate!: number | null

  /**
   * What the period leaves once the committed everyday spending is paid:
   * `totalIncome − everydaySpendingStructure.committed`. Null without income.
   */
  remainingToLive!: number | null
}
