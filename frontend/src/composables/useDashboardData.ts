import { ref, computed, watch } from 'vue'
import {
  api,
  type CategoryOptionDto,
  type DashboardSummaryDto,
} from '@/lib/api'
import { useFiltersStore } from '@/stores/filters'
import { useAccountsStore } from '@/stores/accounts'

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

export function useDashboardData() {
  const filtersStore = useFiltersStore()
  const accountsStore = useAccountsStore()

  // Pre-aggregated data from backend
  const summaryData = ref<DashboardSummaryDto | null>(null)

  // Transactions for drill-down (loaded on demand)

  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const selectedCategory = ref<string | null>(null)
  const selectedIncomeCategory = ref<string | null>(null)

  // Reimbursement toggles (mirror BudgetPage defaults)
  const deductReimbursements = ref(true)
  const deductPendingReimbursements = ref(false)

  // Transform backend data to component format
  const monthlyData = computed<MonthlyData[]>(
    () => summaryData.value?.monthlyData ?? []
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
  const expenseCategoriesDetailed = computed(
    () => summaryData.value?.expensesByCategory ?? []
  )
  const incomeCategoriesDetailed = computed(
    () => summaryData.value?.incomeByCategory ?? []
  )
  const monthLabels = computed(() => summaryData.value?.monthLabels ?? [])

  // All categories (for filter panel), each carrying the id it is filtered by
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

  // Helper: Check if category is hidden (dashboard filter OR globally hidden)
  function isExpenseCategoryHiddenOrGlobal(categoryId: string): boolean {
    return (
      filtersStore.isExpenseCategoryHidden(categoryId) ||
      filtersStore.isExpenseCategoryGloballyHidden(categoryId)
    )
  }

  function isIncomeCategoryHiddenOrGlobal(categoryId: string): boolean {
    return (
      filtersStore.isIncomeCategoryHidden(categoryId) ||
      filtersStore.isIncomeCategoryGloballyHidden(categoryId)
    )
  }

  // Available categories (excludes dashboard hidden AND globally hidden)
  const availableExpenseCategories = computed<CategoryOptionDto[]>(() =>
    allExpenseCategories.value.filter(
      cat => !isExpenseCategoryHiddenOrGlobal(cat.id)
    )
  )

  // Available income categories (excludes hidden, globally hidden, and associated)
  const availableIncomeCategories = computed<CategoryOptionDto[]>(() =>
    allIncomeCategories.value.filter(
      cat => !isIncomeCategoryHiddenOrGlobal(cat.id)
    )
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

  // Both drill-down charts read the series the server already computed.
  //
  // They used to be recalculated here from every transaction of the account,
  // which meant the chart and the category breakdown right next to it applied
  // *different* rules: this one deducted a refund in the month it was received,
  // through the category association, while the server now nets it against the
  // expense it repays. Same screen, two answers. Reading the server's own
  // figures makes them agree by construction — and drops the full paginated
  // transaction fetch that existed only to feed this.
  const filteredExpensesByMonth = computed<ChartData>(() => {
    if (!selectedCategory.value) {
      return expensesByMonth.value
    }
    return monthlySeriesOf(
      expenseCategoriesDetailed.value,
      selectedCategory.value
    )
  })

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
  function setSelectedCategory(category: string | null): void {
    selectedCategory.value = category
  }

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

      // Combine dashboard filters with global hidden categories
      const combinedHiddenExpenseCategoryIds = [
        ...new Set([
          ...filtersStore.hiddenExpenseCategoryIds,
          ...filtersStore.globalHiddenExpenseCategoryIds,
        ]),
      ]
      const combinedHiddenIncomeCategoryIds = [
        ...new Set([
          ...filtersStore.hiddenIncomeCategoryIds,
          ...filtersStore.globalHiddenIncomeCategoryIds,
        ]),
      ]

      // Load dashboard summary, accounts, and category associations in parallel
      const [summary] = await Promise.all([
        api.getDashboardSummary({
          hiddenExpenseCategoryIds: combinedHiddenExpenseCategoryIds,
          hiddenIncomeCategoryIds: combinedHiddenIncomeCategoryIds,
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

  // Auto-refetch when filters change (dashboard or global)
  watch(
    () => [
      filtersStore.hiddenExpenseCategoryIds,
      filtersStore.hiddenIncomeCategoryIds,
      filtersStore.globalHiddenExpenseCategoryIds,
      filtersStore.globalHiddenIncomeCategoryIds,
      filtersStore.timePeriod,
      filtersStore.customStartDate,
      filtersStore.customEndDate,
      deductReimbursements.value,
      deductPendingReimbursements.value,
    ],
    () => {
      if (summaryData.value) {
        // Skip refetch if 'custom' is selected but the range is incomplete
        if (
          filtersStore.timePeriod === 'custom' &&
          (!filtersStore.customStartDate || !filtersStore.customEndDate)
        ) {
          return
        }
        fetchData()
      }
    },
    { deep: true }
  )

  return {
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
    availableExpenseCategories,
    availableIncomeCategories,
    selectedCategory,
    selectedIncomeCategory,
    filteredExpensesByMonth,
    filteredIncomeByMonth,
    setSelectedCategory,
    setSelectedIncomeCategory,
    deductReimbursements,
    deductPendingReimbursements,
    isLoading,
    error,
    fetchData,
  }
}
