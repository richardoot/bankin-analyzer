import { ref, computed, watch } from 'vue'
import {
  api,
  type CategoryOptionDto,
  type DashboardSummaryDto,
} from '@/lib/api'
import { useFiltersStore } from '@/stores/filters'
import { useAccountsStore } from '@/stores/accounts'
import { isAmortizationCarrier } from '@/lib/amortization'
import { formatMonthRange } from '@/lib/formatters'

export interface MonthlyData {
  month: string // "2024-01", "2024-02", ...
  label: string // "Jan 2024", "Fév 2024", ...
  expenses: number // dépenses brutes (valeur absolue)
  netExpenses: number // dépenses nettes (après déduction des remboursements)
  income: number // somme des revenus
  /** netExpenses without the events, smoothed purchases sliced. */
  everydayNetExpenses: number
}

export interface ChartData {
  labels: string[]
  values: number[]
}

/**
 * The two readings of a period: as it was (« Tout »), or the lifestyle
 * once the exceptional events are set aside (« Vie courante »).
 */
export type BreakdownMode = 'real' | 'everyday'

const BREAKDOWN_MODE_KEY = 'dashboard-breakdown-mode'

function readStoredBreakdownMode(): BreakdownMode {
  try {
    return localStorage.getItem(BREAKDOWN_MODE_KEY) === 'real'
      ? 'real'
      : 'everyday'
  } catch {
    return 'everyday'
  }
}

