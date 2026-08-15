<script setup lang="ts">
  import { onMounted, computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import MonthlyBarChart from '@/components/charts/MonthlyBarChart.vue'
  import CategoryPieChart from '@/components/charts/CategoryPieChart.vue'
  import AdvancedFiltersPanel from '@/components/filters/AdvancedFiltersPanel.vue'
  import TimePeriodSelector from '@/components/filters/TimePeriodSelector.vue'
  import SparklineChart from '@/components/budget/SparklineChart.vue'
  import CategoryBreakdownList from '@/components/dashboard/CategoryBreakdownList.vue'
  import { useDashboardData } from '@/composables/useDashboardData'
  import { formatCurrency } from '@/lib/formatters'

  const router = useRouter()

  const {
    totalExpenses,
    totalIncome,
    averageMonthlyExpenses,
    totalEverydayExpenses,
    averageEverydayMonthlyExpenses,
    exceptionalEvents,
    hasExceptionalExpenses,
    averageMonthlyIncome,
    averageMonthlySavings,
    expensesSparkline,
    incomeSparkline,
    savingsSparkline,
    expensesByCategory,
    incomeByCategory,
    expenseCategoriesDetailed,
    monthLabels,
    allExpenseCategories,
    allIncomeCategories,
    availableExpenseCategories,
    availableIncomeCategories,
    selectedCategory,
    selectedIncomeCategory,
    filteredExpensesByMonth,
    filteredIncomeByMonth,
    setSelectedCategory,
    setSelectedIncomeCategory,
    deductReimbursements,
    deductPendingReimbursements,
    isLoading,
    isLoadingExpenseChart,
    isLoadingIncomeChart,
    error,
    fetchData,
    monthlyData,
  } = useDashboardData()

  // Track if we have initial data loaded (for showing full loader vs subtle refresh indicator)
  const hasInitialData = computed(
    () =>
      monthlyData.value.length > 0 ||
      totalExpenses.value > 0 ||
      totalIncome.value > 0
  )

  // Show full loader only on initial load
  const showFullLoader = computed(
    () => isLoading.value && !hasInitialData.value
  )

  // Show subtle refresh indicator when reloading with existing data
  const isRefreshing = computed(() => isLoading.value && hasInitialData.value)

  // Real vs everyday breakdown, persisted so the choice survives a reload.
  const BREAKDOWN_MODE_KEY = 'dashboard-breakdown-mode'
  const breakdownMode = ref<'real' | 'everyday'>(
    localStorage.getItem(BREAKDOWN_MODE_KEY) === 'everyday'
      ? 'everyday'
      : 'real'
  )

  function setBreakdownMode(mode: 'real' | 'everyday'): void {
    breakdownMode.value = mode
    try {
      localStorage.setItem(BREAKDOWN_MODE_KEY, mode)
    } catch {
      // Private browsing: the choice simply does not persist.
    }
  }

  /**
   * Sum of the listed events, so the banner header matches the chips below it.
   * Deliberately not `totalExceptionalExpenses`, which is net of reimbursements
   * while the per-event amounts are gross.
   */
  const exceptionalEventsTotal = computed(() =>
    exceptionalEvents.value.reduce((sum, e) => sum + e.amount, 0)
  )

  function openTagAnalysis(tagId: string): void {
    router.push({ name: 'tag-analysis', params: { id: tagId } })
  }

  onMounted(() => {
    fetchData()
  })

  function handleCategoryChange(event: Event) {
    const target = event.target as HTMLSelectElement
    const value = target.value
    setSelectedCategory(value === '' ? null : value)
  }

  function handleIncomeCategoryChange(event: Event) {
    const target = event.target as HTMLSelectElement
    const value = target.value
    setSelectedIncomeCategory(value === '' ? null : value)
  }
</script>

<template>
  <div
    data-testid="dashboard-container"
    class="min-h-screen bg-gray-50 dark:bg-slate-800 py-8 transition-colors"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8 flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Dashboard
          </h1>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            Vue d'ensemble de vos finances
          </p>
        </div>
        <!-- Subtle refresh indicator -->
        <div
          v-if="isRefreshing"
          class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
        >
          <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Mise à jour...</span>
        </div>
      </div>

      <!-- Error state -->
      <div
        v-if="error"
        class="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg"
      >
        {{ error }}
      </div>

      <!-- Initial loading state (only shown when no data yet) -->
      <div v-if="showFullLoader" class="flex justify-center items-center py-20">
        <div class="flex items-center gap-3 text-gray-500 dark:text-gray-400">
          <svg class="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Chargement des données...</span>
        </div>
      </div>

      <!-- Content (shown when we have data or finished loading) -->
      <div
        v-if="!error && !showFullLoader"
        class="transition-opacity duration-200"
        :class="isRefreshing ? 'opacity-60' : 'opacity-100'"
      >
        <!-- Advanced filters panel -->
        <AdvancedFiltersPanel
          :all-expense-categories="allExpenseCategories"
          :all-income-categories="allIncomeCategories"
        />

        <!-- Period + reimbursement toggles (harmonized in a single card) -->
        <div
          data-testid="dashboard-filters-card"
          class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 border border-gray-200 dark:border-slate-700 p-4 sm:p-5 mb-6 space-y-4"
        >
          <TimePeriodSelector />

          <div
            class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6 pt-4 border-t border-gray-100 dark:border-slate-700"
          >
            <button
              type="button"
              role="switch"
              :aria-checked="deductReimbursements"
              data-testid="toggle-deduct-reimbursements"
              class="group flex items-center gap-2.5 cursor-pointer select-none"
              @click="deductReimbursements = !deductReimbursements"
            >
              <span
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200"
                :class="
                  deductReimbursements
                    ? 'bg-emerald-500'
                    : 'bg-gray-300 dark:bg-slate-600'
                "
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200"
                  :class="
                    deductReimbursements ? 'translate-x-4' : 'translate-x-0.5'
                  "
                />
              </span>
              <span class="text-sm text-gray-700 dark:text-gray-300">
                Déduire les remboursements reçus
              </span>
            </button>
            <button
              type="button"
              role="switch"
              :aria-checked="deductPendingReimbursements"
              data-testid="toggle-deduct-pending"
              class="group flex items-center gap-2.5 cursor-pointer select-none"
              @click="
                deductPendingReimbursements = !deductPendingReimbursements
              "
            >
              <span
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200"
                :class="
                  deductPendingReimbursements
                    ? 'bg-emerald-500'
                    : 'bg-gray-300 dark:bg-slate-600'
                "
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200"
                  :class="
                    deductPendingReimbursements
                      ? 'translate-x-4'
                      : 'translate-x-0.5'
                  "
                />
              </span>
              <span class="text-sm text-gray-700 dark:text-gray-300">
                Déduire les remboursements en attente
              </span>
            </button>
          </div>
        </div>

        <!-- KPI cards: monthly averages -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8">
          <!-- Average monthly expenses -->
          <div
            data-testid="kpi-card-expenses"
            class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-5 border-l-4 border-red-500"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div
                  class="text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  Dépenses moyennes / mois
                </div>
                <div
                  class="mt-2 text-2xl font-bold text-red-600 dark:text-red-500"
                >
                  {{ formatCurrency(averageMonthlyExpenses) }}
                </div>
                <!-- Everyday baseline: what the lifestyle costs once the
                     one-off events are set aside. -->
                <div
                  v-if="hasExceptionalExpenses"
                  class="mt-1 text-xs text-gray-500 dark:text-gray-400"
                  title="Moyenne calculée hors dépenses étiquetées comme exceptionnelles, sur la même période"
                >
                  dont vie courante
                  <span class="font-semibold text-gray-700 dark:text-gray-300">
                    {{ formatCurrency(averageEverydayMonthlyExpenses) }}
                  </span>
                  / mois
                </div>
              </div>
              <SparklineChart
                v-if="expensesSparkline.length >= 2"
                :data="expensesSparkline"
                color="#ef4444"
              />
            </div>
          </div>

          <!-- Average monthly income -->
          <div
            data-testid="kpi-card-income"
            class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-5 border-l-4 border-green-500"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div
                  class="text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  Revenus moyens / mois
                </div>
                <div
                  class="mt-2 text-2xl font-bold text-green-600 dark:text-green-500"
                >
                  {{ formatCurrency(averageMonthlyIncome) }}
                </div>
              </div>
              <SparklineChart
                v-if="incomeSparkline.length >= 2"
                :data="incomeSparkline"
                color="#22c55e"
              />
            </div>
          </div>

          <!-- Average monthly savings -->
          <div
            data-testid="kpi-card-savings"
            class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-5 border-l-4"
            :class="
              averageMonthlySavings >= 0
                ? 'border-indigo-500'
                : 'border-amber-500'
            "
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div
                  class="text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  Épargne moyenne / mois
                </div>
                <div
                  class="mt-2 text-2xl font-bold"
                  :class="
                    averageMonthlySavings >= 0
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-amber-600 dark:text-amber-400'
                  "
                >
                  {{ formatCurrency(averageMonthlySavings) }}
                </div>
              </div>
              <SparklineChart
                v-if="savingsSparkline.length >= 2"
                :data="savingsSparkline"
                :color="averageMonthlySavings >= 0 ? '#6366f1' : '#f59e0b'"
              />
            </div>
          </div>
        </div>

        <!-- Expenses section (primary) -->
        <section data-testid="dashboard-expenses-section" class="mb-10">
          <h2
            class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4"
          >
            Dépenses
          </h2>
          <div
            data-testid="dashboard-charts-section"
            class="grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            <!-- Monthly expenses chart -->
            <div
              class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6"
            >
              <div class="flex justify-between items-center mb-4">
                <h3
                  class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                >
                  Dépenses par mois
                </h3>
                <select
                  v-if="availableExpenseCategories.length > 0"
                  data-testid="expense-category-filter"
                  :value="selectedCategory ?? ''"
                  class="text-sm border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400"
                  @change="handleCategoryChange"
                >
                  <option value="">Toutes les catégories</option>
                  <option
                    v-for="cat in availableExpenseCategories"
                    :key="cat"
                    :value="cat"
                  >
                    {{ cat }}
                  </option>
                </select>
              </div>
              <div v-if="totalExpenses > 0" class="relative">
                <!-- Chart loader overlay -->
                <div
                  v-if="isLoadingExpenseChart"
                  class="absolute inset-0 bg-white/70 dark:bg-slate-900/70 flex items-center justify-center z-10 rounded-lg"
                >
                  <div class="flex flex-col items-center gap-2">
                    <svg
                      class="animate-spin h-8 w-8 text-red-500"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                      />
                      <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span class="text-sm text-gray-500 dark:text-gray-400"
                      >Chargement...</span
                    >
                  </div>
                </div>
                <MonthlyBarChart
                  :data="filteredExpensesByMonth"
                  title="Dépenses"
                  color="#ef4444"
                />
              </div>
              <div
                v-else
                class="py-12 text-center text-gray-500 dark:text-gray-400"
              >
                Aucune dépense enregistrée
              </div>
            </div>

            <!-- Expenses pie chart -->
            <div
              class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6"
            >
              <h3
                class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
              >
                Dépenses par catégorie
              </h3>
              <div v-if="expensesByCategory.values.length > 0" class="h-80">
                <CategoryPieChart :data="expensesByCategory" title="Dépenses" />
              </div>
              <div
                v-else
                class="py-12 text-center text-gray-500 dark:text-gray-400"
              >
                Aucune dépense enregistrée
              </div>
            </div>
          </div>

          <!-- Category breakdown list (drill-down) -->
          <div
            v-if="expenseCategoriesDetailed.length > 0"
            class="mt-6 bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-4 sm:p-6"
          >
            <div class="flex flex-wrap items-start justify-between gap-3 mb-1">
              <h3
                class="text-lg font-semibold text-gray-900 dark:text-gray-100"
              >
                Détail par catégorie
              </h3>

              <!-- Real vs everyday selector -->
              <div
                v-if="hasExceptionalExpenses"
                class="inline-flex rounded-lg border border-gray-200 dark:border-slate-700 p-0.5 text-xs"
                role="group"
                aria-label="Mode d'affichage des moyennes"
              >
                <button
                  type="button"
                  data-testid="breakdown-mode-real"
                  class="px-2.5 py-1 rounded-md transition-colors"
                  :class="
                    breakdownMode === 'real'
                      ? 'bg-gray-900 text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'text-gray-500 dark:text-gray-400'
                  "
                  @click="setBreakdownMode('real')"
                >
                  Tout
                </button>
                <button
                  type="button"
                  data-testid="breakdown-mode-everyday"
                  class="px-2.5 py-1 rounded-md transition-colors"
                  :class="
                    breakdownMode === 'everyday'
                      ? 'bg-gray-900 text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'text-gray-500 dark:text-gray-400'
                  "
                  @click="setBreakdownMode('everyday')"
                >
                  Vie courante
                </button>
              </div>
            </div>
            <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">
              <template v-if="breakdownMode === 'everyday'">
                Moyennes hors dépenses étiquetées comme exceptionnelles. Seules
                les catégories concernées par un événement changent de valeur.
              </template>
              <template v-else>
                Cliquez sur une catégorie pour voir ses sous-catégories et son
                évolution mensuelle.
              </template>
            </p>

            <!-- What the exceptional share is made of -->
            <div
              v-if="hasExceptionalExpenses && exceptionalEvents.length > 0"
              class="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5"
            >
              <p
                class="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1.5"
              >
                Événements de la période —
                {{ formatCurrency(exceptionalEventsTotal) }}
              </p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="event in exceptionalEvents"
                  :key="event.id"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 hover:ring-2 hover:ring-amber-300 transition"
                  @click="openTagAnalysis(event.id)"
                >
                  <span
                    class="inline-block h-2 w-2 rounded-full shrink-0"
                    :style="{ backgroundColor: event.color ?? '#9ca3af' }"
                  ></span>
                  {{ event.name }}
                  <span class="font-semibold tabular-nums">
                    {{ formatCurrency(event.amount) }}
                  </span>
                </button>
              </div>
            </div>

            <CategoryBreakdownList
              :categories="expenseCategoriesDetailed"
              :month-labels="monthLabels"
              :total="
                breakdownMode === 'everyday'
                  ? totalEverydayExpenses
                  : totalExpenses
              "
              :mode="breakdownMode"
              color="#ef4444"
            />
          </div>
        </section>

        <!-- Income section (secondary) -->
        <section data-testid="dashboard-income-section">
          <h2
            class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4"
          >
            Revenus
          </h2>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- Monthly income chart -->
            <div
              class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6"
            >
              <div class="flex justify-between items-center mb-4">
                <h3
                  class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                >
                  Revenus par mois
                </h3>
                <select
                  v-if="availableIncomeCategories.length > 0"
                  data-testid="income-category-filter"
                  :value="selectedIncomeCategory ?? ''"
                  class="text-sm border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400"
                  @change="handleIncomeCategoryChange"
                >
                  <option value="">Toutes les catégories</option>
                  <option
                    v-for="cat in availableIncomeCategories"
                    :key="cat"
                    :value="cat"
                  >
                    {{ cat }}
                  </option>
                </select>
              </div>
              <div v-if="totalIncome > 0" class="relative">
                <!-- Chart loader overlay -->
                <div
                  v-if="isLoadingIncomeChart"
                  class="absolute inset-0 bg-white/70 dark:bg-slate-900/70 flex items-center justify-center z-10 rounded-lg"
                >
                  <div class="flex flex-col items-center gap-2">
                    <svg
                      class="animate-spin h-8 w-8 text-emerald-500"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                      />
                      <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span class="text-sm text-gray-500 dark:text-gray-400"
                      >Chargement...</span
                    >
                  </div>
                </div>
                <MonthlyBarChart
                  :data="filteredIncomeByMonth"
                  title="Revenus"
                  color="#22c55e"
                />
              </div>
              <div
                v-else
                class="py-12 text-center text-gray-500 dark:text-gray-400"
              >
                Aucun revenu enregistré
              </div>
            </div>

            <!-- Income pie chart -->
            <div
              class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6"
            >
              <h3
                class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
              >
                Revenus par catégorie
              </h3>
              <div v-if="incomeByCategory.values.length > 0" class="h-80">
                <CategoryPieChart :data="incomeByCategory" title="Revenus" />
              </div>
              <div
                v-else
                class="py-12 text-center text-gray-500 dark:text-gray-400"
              >
                Aucun revenu enregistré
              </div>
            </div>
          </div>
        </section>

        <!-- Empty state -->
        <div
          v-if="totalExpenses === 0 && totalIncome === 0"
          class="mt-8 text-center py-12 bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20"
        >
          <svg
            class="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
            Aucune transaction
          </h3>
          <p class="mt-2 text-gray-500 dark:text-gray-400">
            Importez vos transactions pour voir vos statistiques
          </p>
          <RouterLink
            to="/import"
            class="mt-4 inline-flex items-center px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors"
          >
            Importer des transactions
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
