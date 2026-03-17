import { ref, computed, watch } from 'vue'
import { api, type DashboardSummaryDto, type TransactionDto } from '@/lib/api'
import { useFiltersStore } from '@/stores/filters'
import { useCategoryAssociationsStore } from '@/stores/categoryAssociations'

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
  const categoryAssociationsStore = useCategoryAssociationsStore()

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
    values: monthlyData.value.map(d => d.netExpenses),
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

  // All income categories excluding those associated with expense categories
  const allIncomeCategories = computed<string[]>(() =>
    (summaryData.value?.allIncomeCategories ?? []).filter(
      cat => !categoryAssociationsStore.isIncomeCategoryAssociated(cat)
    )
  )

  // Available categories (excludes hidden)
  const availableExpenseCategories = computed<string[]>(() =>
    allExpenseCategories.value.filter(
      cat => !filtersStore.isExpenseCategoryHidden(cat)
    )
  )

  // Available income categories (excludes hidden and associated)
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
  // Deducts reimbursements from associated income category
  // Shows all months from the selected time period, with zeros for months without data
  const filteredExpensesByMonth = computed<ChartData>(() => {
    if (!selectedCategory.value) {
      return expensesByMonth.value
    }

    if (!transactionsLoaded.value) {
      return { labels: [], values: [] }
    }

    const expensesByMonthMap = new Map<string, number>()
    const reimbursementsByMonthMap = new Map<string, number>()

    // Find the associated income category for this expense category
    // Access associations directly to ensure Vue tracks the dependency
    const association = categoryAssociationsStore.associations.find(
      a => a.expenseCategoryName === selectedCategory.value
    )
    const associatedIncomeCategory = association?.incomeCategoryName ?? null

    for (const tx of transactions.value) {
      const date = new Date(tx.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

      // Sum expenses for selected category
      if (tx.type === 'EXPENSE' && tx.categoryName === selectedCategory.value) {
        const category = tx.categoryName || 'Autre'
        if (filtersStore.isExpenseCategoryHidden(category)) continue

        const current = expensesByMonthMap.get(monthKey) ?? 0
        expensesByMonthMap.set(
          monthKey,
          current + Math.abs(getAdjustedAmount(tx))
        )
      }

      // Sum reimbursements from associated income category
      if (
        associatedIncomeCategory &&
        tx.type === 'INCOME' &&
        tx.categoryName === associatedIncomeCategory
      ) {
        const current = reimbursementsByMonthMap.get(monthKey) ?? 0
        reimbursementsByMonthMap.set(monthKey, current + getAdjustedAmount(tx))
      }
    }

    // Use all months from the global monthlyData to maintain consistency with time period
    const allMonthsFromPeriod = monthlyData.value.map(d => d.month)

    // Calculate net expenses per month for all months in the period
    return {
      labels: allMonthsFromPeriod.map(month => {
        const [year, monthNum] = month.split('-')
        return `${MONTH_LABELS[monthNum]} ${year}`
      }),
      values: allMonthsFromPeriod.map(month => {
        const expenses = expensesByMonthMap.get(month) ?? 0
        const reimbursements = reimbursementsByMonthMap.get(month) ?? 0
        const netExpenses = Math.max(0, expenses - reimbursements)
        return Math.round(netExpenses * 100) / 100
      }),
    }
  })

  // Filtered income by month (when category is selected) - requires transactions
  // Shows all months from the selected time period, with zeros for months without data
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

    // Use all months from the global monthlyData to maintain consistency with time period
    const allMonthsFromPeriod = monthlyData.value.map(d => d.month)

    return {
      labels: allMonthsFromPeriod.map(month => {
        const [year, monthNum] = month.split('-')
        return `${MONTH_LABELS[monthNum]} ${year}`
      }),
      values: allMonthsFromPeriod.map(
        month => Math.round((dataByMonth.get(month) ?? 0) * 100) / 100
      ),
    }
  })

  // Load transactions for drill-down (on demand)
  // Fetches all transactions by paginating through all pages
  async function loadTransactionsForDrillDown() {
    if (transactionsLoaded.value) return

    try {
      const allTransactions: TransactionDto[] = []
      let page = 1
      const limit = 100 // Maximum allowed by backend

      // Fetch all pages
      while (true) {
        const response = await api.getTransactions({ page, limit })
        allTransactions.push(...response.data)

        if (!response.meta.hasNextPage) {
          break
        }
        page++
      }

      transactions.value = allTransactions
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
      // Calculate date range from selected time period
      const { startDate, endDate } = filtersStore.getDateRangeFromPeriod(
        filtersStore.timePeriod
      )

      // Load dashboard summary and category associations in parallel
      const [summary] = await Promise.all([
        api.getDashboardSummary({
          jointAccounts: filtersStore.jointAccounts,
          hiddenExpenseCategories: filtersStore.hiddenExpenseCategories,
          hiddenIncomeCategories: filtersStore.hiddenIncomeCategories,
          startDate: startDate ?? undefined,
          endDate: endDate ?? undefined,
        }),
        categoryAssociationsStore.load(),
      ])

      summaryData.value = summary

      // Reset drill-down state when reloading
      transactionsLoaded.value = false
      transactions.value = []

      // If a category filter is active, reload transactions for drill-down
      if (selectedCategory.value || selectedIncomeCategory.value) {
        await loadTransactionsForDrillDown()
      }
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
      filtersStore.timePeriod,
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