export function useDashboardData() {
  const filtersStore = useFiltersStore()
  const accountsStore = useAccountsStore()

  /**
   * One reading for the whole page — the month band, the
   * structure card and the category list follow it together. Persisted:
   * it is a way of looking at the figures, not a question of the moment.
   * Defaults to « Vie courante », as the budget does: a holiday must not
   * read as a jump in what the lifestyle costs.
   */
  const breakdownMode = ref<BreakdownMode>(readStoredBreakdownMode())

  function setBreakdownMode(mode: BreakdownMode): void {
    breakdownMode.value = mode
    try {
      localStorage.setItem(BREAKDOWN_MODE_KEY, mode)
    } catch {
      // Private browsing: the choice simply does not persist.
    }
  }

  // Pre-aggregated data from backend
  const summaryData = ref<DashboardSummaryDto | null>(null)

  // Transactions for drill-down (loaded on demand)

  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Reimbursement toggles. Received reimbursements are a reading of the
  // screen; a debt still owed is a preference shared with the budget, kept
  // by the backend, so the switch here reads and writes the store.
  const deductReimbursements = ref(true)
  const deductPendingReimbursements = computed<boolean>({
    get: () => filtersStore.deductPendingReimbursements,
    set: value => {
      void filtersStore.setDeductPendingReimbursements(value)
    },
  })
  /** The last failure to keep the shared preference on the server, if any. */
  const pendingPreferenceSyncError = computed<string | null>(
    () => filtersStore.lastSyncError ?? null
  )

  /**
   * The months of the period. A month only slices of smoothed purchases
   * reach (nothing real in it) carries the everyday reading only: the real
   * reading leaves it out, to look — and divide — exactly as it did.
   */
  const monthlyData = computed<MonthlyData[]>(() => {
    const months = summaryData.value?.monthlyData ?? []
    if (breakdownMode.value === 'everyday') return months
    return months.filter(
      m =>
        m.amortizedExpenses === undefined ||
        m.expenses !== 0 ||
        m.income !== 0 ||
        m.netExpenses !== 0
    )
  })

  /** Whether the everyday reading spreads a smoothed purchase here. */
  const hasAmortizedExpenses = computed(() =>
    (summaryData.value?.monthlyData ?? []).some(
      m => m.amortizedExpenses !== undefined
    )
  )

  const totalExpenses = computed(() => summaryData.value?.totalExpenses ?? 0)
  const totalIncome = computed(() => summaryData.value?.totalIncome ?? 0)

  // The structure of spending and the savings reading, straight from the
  // server; absent on an older server, so every consumer guards for it.
  const spendingStructure = computed(
    () => summaryData.value?.spendingStructure ?? null
  )
  const everydaySpendingStructure = computed(
    () => summaryData.value?.everydaySpendingStructure ?? null
  )
  // What the period kept: income less every expense, the server's figure.
  const savings = computed(
    () =>
      summaryData.value?.savings ??
      Math.round((totalIncome.value - totalExpenses.value) * 100) / 100
  )
  // Where some of it went: informational, it carries no rate.
  const savingsTransfers = computed(
    () => summaryData.value?.savingsTransfers ?? 0
  )
  const savingsRate = computed(() => summaryData.value?.savingsRate ?? null)
  const remainingToLive = computed(
    () => summaryData.value?.remainingToLive ?? null
  )
  const pendingReceivables = computed(
    () => summaryData.value?.pendingReceivables ?? 0
  )
  // The tag families over the current calendar year, whatever the period:
  // the « Épisodes » line names them; their card is on the Tags page.
  const tagFamiliesOfYear = computed(
    () => summaryData.value?.tagFamiliesOfYear ?? []
  )

  /**
   * The months the averages read, and their number: the server's
   * `periodMonths`, the closed months of the period. The current month is
   * drawn on every chart but averaged nowhere — half a month is not a
   * month. They are the first `periodMonths` of `monthLabels` (the current
   * month and any after it come last); a period of the current month alone
   * averages it over 1. An older server without the field: every month.
   */
  const averagedMonths = computed<Set<string> | null>(() => {
    const labels = summaryData.value?.monthLabels
    const closed = summaryData.value?.periodMonths
    if (!labels || closed === undefined) return null
    return new Set(labels.length > closed ? labels.slice(0, closed) : labels)
  })

  /**
   * The divisor. The real reading leaves out a month only smoothed slices
   * reach, as `monthlyData` does: it divides exactly as it did before the
   * smoothing.
   */
  const periodMonths = computed(() => {
    const closed = summaryData.value?.periodMonths
    if (closed === undefined) return monthlyData.value.length || 1
    if (breakdownMode.value === 'everyday') return closed
    const slicesOnly = (summaryData.value?.monthlyData ?? []).filter(
      m =>
        (averagedMonths.value?.has(m.month) ?? false) &&
        m.amortizedExpenses !== undefined &&
        m.expenses === 0 &&
        m.income === 0 &&
        m.netExpenses === 0
    ).length
    return Math.max(1, closed - slicesOnly)
  })
  /** Whether the averages read closed months, or the current month alone. */
  const averagesReadClosedMonths = computed(() => {
    const labels = summaryData.value?.monthLabels ?? []
    const last = labels[Math.min(periodMonths.value, labels.length) - 1]
    if (!last) return true
    const now = new Date()
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return last < current
  })

  /** A month series summed over the averaged months, then per month. */
  function averageOf(
    pick: (m: DashboardSummaryDto['monthlyData'][number]) => number,
    total: number
  ): number {
    const months = averagedMonths.value
    const sum = months
      ? (summaryData.value?.monthlyData ?? [])
          .filter(m => months.has(m.month))
          .reduce((acc, m) => acc + pick(m), 0)
      : total
    return Math.round((sum / periodMonths.value) * 100) / 100
  }

  const averageMonthlyExpenses = computed(() =>
    averageOf(m => m.netExpenses, totalExpenses.value)
  )
  const averageMonthlyIncome = computed(() =>
    averageOf(m => m.income, totalIncome.value)
  )
  const averageMonthlySavings = computed(
    () =>
      Math.round(
        (averageMonthlyIncome.value - averageMonthlyExpenses.value) * 100
      ) / 100
  )

  // --- Everyday vs exceptional -------------------------------------------
  // Transactions carrying a tag flagged "exceptional" (a holiday, a birthday)
  // describe a one-off event, not the user's recurring lifestyle. Keeping them
  // out of the averages is what makes those averages usable as a budget.

  const totalExceptionalExpenses = computed(
    () => summaryData.value?.totalExceptionalExpenses ?? 0
  )
  const exceptionalEvents = computed(
    () => summaryData.value?.exceptionalEvents ?? []
  )
  const totalEverydayExpenses = computed(() => {
    const categories = summaryData.value?.expensesByCategory ?? []
    // `everydayAmount` is absent before a breakdown is requested; the real
    // amount is then the best available answer.
    const sum = categories.reduce(
      (acc, cat) => acc + (cat.everydayAmount ?? cat.amount),
      0
    )
    return Math.round(sum * 100) / 100
  })

  const hasExceptionalExpenses = computed(
    () => totalExceptionalExpenses.value > 0
  )

  const isEverydayMode = computed(() => breakdownMode.value === 'everyday')

  // The figures that follow the reading. Income and savings stay as they
  // are: money is money, only the expenses have an exceptional share.
  const displayedTotalExpenses = computed(() =>
    isEverydayMode.value ? totalEverydayExpenses.value : totalExpenses.value
  )

  const expensesByCategory = computed<ChartData>(() => {
    const data = summaryData.value?.expensesByCategory ?? []
    return {
      labels: data.map(d => d.category),
      values: data.map(d => d.amount),
    }
  })

  // Detailed category breakdown (with monthlyAmounts, subcategories, etc.)
  // The real reading leaves out a category only slices reach.
  const expenseCategoriesDetailed = computed(() => {
    const categories = summaryData.value?.expensesByCategory ?? []
    return isEverydayMode.value
      ? categories
      : categories.filter(c => !isAmortizationCarrier(c))
  })
  const incomeCategoriesDetailed = computed(
    () => summaryData.value?.incomeByCategory ?? []
  )
  const monthLabels = computed(() => summaryData.value?.monthLabels ?? [])

  /**
   * The period in months, for the heading of « Où part l'argent »:
   * « novembre 2025 à octobre 2026 ». Read off the months the summary
   * covers, so it names what the figures are; before any answer, off the
   * selected range. Null when neither says (an unbounded period not
   * loaded yet).
   */
  const periodRangeLabel = computed<string | null>(() => {
    const labels = monthLabels.value
    let first: string | null | undefined = labels[0]
    let last: string | null | undefined = labels.at(-1)
    if (!first || !last) {
      const range = filtersStore.getDateRangeFromPeriod(filtersStore.timePeriod)
      first = range.startDate
      last = range.endDate
    }
    return first && last ? formatMonthRange(first, last) : null
  })

  // Every expense category the period carries, each with its id
  const allExpenseCategories = computed<CategoryOptionDto[]>(
    () => summaryData.value?.allExpenseCategories ?? []
  )

  // Every income category the period carries. Those linked to an expense
  // category used to be filtered out here, because the server excluded them
  // from income wholesale. It no longer does: a transfer is now netted by the
  // cash it actually paid back, so a mixed one — salary plus a refund — still
  // reports its salary, and hiding the category would hide real income.
  const allIncomeCategories = computed<CategoryOptionDto[]>(
    () => summaryData.value?.allIncomeCategories ?? []
  )

  async function fetchData() {
    isLoading.value = true
    error.value = null

    try {
      // Calculate date range from selected time period
      const { startDate, endDate } = filtersStore.getDateRangeFromPeriod(
        filtersStore.timePeriod
      )

      // Load dashboard summary and accounts in parallel
      const [summary] = await Promise.all([
        api.getDashboardSummary({
          // Omitted when absent rather than sent as `undefined`: an unbounded
          // period is expressed by saying nothing, not by naming a date of
          // nothing.
          ...(startDate && { startDate }),
          ...(endDate && { endDate }),
          deductReimbursements: deductReimbursements.value,
          deductPendingReimbursements: deductPendingReimbursements.value,
          includeCategoryBreakdown: true,
        }),
        accountsStore.load(),
      ])

      summaryData.value = summary
    } catch (err) {
      error.value =
        err instanceof Error
          ? err.message
          : 'Erreur lors du chargement des données'
    } finally {
      isLoading.value = false
    }
  }

  // Auto-refetch when filters change
  watch(
    () => [
      filtersStore.timePeriod,
      filtersStore.customStartDate,
      filtersStore.customEndDate,
      deductReimbursements.value,
      filtersStore.deductPendingReimbursements,
    ],
    () => {
      // Not before the first fetch has run — but after a failed one, a new
      // period is also a way to try again.
      if (summaryData.value || error.value) {
        // Skip refetch if 'custom' is selected but the range is incomplete
        // or inverted — the selector says so on screen.
        if (filtersStore.timePeriod === 'custom') {
          const { customStartDate: start, customEndDate: end } = filtersStore
          if (!start || !end || end < start) return
        }
        fetchData()
      }
    },
    { deep: true }
  )

  // Something came back once: a later fetch is a refresh, not a first load.
  const hasLoaded = computed(() => summaryData.value !== null)

  return {
    hasLoaded,
    breakdownMode,
    setBreakdownMode,
    displayedTotalExpenses,
    pendingPreferenceSyncError,
    monthlyData,
    totalExpenses,
    totalIncome,
    periodMonths,
    averagesReadClosedMonths,
    averageMonthlyExpenses,
    averageMonthlyIncome,
    averageMonthlySavings,
    totalExceptionalExpenses,
    totalEverydayExpenses,
    exceptionalEvents,
    hasExceptionalExpenses,
    hasAmortizedExpenses,
    expensesByCategory,
    expenseCategoriesDetailed,
    incomeCategoriesDetailed,
    monthLabels,
    periodRangeLabel,
    allExpenseCategories,
    allIncomeCategories,
    deductReimbursements,
    deductPendingReimbursements,
    spendingStructure,
    everydaySpendingStructure,
    savings,
    savingsTransfers,
    pendingReceivables,
    savingsRate,
    remainingToLive,
    tagFamiliesOfYear,
    isLoading,
    error,
    fetchData,
  }
}
