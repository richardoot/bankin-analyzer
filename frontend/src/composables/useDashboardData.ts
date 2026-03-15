import { ref, computed, watch } from 'vue'
import { api, type DashboardSummaryDto, type TransactionDto } from '@/lib/api'
import { useFiltersStore } from '@/stores/filters'

export interface MonthlyData {
  month: string // "2024-01", "2024-02", ...
  label: string // "Jan 2024", "Fév 2024", ...
  expenses: number // somme des dépenses (valeur absolue)
  income: number // somme des revenus
}

export interface ChartData {
  labels: string[]
  values: number[]
}

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan',
  '02': 'Fév',
  '03': 'Mar',
  '04': 'Avr',
  '05': 'Mai',
  '06': 'Juin',
  '07': 'Juil',
  '08': 'Août',
  '09': 'Sep',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Déc',
}

export function useDashboardData() {
  const filtersStore = useFiltersStore()

  // Pre-aggregated data from backend
  const summaryData = ref<DashboardSummaryDto | null>(null)

  // Transactions for drill-down (loaded on demand)
  const transactions = ref<TransactionDto[]>([])
  const transactionsLoaded = ref(false)

  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const selectedCategory = ref<string | null>(null)
  const selectedIncomeCategory = ref<string | null>(null)

  // Transform backend data to component format
  const monthlyData = computed<MonthlyData[]>(
    () => summaryData.value?.monthlyData ?? []
  )

  const expensesByMonth = computed<ChartData>(() => ({
    labels: monthlyData.value.map(d => d.label),
    values: monthlyData.value.map(d => d.expenses),
  }))

  const incomeByMonth = computed<ChartData>(() => ({
    labels: monthlyData.value.map(d => d.label),
    values: monthlyData.value.map(d => d.income),
  }))

  const totalExpenses = computed(() => summaryData.value?.totalExpenses ?? 0)
  const totalIncome = computed(() => summaryData.value?.totalIncome ?? 0)

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

  // All categories (for filter panel)
  const allExpenseCategories = computed<string[]>(
    () => summaryData.value?.allExpenseCategories ?? []
  )

  const allIncomeCategories = computed<string[]>(
    () => summaryData.value?.allIncomeCategories ?? []
  )

  // Available categories (excludes hidden)
  const availableExpenseCategories = computed<string[]>(() =>
    allExpenseCategories.value.filter(
      cat => !filtersStore.isExpenseCategoryHidden(cat)
    )
  )

  const availableIncomeCategories = computed<string[]>(() =>
    allIncomeCategories.value.filter(
      cat => !filtersStore.isIncomeCategoryHidden(cat)
    )
  )

  // Available accounts for joint account filter
  const availableAccounts = computed<string[]>(
    () => summaryData.value?.availableAccounts ?? []
  )

  // Helper pour obtenir le montant ajusté (divisé par 2 si compte joint)
  function getAdjustedAmount(tx: TransactionDto): number {
    const divisor = filtersStore.isJointAccount(tx.account) ? 2 : 1
    return tx.amount / divisor
  }

  // Filtered expenses by month (when category is selected) - requires transactions
  const filteredExpensesByMonth = computed<ChartData>(() => {
    if (!selectedCategory.value) {
      return expensesByMonth.value
    }

    if (!transactionsLoaded.value) {
      return { labels: [], values: [] }
    }

    const dataByMonth = new Map<string, number>()

    for (const tx of transactions.value) {
      if (tx.type === 'EXPENSE' && tx.categoryName === selectedCategory.value) {
        const category = tx.categoryName || 'Autre'
        if (filtersStore.isExpenseCategoryHidden(category)) continue

        const date = new Date(tx.date)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

        const current = dataByMonth.get(monthKey) ?? 0
        dataByMonth.set(monthKey, current + Math.abs(getAdjustedAmount(tx)))
      }
    }

    // Sort by month
    const sortedMonths = Array.from(dataByMonth.keys()).sort()

    return {
      labels: sortedMonths.map(month => {
        const [year, monthNum] = month.split('-')
        return `${MONTH_LABELS[monthNum]} ${year}`
      }),
      values: sortedMonths.map(
        month => Math.round((dataByMonth.get(month) ?? 0) * 100) / 100
      ),
    }
  })

  // Filtered income by month (when category is selected) - requires transactions
  const filteredIncomeByMonth = computed<ChartData>(() => {
    if (!selectedIncomeCategory.value) {
      return incomeByMonth.value
    }

    if (!transactionsLoaded.value) {
      return { labels: [], values: [] }
    }

    const dataByMonth = new Map<string, number>()

    for (const tx of transactions.value) {
      if (
        tx.type === 'INCOME' &&
        tx.categoryName === selectedIncomeCategory.value
      ) {
        const category = tx.categoryName || 'Autre'
        if (filtersStore.isIncomeCategoryHidden(category)) continue

        const date = new Date(tx.date)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

        const current = dataByMonth.get(monthKey) ?? 0
        dataByMonth.set(monthKey, current + getAdjustedAmount(tx))
      }
    }

    // Sort by month
    const sortedMonths = Array.from(dataByMonth.keys()).sort()

    return {
      labels: sortedMonths.map(month => {
        const [year, monthNum] = month.split('-')
        return `${MONTH_LABELS[monthNum]} ${year}`
      }),
      values: sortedMonths.map(
        month => Math.round((dataByMonth.get(month) ?? 0) * 100) / 100
      ),
    }
  })

  // Load transactions for drill-down (on demand)
  async function loadTransactionsForDrillDown() {
    if (transactionsLoaded.value) return

    try {
      transactions.value = await api.getTransactions()
      transactionsLoaded.value = true
    } catch (err) {
      console.error('Failed to load transactions for drill-down:', err)
    }
  }

  async function setSelectedCategory(category: string | null) {
    selectedCategory.value = category
    if (category && !transactionsLoaded.value) {
      await loadTransactionsForDrillDown()
    }
  }

  async function setSelectedIncomeCategory(category: string | null) {
    selectedIncomeCategory.value = category
    if (category && !transactionsLoaded.value) {
      await loadTransactionsForDrillDown()
    }
  }

  async function fetchData() {
    isLoading.value = true
    error.value = null

    try {
      summaryData.value = await api.getDashboardSummary({
        jointAccounts: filtersStore.jointAccounts,
        hiddenExpenseCategories: filtersStore.hiddenExpenseCategories,
        hiddenIncomeCategories: filtersStore.hiddenIncomeCategories,
        categoryAssociations: filtersStore.categoryAssociations,
      })

      // Reset drill-down state when reloading
      transactionsLoaded.value = false
      transactions.value = []
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
      filtersStore.jointAccounts,
      filtersStore.hiddenExpenseCategories,
      filtersStore.hiddenIncomeCategories,
      filtersStore.categoryAssociations,
    ],
    () => {
      if (summaryData.value) {
        fetchData()
      }
    },
    { deep: true }
  )

  return {
    transactions,
    monthlyData,
    expensesByMonth,
    incomeByMonth,
    totalExpenses,
    totalIncome,
    expensesByCategory,
    incomeByCategory,
    allExpenseCategories,
    allIncomeCategories,
    availableExpenseCategories,
    availableIncomeCategories,
    availableAccounts,
    selectedCategory,
    selectedIncomeCategory,
    filteredExpensesByMonth,
    filteredIncomeByMonth,
    setSelectedCategory,
    setSelectedIncomeCategory,
    isLoading,
    error,
    fetchData,
  }
}
