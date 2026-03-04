import { ref, computed } from 'vue'
import { api, type TransactionDto } from '@/lib/api'
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

  const transactions = ref<TransactionDto[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const selectedCategory = ref<string | null>(null)
  const selectedIncomeCategory = ref<string | null>(null)

  // Helper pour obtenir le montant ajusté (divisé par 2 si compte joint)
  function getAdjustedAmount(tx: TransactionDto): number {
    const divisor = filtersStore.isJointAccount(tx.account) ? 2 : 1
    return tx.amount / divisor
  }

  const monthlyData = computed<MonthlyData[]>(() => {
    const dataByMonth = new Map<string, { expenses: number; income: number }>()

    for (const tx of transactions.value) {
      const category = tx.categoryName || 'Autre'

      // Skip hidden categories
      if (
        tx.type === 'EXPENSE' &&
        filtersStore.isExpenseCategoryHidden(category)
      )
        continue
      if (tx.type === 'INCOME' && filtersStore.isIncomeCategoryHidden(category))
        continue

      const date = new Date(tx.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

      const existing = dataByMonth.get(monthKey)
      const monthData = existing ?? { expenses: 0, income: 0 }

      if (tx.type === 'EXPENSE') {
        monthData.expenses += Math.abs(getAdjustedAmount(tx))
      } else {
        monthData.income += getAdjustedAmount(tx)
      }

      dataByMonth.set(monthKey, monthData)
    }

    // Sort by month and convert to array
    const sortedMonths = Array.from(dataByMonth.keys()).sort()

    return sortedMonths.map(month => {
      const [year, monthNum] = month.split('-')
      const data = dataByMonth.get(month) ?? { expenses: 0, income: 0 }

      return {
        month,
        label: `${MONTH_LABELS[monthNum]} ${year}`,
        expenses: Math.round(data.expenses * 100) / 100,
        income: Math.round(data.income * 100) / 100,
      }
    })
  })

  const expensesByMonth = computed<ChartData>(() => ({
    labels: monthlyData.value.map(d => d.label),
    values: monthlyData.value.map(d => d.expenses),
  }))

  const incomeByMonth = computed<ChartData>(() => ({
    labels: monthlyData.value.map(d => d.label),
    values: monthlyData.value.map(d => d.income),
  }))

  const totalExpenses = computed(
    () =>
      Math.round(
        monthlyData.value.reduce((sum, d) => sum + d.expenses, 0) * 100
      ) / 100
  )

  const totalIncome = computed(
    () =>
      Math.round(
        monthlyData.value.reduce((sum, d) => sum + d.income, 0) * 100
      ) / 100
  )

  // Aggregation by category for expenses
  const expensesByCategory = computed<ChartData>(() => {
    const dataByCategory = new Map<string, number>()

    for (const tx of transactions.value) {
      if (tx.type === 'EXPENSE') {
        const category = tx.categoryName || 'Autre'
        if (filtersStore.isExpenseCategoryHidden(category)) continue
        const current = dataByCategory.get(category) ?? 0
        dataByCategory.set(category, current + Math.abs(getAdjustedAmount(tx)))
      }
    }

    // Sort by amount descending
    const sorted = [...dataByCategory.entries()].sort((a, b) => b[1] - a[1])

    return {
      labels: sorted.map(([cat]) => cat),
      values: sorted.map(([, val]) => Math.round(val * 100) / 100),
    }
  })

  // Aggregation by category for income
  const incomeByCategory = computed<ChartData>(() => {
    const dataByCategory = new Map<string, number>()

    for (const tx of transactions.value) {
      if (tx.type === 'INCOME') {
        const category = tx.categoryName || 'Autre'
        if (filtersStore.isIncomeCategoryHidden(category)) continue
        const current = dataByCategory.get(category) ?? 0
        dataByCategory.set(category, current + getAdjustedAmount(tx))
      }
    }

    // Sort by amount descending
    const sorted = [...dataByCategory.entries()].sort((a, b) => b[1] - a[1])

    return {
      labels: sorted.map(([cat]) => cat),
      values: sorted.map(([, val]) => Math.round(val * 100) / 100),
    }
  })

  // All expense categories (for filter panel)
  const allExpenseCategories = computed<string[]>(() => {
    const categories = new Set<string>()
    for (const tx of transactions.value) {
      if (tx.type === 'EXPENSE' && tx.categoryName) {
        categories.add(tx.categoryName)
      }
    }
    return Array.from(categories).sort()
  })

  // Available expense categories for dropdown (excludes hidden)
  const availableExpenseCategories = computed<string[]>(() => {
    return allExpenseCategories.value.filter(
      cat => !filtersStore.isExpenseCategoryHidden(cat)
    )
  })

  // Filtered expenses by month (when category is selected)
  const filteredExpensesByMonth = computed<ChartData>(() => {
    if (!selectedCategory.value) {
      return expensesByMonth.value
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

  // All income categories (for filter panel)
  const allIncomeCategories = computed<string[]>(() => {
    const categories = new Set<string>()
    for (const tx of transactions.value) {
      if (tx.type === 'INCOME' && tx.categoryName) {
        categories.add(tx.categoryName)
      }
    }
    return Array.from(categories).sort()
  })

  // Available income categories for dropdown (excludes hidden)
  const availableIncomeCategories = computed<string[]>(() => {
    return allIncomeCategories.value.filter(
      cat => !filtersStore.isIncomeCategoryHidden(cat)
    )
  })

  // Filtered income by month (when category is selected)
  const filteredIncomeByMonth = computed<ChartData>(() => {
    if (!selectedIncomeCategory.value) {
      return incomeByMonth.value
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

  // Available accounts for joint account filter
  const availableAccounts = computed<string[]>(() => {
    const accounts = new Set<string>()
    for (const tx of transactions.value) {
      if (tx.account) {
        accounts.add(tx.account)
      }
    }
    return Array.from(accounts).sort()
  })

  function setSelectedCategory(category: string | null) {
    selectedCategory.value = category
  }

  function setSelectedIncomeCategory(category: string | null) {
    selectedIncomeCategory.value = category
  }

  async function fetchData() {
    isLoading.value = true
    error.value = null

    try {
      transactions.value = await api.getTransactions()
    } catch (err) {
      error.value =
        err instanceof Error
          ? err.message
          : 'Erreur lors du chargement des données'
    } finally {
      isLoading.value = false
    }
  }

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
