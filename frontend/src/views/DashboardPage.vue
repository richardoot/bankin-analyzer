<script setup lang="ts">
  import { onMounted } from 'vue'
  import MonthlyBarChart from '@/components/charts/MonthlyBarChart.vue'
  import { useDashboardData } from '@/composables/useDashboardData'

  const {
    expensesByMonth,
    incomeByMonth,
    totalExpenses,
    totalIncome,
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
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p class="mt-2 text-gray-600">Vue d'ensemble de vos finances</p>
      </div>

      <!-- Error state -->
      <div
        v-if="error"
        class="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg"
      >
        {{ error }}
      </div>

      <!-- Loading state -->
      <div v-if="isLoading" class="flex justify-center items-center py-20">
        <div class="flex items-center gap-3 text-gray-500">
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
        <!-- Summary cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div
            class="bg-white rounded-xl shadow-sm p-6 border-l-4 border-red-500"
          >
            <div class="text-sm font-medium text-gray-500">
              Total des dépenses
            </div>
            <div class="mt-2 text-2xl font-bold text-red-600">
              {{ formatCurrency(totalExpenses) }}
            </div>
          </div>
          <div
            class="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500"
          >
            <div class="text-sm font-medium text-gray-500">
              Total des revenus
            </div>
            <div class="mt-2 text-2xl font-bold text-green-600">
              {{ formatCurrency(totalIncome) }}
            </div>
          </div>
        </div>

        <!-- Charts grid -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Left column: Expenses -->
          <div class="bg-white rounded-xl shadow-sm p-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">
              Dépenses par mois
            </h2>
            <div v-if="totalExpenses > 0">
              <MonthlyBarChart
                :data="expensesByMonth"
                title="Dépenses"
                color="#ef4444"
              />
            </div>
            <div v-else class="py-12 text-center text-gray-500">
              Aucune dépense enregistrée
            </div>
          </div>

          <!-- Right column: Income -->
          <div class="bg-white rounded-xl shadow-sm p-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">
              Revenus par mois
            </h2>
            <div v-if="totalIncome > 0">
              <MonthlyBarChart
                :data="incomeByMonth"
                title="Revenus"
                color="#22c55e"
              />
            </div>
            <div v-else class="py-12 text-center text-gray-500">
              Aucun revenu enregistré
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div
          v-if="totalExpenses === 0 && totalIncome === 0"
          class="mt-8 text-center py-12 bg-white rounded-xl shadow-sm"
        >
          <svg
            class="mx-auto h-12 w-12 text-gray-400"
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
          <h3 class="mt-4 text-lg font-medium text-gray-900">
            Aucune transaction
          </h3>
          <p class="mt-2 text-gray-500">
            Importez vos transactions pour voir vos statistiques
          </p>
          <RouterLink
            to="/import"
            class="mt-4 inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            Importer des transactions
          </RouterLink>
        </div>
      </template>
    </div>
  </div>
</template>
