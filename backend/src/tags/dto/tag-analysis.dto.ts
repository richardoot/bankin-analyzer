import { ApiProperty } from '@nestjs/swagger'

/** One category slice of a tag's spending/income. */
export class TagAnalysisCategoryDto {
  categoryId!: string | null
  categoryName!: string
  categoryIcon!: string | null
  type!: 'EXPENSE' | 'INCOME'
  amount!: number
  transactionCount!: number

  /**
   * What the user would normally have spent in this category over the event's
   * duration, derived from their everyday rate. Only set for EXPENSE rows of an
   * event that declares a period.
   */
  baselineAmount?: number

  /** `amount - baselineAmount`. Negative means the event cost less than usual. */
  surplusAmount?: number
}

/** Reference window used to derive the everyday baselines. */
export class TagAnalysisBaselineDto {
  /** ISO date of the first day of the reference window. */
  startDate!: string

  /** ISO date of the last day of the reference window. */
  endDate!: string

  /**
   * Days of the window actually spent living an everyday life, i.e. total days
   * minus the days consumed by exceptional events.
   */
  everydayDays!: number

  /** Duration of the event the baseline is projected onto. */
  eventDays!: number
}

/** One month slice of a tag's activity. */
export class TagAnalysisMonthDto {
  /** YYYY-MM */
  month!: string
  expenses!: number
  income!: number
}

/** Aggregated analysis of every transaction carrying a given tag. */
export class TagAnalysisDto {
  tag!: {
    id: string
    name: string
    color: string | null
    icon: string | null
    isExceptional: boolean
    eventStartDate: string | null
    eventEndDate: string | null
    /** Total envelope allocated to the event, or null. */
    budgetAmount: number | null
    /** The family the tag is filed under, or null. */
    family: { id: string; name: string; color: string | null } | null
  }

  /**
   * Total expenses: absolute, net of reimbursements as the dashboard reads
   * them, joint-account-adjusted.
   */
  totalExpenses!: number

  /**
   * Total income, joint-account-adjusted, less the cash drawn to repay a
   * debt — an income entirely drawn is not counted at all.
   */
  totalIncome!: number

  /** income - expenses. */
  net!: number

  /** Number of tagged transactions counted in the aggregates. */
  transactionCount!: number

  /** ISO date of the earliest tagged transaction (null when empty). */
  firstDate!: string | null

  /** ISO date of the latest tagged transaction (null when empty). */
  lastDate!: string | null

  /** Per-category breakdown, sorted by amount desc. */
  byCategory!: TagAnalysisCategoryDto[]

  /** Per-month breakdown, chronological. */
  byMonth!: TagAnalysisMonthDto[]

  /**
   * Reference used for the surplus computation, or null when the tag declares
   * no event period — an additive event (a party at home) does not suspend
   * everyday spending, so there is nothing to deduct.
   */
  baseline!: TagAnalysisBaselineDto | null

  /**
   * Sum of the per-category surplus: what the event really cost on top of an
   * ordinary stretch of the same length. Null when no baseline applies.
   */
  totalSurplus!: number | null
}

/** One project (exceptional tag) weighed against its envelope. */
export class TagBudgetSummaryItemDto {
  id!: string
  name!: string
  color!: string | null
  icon!: string | null

  /** Declared event window, when the tag has one. */
  eventStartDate!: string | null
  eventEndDate!: string | null

  /** Envelope decided for the project as a whole, or null. */
  budgetAmount!: number | null

  /**
   * Expenses tagged with it inside the requested window, net of
   * reimbursements and of tagged income.
   */
  spent!: number
}

/**
 * A family with an annual envelope, charged against the window as a whole:
 * its envelope prorated to the window replaces its tags' own envelopes.
 */
export class TagBudgetSummaryFamilyDto {
  id!: string
  name!: string
  color!: string | null
  icon!: string | null

  /** The family's envelope over a calendar year. */
  annualBudget!: number

  /** annualBudget × months of the window / 12: what the window commits. */
  proratedBudget!: number

  /**
   * Expenses of its exceptional tags inside the window, net of tagged income,
   * each transaction once however many of the family's tags it carries.
   */
  spent!: number

  /** Its exceptional tags overlapping the window; may be empty. */
  @ApiProperty({ type: [TagBudgetSummaryItemDto] })
  items!: TagBudgetSummaryItemDto[]
}

/** Every project overlapping a window, weighed against their envelopes. */
export class TagBudgetSummaryDto {
  /** Projects outside any family with an annual envelope. */
  @ApiProperty({ type: [TagBudgetSummaryItemDto] })
  items!: TagBudgetSummaryItemDto[]

  /**
   * Every family with an annual envelope, whether or not one of its tags
   * overlaps the window: an annual envelope commits the reserve on its own.
   */
  @ApiProperty({ type: [TagBudgetSummaryFamilyDto] })
  families!: TagBudgetSummaryFamilyDto[]

  /**
   * What the window commits: the envelopes of `items` (0 without one) plus
   * the prorated envelope of each family — never its tags' envelopes.
   */
  totalBudget!: number

  /** What was actually spent on `items` and `families`. */
  totalSpent!: number
}
