<script setup lang="ts">
  import { useBarChart, type MonthlyData } from '@/composables/useBarChart'
  import { useMonthFilter } from '@/composables/useMonthFilter'
  import { usePieChart, type CategoryData } from '@/composables/usePieChart'
  import { useFilterPersistence } from '@/composables/useFilterPersistence'
  import type { CsvAnalysisResult, ImportSession } from '@/types'
  import { computed, ref, watch, nextTick } from 'vue'
  import BaseCard from '@/components/shared/BaseCard.vue'
  import BarChart from '../components/charts/BarChart.vue'
  import CategoryFilter from '../components/filters/CategoryFilter.vue'
  import JointAccountFilter from '../components/filters/JointAccountFilter.vue'
  import PieChart from '../components/charts/PieChart.vue'
  import ReimbursementCompensationFilter, {
    type CompensationRule,
  } from '../components/filters/ReimbursementCompensationFilter.vue'
  import TransactionsList from '../components/shared/TransactionsList.vue'

  interface Props {
    analysisResult?: CsvAnalysisResult // Ancien format pour compatibilité
    importSession?: ImportSession // Nouveau format multi-imports
  }

  const props = defineProps<Props>()

  // Computed pour auto-détecter le mode et obtenir l'analysisResult
  const currentAnalysisResult = computed(() => {
    // Priorité au nouveau format (importSession)
    if (props.importSession) {
      return props.importSession.analysisResult
    }
    // Fallback sur l'ancien format
    if (props.analysisResult) {
      return props.analysisResult
    }
    // Fallback par défaut (ne devrait pas arriver)
    return {
      isValid: false,
      transactionCount: 0,
      categoryCount: 0,
      categories: [],
      dateRange: { start: '', end: '' },
      totalAmount: 0,
      expenses: {
        totalAmount: 0,
        transactionCount: 0,
        categories: [],
        categoriesData: {},
      },
      income: {
        totalAmount: 0,
        transactionCount: 0,
        categories: [],
        categoriesData: {},
      },
      transactions: [],
    } as CsvAnalysisResult
  })

  // Computed pour détecter le mode multi-imports
  const _isMultiImportMode = computed(() => !!props.importSession)

  // Computed pour obtenir l'ID de session actuel
  const currentSessionId = computed(() => props.importSession?.id || null)

  // Utilisation du composable de persistance des filtres
  const {
    selectedExpenseCategories,
    selectedIncomeCategories,
    selectedJointAccounts,
    compensationRules,
    selectedExpenseMonth,
    selectedIncomeMonth,
    showAdvancedFilters,
    showExpenseFilter,
    showIncomeFilter,
    resetFilters,
  } = useFilterPersistence(currentSessionId)

  // Utilisation du composable pour le filtrage par mois
  const { generateAvailableMonths, parseDate } = useMonthFilter()

  // Calculer la liste des comptes uniques - avec cache
  const availableAccounts = computed(() => {
    if (
      !currentAnalysisResult.value?.isValid ||
      !currentAnalysisResult.value?.transactions?.length
    ) {
      return []
    }
    const accounts = new Set<string>()
    currentAnalysisResult.value.transactions.forEach(transaction => {
      if (transaction.account) {
        accounts.add(transaction.account)
      }
    })
    return Array.from(accounts).sort()
  })

  // Initialiser les catégories sélectionnées avec toutes les catégories disponibles (triées par ordre alphabétique)
  const initializeSelectedCategories = () => {
    if (!currentAnalysisResult.value?.isValid) {
      return
    }

    const expenseCategories = currentAnalysisResult.value.expenses?.categories
    const incomeCategories = currentAnalysisResult.value.income?.categories

    // Seulement initialiser si les catégories ne sont pas déjà sélectionnées (première fois)
    if (expenseCategories?.length && selectedExpenseCategories.value.length === 0) {
      selectedExpenseCategories.value = [...expenseCategories].sort()
    }

    if (incomeCategories?.length && selectedIncomeCategories.value.length === 0) {
      selectedIncomeCategories.value = [...incomeCategories].sort()
    }
  }

  // Watcher pour initialiser les catégories quand les données sont prêtes
  watch(
    () => currentAnalysisResult.value.isValid,
    isValid => {
      if (isValid) {
        nextTick(() => {
          initializeSelectedCategories()
        })
      }
    },
    { immediate: true }
  )

  // Categories for expenses and income filters - avec cache
  const availableExpenseCategories = computed(() => {
    if (
      !currentAnalysisResult.value?.isValid ||
      !currentAnalysisResult.value?.expenses?.categories?.length
    ) {
      return []
    }
    return [...currentAnalysisResult.value.expenses.categories].sort()
  })

  const availableIncomeCategories = computed(() => {
    if (
      !currentAnalysisResult.value?.isValid ||
      !currentAnalysisResult.value?.income?.categories?.length
    ) {
      return []
    }
    return [...currentAnalysisResult.value.income.categories].sort()
  })

  const _availableIncomeCategories = computed(() => {
    if (!currentAnalysisResult.value.isValid) return []
    const allIncomeCategories = [
      ...currentAnalysisResult.value.income.categories,
    ]

    // Si aucune règle de compensation, afficher toutes les catégories
    if (!compensationRules.value.length) {
      return allIncomeCategories.sort()
    }

    // Filtrer les catégories de revenus qui ne sont pas mises à zéro par les associations
    const hiddenCategories = new Set(
      compensationRules.value.map(rule => rule.incomeCategory)
    )

    return allIncomeCategories
      .filter(category => !hiddenCategories.has(category))
      .sort()
  })

  // Removed currentSelectedCategories - now handled separately for each type

  // Fonctions de toggle pour les filtres
  const toggleAdvancedFilters = () => {
    showAdvancedFilters.value = !showAdvancedFilters.value
  }

  const toggleExpenseFilter = () => {
    showExpenseFilter.value = !showExpenseFilter.value
  }

  const toggleIncomeFilter = () => {
    showIncomeFilter.value = !showIncomeFilter.value
  }

  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return 'Non défini'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('fr-FR')
    } catch {
      return dateStr
    }
  }

  // Utilisation du composable pour les graphiques avec filtrage
  const analysisResultComputed = computed(() => currentAnalysisResult.value)
  const selectedExpenseCategoriesComputed = computed(
    () => selectedExpenseCategories.value
  )
  const selectedIncomeCategoriesComputed = computed(
    () => selectedIncomeCategories.value
  )

  // Créer un analysisResult filtré par mois pour les dépenses - optimisé
  const expensesAnalysisResult = computed(() => {
    if (
      !currentAnalysisResult.value?.isValid ||
      !currentAnalysisResult.value?.transactions?.length
    ) {
      return currentAnalysisResult.value
    }

    if (!selectedExpenseMonth.value) {
      return currentAnalysisResult.value
    }

    // Filtrer les transactions pour le mois sélectionné (dépenses uniquement)
    const filteredTransactions =
      currentAnalysisResult.value.transactions.filter(transaction => {
        if (!transaction?.date || transaction?.type !== 'expense') return false
        const date = parseDate(transaction.date)
        if (!date || isNaN(date.getTime())) return false
        const transactionMonth = date.toISOString().substring(0, 7)
        return transactionMonth === selectedExpenseMonth.value
      })

    // Recalculer les statistiques pour les dépenses filtrées
    const expenseCategoriesData: Record<string, number> = {}
    const expenseCategories = new Set<string>()
    let totalExpenseAmount = 0

    filteredTransactions.forEach(transaction => {
      if (
        transaction?.category &&
        transaction?.type === 'expense' &&
        transaction?.amount != null
      ) {
        const amount = Math.abs(transaction.amount)
        expenseCategoriesData[transaction.category] =
          (expenseCategoriesData[transaction.category] || 0) + amount
        expenseCategories.add(transaction.category)
        totalExpenseAmount += amount
      }
    })

    const result = {
      ...currentAnalysisResult.value,
      transactions: filteredTransactions,
      expenses: {
        totalAmount: totalExpenseAmount,
        transactionCount: filteredTransactions.filter(t => t.type === 'expense')
          .length,
        categories: Array.from(expenseCategories),
        categoriesData: expenseCategoriesData,
      },
    }

    return result
  })

  // Créer un analysisResult filtré par mois pour les revenus - optimisé
  const incomeAnalysisResult = computed(() => {
    if (
      !currentAnalysisResult.value?.isValid ||
      !currentAnalysisResult.value?.transactions?.length
    ) {
      return currentAnalysisResult.value
    }

    if (!selectedIncomeMonth.value) {
      return currentAnalysisResult.value
    }

    // Filtrer les transactions pour le mois sélectionné (revenus uniquement)
    const filteredTransactions =
      currentAnalysisResult.value.transactions.filter(transaction => {
        if (!transaction?.date || transaction?.type !== 'income') return false
        const date = parseDate(transaction.date)
        if (!date || isNaN(date.getTime())) return false
        const transactionMonth = date.toISOString().substring(0, 7)
        return transactionMonth === selectedIncomeMonth.value
      })

    // Recalculer les statistiques pour les revenus filtrés
    const incomeCategoriesData: Record<string, number> = {}
    const incomeCategories = new Set<string>()
    let totalIncomeAmount = 0

    filteredTransactions.forEach(transaction => {
      if (
        transaction?.category &&
        transaction?.type === 'income' &&
        transaction?.amount != null
      ) {
        const amount = Math.abs(transaction.amount)
        incomeCategoriesData[transaction.category] =
          (incomeCategoriesData[transaction.category] || 0) + amount
        incomeCategories.add(transaction.category)
        totalIncomeAmount += amount
      }
    })

    const result = {
      ...currentAnalysisResult.value,
      transactions: filteredTransactions,
      income: {
        totalAmount: totalIncomeAmount,
        transactionCount: filteredTransactions.filter(t => t.type === 'income')
          .length,
        categories: Array.from(incomeCategories),
        categoriesData: incomeCategoriesData,
      },
    }

    return result
  })

  // Utilisation de composables séparés pour les graphiques camembert
  const {
    expensesChartData,
    formatAmount: formatChartAmount,
    formatPercentage,
  } = usePieChart(
    expensesAnalysisResult,
    selectedExpenseCategoriesComputed,
    computed(() => []), // Pas de revenus pour ce composable
    computed(() => selectedJointAccounts.value),
    computed(() => compensationRules.value)
  )

  const { incomeChartData } = usePieChart(
    incomeAnalysisResult,
    computed(() => []), // Pas de dépenses pour ce composable
    selectedIncomeCategoriesComputed,
    computed(() => selectedJointAccounts.value),
    computed(() => compensationRules.value)
  )

  // Générer les mois disponibles à partir des transactions - avec cache
  const availableMonths = computed(() => {
    if (
      !currentAnalysisResult.value?.isValid ||
      !currentAnalysisResult.value?.transactions?.length
    ) {
      return []
    }
    const months = generateAvailableMonths(
      currentAnalysisResult.value.transactions
    )
    return months
  })

  // Utilisation du composable pour l'histogramme mensuel avec filtrage
  const { monthlyChartData, formatAmount: formatBarAmount } = useBarChart(
    analysisResultComputed,
    selectedExpenseCategoriesComputed,
    selectedIncomeCategoriesComputed,
    computed(() => selectedJointAccounts.value)
  )

  // Transactions filtrées pour les sections de comparaison - avec cache
  const filteredExpenseTransactions = computed(() => {
    if (
      !currentAnalysisResult.value?.isValid ||
      !currentAnalysisResult.value?.transactions?.length
    ) {
      return []
    }
    return currentAnalysisResult.value.transactions.filter(
      transaction => transaction?.type === 'expense'
    )
  })

  const filteredIncomeTransactions = computed(() => {
    if (
      !currentAnalysisResult.value?.isValid ||
      !currentAnalysisResult.value?.transactions?.length
    ) {
      return []
    }
    return currentAnalysisResult.value.transactions.filter(
      transaction => transaction?.type === 'income'
    )
  })

  // Gestion des interactions avec le graphique
  const handleCategoryClick = (category: CategoryData) => {
    console.log('Catégorie cliquée:', category)
    // Ici on pourrait ajouter une logique pour filtrer les transactions par catégorie
  }

  const handleCategoryHover = (_category: CategoryData | null) => {
    // Ici on pourrait ajouter une logique pour mettre en surbrillance les éléments liés
  }

  // Gestionnaires pour les changements de mois dans les graphiques
  const handleExpenseMonthChange = (month: string) => {
    selectedExpenseMonth.value = month
  }

  const handleIncomeMonthChange = (month: string) => {
    selectedIncomeMonth.value = month
  }

  // Gestion des interactions avec l'histogramme
  const handleMonthClick = (month: MonthlyData, type: string) => {
    console.log('Mois cliqué:', month, type)
    // Ici on pourrait ajouter une logique pour filtrer les transactions par mois
  }

  const handleMonthHover = (
    _month: MonthlyData | null,
    _type: string | null
  ) => {
    // Ici on pourrait ajouter une logique pour mettre en surbrillance les éléments liés
  }
