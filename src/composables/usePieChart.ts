/**
 * Composable pour la gestion du graphique camembert
 * Fournit les fonctions utilitaires pour les données et couleurs du graphique
 */

import type { CsvAnalysisResult } from '@/types'
import { computed, type ComputedRef } from 'vue'

export interface CategoryData {
  name: string
  value: number
  percentage: number
  color: string
}

export interface PieChartData {
  categories: CategoryData[]
  total: number
}

/**
 * Palette de couleurs élégantes pour les graphiques financiers
 * Inspirée des designs premium avec des tons sobres et professionnels
 */
const CHART_COLORS = [
  '#3B82F6', // Bleu principal
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#A855F7', // Pourpre
  '#EC4899', // Rose
  '#F43F5E', // Rose-rouge
  '#EF4444', // Rouge
  '#F97316', // Orange
  '#F59E0B', // Ambre
  '#EAB308', // Jaune
  '#84CC16', // Lime
  '#22C55E', // Vert
  '#10B981', // Emeraude
  '#06B6D4', // Cyan
  '#0EA5E9', // Bleu ciel
  '#6B7280', // Gris
  '#8B8B8B', // Gris moyen
  '#A1A1A1', // Gris clair
] as const

/**
 * Génère des couleurs dégradées si on a plus de catégories que de couleurs de base
 */
