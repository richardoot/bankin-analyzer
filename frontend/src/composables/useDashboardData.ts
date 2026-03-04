import { ref, computed } from 'vue'
import { api, type TransactionDto } from '@/lib/api'

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
  const transactions = ref<TransactionDto[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const monthlyData = computed<MonthlyData[]>(() => {
    const dataByMonth = new Map<string, { expenses: number; income: number }>()

    for (const tx of transactions.value) {
      const date = new Date(tx.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

      const existing = dataByMonth.get(monthKey)
      const monthData = existing ?? { expenses: 0, income: 0 }

      if (tx.type === 'EXPENSE') {
        monthData.expenses += Math.abs(tx.amount)
      } else {
        monthData.income += tx.amount
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
    isLoading,
    error,
    fetchData,
  }
}
