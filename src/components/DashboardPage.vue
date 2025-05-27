<script setup lang="ts">
  import { useBarChart, type MonthlyData } from '@/composables/useBarChart'
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
  const selectedExpenseCategoriesComputed = computed(() => {
    console.log('🔍 Filtres dépenses actifs:', selectedExpenseCategories.value)
    return selectedExpenseCategories.value
  })
  const selectedIncomeCategoriesComputed = computed(() => {
    console.log('🔍 Filtres revenus actifs:', selectedIncomeCategories.value)
    return selectedIncomeCategories.value
  })

  const {
    expensesChartData,
    incomeChartData,
    formatAmount: formatChartAmount,
    formatPercentage,
  } = usePieChart(
    analysisResultComputed,
    selectedExpenseCategoriesComputed,
    selectedIncomeCategoriesComputed,
    computed(() => selectedJointAccounts.value),
    computed(() => compensationRules.value)
  )

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
  <div class="dashboard-page">
    <div class="dashboard-container">
      <!-- En-tête du dashboard -->
      <div class="dashboard-header">
        <h1 class="dashboard-title">
          <svg
            class="dashboard-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="9" x2="15" y2="9" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          Tableau de bord financier
        </h1>
        <p class="dashboard-description">
          Analyse détaillée de vos transactions - Dépenses et Revenus séparés
        </p>
      </div>

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
            <path d="M6 3h12l-4 4v8l-4 2V7L6 3z" />
          </svg>
          <span>Filtrages avancés</span>
          <svg
            class="chevron-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            :class="{ rotated: showAdvancedFilters }"
          >
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </button>
      </div>

      <!-- Panneau de filtres (conditionnel) -->
      <div v-show="showAdvancedFilters" class="advanced-filters-panel">
        <CategoryFilter
          :categories="availableCategories"
          :selected-categories="currentSelectedCategories"
          @update:selected-categories="currentSelectedCategories = $event"
        />

        <JointAccountFilter
          :accounts="availableAccounts"
          :selected-accounts="selectedJointAccounts"
          @update:selected-accounts="selectedJointAccounts = $event"
        />

        <ReimbursementCompensationFilter
          :analysis-result="analysisResult"
          :selected-rules="compensationRules"
          :selected-expense-categories="selectedExpenseCategories"
          :selected-income-categories="selectedIncomeCategories"
          @update:selected-rules="compensationRules = $event"
        />
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
                    {{ formatAmount(analysisResult.expenses.totalAmount) }}
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
                @category-click="handleCategoryClick"
                @category-hover="handleCategoryHover"
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
                    {{ formatAmount(analysisResult.income.totalAmount) }}
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
                @category-click="handleCategoryClick"
                @category-hover="handleCategoryHover"
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
  .dashboard-page {
    min-height: calc(100vh - 120px);
    padding: 2rem;
    background: linear-gradient(
      135deg,
      rgba(102, 126, 234, 0.05) 0%,
      rgba(118, 75, 162, 0.05) 50%,
      rgba(248, 250, 252, 0.8) 100%
    );
    position: relative;
  }

  /* Effet de texture subtile pour harmoniser avec l'app */
  .dashboard-page::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: radial-gradient(
      circle at 1px 1px,
      rgba(102, 126, 234, 0.02) 1px,
      transparent 0
    );
    background-size: 30px 30px;
    pointer-events: none;
    z-index: 0;
  }

  .dashboard-container {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2rem;
    position: relative;
    z-index: 1;
  }

  /* En-tête */
  .dashboard-header {
    text-align: center;
    padding: 2rem 0;
  }

  .dashboard-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    font-size: 2.5rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 1rem;
    line-height: 1.2;
  }

  .dashboard-icon {
    width: 2.5rem;
    height: 2.5rem;
    color: #3b82f6;
  }

  .dashboard-description {
    font-size: 1.125rem;
    color: #6b7280;
    line-height: 1.6;
    max-width: 600px;
    margin: 0 auto;
  }

  /* Statistiques générales */
  .overview-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
    margin-bottom: 1rem;
  }

  .stat-card {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    padding: 2rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    gap: 1.5rem;
    transition: all 0.3s ease;
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    background: rgba(255, 255, 255, 0.85);
  }

  .stat-icon {
    width: 3rem;
    height: 3rem;
    border-radius: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .stat-icon svg {
    width: 1.5rem;
    height: 1.5rem;
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
    font-size: 2rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 0.25rem;
    line-height: 1;
  }

  .stat-description {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
  }

  /* Système d'onglets */
  .tabs-container {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.2);
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
    margin: 1.5rem 0;
    display: flex;
    justify-content: center;
  }

  .advanced-filters-btn {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1.5rem;
    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    border: 1px solid #cbd5e1;
    border-radius: 0.75rem;
    color: #475569;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    position: relative;
    overflow: hidden;
  }

  .advanced-filters-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.2),
      transparent
    );
    transition: left 0.5s;
  }

  .advanced-filters-btn:hover::before {
    left: 100%;
  }

  .advanced-filters-btn:hover {
    background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
    border-color: #94a3b8;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .advanced-filters-btn.active {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    border-color: #1d4ed8;
    color: white;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  .advanced-filters-btn.active:hover {
    background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
    border-color: #1e40af;
  }

  .filter-toggle-icon {
    width: 1.125rem;
    height: 1.125rem;
    flex-shrink: 0;
  }

  .chevron-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .chevron-icon.rotated {
    transform: rotate(180deg);
  }

  /* Panneau de filtres avancés */
  .advanced-filters-panel {
    animation: slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-20px);
      max-height: 0;
    }
    to {
      opacity: 1;
      transform: translateY(0);
      max-height: 500px;
    }
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
  @media (max-width: 1024px) {
    .panel-stats {
      grid-template-columns: 1fr;
    }

    .tabs-navigation {
      flex-direction: column;
    }

    .tab-button {
      padding: 1rem 1.5rem;
    }
  }

  @media (max-width: 768px) {
    .dashboard-page {
      padding: 1.5rem;
    }

    .dashboard-title {
      font-size: 2rem;
      flex-direction: column;
      gap: 0.5rem;
    }

    .dashboard-icon {
      width: 2rem;
      height: 2rem;
    }

    .overview-stats {
      grid-template-columns: 1fr;
    }

    .tab-panel {
      padding: 1.5rem;
    }

    .panel-title {
      font-size: 1.5rem;
      flex-direction: column;
      gap: 0.5rem;
    }

    .panel-stats {
      grid-template-columns: 1fr;
    }

    .categories-grid {
      grid-template-columns: 1fr;
    }

    .info-card {
      flex-direction: column;
      text-align: center;
    }

    .tab-button {
      padding: 0.875rem 1rem;
      font-size: 0.875rem;
    }

    .tab-badge {
      font-size: 0.6875rem;
      padding: 0.1875rem 0.375rem;
    }
  }

  @media (max-width: 480px) {
    .dashboard-page {
      padding: 1rem;
    }

    .tab-panel {
      padding: 1rem;
    }

    .panel-stat-card {
      padding: 1rem;
    }

    .tabs-navigation {
      border-radius: 0;
    }

    .tab-button {
      padding: 0.75rem;
      flex-direction: column;
      gap: 0.5rem;
    }

    .tab-icon {
      width: 1rem;
      height: 1rem;
    }
  }
</style>