const generateColor = (index: number): string => {
  if (index < CHART_COLORS.length) {
    return CHART_COLORS[index] as string
  }

  // Génère une couleur basée sur l'index pour les catégories supplémentaires
  const hue = (index * 137.508) % 360 // Nombre d'or pour une répartition uniforme
  const saturation = 70 + (index % 3) * 10 // Variation de saturation
  const lightness = 50 + (index % 4) * 5 // Variation de luminosité

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

/**
 * Traite les données d'analyse pour créer les données du graphique camembert
 */
const processChartData = (
  data: Record<string, number>,
  _type: 'expenses' | 'income',
  selectedCategories?: string[]
): PieChartData => {
  // Filtre les données selon les catégories sélectionnées
  const filteredData =
    selectedCategories && selectedCategories.length > 0
      ? Object.fromEntries(
          Object.entries(data).filter(([name]) =>
            selectedCategories.includes(name)
          )
        )
      : data

  const total = Object.values(filteredData).reduce(
    (sum, value) => sum + Math.abs(value),
    0
  )

  if (total === 0) {
    return { categories: [], total: 0 }
  }

  // Trie les catégories par valeur décroissante
  const sortedEntries = Object.entries(filteredData)
    .map(([name, value]) => ({ name, value: Math.abs(value) }))
    .filter(({ value }) => value > 0)
    .sort((a, b) => b.value - a.value)

  const categories: CategoryData[] = sortedEntries.map(
    ({ name, value }, index) => ({
      name,
      value,
      percentage: (value / total) * 100,
      color: generateColor(index),
    })
  )

  return { categories, total }
}

/**
 * Hook principal pour utiliser le graphique camembert
 */
export const usePieChart = (
  analysisResult: ComputedRef<CsvAnalysisResult | null>,
  selectedExpenseCategories?: ComputedRef<string[]>,
  selectedIncomeCategories?: ComputedRef<string[]>,
  jointAccounts?: ComputedRef<string[]>,
  compensationRules?: ComputedRef<
    Array<{
      expenseCategory: string
      incomeCategory: string
      affectedAmount: number
    }>
  >
) => {
  /**
   * Applique la logique des comptes joints aux données de catégories
   */
  const applyJointAccountLogic = (
    categoriesData: Record<string, number>,
    type: 'expenses' | 'income'
  ): Record<string, number> => {
    if (!jointAccounts?.value?.length || !analysisResult.value?.transactions) {
      return categoriesData
    }

    const result: Record<string, number> = {}

    // Convertir le type pour correspondre aux types de transaction
    const transactionType = type === 'expenses' ? 'expense' : 'income'

    // Recalculer les montants en tenant compte des comptes joints
    for (const [category, originalAmount] of Object.entries(categoriesData)) {
      let adjustedAmount = 0

      // Parcourir les transactions pour cette catégorie
      const categoryTransactions = analysisResult.value.transactions.filter(
        t => t.category === category && t.type === transactionType
      )

      if (categoryTransactions.length === 0) {
        // Si aucune transaction trouvée, utiliser le montant original
        adjustedAmount = originalAmount
      } else {
        // Recalculer en fonction des comptes joints
        for (const transaction of categoryTransactions) {
          const isJointAccount = jointAccounts.value.includes(
            transaction.account
          )
          const amount = Math.abs(transaction.amount)
          adjustedAmount += isJointAccount ? amount / 2 : amount
        }
      }

      result[category] = adjustedAmount
    }

    return result
  }

  /**
   * Applique les règles de compensation aux données de catégories
   */
  const applyCompensationRules = (
    expensesData: Record<string, number>,
    incomeData: Record<string, number>
  ): {
    adjustedExpenses: Record<string, number>
    adjustedIncome: Record<string, number>
  } => {
    // Toujours créer de nouvelles références pour assurer la réactivité
    if (!compensationRules?.value?.length) {
      return {
        adjustedExpenses: { ...expensesData },
        adjustedIncome: { ...incomeData },
      }
    }

    // Important: créer des copies profondes pour ne pas modifier les données originales
    const adjustedExpenses = { ...expensesData }
    const adjustedIncome = { ...incomeData }

    // Optimisation: traitement batch des règles sans logs pour améliorer les performances
    compensationRules.value.forEach(rule => {
      const { expenseCategory, incomeCategory, affectedAmount } = rule

      // Déduire le montant de remboursement de la catégorie de dépense
      if (adjustedExpenses[expenseCategory] !== undefined) {
        adjustedExpenses[expenseCategory] = Math.max(
          0,
          adjustedExpenses[expenseCategory] - affectedAmount
        )
      }

      // Masquer la catégorie de remboursement (mettre à 0)
      if (adjustedIncome[incomeCategory] !== undefined) {
        adjustedIncome[incomeCategory] = 0
      }
    })

    // Retourner des nouveaux objets explicitement pour forcer la réactivité Vue
    return {
      adjustedExpenses: { ...adjustedExpenses },
      adjustedIncome: { ...adjustedIncome },
    }
  }
  // Cache pour éviter les recalculs inutiles
  const baseExpensesDataCache = computed(() => {
    if (!analysisResult.value) return {}

    let expensesData = analysisResult.value.expenses.categoriesData

    // Si pas de données détaillées, utilise une répartition simulée mise en cache
    if (!expensesData || Object.keys(expensesData).length === 0) {
      const simulatedData: Record<string, number> = {}
      const expenseCategories = analysisResult.value.expenses.categories
      const totalExpenses = analysisResult.value.expenses.totalAmount

      expenseCategories.forEach((category, index) => {
        const baseAmount = totalExpenses / expenseCategories.length
        // Utiliser l'index pour une simulation déterministe (pas de Math.random())
        const variation =
          (index % 2 === 0 ? 0.1 : -0.1) * ((index % 3) + 1) * 0.1
        simulatedData[category] = Math.abs(baseAmount * (1 + variation))
      })

      expensesData = simulatedData
    }

    return applyJointAccountLogic(expensesData, 'expenses')
  })

  const baseIncomeDataCache = computed(() => {
    if (!analysisResult.value) return {}

    let incomeData = analysisResult.value.income.categoriesData

    // Si pas de données détaillées, utilise une répartition simulée mise en cache
    if (!incomeData || Object.keys(incomeData).length === 0) {
      const simulatedData: Record<string, number> = {}
      const incomeCategories = analysisResult.value.income.categories
      const totalIncome = analysisResult.value.income.totalAmount

      incomeCategories.forEach((category, index) => {
        const baseAmount = totalIncome / incomeCategories.length
        // Utiliser l'index pour une simulation déterministe
        const variation =
          (index % 2 === 0 ? 0.15 : -0.05) * ((index % 4) + 1) * 0.1
        simulatedData[category] = Math.abs(baseAmount * (1 + variation))
      })

      incomeData = simulatedData
    }

    return applyJointAccountLogic(incomeData, 'income')
  })

  /**
   * Données pour le graphique des dépenses - optimisé avec cache
   */
  const expensesChartData = computed((): PieChartData => {
    const baseData = baseExpensesDataCache.value
    if (Object.keys(baseData).length === 0) {
      return { categories: [], total: 0 }
    }

    // Appliquer les règles de compensation si disponibles
    let adjustedData = baseData
    if (compensationRules?.value?.length) {
      const incomeData = baseIncomeDataCache.value
      const { adjustedExpenses } = applyCompensationRules(baseData, incomeData)
      adjustedData = adjustedExpenses
    }

    return processChartData(
      adjustedData,
      'expenses',
      selectedExpenseCategories?.value
    )
  })

  /**
   * Données pour le graphique des revenus - optimisé avec cache
   */
  const incomeChartData = computed((): PieChartData => {
    const baseData = baseIncomeDataCache.value
    if (Object.keys(baseData).length === 0) {
      return { categories: [], total: 0 }
    }

    // Appliquer les règles de compensation si disponibles (masquer les catégories de remboursement)
    let adjustedData = baseData
    if (compensationRules?.value?.length) {
      const expenseData = baseExpensesDataCache.value
      const { adjustedIncome } = applyCompensationRules(expenseData, baseData)
      adjustedData = adjustedIncome
    }

    return processChartData(
      adjustedData,
      'income',
      selectedIncomeCategories?.value
    )
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
   * Formate un pourcentage
   */
  const formatPercentage = (percentage: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(percentage / 100)
  }

  return {
    expensesChartData,
    incomeChartData,
    formatAmount,
    formatPercentage,
  }
}
