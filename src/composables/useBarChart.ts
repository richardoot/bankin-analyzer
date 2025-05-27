import type { CsvAnalysisResult } from '@/types'
import { computed, type ComputedRef } from 'vue'

export interface MonthlyData {
  month: string
  year: number
  monthKey: string // Format YYYY-MM pour le tri
  expenses: number
  income: number
  net: number
  transactionCount: number
}

export interface BarChartData {
  months: MonthlyData[]
  maxValue: number
  minValue: number
  totalExpenses: number
  totalIncome: number
  totalNet: number
}

/**
 * Composable pour créer les données d'histogramme mensuel
 */
export const useBarChart = (
  analysisResult: ComputedRef<CsvAnalysisResult>,
  selectedExpenseCategories?: ComputedRef<string[]>,
  selectedIncomeCategories?: ComputedRef<string[]>
) => {
  /**
   * Parse une date au format DD/MM/YYYY ou autres formats communs
   */
  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null

    try {
      // Format DD/MM/YYYY (Bankin)
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/')
        if (parts.length === 3) {
          const [day, month, year] = parts
          if (day && month && year) {
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
          }
        }
      }

      // Format YYYY-MM-DD (ISO)
      if (dateStr.includes('-') && dateStr.length === 10) {
        return new Date(dateStr)
      }

      // Tentative de parsing générique
      return new Date(dateStr)
    } catch {
      return null
    }
  }

  /**
   * Génère les données mensuelles à partir des transactions réelles
   */
  const monthlyChartData = computed((): BarChartData => {
    const result = analysisResult.value

    if (
      !result.isValid ||
      !result.transactions ||
      result.transactions.length === 0
    ) {
      return {
        months: [],
        maxValue: 0,
        minValue: 0,
        totalExpenses: 0,
        totalIncome: 0,
        totalNet: 0,
      }
    }

    // Map pour stocker les données par mois (YYYY-MM)
    const monthlyData = new Map<string, MonthlyData>()

    // Grouper les transactions par mois
    result.transactions.forEach(transaction => {
      const date = parseDate(transaction.date)
      if (!date) return

      // Appliquer le filtrage par catégories
      if (transaction.type === 'expense' && selectedExpenseCategories?.value) {
        if (
          selectedExpenseCategories.value.length > 0 &&
          !selectedExpenseCategories.value.includes(transaction.category || '')
        ) {
          return
        }
      }

      if (transaction.type === 'income' && selectedIncomeCategories?.value) {
        if (
          selectedIncomeCategories.value.length > 0 &&
          !selectedIncomeCategories.value.includes(transaction.category || '')
        ) {
          return
        }
      }

      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

      // Initialiser le mois s'il n'existe pas
      if (!monthlyData.has(monthKey)) {
        const monthName = date.toLocaleDateString('fr-FR', {
          month: 'long',
          year: 'numeric',
        })

        monthlyData.set(monthKey, {
          month: monthName,
          year: date.getFullYear(),
          monthKey,
          expenses: 0,
          income: 0,
          net: 0,
          transactionCount: 0,
        })
      }

      const monthData = monthlyData.get(monthKey)
      if (!monthData) return

      // Ajouter la transaction aux totaux du mois
      if (transaction.type === 'expense') {
        monthData.expenses += Math.abs(transaction.amount)
      } else if (transaction.type === 'income') {
        monthData.income += transaction.amount
      }

      monthData.transactionCount++
      monthData.net = monthData.income - monthData.expenses
    })

    // Convertir en tableau et trier par date
    const months = Array.from(monthlyData.values()).sort((a, b) =>
      a.monthKey.localeCompare(b.monthKey)
    )

    if (months.length === 0) {
      return {
        months: [],
        maxValue: 0,
        minValue: 0,
        totalExpenses: 0,
        totalIncome: 0,
        totalNet: 0,
      }
    }

    // Calculer les totaux et valeurs min/max
    const totalExpenses = months.reduce((sum, m) => sum + m.expenses, 0)
    const totalIncome = months.reduce((sum, m) => sum + m.income, 0)
    const totalNet = totalIncome - totalExpenses

    const allValues = months.flatMap(m => [
      m.expenses,
      m.income,
      Math.abs(m.net),
    ])

    const maxValue = Math.max(...allValues, 1000) // Minimum 1000 pour éviter les graphiques trop petits
    const minValue = Math.min(...months.map(m => m.net), 0)

    return {
      months,
      maxValue: maxValue * 1.1, // Ajouter 10% de marge
      minValue: minValue * 1.1,
      totalExpenses,
      totalIncome,
      totalNet,
    }
  })

  /**
   * Formate un montant en euros
   */
  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  /**
   * Formate un mois pour l'affichage
   */
  const formatMonth = (monthData: MonthlyData): string => {
    return monthData.month
  }

  /**
   * Détermine la couleur d'une barre selon le type
   */
  const getBarColor = (
    type: 'expenses' | 'income' | 'net',
    value: number = 0
  ): string => {
    switch (type) {
      case 'expenses':
        return '#ef4444' // Rouge pour les dépenses
      case 'income':
        return '#10b981' // Vert pour les revenus
      case 'net':
        return value >= 0 ? '#10b981' : '#ef4444' // Vert si positif, rouge si négatif
      default:
        return '#6b7280'
    }
  }

  return {
    monthlyChartData,
    formatAmount,
    formatMonth,
    getBarColor,
  }
}
