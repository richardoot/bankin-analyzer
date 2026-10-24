/**
 * The months « Dépenses et enveloppe par mois » draws
 * (agent-os/product/budget-refonte.md, lot 5): the plan's started months,
 * and the comparison's whenever one is chosen, in tracking as in editing
 * (Richard, 2026-10-24). A month still to come has nothing to draw,
 * a month between the comparison and the plan belongs to neither.
 * Shared by the chart and by the page, which leaves the chart out when it
 * would draw fewer than two columns.
 */

export type BudgetChartMonthKind = 'plan' | 'comparison'

export interface BudgetChartMonth {
  /** Index into the statistics' `monthLabels` and the totals. */
  index: number
  /** `YYYY-MM`. */
  ym: string
  kind: BudgetChartMonthKind
}

export interface BudgetChartRanges {
  planStartMonth?: string | undefined
  planEndMonth?: string | undefined
  comparisonStartMonth?: string | undefined
  comparisonEndMonth?: string | undefined
  /** The month still running, `YYYY-MM`; later months are left out. */
  currentMonth: string
}

const within = (ym: string, from?: string, to?: string): boolean =>
  !!from && !!to && ym >= from && ym <= to

export function budgetChartMonths(
  monthLabels: readonly string[],
  ranges: BudgetChartRanges
): BudgetChartMonth[] {
  const hasPlan = !!ranges.planStartMonth && !!ranges.planEndMonth
  const months: BudgetChartMonth[] = []
  monthLabels.forEach((ym, index) => {
    if (ym > ranges.currentMonth) return
    // Without a plan range every month is the plan's: the chart alone.
    if (!hasPlan || within(ym, ranges.planStartMonth, ranges.planEndMonth)) {
      months.push({ index, ym, kind: 'plan' })
      return
    }
    if (within(ym, ranges.comparisonStartMonth, ranges.comparisonEndMonth)) {
      months.push({ index, ym, kind: 'comparison' })
    }
  })
  return months
}

/** Today's month, `YYYY-MM`. */
export function thisYearMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
