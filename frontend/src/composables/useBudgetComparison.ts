import { computed, type Ref } from 'vue'
import type {
  BudgetPlanDto,
  BudgetStatisticsDto,
  CategoryAverageDto,
} from '@/lib/api'

/** What the user picked in the "Comparer avec…" selector. */
export type ComparisonPreset =
  | 'none'
  | '3m'
  | '6m'
  | '12m'
  | 'year-ago'
  | 'custom'

/** A concrete comparison window resolved from a preset (or custom dates). */
export interface ComparisonRange {
  /** First day of the first month, ISO YYYY-MM-DD */
  startDate: string
  /** Last day of the last month, ISO YYYY-MM-DD */
  endDate: string
  /** YYYY-MM of the first month — handy for client-side classification */
  startMonth: string
  /** YYYY-MM of the last month */
  endMonth: string
  /** Human-readable label, e.g. "Janv–Mars 2026" */
  label: string
  /** Which preset produced the range (for tagging / re-selecting on reload) */
  source: ComparisonPreset
}

/**
 * For each month label in the stats response, which logical zone it belongs to.
 * - `plan`        : month is inside the plan range
 * - `comparison`  : month is inside the comparison range
 * - `gap`         : month falls between the comparison and plan when they
 *                   are not adjacent (only relevant when a comparison exists)
 * - `outside`     : month is outside everything we care about (defensive)
 */
export type MonthZone = 'plan' | 'comparison' | 'gap' | 'outside'

interface UseBudgetComparisonDeps {
  plan: Ref<BudgetPlanDto | null>
  comparison: Ref<ComparisonRange | null>
  statistics: Ref<BudgetStatisticsDto | null>
  /** Inject the current date (for testability). Defaults to `new Date()`. */
  now?: () => Date
}

