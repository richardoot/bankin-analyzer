/**
 * Reading smoothed purchases on screen (agent-os/product/amortization-framework.md).
 *
 * The statistics count a smoothed purchase in two ways. The real reading
 * counts it whole at its date, as before the feature; the everyday reading
 * counts its monthly slices instead, in the months they fall in. To show
 * the everyday figures, the backend may add a category, a subcategory line
 * or a month that only slices reach, with nothing real in it: a « carrier ».
 * The real reading must look exactly as it did, so those carriers are left
 * out there. This file holds the few rules the screens share for that, and
 * for linking a figure to the purchases whose slices it counts.
 */
import type { AmortizedPurchaseDto } from '@/lib/api'

/**
 * A category or a breakdown line the backend added for slices alone: it
 * carries no transaction of its own in the period. Only such a row has both
 * an `amortizedAmount` and a count of zero.
 */
export function isAmortizationCarrier(row: {
  amortizedAmount?: number | undefined
  transactionCount?: number | undefined
}): boolean {
  return row.amortizedAmount !== undefined && row.transactionCount === 0
}

/** Months from `from` to `to`, both `YYYY-MM`, inclusive; 0 when reversed. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  if (!fy || !fm || !ty || !tm) return 0
  return Math.max(0, (ty - fy) * 12 + (tm - fm) + 1)
}

/**
 * The slices still to fall from `currentMonth` on, this month's included:
 * all of them before the purchase's first month, none after its last.
 */
export function remainingSlices(
  purchase: Pick<AmortizedPurchaseDto, 'firstMonth' | 'lastMonth' | 'months'>,
  currentMonth: string
): number {
  if (currentMonth < purchase.firstMonth) return purchase.months
  return monthsBetween(currentMonth, purchase.lastMonth)
}

export interface SmoothedScope {
  /** A category id; absent for every category. */
  categoryId?: string | undefined
  /**
   * A subcategory id, `null` for the rows filed under none; absent for every
   * line of the category.
   */
  subcategoryId?: string | null | undefined
  /** First and last month the figure reads, `YYYY-MM`, inclusive. */
  from: string
  to: string
}

/**
 * The smoothed purchases with at least one slice in the months a figure
 * reads, within its category or line: those its everyday amount counts.
 */
export function purchasesWithSlicesIn(
  purchases: AmortizedPurchaseDto[] | undefined,
  scope: SmoothedScope
): AmortizedPurchaseDto[] {
  return (purchases ?? []).filter(
    p =>
      (scope.categoryId === undefined || p.categoryId === scope.categoryId) &&
      (scope.subcategoryId === undefined ||
        p.subcategoryId === scope.subcategoryId) &&
      p.sliceMonthsInPeriod.some(m => m >= scope.from && m <= scope.to)
  )
}

/**
 * The ids a « voir les transactions » link adds on top of its window
 * (`alsoIds`): the purchases whose slices the figure counts. Undefined
 * when there is none, so the link stays as it was.
 */
export function smoothedSourceIds(
  purchases: AmortizedPurchaseDto[] | undefined,
  scope: SmoothedScope
): string[] | undefined {
  const ids = purchasesWithSlicesIn(purchases, scope).map(p => p.transactionId)
  return ids.length > 0 ? ids : undefined
}
