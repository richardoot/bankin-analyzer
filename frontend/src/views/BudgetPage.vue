<script setup lang="ts">
  import { ref, computed, onMounted, watch } from 'vue'
  import { api } from '@/lib/api'
  import type {
    BudgetDto,
    BudgetStatisticsDto,
    CategoryAverageDto,
  } from '@/lib/api'
  import { useFiltersStore } from '@/stores/filters'

  const filtersStore = useFiltersStore()

  // Period options
  type PeriodOption = '3m' | '6m' | '12m' | 'custom'
  const periodOptions: { value: PeriodOption; label: string }[] = [
    { value: '3m', label: '3 mois' },
    { value: '6m', label: '6 mois' },
    { value: '12m', label: '12 mois' },
    { value: 'custom', label: 'Personnalise' },
  ]

  // State
  const selectedPeriod = ref<PeriodOption>('12m')
  const customStartDate = ref<string>('')
  const customEndDate = ref<string>('')
  const statistics = ref<BudgetStatisticsDto | null>(null)
  const budgets = ref<BudgetDto[]>([])
  const budgetInputs = ref<Map<string, number>>(new Map())
  const isLoading = ref(false)
  const isSaving = ref(false)
  const error = ref<string | null>(null)
  const saveSuccess = ref(false)

  // Debounce timer for auto-save
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  // Computed: Date range based on selected period
  const dateRange = computed(() => {
    if (selectedPeriod.value === 'custom') {
      return {
        startDate: customStartDate.value || null,
        endDate: customEndDate.value || null,
      }
    }

    const endDate = new Date()
    const startDate = new Date()

    switch (selectedPeriod.value) {
      case '3m':
        startDate.setMonth(startDate.getMonth() - 3)
        break
      case '6m':
        startDate.setMonth(startDate.getMonth() - 6)
        break
      case '12m':
        startDate.setFullYear(startDate.getFullYear() - 1)
        break
    }

    return {
      startDate: startDate.toISOString().split('T')[0] ?? '',
      endDate: endDate.toISOString().split('T')[0] ?? '',
    }
  })

  // Computed: Is custom period valid
  const isCustomPeriodValid = computed(() => {
    if (selectedPeriod.value !== 'custom') return true
    return customStartDate.value && customEndDate.value
  })

  // Computed: Visible expense categories (excludes globally hidden)
  const visibleExpenseCategories = computed(
    () =>
      statistics.value?.expensesByCategory?.filter(
        cat => !filtersStore.isExpenseCategoryGloballyHidden(cat.categoryName)
      ) ?? []
  )

  // Computed: Visible income categories (excludes globally hidden)
  const visibleIncomeCategories = computed(
    () =>
      statistics.value?.incomeByCategory?.filter(
        cat => !filtersStore.isIncomeCategoryGloballyHidden(cat.categoryName)
      ) ?? []
  )

  // Computed: Visible average monthly expenses
  const visibleAverageMonthlyExpenses = computed(() =>
    visibleExpenseCategories.value.reduce(
      (sum, cat) => sum + cat.averagePerMonth,
      0
    )
  )

  // Computed: Visible average monthly income
  const visibleAverageMonthlyIncome = computed(() =>
    visibleIncomeCategories.value.reduce(
      (sum, cat) => sum + cat.averagePerMonth,
      0
    )
  )

  // Computed: Total budget (only for visible categories)
  const totalBudget = computed(() => {
    let total = 0
    for (const cat of visibleExpenseCategories.value) {
      const amount = budgetInputs.value.get(cat.categoryId) ?? 0
      total += amount
    }
    return total
  })

  // Computed: Current savings (income - expenses)
  const currentSavings = computed(() => {
    if (!statistics.value) return 0
    return (
      visibleAverageMonthlyIncome.value - visibleAverageMonthlyExpenses.value
    )
  })

  // Computed: Target savings (income - budget)
  const targetSavings = computed(() => {
    if (!statistics.value) return 0
    return visibleAverageMonthlyIncome.value - totalBudget.value
  })

  // Computed: Potential gain
  const potentialGain = computed(() => {
    return targetSavings.value - currentSavings.value
  })

  // Format currency
  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value)
  }

  // Get budget for a category
  function getBudgetForCategory(categoryId: string): number {
    return budgetInputs.value.get(categoryId) ?? 0
  }

  // Get difference (budget - actual)
  function getDifference(category: CategoryAverageDto): number {
    const budget = getBudgetForCategory(category.categoryId)
    return budget - category.averagePerMonth
  }

  // Update budget input
  function updateBudgetInput(categoryId: string, value: string) {
    const numValue = parseFloat(value) || 0
    budgetInputs.value.set(categoryId, numValue)

    // Trigger auto-save with debounce
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveBudgets()
    }, 1000)
  }

  // Set budget from average
  function setBudgetFromAverage(category: CategoryAverageDto) {
    budgetInputs.value.set(
      category.categoryId,
      Math.round(category.averagePerMonth)
    )

    // Trigger auto-save
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveBudgets()
    }, 500)
  }

  // Fetch data
  async function fetchData() {
    if (!isCustomPeriodValid.value) return
    if (!dateRange.value.startDate || !dateRange.value.endDate) return

    try {
      isLoading.value = true
      error.value = null

      const [statsResult, budgetsResult] = await Promise.all([
        api.getBudgetStatistics({
          startDate: dateRange.value.startDate,
          endDate: dateRange.value.endDate,
          jointAccounts: filtersStore.jointAccounts,
        }),
        api.getBudgets(),
      ])

      statistics.value = statsResult
      budgets.value = budgetsResult

      // Initialize budget inputs from saved budgets
      budgetInputs.value = new Map()
      for (const budget of budgetsResult) {
        budgetInputs.value.set(budget.categoryId, budget.amount)
      }
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Erreur lors du chargement'
    } finally {
      isLoading.value = false
    }
  }

  // Save budgets
  async function saveBudgets() {
    const budgetsToSave = Array.from(budgetInputs.value.entries())
      .filter(([, amount]) => amount > 0)
      .map(([categoryId, amount]) => ({ categoryId, amount }))

    if (budgetsToSave.length === 0) return

    try {
      isSaving.value = true
      await api.upsertBudgets({ budgets: budgetsToSave })
      saveSuccess.value = true
      setTimeout(() => {
        saveSuccess.value = false
      }, 2000)
    } catch (err) {
      console.error('Failed to save budgets:', err)
    } finally {
      isSaving.value = false
    }
  }

  // Watch for period changes
  watch([selectedPeriod, customStartDate, customEndDate], () => {
    if (isCustomPeriodValid.value) {
      fetchData()
    }
  })

  // Watch for joint accounts changes
  watch(
    () => filtersStore.jointAccounts,
    () => {
      fetchData()
    },
    { deep: true }
  )

  onMounted(() => {
    // Set default custom dates
    const endDate = new Date()
    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 1)
    customEndDate.value = endDate.toISOString().split('T')[0] ?? ''
    customStartDate.value = startDate.toISOString().split('T')[0] ?? ''

    fetchData()
  })
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-slate-800 py-8 transition-colors">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8"
      >
        <div>
          <h1
            class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100"
          >
            Budget Mensuel
          </h1>
          <p
            class="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400"
          >
            Definissez vos objectifs de budget par categorie
          </p>
        </div>

        <!-- Save indicator -->
        <div
          v-if="isSaving || saveSuccess"
          class="flex items-center gap-2 text-sm"
        >
          <template v-if="isSaving">
            <svg
              class="animate-spin h-4 w-4 text-indigo-600 dark:text-indigo-400"
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
            <span class="text-gray-500 dark:text-gray-400">Sauvegarde...</span>
          </template>
          <template v-else-if="saveSuccess">
            <svg
              class="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span class="text-emerald-600 dark:text-emerald-400"
              >Sauvegarde</span
            >
          </template>
        </div>
      </div>

      <!-- Period Selector -->
      <div
        class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-4 sm:p-6 mb-6"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div class="flex flex-wrap gap-2">
            <button
              v-for="option in periodOptions"
              :key="option.value"
              type="button"
              class="px-4 py-2 text-sm font-medium rounded-lg transition-colors min-h-[44px] sm:min-h-0"
              :class="
                selectedPeriod === option.value
                  ? 'bg-indigo-600 dark:bg-indigo-500 text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              "
              @click="selectedPeriod = option.value"
            >
              {{ option.label }}
            </button>
          </div>

          <!-- Custom date inputs -->
          <div
            v-if="selectedPeriod === 'custom'"
            class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
          >
            <div class="flex items-center gap-2">
              <label class="text-sm text-gray-600 dark:text-gray-400 shrink-0"
                >Du:</label
              >
              <input
                v-model="customStartDate"
                type="date"
                class="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-sm min-h-[44px] sm:min-h-0"
              />
            </div>
            <div class="flex items-center gap-2">
              <label class="text-sm text-gray-600 dark:text-gray-400 shrink-0"
                >Au:</label
              >
              <input
                v-model="customEndDate"
                type="date"
                class="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-sm min-h-[44px] sm:min-h-0"
              />
            </div>
          </div>
        </div>

        <!-- Period info -->
        <p
          v-if="statistics"
          class="mt-4 text-sm text-gray-500 dark:text-gray-400"
        >
          Analyse sur {{ statistics.periodMonths }} mois
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
          <span>Chargement...</span>
        </div>
      </div>

      <!-- Content -->
      <div v-else-if="statistics && !error">
        <!-- Expenses Section -->
        <div
          class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-4 sm:p-6 mb-6"
        >
          <h2
            class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
          >
            Depenses par categorie
          </h2>

          <!-- Desktop table -->
          <div class="hidden sm:block overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr
                  class="text-left text-sm text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700"
                >
                  <th class="pb-3 font-medium">Categorie</th>
                  <th class="pb-3 font-medium text-right">Moyenne actuelle</th>
                  <th class="pb-3 font-medium text-center">Budget cible</th>
                  <th class="pb-3 font-medium text-right">Difference</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-slate-700">
                <tr
                  v-for="cat in visibleExpenseCategories"
                  :key="cat.categoryId"
                  class="group"
                >
                  <td class="py-3 text-gray-900 dark:text-gray-100">
                    {{ cat.categoryName }}
                    <span class="text-xs text-gray-400 dark:text-gray-500 ml-2">
                      ({{ cat.transactionCount }} tx)
                    </span>
                  </td>
                  <td class="py-3 text-right text-gray-700 dark:text-gray-300">
                    {{ formatCurrency(cat.averagePerMonth) }}
                  </td>
                  <td class="py-3">
                    <div class="flex items-center justify-center gap-2">
                      <input
                        type="number"
                        :value="getBudgetForCategory(cat.categoryId)"
                        min="0"
                        step="10"
                        class="w-28 px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-right focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400"
                        @input="
                          e =>
                            updateBudgetInput(
                              cat.categoryId,
                              (e.target as HTMLInputElement).value
                            )
                        "
                      />
                      <button
                        type="button"
                        class="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Utiliser la moyenne"
                        @click="setBudgetFromAverage(cat)"
                      >
                        <svg
                          class="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>
                  <td
                    class="py-3 text-right font-medium"
                    :class="
                      getDifference(cat) >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    "
                  >
                    {{ getDifference(cat) >= 0 ? '+' : ''
                    }}{{ formatCurrency(getDifference(cat)) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mobile cards -->
          <div class="sm:hidden space-y-4">
            <div
              v-for="cat in visibleExpenseCategories"
              :key="cat.categoryId"
              class="bg-gray-50 dark:bg-slate-800 rounded-lg p-4"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="font-medium text-gray-900 dark:text-gray-100">{{
                  cat.categoryName
                }}</span>
                <span class="text-xs text-gray-400 dark:text-gray-500"
                  >({{ cat.transactionCount }} tx)</span
                >
              </div>
              <div class="flex items-center justify-between mb-3">
                <span class="text-sm text-gray-500 dark:text-gray-400"
                  >Moyenne:</span
                >
                <span class="text-gray-700 dark:text-gray-300">{{
                  formatCurrency(cat.averagePerMonth)
                }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-500 dark:text-gray-400 shrink-0"
                  >Budget:</span
                >
                <input
                  type="number"
                  :value="getBudgetForCategory(cat.categoryId)"
                  min="0"
                  step="10"
                  class="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 text-right min-h-[44px]"
                  @input="
                    e =>
                      updateBudgetInput(
                        cat.categoryId,
                        (e.target as HTMLInputElement).value
                      )
                  "
                />
                <button
                  type="button"
                  class="p-2 min-h-[44px] min-w-[44px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg"
                  title="Utiliser la moyenne"
                  @click="setBudgetFromAverage(cat)"
                >
                  <svg
                    class="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                    />
                  </svg>
                </button>
              </div>
              <div class="mt-2 text-right">
                <span
                  class="text-sm font-medium"
                  :class="
                    getDifference(cat) >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  "
                >
                  {{ getDifference(cat) >= 0 ? '+' : ''
                  }}{{ formatCurrency(getDifference(cat)) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Totals -->
          <div
            class="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
          >
            <div class="text-gray-700 dark:text-gray-300">
              <span class="font-medium">Total depenses:</span>
              <span class="ml-2"
                >{{ formatCurrency(visibleAverageMonthlyExpenses) }}/mois</span
              >
            </div>
            <div class="text-indigo-700 dark:text-indigo-400">
              <span class="font-medium">Budget total:</span>
              <span class="ml-2 text-lg font-bold"
                >{{ formatCurrency(totalBudget) }}/mois</span
              >
            </div>
          </div>
        </div>

        <!-- Income Section -->
        <div
          class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-4 sm:p-6 mb-6"
        >
          <h2
            class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
          >
            Revenus (hors remboursements)
          </h2>

          <div class="space-y-3">
            <div
              v-for="cat in visibleIncomeCategories"
              :key="cat.categoryId"
              class="flex items-center justify-between py-2"
            >
              <div>
                <span class="text-gray-900 dark:text-gray-100">{{
                  cat.categoryName
                }}</span>
                <span class="text-xs text-gray-400 dark:text-gray-500 ml-2"
                  >({{ cat.transactionCount }} tx)</span
                >
              </div>
              <span class="font-medium text-emerald-600 dark:text-emerald-400">
                {{ formatCurrency(cat.averagePerMonth) }}
              </span>
            </div>
          </div>

          <div class="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
            <div class="flex items-center justify-between">
              <span class="font-medium text-gray-700 dark:text-gray-300"
                >Total revenus:</span
              >
              <span
                class="text-lg font-bold text-emerald-600 dark:text-emerald-400"
              >
                {{ formatCurrency(visibleAverageMonthlyIncome) }}/mois
              </span>
            </div>
          </div>
        </div>

        <!-- Savings Summary -->
        <div
          class="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl shadow-lg p-6 text-white"
        >
          <h2 class="text-lg font-semibold mb-6">Resume Epargne</h2>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <!-- Current savings -->
            <div class="text-center">
              <p class="text-indigo-100 text-sm mb-1">Epargne actuelle</p>
              <p class="text-2xl sm:text-3xl font-bold">
                {{ formatCurrency(currentSavings) }}
              </p>
              <p class="text-indigo-200 text-xs mt-1">(revenus - depenses)</p>
            </div>

            <!-- Target savings -->
            <div class="text-center">
              <p class="text-indigo-100 text-sm mb-1">Epargne cible</p>
              <p class="text-2xl sm:text-3xl font-bold">
                {{ formatCurrency(targetSavings) }}
              </p>
              <p class="text-indigo-200 text-xs mt-1">(revenus - budget)</p>
            </div>

            <!-- Potential gain -->
            <div class="text-center">
              <p class="text-indigo-100 text-sm mb-1">Gain potentiel</p>
              <p
                class="text-2xl sm:text-3xl font-bold"
                :class="
                  potentialGain >= 0 ? 'text-emerald-300' : 'text-red-300'
                "
              >
                {{ potentialGain >= 0 ? '+' : ''
                }}{{ formatCurrency(potentialGain) }}
              </p>
              <p class="text-indigo-200 text-xs mt-1">(cible - actuelle)</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="!isLoading && !error"
        class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-8 text-center"
      >
        <div
          class="h-16 w-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <svg
            class="h-8 w-8 text-indigo-600 dark:text-indigo-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          Aucune donnee disponible
        </h3>
        <p class="text-gray-500 dark:text-gray-400">
          Selectionnez une periode pour afficher vos statistiques de budget.
        </p>
      </div>
    </div>
  </div>
</template>
