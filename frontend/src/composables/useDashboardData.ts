import { ref, computed, watch } from 'vue'
import {
  api,
  type CategoryOptionDto,
  type DashboardSummaryDto,
} from '@/lib/api'
import { useFiltersStore } from '@/stores/filters'
import { useAccountsStore } from '@/stores/accounts'
import { isAmortizationCarrier } from '@/lib/amortization'

export interface MonthlyData {
  month: string // "2024-01", "2024-02", ...
  label: string // "Jan 2024", "Fév 2024", ...
  expenses: number // dépenses brutes (valeur absolue)
  netExpenses: number // dépenses nettes (après déduction des remboursements)
  income: number // somme des revenus
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
   * One reading for the whole page — the expenses KPI, the
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
  const selectedIncomeCategory = ref<string | null>(null)

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

  const expensesByMonth = computed<ChartData>(() => ({
    labels: monthlyData.value.map(d => d.label),
    values: monthlyData.value.map(d => d.netExpenses),
  }))

  const incomeByMonth = computed<ChartData>(() => ({
    labels: monthlyData.value.map(d => d.label),
    values: monthlyData.value.map(d => d.income),
  }))

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
  // The tag families over the current calendar year, whatever the period.
  const tagFamiliesOfYear = computed(
    () => summaryData.value?.tagFamiliesOfYear ?? []
  )
  const realExpensesOfYear = computed(
    () => summaryData.value?.realExpensesOfYear ?? null
  )

  // Number of months in the period (used for averages)
  const periodMonths = computed(() => monthlyData.value.length || 1)

  const averageMonthlyExpenses = computed(
    () => Math.round((totalExpenses.value / periodMonths.value) * 100) / 100
  )
  const averageMonthlyIncome = computed(
    () => Math.round((totalIncome.value / periodMonths.value) * 100) / 100
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

  // Same divisor as averageMonthlyExpenses, so the gap between the two figures
  // is exactly the exceptional spending and nothing else.
  const averageEverydayMonthlyExpenses = computed(
    () =>
      Math.round((totalEverydayExpenses.value / periodMonths.value) * 100) / 100
  )

  const hasExceptionalExpenses = computed(
    () => totalExceptionalExpenses.value > 0
  )

  const isEverydayMode = computed(() => breakdownMode.value === 'everyday')

  // The figures that follow the reading. Income and savings stay as they
  // are: money is money, only the expenses have an exceptional share.
  const displayedTotalExpenses = computed(() =>
    isEverydayMode.value ? totalEverydayExpenses.value : totalExpenses.value
  )
  const displayedAverageMonthlyExpenses = computed(() =>
    isEverydayMode.value
      ? averageEverydayMonthlyExpenses.value
      : averageMonthlyExpenses.value
  )
  /**
   * The events, per month. Read from their own total: the everyday reading
   * also spreads smoothed purchases, so the gap between the two readings is
   * no longer the events alone once one is smoothed.
   */
  const averageExceptionalMonthlyExpenses = computed(() =>
    hasAmortizedExpenses.value
      ? Math.round(
          (totalExceptionalExpenses.value / periodMonths.value) * 100
        ) / 100
      : Math.round(
          (averageMonthlyExpenses.value -
            averageEverydayMonthlyExpenses.value) *
            100
        ) / 100
  )

  // Per-month series for sparklines
  const expensesSparkline = computed(() =>
    monthlyData.value.map(d => d.netExpenses)
  )
  const incomeSparkline = computed(() => monthlyData.value.map(d => d.income))
  const savingsSparkline = computed(() =>
    monthlyData.value.map(
      d => Math.round((d.income - d.netExpenses) * 100) / 100
    )
  )

  const expensesByCategory = computed<ChartData>(() => {
    const data = summaryData.value?.expensesByCategory ?? []
    return {
      labels: data.map(d => d.category),
      values: data.map(d => d.amount),
    }
  })

  const incomeByCategory = computed<ChartData>(() => {
    const data = summaryData.value?.incomeByCategory ?? []
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

  /**
   * The server's per-category monthly series, keyed by month.
   *
   * `monthlyAmounts` is aligned with `monthLabels`, which spans the whole
   * requested period, while the chart axis follows `monthlyData` — the months
   * that actually carry something. Going through a map rather than a shared
   * index keeps the two from silently drifting apart.
   */
  function monthlySeriesOf(
    categories: { categoryId: string; monthlyAmounts?: number[] }[],
    categoryId: string
  ): ChartData {
    const category = categories.find(c => c.categoryId === categoryId)
    const labels = monthLabels.value
    const byMonth = new Map<string, number>(
      (category?.monthlyAmounts ?? []).map((amount, index) => [
        labels[index] ?? String(index),
        amount,
      ])
    )

    // The axis carries its own formatted label already; reusing it keeps the
    // drill-down chart aligned with the overview above it.
    return {
      labels: monthlyData.value.map(d => d.label),
      values: monthlyData.value.map(d => byMonth.get(d.month) ?? 0),
    }
  }

  // The income drill-down chart reads the series the server already computed.
  // (The expenses chart lost its selector: each expanded category row draws
  // its own monthly chart.)
  //
  // Drill-down charts used to be recalculated here from every transaction of the account,
  // which meant the chart and the category breakdown right next to it applied
  // *different* rules: this one deducted a refund in the month it was received,
  // through the category association, while the server now nets it against the
  // expense it repays. Same screen, two answers. Reading the server's own
  // figures makes them agree by construction — and drops the full paginated
  // transaction fetch that existed only to feed this.
  const filteredIncomeByMonth = computed<ChartData>(() => {
    if (!selectedIncomeCategory.value) {
      return incomeByMonth.value
    }
    return monthlySeriesOf(
      incomeCategoriesDetailed.value,
      selectedIncomeCategory.value
    )
  })

  // Selecting a category no longer fetches anything: the summary already
  // carries its monthly series. What used to happen here was a full paginated
  // walk of every transaction on the account, on the first drill-down, purely
  // to redraw a chart the server had already computed.
  function setSelectedIncomeCategory(category: string | null): void {
    selectedIncomeCategory.value = category
  }

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
    displayedAverageMonthlyExpenses,
    averageExceptionalMonthlyExpenses,
    pendingPreferenceSyncError,
    monthlyData,
    expensesByMonth,
    incomeByMonth,
    totalExpenses,
    totalIncome,
    periodMonths,
    averageMonthlyExpenses,
    averageMonthlyIncome,
    averageMonthlySavings,
    totalExceptionalExpenses,
    totalEverydayExpenses,
    averageEverydayMonthlyExpenses,
    exceptionalEvents,
    hasExceptionalExpenses,
    hasAmortizedExpenses,
    expensesSparkline,
    incomeSparkline,
    savingsSparkline,
    expensesByCategory,
    incomeByCategory,
    expenseCategoriesDetailed,
    incomeCategoriesDetailed,
    monthLabels,
    allExpenseCategories,
    allIncomeCategories,
    selectedIncomeCategory,
    filteredIncomeByMonth,
    setSelectedIncomeCategory,
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
    realExpensesOfYear,
    isLoading,
    error,
    fetchData,
  }
}