</script>

<template>
  <BaseCard variant="glass" padding="lg" rounded="lg" class="dashboard-manager">
    <template #header>
      <h4 class="section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="9" x2="15" y2="9" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
        Tableau de bord financier
        <span class="title-badge"> Analyse complète </span>
      </h4>
      <p class="section-description">
        Analyse détaillée de vos transactions - Vue d'ensemble des dépenses et
        revenus
      </p>
    </template>

    <div class="section-content">
      <!-- Statistiques générales -->
      <div class="overview-stats">
        <div class="stat-card total">
          <div class="stat-icon total-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
              />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
          </div>
          <div class="stat-content">
            <h3 class="stat-title">Total Transactions</h3>
            <p class="stat-value">
              {{ currentAnalysisResult.transactionCount }}
            </p>
            <p class="stat-description">transactions analysées</p>
          </div>
        </div>

        <div class="stat-card period">
          <div class="stat-icon period-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div class="stat-content">
            <h3 class="stat-title">Période d'analyse</h3>
            <p class="stat-value">
              {{ formatDate(currentAnalysisResult.dateRange.start) }}
            </p>
            <p class="stat-description">
              au {{ formatDate(currentAnalysisResult.dateRange.end) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Bouton de filtrage avancé -->
      <div class="advanced-filters-toggle">
        <button
          class="advanced-filters-btn"
          :class="{ active: showAdvancedFilters }"
          @click="toggleAdvancedFilters"
        >
          <svg
            class="filter-toggle-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
          </svg>
          Filtres avancés
          <svg
            class="chevron-icon"
            :class="{ rotated: showAdvancedFilters }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </button>
      </div>

      <!-- Panneau de filtres avancés -->
      <div v-show="showAdvancedFilters" class="advanced-filters-panel">
        <div class="filters-container">
          <!-- En-tête principal du panneau -->
          <div class="filters-main-header">
            <div class="filters-main-title">
              <div class="filters-main-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
                </svg>
              </div>
              <h3>Filtres avancés du tableau de bord</h3>
            </div>
            <p class="filters-main-description">
              Personnalisez l'affichage de vos données avec les options
              ci-dessous
            </p>
          </div>

          <!-- Grille des filtres côte à côte -->
          <div class="filters-side-by-side">
            <!-- Filtre Comptes Joints -->
            <div class="compact-filter-card">
              <div class="compact-filter-header">
                <div class="compact-filter-icon joint-accounts-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  </svg>
                </div>
                <div class="compact-filter-title">
                  <h4>Comptes joints</h4>
                  <span class="compact-filter-subtitle"
                    >Montants divisés par 2</span
                  >
                </div>
              </div>
              <div class="compact-filter-content">
                <JointAccountFilter
                  :accounts="availableAccounts"
                  :selected-accounts="selectedJointAccounts"
                  @update:selected-accounts="selectedJointAccounts = $event"
                />
              </div>
            </div>

            <!-- Filtre Compensation -->
            <div class="compact-filter-card">
              <div class="compact-filter-header">
                <div class="compact-filter-icon compensation-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M12 1v6l4-4" />
                    <path d="M12 23v-6l4 4M12 17l-4 4" />
                    <path d="M20 12h-6l4-4M14 12l4 4" />
                  </svg>
                </div>
                <div class="compact-filter-title">
                  <h4>Compensation des remboursements</h4>
                  <span class="compact-filter-subtitle"
                    >Association dépenses/remboursements</span
                  >
                </div>
              </div>
              <div class="compact-filter-content">
                <ReimbursementCompensationFilter
                  :analysis-result="currentAnalysisResult"
                  :selected-rules="compensationRules"
                  :selected-expense-categories="selectedExpenseCategories"
                  :selected-income-categories="selectedIncomeCategories"
                  @update:selected-rules="compensationRules = $event"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Analyses Dépenses et Revenus -->
      <div class="dashboard-sections">
        <!-- Section Dépenses -->
        <div class="section-container expenses-section">
          <div class="section-header">
            <h2 class="section-title">
              <svg
                class="section-icon expenses-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="M17 11l-3-3V2m0 6l-3 3m3-3h8" />
                <path d="M7 21H4a2 2 0 01-2-2v-5h20v5a2 2 0 01-2 2h-3" />
              </svg>
              Analyse des Dépenses
            </h2>
            <p class="section-description">
              Catégories de dépenses basées sur la colonne "Catégorie"
            </p>
          </div>

          <div class="section-stats">
            <div class="section-stat-card">
              <div class="section-stat-icon expenses">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div class="section-stat-content">
                <h4 class="section-stat-title">Montant total</h4>
                <p class="section-stat-value expenses-amount">
                  {{ formatAmount(expensesChartData.total) }}
                </p>
              </div>
            </div>

            <div class="section-stat-card">
              <div class="section-stat-icon transactions">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M9 12l2 2 4-4" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              </div>
              <div class="section-stat-content">
                <h4 class="section-stat-title">Transactions</h4>
                <p class="section-stat-value">
                  {{ currentAnalysisResult.expenses.transactionCount }}
                </p>
              </div>
            </div>

            <div class="section-stat-card">
              <div class="section-stat-icon categories">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" />
                </svg>
              </div>
              <div class="section-stat-content">
                <h4 class="section-stat-title">Catégories</h4>
                <p class="section-stat-value">
                  {{ currentAnalysisResult.expenses.categories.length }}
                </p>
              </div>
            </div>
          </div>

          <!-- Bouton de filtre local pour les dépenses -->
          <div class="section-filter-toggle">
            <button
              class="section-filter-btn"
              :class="{ active: showExpenseFilter }"
              @click="toggleExpenseFilter"
            >
              <svg
                class="filter-toggle-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Filtrer les catégories
              <svg
                class="chevron-icon"
                :class="{ rotated: showExpenseFilter }"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <polyline points="6,9 12,15 18,9" />
              </svg>
            </button>
          </div>

          <!-- Filtre de catégories local pour les dépenses -->
          <div v-show="showExpenseFilter" class="section-local-filter">
            <div class="local-filter-card">
              <div class="local-filter-header">
                <div class="local-filter-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </div>
                <h4>Sélection des catégories de dépenses</h4>
              </div>
              <div class="local-filter-content">
                <CategoryFilter
                  :categories="availableExpenseCategories"
                  :selected-categories="selectedExpenseCategories"
                  @update:selected-categories="
                    selectedExpenseCategories = $event
                  "
                />
              </div>
            </div>
          </div>

          <!-- Graphique camembert des dépenses -->
          <div class="chart-section">
            <PieChart
              :chart-data="expensesChartData"
              title="Répartition des dépenses"
              type="expenses"
              :format-amount="formatChartAmount"
              :format-percentage="formatPercentage"
              :available-months="availableMonths"
              :selected-month="selectedExpenseMonth"
              @category-click="handleCategoryClick"
              @category-hover="handleCategoryHover"
              @month-change="handleExpenseMonthChange"
            />
          </div>

          <!-- Histogramme des dépenses -->
          <div class="chart-section">
            <BarChart
              :chart-data="monthlyChartData"
              :available-categories="availableExpenseCategories"
              :analysis-result="currentAnalysisResult"
              title="Évolution mensuelle des dépenses"
              type="expenses"
              :format-amount="formatBarAmount"
              @month-click="handleMonthClick"
              @month-hover="handleMonthHover"
            />
          </div>

          <!-- Liste des transactions de dépenses -->
          <div class="chart-section">
            <TransactionsList
              :transactions="filteredExpenseTransactions"
              title="Transactions de dépenses"
            />
          </div>
        </div>

        <!-- Section Revenus -->
        <div class="section-container income-section">
          <div class="section-header">
            <h2 class="section-title">
              <svg
                class="section-icon income-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="M7 13l3 3 7-7" />
                <path
                  d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.35 0 4.49.91 6.08 2.4"
                />
              </svg>
              Analyse des Revenus
            </h2>
            <p class="section-description">
              Sources de revenus basées sur la colonne "Sous-Catégorie"
            </p>
          </div>

          <div class="section-stats">
            <div class="section-stat-card">
              <div class="section-stat-icon income">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div class="section-stat-content">
                <h4 class="section-stat-title">Montant total</h4>
                <p class="section-stat-value income-amount">
                  {{ formatAmount(incomeChartData.total) }}
                </p>
              </div>
            </div>

            <div class="section-stat-card">
              <div class="section-stat-icon transactions">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M9 12l2 2 4-4" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              </div>
              <div class="section-stat-content">
                <h4 class="section-stat-title">Transactions</h4>
                <p class="section-stat-value">
                  {{ currentAnalysisResult.income.transactionCount }}
                </p>
              </div>
            </div>

            <div class="section-stat-card">
              <div class="section-stat-icon categories">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" />
                </svg>
              </div>
              <div class="section-stat-content">
                <h4 class="section-stat-title">Catégories</h4>
                <p class="section-stat-value">
                  {{ currentAnalysisResult.income.categories.length }}
                </p>
              </div>
            </div>
          </div>

          <!-- Bouton de filtre local pour les revenus -->
          <div class="section-filter-toggle">
            <button
              class="section-filter-btn"
              :class="{ active: showIncomeFilter }"
              @click="toggleIncomeFilter"
            >
              <svg
                class="filter-toggle-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Filtrer les catégories
              <svg
                class="chevron-icon"
                :class="{ rotated: showIncomeFilter }"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <polyline points="6,9 12,15 18,9" />
              </svg>
            </button>
          </div>

          <!-- Filtre de catégories local pour les revenus -->
          <div v-show="showIncomeFilter" class="section-local-filter">
            <div class="local-filter-card">
              <div class="local-filter-header">
                <div class="local-filter-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </div>
                <h4>Sélection des catégories de revenus</h4>
              </div>
              <div class="local-filter-content">
                <CategoryFilter
                  :categories="availableIncomeCategories"
                  :selected-categories="selectedIncomeCategories"
                  @update:selected-categories="
                    selectedIncomeCategories = $event
                  "
                />
              </div>
            </div>
          </div>

          <!-- Graphique camembert des revenus -->
          <div class="chart-section">
            <PieChart
              :chart-data="incomeChartData"
              title="Répartition des revenus"
              type="income"
              :format-amount="formatChartAmount"
              :format-percentage="formatPercentage"
              :available-months="availableMonths"
              :selected-month="selectedIncomeMonth"
              @category-click="handleCategoryClick"
              @category-hover="handleCategoryHover"
              @month-change="handleIncomeMonthChange"
            />
          </div>

          <!-- Histogramme des revenus -->
          <div class="chart-section">
            <BarChart
              :chart-data="monthlyChartData"
              :available-categories="availableIncomeCategories"
              :analysis-result="currentAnalysisResult"
              title="Évolution mensuelle des revenus"
              type="income"
              :format-amount="formatBarAmount"
              @month-click="handleMonthClick"
              @month-hover="handleMonthHover"
            />
          </div>

          <!-- Liste des transactions de revenus -->
          <div class="chart-section">
            <TransactionsList
              :transactions="filteredIncomeTransactions"
              title="Transactions de revenus"
            />
          </div>
        </div>
      </div>

      <!-- Message informatif -->
      <div class="info-section">
        <div class="info-card">
          <div class="info-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </div>
          <div class="info-content">
            <h3 class="info-title">Analyse terminée</h3>
            <p class="info-description">
              Vos données Bankin ont été analysées selon les règles métier : les
              dépenses utilisent la colonne "Catégorie" et les revenus la
              colonne "Sous-Catégorie".
            </p>
          </div>
        </div>
      </div>
    </div>
  </BaseCard>
</template>

<style scoped>
  .dashboard-manager {
    margin-bottom: 1.5rem;
    overflow-x: hidden;
    max-width: 100vw;
    box-sizing: border-box;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    font-size: var(--text-xl);
    font-weight: var(--font-weight-bold);
    color: var(--gray-900);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    margin: 0 0 var(--spacing-6) 0;
    position: relative;
  }

  .section-title::after {
    content: '';
    position: absolute;
    bottom: -8px;
    left: 0;
    width: 60px;
    height: 3px;
    background: linear-gradient(90deg, var(--primary-500), var(--primary-600));
    border-radius: 2px;
  }

  .section-title svg {
    width: 1.25rem;
    height: 1.25rem;
    color: #3b82f6;
  }

  .title-badge {
    background: linear-gradient(135deg, var(--primary-50), var(--primary-100));
    color: var(--primary-700);
    padding: 0.375rem 0.875rem;
    border-radius: 16px;
    font-size: 0.75rem;
    font-weight: var(--font-weight-semibold);
    margin-left: auto;
    border: 1px solid var(--primary-200);
    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1);
    backdrop-filter: blur(10px);
  }

  .section-description {
    font-size: 0.875rem;
    color: var(--gray-600);
    margin: var(--spacing-3) 0 0;
    line-height: 1.5;
  }

  .section-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-6);
    overflow-x: hidden;
    max-width: 100%;
  }

  /* Statistiques générales */
  .overview-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
    margin-bottom: 1rem;
  }

  .stat-card {
    background: white;
    border-radius: 0.75rem;
    padding: 1.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    border: 1px solid #f3f4f6;
    display: flex;
    align-items: center;
    gap: 1.25rem;
    transition: all 0.3s ease;
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  }

  .stat-icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .stat-icon svg {
    width: 1.25rem;
    height: 1.25rem;
    color: white;
  }

  .total-icon {
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  }

  .period-icon {
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  }

  .stat-content {
    flex: 1;
  }

  .stat-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: #6b7280;
    margin: 0 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 0.25rem;
  }

  .stat-description {
    font-size: 0.8125rem;
    color: #9ca3af;
    margin: 0;
  }

  /* Dashboard sections - side by side layout */
  .dashboard-sections {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 2rem;
    overflow-x: hidden;
  }

  .section-container {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    min-width: 0;
    overflow-x: hidden;
  }

  .expenses-section {
    border-left: 4px solid #ef4444;
  }

  .income-section {
    border-left: 4px solid #10b981;
  }

  .combined-charts-section {
    grid-column: 1 / -1;
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    padding: 2rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
  }

  .section-header {
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .section-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    font-size: 1.5rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 0.75rem;
  }

  .section-icon {
    width: 1.5rem;
    height: 1.5rem;
  }

  .expenses-icon {
    color: #ef4444;
  }

  .income-icon {
    color: #10b981;
  }

  .section-description {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
    line-height: 1.5;
  }

  .section-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .section-stat-card {
    background: rgba(249, 250, 251, 0.6);
    backdrop-filter: blur(5px);
    border-radius: 0.75rem;
    padding: 0.75rem;
    border: 1px solid rgba(229, 231, 235, 0.3);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s ease;
    text-align: center;
    min-width: 0;
  }

  .section-stat-card:hover {
    background: rgba(243, 244, 246, 0.8);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .section-stat-icon {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .section-stat-icon svg {
    width: 1rem;
    height: 1rem;
    color: white;
  }

  .section-stat-icon.expenses {
    background: linear-gradient(135deg, #ef4444, #dc2626);
  }

  .section-stat-icon.income {
    background: linear-gradient(135deg, #10b981, #059669);
  }

  .section-stat-icon.transactions {
    background: linear-gradient(135deg, #6366f1, #4f46e5);
  }

  .section-stat-icon.categories {
    background: linear-gradient(135deg, #f59e0b, #d97706);
  }

  .section-stat-content {
    flex: 1;
    min-width: 0;
  }

  .section-stat-title {
    font-size: 0.75rem;
    font-weight: 500;
    color: #6b7280;
    margin: 0 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .section-stat-value {
    font-size: 1.125rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }

  .expenses-amount {
    color: #ef4444;
  }

  .income-amount {
    color: #10b981;
  }

  /* Section graphique */
  .chart-section {
    margin: 1.5rem 0;
    display: flex;
    justify-content: center;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: hidden;
  }

  /* Bouton de filtres avancés */
  .advanced-filters-toggle {
    margin-bottom: 1rem;
  }

  .advanced-filters-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: #ffffff;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .advanced-filters-btn:hover {
    background: #f9fafb;
    border-color: #9ca3af;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .advanced-filters-btn.active {
    background: #eff6ff;
    border-color: #3b82f6;
    color: #1e40af;
  }

  .filter-toggle-icon {
    width: 1rem;
    height: 1rem;
  }

  .chevron-icon {
    width: 1rem;
    height: 1rem;
    transition: transform 0.2s ease;
  }

  .chevron-icon.rotated {
    transform: rotate(180deg);
  }

  /* Panneau de filtres avancés */
  .advanced-filters-panel {
    margin-bottom: 1.5rem;
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .filters-container {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(229, 231, 235, 0.3);
    border-radius: 0.75rem;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  /* En-tête principal du panneau */
  .filters-main-header {
    margin-bottom: 1.5rem;
    text-align: center;
    border-bottom: 1px solid rgba(229, 231, 235, 0.3);
    padding-bottom: 1rem;
  }

  .filters-main-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .filters-main-icon {
    width: 2rem;
    height: 2rem;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .filters-main-icon svg {
    width: 1rem;
    height: 1rem;
    color: white;
  }

  .filters-main-title h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  .filters-main-description {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
  }

  /* Grille des filtres côte à côte */
  .filters-side-by-side {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .compact-filter-card {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(229, 231, 235, 0.3);
    border-radius: 0.75rem;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
  }

  .compact-filter-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }


  .compact-filter-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.25rem 0.75rem;
    background: linear-gradient(
      135deg,
      rgba(248, 250, 252, 0.8) 0%,
      rgba(255, 255, 255, 0.9) 100%
    );
    backdrop-filter: blur(5px);
    border-bottom: 1px solid rgba(241, 245, 249, 0.3);
  }

  .compact-filter-icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .compact-filter-icon svg {
    width: 1.25rem;
    height: 1.25rem;
    color: white;
  }

  /* Icônes spécifiques par type de filtre */
  .categories-icon {
    background: linear-gradient(135deg, #10b981, #059669);
  }

  .joint-accounts-icon {
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  }

  .compensation-icon {
    background: linear-gradient(135deg, #f59e0b, #d97706);
  }

  .compact-filter-title h4 {
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 0.125rem;
  }

  .compact-filter-subtitle {
    font-size: 0.75rem;
    color: #6b7280;
  }

  .compact-filter-content {
    padding: 0;
    height: 100%;
  }

  /* Boutons de filtres locaux */
  .section-filter-toggle {
    margin-bottom: 1rem;
  }

  .section-filter-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.8);
    border: 1px solid rgba(229, 231, 235, 0.5);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    width: 100%;
    backdrop-filter: blur(5px);
  }

  .section-filter-btn:hover {
    background: rgba(249, 250, 251, 0.9);
    border-color: rgba(156, 163, 175, 0.5);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .section-filter-btn.active {
    background: rgba(239, 246, 255, 0.9);
    border-color: rgba(59, 130, 246, 0.5);
    color: #1e40af;
  }

  .section-filter-btn .filter-toggle-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .section-filter-btn .chevron-icon {
    width: 1rem;
    height: 1rem;
    transition: transform 0.2s ease;
    margin-left: auto;
    flex-shrink: 0;
  }

  .section-filter-btn .chevron-icon.rotated {
    transform: rotate(180deg);
  }

  /* Filtres locaux des sections */
  .section-local-filter {
    margin-bottom: 1.5rem;
    animation: slideDown 0.3s ease-out;
  }

  .local-filter-card {
    background: rgba(248, 250, 252, 0.8);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(229, 231, 235, 0.4);
    border-radius: 0.75rem;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
  }

  .local-filter-card:hover {
    background: rgba(243, 244, 246, 0.9);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }

  .local-filter-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    background: linear-gradient(
      135deg,
      rgba(243, 244, 246, 0.8) 0%,
      rgba(249, 250, 251, 0.9) 100%
    );
    backdrop-filter: blur(5px);
    border-bottom: 1px solid rgba(229, 231, 235, 0.3);
  }

  .local-filter-icon {
    width: 2rem;
    height: 2rem;
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .local-filter-icon svg {
    width: 1rem;
    height: 1rem;
    color: white;
  }

  .local-filter-header h4 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    margin: 0;
  }

  .local-filter-content {
    padding: 0;
  }

  /* Section info */
  .info-section {
    margin-top: 1rem;
  }

  .info-card {
    background: linear-gradient(135deg, #dbeafe, #bfdbfe);
    border-radius: 1rem;
    padding: 2rem;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    border: 1px solid #93c5fd;
  }

  .info-icon {
    width: 3rem;
    height: 3rem;
    background: #3b82f6;
    border-radius: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .info-icon svg {
    width: 1.5rem;
    height: 1.5rem;
    color: white;
  }

  .info-content {
    flex: 1;
  }

  .info-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: #1e40af;
    margin: 0 0 0.5rem;
  }

  .info-description {
    font-size: 0.875rem;
    color: #1e40af;
    margin: 0;
    line-height: 1.5;
  }

  /* Responsive */
  @media (max-width: 1400px) {
    .dashboard-sections {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }
  }

  @media (max-width: 1200px) {
    .filters-side-by-side {
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }
  }

  @media (max-width: 768px) {
    .dashboard-manager {
      border-radius: 0.5rem;
      margin: 0.5rem;
    }

    .section-content {
      gap: var(--spacing-4);
    }

    .overview-stats {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .section-stats {
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 0.75rem;
    }

    .section-filter-btn {
      padding: 0.75rem;
      font-size: 0.8125rem;
    }

    .local-filter-header {
      flex-direction: column;
      text-align: center;
      gap: 0.5rem;
      padding: 1rem;
    }

    .local-filter-header h4 {
      font-size: 0.8125rem;
    }

    .chart-section {
      margin: 1.5rem 0;
    }

    .section-container,
    .combined-charts-section {
      padding: 1.5rem;
    }

    .section-title {
      font-size: 1.25rem;
      flex-direction: column;
      gap: 0.5rem;
    }

    .section-icon {
      width: 1.25rem;
      height: 1.25rem;
    }
  }

  @media (max-width: 480px) {
    .dashboard-manager {
      margin: 0.25rem;
      border-radius: 0.375rem;
    }

    .section-container,
    .combined-charts-section {
      padding: 1rem;
    }

    .section-stats {
      grid-template-columns: 1fr;
    }

    .section-filter-btn {
      padding: 0.625rem;
      font-size: 0.75rem;
      gap: 0.375rem;
    }

    .section-filter-btn .filter-toggle-icon,
    .section-filter-btn .chevron-icon {
      width: 0.875rem;
      height: 0.875rem;
    }

    .local-filter-header {
      padding: 0.75rem;
    }

    .local-filter-icon {
      width: 1.5rem;
      height: 1.5rem;
    }

    .local-filter-icon svg {
      width: 0.875rem;
      height: 0.875rem;
    }

    .stat-card {
      flex-direction: column;
      text-align: center;
      gap: 1rem;
      padding: 1.25rem;
    }
  }

  /* Thème sombre */
  @media (prefers-color-scheme: dark) {
    .dashboard-sections .section-container,
    .dashboard-sections .combined-charts-section {
      background: rgba(30, 41, 59, 0.8);
      border-color: rgba(71, 85, 105, 0.3);
    }

    .section-title {
      color: #e2e8f0;
    }

    .section-description {
      color: #94a3b8;
    }

    .section-stat-card {
      background: rgba(51, 65, 85, 0.9);
      border-color: rgba(71, 85, 105, 0.3);
    }

    .local-filter-card {
      background: rgba(30, 41, 59, 0.8);
      border-color: rgba(71, 85, 105, 0.3);
    }

    .local-filter-header {
      background: linear-gradient(
        135deg,
        rgba(51, 65, 85, 0.8) 0%,
        rgba(30, 41, 59, 0.9) 100%
      );
      border-bottom-color: rgba(71, 85, 105, 0.3);
    }

    .local-filter-header h4 {
      color: #e2e8f0;
    }

    .section-filter-btn {
      background: rgba(30, 41, 59, 0.8);
      border-color: rgba(71, 85, 105, 0.5);
      color: #e2e8f0;
    }

    .section-filter-btn:hover {
      background: rgba(51, 65, 85, 0.9);
      border-color: rgba(100, 116, 139, 0.5);
    }

    .section-filter-btn.active {
      background: rgba(30, 58, 138, 0.3);
      border-color: rgba(59, 130, 246, 0.5);
      color: #93c5fd;
    }

    .section-stat-title {
      color: #94a3b8;
    }

    .section-stat-value {
      color: #e2e8f0;
    }
  }
</style>
