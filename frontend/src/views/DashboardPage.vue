<script setup lang="ts">
  import { onMounted } from 'vue'
  import MonthlyBarChart from '@/components/charts/MonthlyBarChart.vue'
  import CategoryPieChart from '@/components/charts/CategoryPieChart.vue'
  import AdvancedFiltersPanel from '@/components/filters/AdvancedFiltersPanel.vue'
  import TimePeriodSelector from '@/components/filters/TimePeriodSelector.vue'
  import { useDashboardData } from '@/composables/useDashboardData'

  const {
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
  } = useDashboardData()

  onMounted(() => {
    fetchData()
  })

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value)
  }

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
  <div class="min-h-screen bg-gray-50 dark:bg-slate-800 py-8 transition-colors">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Dashboard
        </h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Vue d'ensemble de vos finances
        </p>
      </div>

      <!-- Error state -->
      <div
        v-if="error"
        class="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg"
      >
        {{ error }}
      </div>

      <!-- Loading state -->
      <div v-if="isLoading" class="flex justify-center items-center py-20">
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

      <!-- Content -->
      <template v-else-if="!error">
        <!-- Advanced filters panel -->
        <AdvancedFiltersPanel
          :available-accounts="availableAccounts"
          :all-expense-categories="allExpenseCategories"
          :all-income-categories="allIncomeCategories"
        />

        <!-- Summary cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div
            class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6 border-l-4 border-red-500"
          >
            <div class="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total des dépenses
            </div>
            <div class="mt-2 text-2xl font-bold text-red-600 dark:text-red-500">
              {{ formatCurrency(totalExpenses) }}
            </div>
          </div>
          <div
            class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6 border-l-4 border-green-500"
          >
            <div class="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total des revenus
            </div>
            <div
              class="mt-2 text-2xl font-bold text-green-600 dark:text-green-500"
            >
              {{ formatCurrency(totalIncome) }}
            </div>
          </div>
        </div>

        <!-- Time period selector -->
        <div class="mb-6">
          <TimePeriodSelector />
        </div>

        <!-- Charts grid: Bar charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <!-- Left column: Expenses with filter -->
          <div
            class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6"
          >
            <div class="flex justify-between items-center mb-4">
              <h2
                class="text-lg font-semibold text-gray-900 dark:text-gray-100"
              >
                Dépenses par mois
              </h2>
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
            <div v-if="totalExpenses > 0">
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

          <!-- Right column: Income with filter -->
          <div
            class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6"
          >
            <div class="flex justify-between items-center mb-4">
              <h2
                class="text-lg font-semibold text-gray-900 dark:text-gray-100"
              >
                Revenus par mois
              </h2>
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
            <div v-if="totalIncome > 0">
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
        </div>

        <!-- Charts grid: Pie charts by category -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Left column: Expenses by category -->
          <div
            class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6"
          >
            <h2
              class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
            >
              Dépenses par catégorie
            </h2>
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

          <!-- Right column: Income by category -->
          <div
            class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6"
          >
            <h2
              class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
            >
              Revenus par catégorie
            </h2>
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
      </template>
    </div>
  </div>
</template>
