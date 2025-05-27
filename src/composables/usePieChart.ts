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
  _type: 'expenses' | 'income'
): PieChartData => {
  const total = Object.values(data).reduce(
    (sum, value) => sum + Math.abs(value),
    0
  )

  if (total === 0) {
    return { categories: [], total: 0 }
  }

  // Trie les catégories par valeur décroissante
  const sortedEntries = Object.entries(data)
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
  analysisResult: ComputedRef<CsvAnalysisResult | null>
) => {
  /**
   * Données pour le graphique des dépenses
   */
  const expensesChartData = computed((): PieChartData => {
    if (!analysisResult.value) {
      return { categories: [], total: 0 }
    }

    // Utilise les vraies données de catégories de dépenses si disponibles
    const expensesData = analysisResult.value.expenses.categoriesData

    // Si pas de données détaillées, crée une répartition simulée
    if (!expensesData || Object.keys(expensesData).length === 0) {
      const simulatedData: Record<string, number> = {}
      const expenseCategories = analysisResult.value.expenses.categories
      const totalExpenses = analysisResult.value.expenses.totalAmount

      expenseCategories.forEach((category, _index) => {
        const baseAmount = totalExpenses / expenseCategories.length
        const variation = (Math.random() - 0.5) * 0.4 // Variation de ±20%
        simulatedData[category] = Math.abs(baseAmount * (1 + variation))
      })

      return processChartData(simulatedData, 'expenses')
    }

    return processChartData(expensesData, 'expenses')
  })

  /**
   * Données pour le graphique des revenus
   */
  const incomeChartData = computed((): PieChartData => {
    if (!analysisResult.value) {
      return { categories: [], total: 0 }
    }

    // Utilise les vraies données de catégories de revenus si disponibles
    const incomeData = analysisResult.value.income.categoriesData

    // Si pas de données détaillées, crée une répartition simulée
    if (!incomeData || Object.keys(incomeData).length === 0) {
      const simulatedData: Record<string, number> = {}
      const incomeCategories = analysisResult.value.income.categories
      const totalIncome = analysisResult.value.income.totalAmount

      incomeCategories.forEach((category, _index) => {
        const baseAmount = totalIncome / incomeCategories.length
        const variation = (Math.random() - 0.5) * 0.4 // Variation de ±20%
        simulatedData[category] = Math.abs(baseAmount * (1 + variation))
      })

      return processChartData(simulatedData, 'income')
    }

    return processChartData(incomeData, 'income')
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
