<script setup lang="ts">
  import { useBarChart, type MonthlyData } from '@/composables/useBarChart'
  import { useMonthFilter } from '@/composables/useMonthFilter'
  import { usePieChart, type CategoryData } from '@/composables/usePieChart'
  import type { CsvAnalysisResult } from '@/types'
  import { computed, ref } from 'vue'
  import BarChart from './BarChart.vue'
  import CategoryFilter from './CategoryFilter.vue'
  import JointAccountFilter from './JointAccountFilter.vue'
  import PieChart from './PieChart.vue'
  import ReimbursementCompensationFilter, {
    type CompensationRule,
  } from './ReimbursementCompensationFilter.vue'
  import TransactionsList from './TransactionsList.vue'

  interface Props {
    analysisResult: CsvAnalysisResult
  }

  const props = defineProps<Props>()

  // État pour gérer l'onglet actif
  const activeTab = ref<'expenses' | 'income'>('expenses')

  // État pour contrôler la visibilité du panneau de filtrage
  const showAdvancedFilters = ref(false)

  // États pour les filtres de catégories
  const selectedExpenseCategories = ref<string[]>([])
  const selectedIncomeCategories = ref<string[]>([])

  // États pour les comptes joints
  const selectedJointAccounts = ref<string[]>([])

  // États pour les règles de compensation des remboursements
  const compensationRules = ref<CompensationRule[]>([])

  // États pour les filtres par mois des graphiques
  const selectedExpenseMonth = ref<string>('')
  const selectedIncomeMonth = ref<string>('')

  // Utilisation du composable pour le filtrage par mois
  const { generateAvailableMonths, parseDate } = useMonthFilter()

  // Calculer la liste des comptes uniques
  const availableAccounts = computed(() => {
    if (!props.analysisResult.isValid) return []
    const accounts = new Set<string>()
    props.analysisResult.transactions.forEach(transaction => {
      if (transaction.account) {
        accounts.add(transaction.account)
      }
    })
    return Array.from(accounts).sort()
  })

  // Initialiser les catégories sélectionnées avec toutes les catégories disponibles (triées par ordre alphabétique)
  const initializeSelectedCategories = () => {
    if (props.analysisResult.isValid) {
      selectedExpenseCategories.value = [
        ...props.analysisResult.expenses.categories.slice().sort(),
      ]
      selectedIncomeCategories.value = [
        ...props.analysisResult.income.categories.slice().sort(),
      ]
    }
  }

  // Initialiser au montage
  initializeSelectedCategories()

  // Catégories disponibles selon l'onglet actif (triées par ordre alphabétique)
  const availableCategories = computed(() => {
    if (!props.analysisResult.isValid) return []

    if (activeTab.value === 'expenses') {
      // Pour les dépenses : garder toutes les catégories visibles
      return [...props.analysisResult.expenses.categories].sort()
    } else {
      // Pour les revenus : filtrer les catégories à valeur nulle après compensation
      const allIncomeCategories = [...props.analysisResult.income.categories]

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
    }
  })

  // Catégories sélectionnées selon l'onglet actif
  const currentSelectedCategories = computed({
    get: () =>
      activeTab.value === 'expenses'
        ? selectedExpenseCategories.value
        : selectedIncomeCategories.value,
    set: value => {
      if (activeTab.value === 'expenses') {
        selectedExpenseCategories.value = value
      } else {
        selectedIncomeCategories.value = value
      }
    },
  })

  const setActiveTab = (tab: 'expenses' | 'income') => {
    activeTab.value = tab
  }

  const toggleAdvancedFilters = () => {
    showAdvancedFilters.value = !showAdvancedFilters.value
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
  const analysisResultComputed = computed(() => props.analysisResult)
  const selectedExpenseCategoriesComputed = computed(
    () => selectedExpenseCategories.value
  )
  const selectedIncomeCategoriesComputed = computed(
    () => selectedIncomeCategories.value
  )

  // Créer un analysisResult filtré par mois pour les dépenses
  const expensesAnalysisResult = computed(() => {
    console.log(
      '🔍 expensesAnalysisResult - Mois sélectionné:',
      selectedExpenseMonth.value
    )

    if (!props.analysisResult.isValid) return props.analysisResult

    if (!selectedExpenseMonth.value) {
      console.log(
        '🔍 expensesAnalysisResult - Pas de mois sélectionné, retour de toutes les données'
      )
      return props.analysisResult
    }

    // Filtrer les transactions pour le mois sélectionné (dépenses uniquement)
    const filteredTransactions = props.analysisResult.transactions.filter(
      transaction => {
        if (!transaction.date || transaction.type !== 'expense') return false
        const date = parseDate(transaction.date)
        if (isNaN(date.getTime())) return false
        const transactionMonth = date.toISOString().substring(0, 7)
        return transactionMonth === selectedExpenseMonth.value
      }
    )

    console.log(
      '🔍 expensesAnalysisResult - Transactions filtrées:',
      filteredTransactions.length,
      'sur',
      props.analysisResult.transactions.filter(t => t.type === 'expense')
        .length,
      'dépenses totales'
    )

    // Recalculer les statistiques pour les dépenses filtrées
    const expenseCategoriesData: Record<string, number> = {}
    const expenseCategories = new Set<string>()
    let totalExpenseAmount = 0

    filteredTransactions.forEach(transaction => {
      if (transaction.category && transaction.type === 'expense') {
        const amount = Math.abs(transaction.amount)
        expenseCategoriesData[transaction.category] =
          (expenseCategoriesData[transaction.category] || 0) + amount
        expenseCategories.add(transaction.category)
        totalExpenseAmount += amount
      }
    })

    console.log(
      '🔍 expensesAnalysisResult - Catégories calculées:',
      expenseCategoriesData
    )

    const result = {
      ...props.analysisResult,
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

  // Créer un analysisResult filtré par mois pour les revenus
  const incomeAnalysisResult = computed(() => {
    console.log(
      '🔍 incomeAnalysisResult - Mois sélectionné:',
      selectedIncomeMonth.value
    )

    if (!props.analysisResult.isValid) return props.analysisResult

    if (!selectedIncomeMonth.value) {
      console.log(
        '🔍 incomeAnalysisResult - Pas de mois sélectionné, retour de toutes les données'
      )
      return props.analysisResult
    }

    // Filtrer les transactions pour le mois sélectionné (revenus uniquement)
    const filteredTransactions = props.analysisResult.transactions.filter(
      transaction => {
        if (!transaction.date || transaction.type !== 'income') return false
        const date = parseDate(transaction.date)
        if (isNaN(date.getTime())) return false
        const transactionMonth = date.toISOString().substring(0, 7)
        return transactionMonth === selectedIncomeMonth.value
      }
    )

    console.log(
      '🔍 incomeAnalysisResult - Transactions filtrées:',
      filteredTransactions.length,
      'sur',
      props.analysisResult.transactions.filter(t => t.type === 'income').length,
      'revenus totaux'
    )

    // Recalculer les statistiques pour les revenus filtrés
    const incomeCategoriesData: Record<string, number> = {}
    const incomeCategories = new Set<string>()
    let totalIncomeAmount = 0

    filteredTransactions.forEach(transaction => {
      if (transaction.category && transaction.type === 'income') {
        const amount = Math.abs(transaction.amount)
        incomeCategoriesData[transaction.category] =
          (incomeCategoriesData[transaction.category] || 0) + amount
        incomeCategories.add(transaction.category)
        totalIncomeAmount += amount
      }
    })

    console.log(
      '🔍 incomeAnalysisResult - Catégories calculées:',
      incomeCategoriesData
    )

    const result = {
      ...props.analysisResult,
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

  // Générer les mois disponibles à partir des transactions
  const availableMonths = computed(() => {
    if (!props.analysisResult.isValid) return []
    const months = generateAvailableMonths(props.analysisResult.transactions)
    console.log('📅 DashboardPage - Mois disponibles générés:', months)
    console.log(
      '📅 DashboardPage - Nombre de transactions total:',
      props.analysisResult.transactions.length
    )

    // Log quelques transactions pour debug
    if (props.analysisResult.transactions.length > 0) {
      console.log(
        '📅 DashboardPage - Première transaction:',
        props.analysisResult.transactions[0]
      )
      console.log(
        '📅 DashboardPage - Dernière transaction:',
        props.analysisResult.transactions[
          props.analysisResult.transactions.length - 1
        ]
      )
    }

    return months
  })

  // Utilisation du composable pour l'histogramme mensuel avec filtrage
  const { monthlyChartData, formatAmount: formatBarAmount } = useBarChart(
    analysisResultComputed,
    selectedExpenseCategoriesComputed,
    selectedIncomeCategoriesComputed,
    computed(() => selectedJointAccounts.value)
  )

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
  <div class="dashboard-manager">
    <!-- En-tête avec titre -->
    <div class="manager-header">
      <div class="header-content">
        <h2 class="manager-title">
          <svg
            class="title-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="9" x2="15" y2="9" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          Tableau de bord financier
        </h2>
        <p class="manager-description">
          Analyse détaillée de vos transactions - Dépenses et Revenus séparés
        </p>
      </div>
    </div>

    <!-- Contenu principal avec composants modulaires -->
    <div class="manager-content">
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
            <p class="stat-value">{{ analysisResult.transactionCount }}</p>
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
              {{ formatDate(analysisResult.dateRange.start) }}
            </p>
            <p class="stat-description">
              au {{ formatDate(analysisResult.dateRange.end) }}
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

          <!-- Grille compacte des filtres -->
          <div class="filters-compact-grid">
            <!-- Filtre Catégories -->
            <div class="compact-filter-card">
              <div class="compact-filter-header">
                <div class="compact-filter-icon categories-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </div>
                <div class="compact-filter-title">
                  <h4>Catégories</h4>
                  <span class="compact-filter-subtitle"
                    >Filtrer par catégorie</span
                  >
                </div>
              </div>
              <div class="compact-filter-content">
                <CategoryFilter
                  :categories="availableCategories"
                  :selected-categories="currentSelectedCategories"
                  @update:selected-categories="
                    currentSelectedCategories = $event
                  "
                />
              </div>
            </div>

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
            <div class="compact-filter-card full-width">
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
                  :analysis-result="analysisResult"
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

      <!-- Système d'onglets Dépenses/Revenus -->
      <div class="tabs-container">
        <!-- Navigation des onglets -->
        <div class="tabs-navigation">
          <button
            class="tab-button"
            :class="{ active: activeTab === 'expenses' }"
            @click="setActiveTab('expenses')"
          >
            <svg
              class="tab-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path d="M17 11l-3-3V2m0 6l-3 3m3-3h8" />
              <path d="M7 21H4a2 2 0 01-2-2v-5h20v5a2 2 0 01-2 2h-3" />
            </svg>
            Dépenses
            <span class="tab-badge expenses-badge">
              {{ analysisResult.expenses.transactionCount }}
            </span>
          </button>

          <button
            class="tab-button"
            :class="{ active: activeTab === 'income' }"
            @click="setActiveTab('income')"
          >
            <svg
              class="tab-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path d="M7 13l3 3 7-7" />
              <path
                d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.35 0 4.49.91 6.08 2.4"
              />
            </svg>
            Revenus
            <span class="tab-badge income-badge">
              {{ analysisResult.income.transactionCount }}
            </span>
          </button>
        </div>

        <!-- Contenu des onglets -->
        <div class="tab-content">
          <!-- Onglet Dépenses -->
          <div
            v-show="activeTab === 'expenses'"
            class="tab-panel expenses-panel"
          >
            <div class="panel-header">
              <h2 class="panel-title">
                <svg
                  class="panel-icon expenses-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path d="M17 11l-3-3V2m0 6l-3 3m3-3h8" />
                  <path d="M7 21H4a2 2 0 01-2-2v-5h20v5a2 2 0 01-2 2h-3" />
                </svg>
                Analyse des Dépenses
              </h2>
              <p class="panel-description">
                Catégories de dépenses basées sur la colonne "Catégorie"
              </p>
            </div>

            <div class="panel-stats">
              <div class="panel-stat-card">
                <div class="panel-stat-icon expenses">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path
                      d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
                    />
                  </svg>
                </div>
                <div class="panel-stat-content">
                  <h4 class="panel-stat-title">Montant total</h4>
                  <p class="panel-stat-value expenses-amount">
                    {{ formatAmount(expensesChartData.total) }}
                  </p>
                </div>
              </div>

              <div class="panel-stat-card">
                <div class="panel-stat-icon transactions">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M9 12l2 2 4-4" />
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                </div>
                <div class="panel-stat-content">
                  <h4 class="panel-stat-title">Transactions</h4>
                  <p class="panel-stat-value">
                    {{ analysisResult.expenses.transactionCount }}
                  </p>
                </div>
              </div>

              <div class="panel-stat-card">
                <div class="panel-stat-icon categories">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" />
                  </svg>
                </div>
                <div class="panel-stat-content">
                  <h4 class="panel-stat-title">Catégories</h4>
                  <p class="panel-stat-value">
                    {{ analysisResult.expenses.categories.length }}
                  </p>
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

            <!-- Histogramme mensuel des dépenses -->
            <div class="chart-section">
              <BarChart
                :chart-data="monthlyChartData"
                :available-categories="availableCategories"
                :analysis-result="analysisResult"
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
                :transactions="analysisResult.transactions"
                active-tab="expenses"
              />
            </div>
          </div>

          <!-- Onglet Revenus -->
          <div v-show="activeTab === 'income'" class="tab-panel income-panel">
            <div class="panel-header">
              <h2 class="panel-title">
                <svg
                  class="panel-icon income-icon"
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
              <p class="panel-description">
                Sources de revenus basées sur la colonne "Sous-Catégorie"
              </p>
            </div>

            <div class="panel-stats">
              <div class="panel-stat-card">
                <div class="panel-stat-icon income">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path
                      d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
                    />
                  </svg>
                </div>
                <div class="panel-stat-content">
                  <h4 class="panel-stat-title">Montant total</h4>
                  <p class="panel-stat-value income-amount">
                    {{ formatAmount(incomeChartData.total) }}
                  </p>
                </div>
              </div>

              <div class="panel-stat-card">
                <div class="panel-stat-icon transactions">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M9 12l2 2 4-4" />
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                </div>
                <div class="panel-stat-content">
                  <h4 class="panel-stat-title">Transactions</h4>
                  <p class="panel-stat-value">
                    {{ analysisResult.income.transactionCount }}
                  </p>
                </div>
              </div>

              <div class="panel-stat-card">
                <div class="panel-stat-icon categories">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" />
                  </svg>
                </div>
                <div class="panel-stat-content">
                  <h4 class="panel-stat-title">Catégories</h4>
                  <p class="panel-stat-value">
                    {{ analysisResult.income.categories.length }}
                  </p>
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

            <!-- Histogramme mensuel des revenus -->
            <div class="chart-section">
              <BarChart
                :chart-data="monthlyChartData"
                :available-categories="availableCategories"
                :analysis-result="analysisResult"
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
                :transactions="analysisResult.transactions"
                active-tab="income"
              />
            </div>
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
  </div>
</template>

<style scoped>
  .dashboard-manager {
    background: white;
    border-radius: 1rem;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border: 1px solid #e5e7eb;
  }

  /* En-tête du gestionnaire */
  .manager-header {
    padding: 2rem;
    background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
    border-bottom: 1px solid #e5e7eb;
  }

  .header-content {
    text-align: center;
  }

  .manager-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    font-size: 1.75rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 0.75rem;
    line-height: 1.2;
  }

  .title-icon {
    width: 2rem;
    height: 2rem;
    color: #3b82f6;
  }

  .manager-description {
    font-size: 1rem;
    color: #6b7280;
    line-height: 1.6;
    max-width: 600px;
    margin: 0 auto;
  }

  /* Contenu principal */
  .manager-content {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
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

  /* Système d'onglets */
  .tabs-container {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.2);
    overflow: hidden;
  }

  .tabs-navigation {
    display: flex;
    background: rgba(249, 250, 251, 0.8);
    backdrop-filter: blur(5px);
    border-bottom: 1px solid rgba(229, 231, 235, 0.3);
  }

  .tab-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1.25rem 2rem;
    background: transparent;
    border: none;
    font-size: 1rem;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.3s ease;
    position: relative;
  }

  .tab-button:hover {
    background: rgba(243, 244, 246, 0.8);
    color: #374151;
  }

  .tab-button.active {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    color: #1f2937;
    font-weight: 600;
  }

  .tab-button.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  }

  .tab-icon {
    width: 1.25rem;
    height: 1.25rem;
    transition: transform 0.2s ease;
  }

  .tab-button.active .tab-icon {
    transform: scale(1.1);
  }

  .tab-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
    min-width: 1.5rem;
    text-align: center;
  }

  .expenses-badge {
    background: linear-gradient(135deg, #ef4444, #dc2626);
  }

  .income-badge {
    background: linear-gradient(135deg, #10b981, #059669);
  }

  .tab-content {
    padding: 0;
  }

  .tab-panel {
    padding: 2rem;
    animation: fadeIn 0.3s ease-in-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .panel-header {
    margin-bottom: 2rem;
    text-align: center;
  }

  .panel-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    font-size: 1.75rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 0.75rem;
  }

  .panel-icon {
    width: 1.75rem;
    height: 1.75rem;
  }

  .expenses-icon {
    color: #ef4444;
  }

  .income-icon {
    color: #10b981;
  }

  .panel-description {
    font-size: 1rem;
    color: #6b7280;
    margin: 0;
    line-height: 1.5;
  }

  .panel-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .panel-stat-card {
    background: rgba(249, 250, 251, 0.6);
    backdrop-filter: blur(5px);
    border-radius: 0.75rem;
    padding: 1.5rem;
    border: 1px solid rgba(229, 231, 235, 0.3);
    display: flex;
    align-items: center;
    gap: 1rem;
    transition: all 0.2s ease;
  }

  .panel-stat-card:hover {
    background: rgba(243, 244, 246, 0.8);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .panel-stat-icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .panel-stat-icon svg {
    width: 1.25rem;
    height: 1.25rem;
    color: white;
  }

  .panel-stat-icon.expenses {
    background: linear-gradient(135deg, #ef4444, #dc2626);
  }

  .panel-stat-icon.income {
    background: linear-gradient(135deg, #10b981, #059669);
  }

  .panel-stat-icon.transactions {
    background: linear-gradient(135deg, #6366f1, #4f46e5);
  }

  .panel-stat-icon.categories {
    background: linear-gradient(135deg, #f59e0b, #d97706);
  }

  .panel-stat-content {
    flex: 1;
    min-width: 0;
  }

  .panel-stat-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: #6b7280;
    margin: 0 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .panel-stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0;
    line-height: 1.2;
  }

  .expenses-amount {
    color: #ef4444;
  }

  .income-amount {
    color: #10b981;
  }

  /* Section graphique */
  .chart-section {
    margin: 2rem 0;
    display: flex;
    justify-content: center;
    width: 100%;
    max-width: 100%;
  }

  /* Bouton de filtrage avancé */
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
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 0.75rem;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  /* En-tête principal du panneau */
  .filters-main-header {
    margin-bottom: 1.5rem;
    text-align: center;
    border-bottom: 1px solid #e2e8f0;
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

  /* Grille compacte des filtres */
  .filters-compact-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .compact-filter-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
  }

  .compact-filter-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }

  .compact-filter-card.full-width {
    grid-column: 1 / -1;
  }

  .compact-filter-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.25rem 0.75rem;
    background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
    border-bottom: 1px solid #f1f5f9;
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

  /* Masquer les en-têtes originaux des composants de filtres */
  .compact-filter-content .filter-header {
    display: none;
  }

  /* Ajustements pour les composants de filtres dans le layout compact */
  /*.compact-filter-content .category-filter,
  .compact-filter-content .joint-account-filter {
    border: none;
    background: transparent;
    box-shadow: none;
  }*/

  .compact-filter-content .categories-list,
  .compact-filter-content .accounts-list {
    max-height: 150px;
    overflow-y: auto;
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

  /* Responsive pour les filtres compacts */
  @media (max-width: 1200px) {
    .filters-compact-grid {
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }

    .compact-filter-card.full-width {
      grid-column: 1;
    }
  }

  @media (max-width: 768px) {
    .filters-container {
      padding: 1.5rem;
      margin: 1rem 0;
    }

    .filters-main-title h3 {
      font-size: 1.25rem;
    }

    .filters-main-description {
      font-size: 0.875rem;
    }

    .compact-filter-header {
      padding: 1rem 1.25rem;
    }

    .compact-filter-content {
      padding: 1.25rem;
    }

    .compact-filter-icon {
      width: 2rem;
      height: 2rem;
    }

    .compact-filter-icon svg {
      width: 1rem;
      height: 1rem;
    }
  }

  @media (max-width: 480px) {
    .filters-container {
      padding: 1rem;
    }

    .filters-main-header {
      margin-bottom: 1.5rem;
    }

    .compact-filter-header {
      padding: 0.875rem 1rem;
    }

    .compact-filter-content {
      padding: 1rem;
    }

    .filters-compact-grid {
      gap: 1rem;
    }
  }

  /* Styles pour les sections transactions */
  .transactions-section {
    margin-top: 2rem;
  }

  /* Styles responsive généraux */
  @media (max-width: 1024px) {
    .manager-content {
      padding: 1.5rem;
    }

    .overview-stats {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .panel-stats {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
    }

    .chart-section {
      margin: 1.5rem 0;
    }
  }

  @media (max-width: 768px) {
    .dashboard-manager {
      border-radius: 0.5rem;
      margin: 0.5rem;
    }

    .manager-header {
      padding: 1.5rem;
    }

    .manager-title {
      font-size: 1.5rem;
    }

    .manager-description {
      font-size: 0.875rem;
    }

    .manager-content {
      padding: 1rem;
      gap: 1.5rem;
    }

    .tab-button {
      padding: 1rem;
      font-size: 0.875rem;
    }

    .tab-panel {
      padding: 1.5rem;
    }

    .panel-title {
      font-size: 1.5rem;
    }

    .panel-stats {
      grid-template-columns: 1fr;
    }

    .stat-card {
      padding: 1.25rem;
    }

    .stat-value {
      font-size: 1.25rem;
    }
  }

  @media (max-width: 480px) {
    .dashboard-manager {
      margin: 0.25rem;
      border-radius: 0.375rem;
    }

    .manager-header {
      padding: 1rem;
    }

    .manager-title {
      font-size: 1.25rem;
      flex-direction: column;
      gap: 0.5rem;
    }

    .title-icon {
      width: 1.5rem;
      height: 1.5rem;
    }

    .manager-content {
      padding: 0.75rem;
      gap: 1rem;
    }

    .tabs-navigation {
      flex-direction: column;
    }

    .tab-button {
      padding: 0.75rem;
    }

    .tab-panel {
      padding: 1rem;
    }

    .panel-title {
      font-size: 1.25rem;
      flex-direction: column;
      gap: 0.5rem;
    }

    .stat-card {
      flex-direction: column;
      text-align: center;
      gap: 1rem;
    }
  }
</style>