export function useBudgetComparison({
  plan,
  comparison,
  statistics,
  now = () => new Date(),
}: UseBudgetComparisonDeps) {
  /** Plan span as YYYY-MM bounds (null when no plan). */
  const planMonthRange = computed<{
    startMonth: string
    endMonth: string
  } | null>(() => {
    if (!plan.value) return null
    return {
      startMonth: plan.value.startDate.slice(0, 7),
      endMonth: plan.value.endDate.slice(0, 7),
    }
  })

  /**
   * Date range to pass to `getBudgetStatistics`. Always envelops both the
   * plan and the comparison so the response carries every month we need
   * (including the gap months in between).
   */
  const widerRange = computed<{
    startDate: string
    endDate: string
  } | null>(() => {
    if (!plan.value) return null
    if (!comparison.value) {
      return {
        startDate: plan.value.startDate,
        endDate: plan.value.endDate,
      }
    }
    const startDate =
      comparison.value.startDate < plan.value.startDate
        ? comparison.value.startDate
        : plan.value.startDate
    const endDate =
      comparison.value.endDate > plan.value.endDate
        ? comparison.value.endDate
        : plan.value.endDate
    return { startDate, endDate }
  })

  /** Classify any YYYY-MM month against the plan + comparison. */
  function classifyMonth(ym: string): MonthZone {
    if (!planMonthRange.value) return 'outside'
    const { startMonth, endMonth } = planMonthRange.value
    if (ym >= startMonth && ym <= endMonth) return 'plan'
    if (
      comparison.value &&
      ym >= comparison.value.startMonth &&
      ym <= comparison.value.endMonth
    ) {
      return 'comparison'
    }
    // Only consider "gap" when a comparison is set AND this month is between
    // the two ranges. Otherwise the month is just outside our scope.
    if (comparison.value && planMonthRange.value) {
      const earliest =
        comparison.value.startMonth < planMonthRange.value.startMonth
          ? comparison.value.startMonth
          : planMonthRange.value.startMonth
      const latest =
        comparison.value.endMonth > planMonthRange.value.endMonth
          ? comparison.value.endMonth
          : planMonthRange.value.endMonth
      if (ym > earliest && ym < latest) return 'gap'
    }
    return 'outside'
  }

  /** Months returned by the backend, in chronological order. */
  const monthLabels = computed<string[]>(
    () => statistics.value?.monthLabels ?? []
  )

  /** Indices of the `monthLabels` array that belong to the plan. */
  const planIndices = computed<number[]>(() => {
    const out: number[] = []
    monthLabels.value.forEach((ym, i) => {
      if (classifyMonth(ym) === 'plan') out.push(i)
    })
    return out
  })

  /** Indices belonging to the comparison. Empty when no comparison set. */
  const comparisonIndices = computed<number[]>(() => {
    if (!comparison.value) return []
    const out: number[] = []
    monthLabels.value.forEach((ym, i) => {
      if (classifyMonth(ym) === 'comparison') out.push(i)
    })
    return out
  })

  /**
   * Indices of plan months that have FULLY elapsed (the entire month is in
   * the past). Used to compute averages of "real activity" inside the plan
   * — partial / future months would otherwise distort the figure by zero.
   */
  const completePlanIndices = computed<number[]>(() => {
    if (!planMonthRange.value) return []
    const today = now()
    const todayUtc = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate()
    )
    const out: number[] = []
    monthLabels.value.forEach((ym, i) => {
      if (classifyMonth(ym) !== 'plan') return
      const parts = ym.split('-')
      const y = Number(parts[0])
      const m = Number(parts[1])
      const monthEnd = Date.UTC(y, m, 0, 23, 59, 59)
      if (monthEnd < todayUtc) out.push(i)
    })
    return out
  })

  /** Average of a per-category `monthlyAmounts` array over given indices. */
  function avgOverIndices(
    monthlyAmounts: number[] | undefined,
    indices: number[]
  ): number {
    if (!monthlyAmounts || indices.length === 0) return 0
    let sum = 0
    for (const i of indices) sum += monthlyAmounts[i] ?? 0
    return sum / indices.length
  }

  /** Per-category average over the plan months (incl. partial / future). */
  function planAverage(cat: CategoryAverageDto): number {
    return avgOverIndices(cat.monthlyAmounts, planIndices.value)
  }

  /**
   * Per-category average over the plan months that have fully elapsed only.
   * This is the "Réel à date" / "Réel observé" inside the plan.
   */
  function planActualAverage(cat: CategoryAverageDto): number {
    return avgOverIndices(cat.monthlyAmounts, completePlanIndices.value)
  }

  /** Per-category average over the comparison months. */
  function comparisonAverage(cat: CategoryAverageDto): number {
    return avgOverIndices(cat.monthlyAmounts, comparisonIndices.value)
  }

  /** Sum of `monthlyAmounts` across categories at the given month index. */
  function totalAtIndex(
    categories: CategoryAverageDto[],
    index: number
  ): number {
    let total = 0
    for (const cat of categories) {
      if (!cat.monthlyAmounts) continue
      total += cat.monthlyAmounts[index] ?? 0
    }
    return total
  }

  /** Average total (across all visible categories) over given indices. */
  function totalAvgOver(
    categories: CategoryAverageDto[],
    indices: number[]
  ): number {
    if (indices.length === 0) return 0
    let sum = 0
    for (const i of indices) sum += totalAtIndex(categories, i)
    return sum / indices.length
  }

  /**
   * Builder for per-zone aggregates restricted to the visible categories
   * (the caller filters out globally-hidden ones).
   *
   * - `planExpenseAvg`         : avg across ALL plan months (incl. partials)
   * - `planActualExpenseAvg`   : avg across COMPLETE plan months only
   * - `comparisonExpenseAvg`   : avg across the comparison range
   */
  function aggregatesFor(visibleExpenseCategories: CategoryAverageDto[]) {
    return {
      planExpenseAvg: totalAvgOver(visibleExpenseCategories, planIndices.value),
      planActualExpenseAvg: totalAvgOver(
        visibleExpenseCategories,
        completePlanIndices.value
      ),
      comparisonExpenseAvg: totalAvgOver(
        visibleExpenseCategories,
        comparisonIndices.value
      ),
    }
  }

  function incomeAggregates(visibleIncomeCategories: CategoryAverageDto[]) {
    return {
      planIncomeAvg: totalAvgOver(visibleIncomeCategories, planIndices.value),
      planActualIncomeAvg: totalAvgOver(
        visibleIncomeCategories,
        completePlanIndices.value
      ),
      comparisonIncomeAvg: totalAvgOver(
        visibleIncomeCategories,
        comparisonIndices.value
      ),
    }
  }

  /**
   * How many of the plan's months have fully elapsed (end-of-month < today).
   * Used by the savings summary to decide whether to display "Dépenses
   * réelles" alongside the budget — only meaningful when at least one
   * complete month is available.
   */
  const completePlanMonthsCount = computed<number>(
    () => completePlanIndices.value.length
  )

  /**
   * Total number of plan months declared (irrespective of elapsed state).
   */
  const planMonthsCount = computed<number>(() => planIndices.value.length)

  /**
   * True when every month of the plan is fully behind us — used to switch
   * the "Suivi" block label to "Bilan du plan".
   */
  const isPlanFinished = computed<boolean>(() => {
    if (planMonthsCount.value === 0) return false
    return completePlanMonthsCount.value === planMonthsCount.value
  })

  return {
    planMonthRange,
    widerRange,
    monthLabels,
    classifyMonth,
    planIndices,
    comparisonIndices,
    completePlanIndices,
    planAverage,
    planActualAverage,
    comparisonAverage,
    aggregatesFor,
    incomeAggregates,
    completePlanMonthsCount,
    planMonthsCount,
    isPlanFinished,
  }
}
