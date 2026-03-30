<script setup lang="ts">
  import { ref, computed, onMounted, watch } from 'vue'
  import { api } from '@/lib/api'
  import type {
    BudgetDto,
    BudgetStatisticsDto,
    CategoryAverageDto,
  } from '@/lib/api'
  import { useFiltersStore } from '@/stores/filters'
  import { formatCurrency } from '@/lib/formatters'
  import BudgetSavingsSummary from '@/components/budget/BudgetSavingsSummary.vue'

  const filtersStore = useFiltersStore()

  // Period options
  type PeriodOption = '3m' | '6m' | '12m' | 'custom'
  const periodOptions: { value: PeriodOption; label: string }[] = [
    { value: '3m', label: '3 mois' },
    { value: '6m', label: '6 mois' },
    { value: '12m', label: '12 mois' },
    { value: 'custom', label: 'Personnalise' },
  ]

  // Sort options
  type SortOrder = 'amount-desc' | 'amount-asc' | 'difference-desc' | 'alpha'
  const sortOptions: { value: SortOrder; label: string }[] = [
    { value: 'amount-desc', label: 'Depense (decroissant)' },
    { value: 'amount-asc', label: 'Depense (croissant)' },
    { value: 'difference-desc', label: 'Economie potentielle' },
    { value: 'alpha', label: 'Alphabetique' },
  ]

  // State
  const selectedPeriod = ref<PeriodOption>('12m')
  const sortOrder = ref<SortOrder>('amount-desc')
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

  // Expanded categories state
  const expandedCategories = ref<Set<string>>(new Set())

  function toggleCategoryExpanded(categoryId: string) {
    if (expandedCategories.value.has(categoryId)) {
      expandedCategories.value.delete(categoryId)
    } else {
      expandedCategories.value.add(categoryId)
    }
  }

  function isCategoryExpanded(categoryId: string): boolean {
    return expandedCategories.value.has(categoryId)
  }

  function hasSubcategories(cat: CategoryAverageDto): boolean {
    return (cat.subcategories?.length ?? 0) > 0
  }

  // Computed: Date range based on selected period
  // Uses only completed months (excludes the current month)
  const dateRange = computed(() => {
    if (selectedPeriod.value === 'custom') {
      return {
        startDate: customStartDate.value || null,
        endDate: customEndDate.value || null,
      }
    }

    const now = new Date()

    // End date = last day of previous month
    const endDate = new Date(now.getFullYear(), now.getMonth(), 0)

    // Start date = 1st of month, N months before the end month
    const monthsBack =
      selectedPeriod.value === '3m' ? 3 : selectedPeriod.value === '6m' ? 6 : 12
    const startDate = new Date(
      endDate.getFullYear(),
      endDate.getMonth() - (monthsBack - 1),
      1
    )

    return {
      startDate: toLocalDateString(startDate),
      endDate: toLocalDateString(endDate),
    }
  })

  function toLocalDateString(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // Computed: Human-readable period label
  const periodLabel = computed(() => {
    if (selectedPeriod.value === 'custom') {
      if (!customStartDate.value || !customEndDate.value) return ''
      return `Du ${formatDateLabel(customStartDate.value)} au ${formatDateLabel(customEndDate.value)}`
    }
    const range = dateRange.value
    if (!range.startDate || !range.endDate) return ''
    return `Du ${formatDateLabel(range.startDate)} au ${formatDateLabel(range.endDate)}`
  })

  function formatDateLabel(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

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

  // Computed: Sorted expense categories
  const sortedExpenseCategories = computed(() => {
    const categories = [...visibleExpenseCategories.value]
    switch (sortOrder.value) {
      case 'amount-desc':
        return categories.sort((a, b) => b.averagePerMonth - a.averagePerMonth)
      case 'amount-asc':
        return categories.sort((a, b) => a.averagePerMonth - b.averagePerMonth)
      case 'difference-desc':
        return categories.sort((a, b) => getDifference(b) - getDifference(a))
      case 'alpha':
        return categories.sort((a, b) =>
          a.categoryName.localeCompare(b.categoryName, 'fr')
        )
      default:
        return categories
    }
  })

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

  // Computed: Savings progress percentage
  const savingsProgressPercent = computed(() => {
    if (targetSavings.value <= 0) return 0
    return Math.max(0, (currentSavings.value / targetSavings.value) * 100)
  })

  // Get budget for a category
  function getBudgetForCategory(categoryId: string): number {
    return budgetInputs.value.get(categoryId) ?? 0
  }

  // Get difference (average - budget = potential savings)
  function getDifference(category: CategoryAverageDto): number {
    const budget = getBudgetForCategory(category.categoryId)
    return category.averagePerMonth - budget
  }

  // Get utilization percentage (budget as % of average)
  function getUtilizationPercent(category: CategoryAverageDto): number {
    const average = category.averagePerMonth
    if (average === 0) return 0
    const budget = getBudgetForCategory(category.categoryId)
    return (budget / average) * 100
  }

  // Get progress bar class based on utilization (budget as % of average)
  // < 100% = saving money (green), 100-110% = neutral (amber), > 110% = overspending (red)
  function getProgressBarClass(category: CategoryAverageDto): string {
    const percent = getUtilizationPercent(category)
    if (percent > 110) return 'bg-red-500 dark:bg-red-400'
    if (percent > 100) return 'bg-amber-500 dark:bg-amber-400'
    return 'bg-emerald-500 dark:bg-emerald-400'
  }

  // Get utilization badge class
  function getUtilizationBadgeClass(category: CategoryAverageDto): string {
    const percent = getUtilizationPercent(category)
    if (percent > 110)
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
    if (percent > 100)
      return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
    return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
  }

  // Trigger auto-save with debounce
  function triggerAutoSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveBudgets()
    }, 500)
  }

  // Update budget input
  function updateBudgetInput(categoryId: string, value: string) {
    const numValue = parseFloat(value) || 0
    budgetInputs.value.set(categoryId, numValue)
    triggerAutoSave()
  }

  // Set budget from average
  function setBudgetFromAverage(category: CategoryAverageDto) {
    budgetInputs.value.set(
      category.categoryId,
      Math.round(category.averagePerMonth)
    )
    triggerAutoSave()
  }

  // Adjust budget by percentage
  function adjustBudgetByPercent(categoryId: string, percent: number) {
    const current = budgetInputs.value.get(categoryId) ?? 0
    const newValue = Math.round(current * (1 + percent / 100))
    budgetInputs.value.set(categoryId, Math.max(0, newValue))
    triggerAutoSave()
  }

  // Apply average to all categories
  function applyAverageToAll() {
    for (const cat of visibleExpenseCategories.value) {
      budgetInputs.value.set(cat.categoryId, Math.round(cat.averagePerMonth))
    }
    triggerAutoSave()
  }

  // Adjust all budgets by percentage
  function adjustAllByPercent(percent: number) {
    for (const cat of visibleExpenseCategories.value) {
      const current = budgetInputs.value.get(cat.categoryId) ?? 0
      if (current > 0) {
        budgetInputs.value.set(
          cat.categoryId,
          Math.round(current * (1 + percent / 100))
        )
      }
    }
    triggerAutoSave()
  }

  // Reset all budgets
  function resetAllBudgets() {
    budgetInputs.value.clear()
    triggerAutoSave()
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

  onMounted(() => {
    // Set default custom dates (12 months by default)
    const endDate = new Date()
    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - 11)
    startDate.setDate(1)
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
          v-if="statistics && periodLabel"
          class="mt-4 text-sm text-gray-500 dark:text-gray-400"
        >
          {{ periodLabel }} ({{ statistics.periodMonths }} mois complets)
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
          <!-- Header with title and sort -->
          <div
            class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4"
          >
            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Depenses par categorie
            </h2>
            <div class="flex items-center gap-2">
              <label class="text-sm text-gray-500 dark:text-gray-400 shrink-0"
                >Trier par:</label
              >
              <select
                v-model="sortOrder"
                class="text-sm border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 min-h-[36px]"
              >
                <option
                  v-for="option in sortOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- Quick Actions Bar -->
          <div
            class="flex flex-wrap items-center gap-2 mb-4 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg"
          >
            <span class="text-sm text-gray-500 dark:text-gray-400 mr-1"
              >Actions rapides:</span
            >

            <button
              type="button"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors min-h-[36px]"
              @click="applyAverageToAll"
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
              Appliquer les moyennes
            </button>

            <div class="flex items-center gap-1">
              <button
                type="button"
                class="px-2.5 py-1.5 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors min-h-[36px]"
                @click="adjustAllByPercent(-10)"
              >
                -10%
              </button>
              <button
                type="button"
                class="px-2.5 py-1.5 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors min-h-[36px]"
                @click="adjustAllByPercent(-5)"
              >
                -5%
              </button>
              <button
                type="button"
                class="px-2.5 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors min-h-[36px]"
                @click="adjustAllByPercent(5)"
              >
                +5%
              </button>
              <button
                type="button"
                class="px-2.5 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors min-h-[36px]"
                @click="adjustAllByPercent(10)"
              >
                +10%
              </button>
            </div>

            <button
              type="button"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors min-h-[36px]"
              @click="resetAllBudgets"
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
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Reinitialiser
            </button>
          </div>

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
                  <th class="pb-3 font-medium text-center w-24">Utilisation</th>
                  <th class="pb-3 font-medium text-right">Difference</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-slate-700">
                <template
                  v-for="cat in sortedExpenseCategories"
                  :key="cat.categoryId"
                >
                  <tr>
                    <td class="py-3">
                      <div
                        class="flex items-center text-gray-900 dark:text-gray-100"
                      >
                        <button
                          v-if="hasSubcategories(cat)"
                          type="button"
                          class="mr-2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          @click="toggleCategoryExpanded(cat.categoryId)"
                        >
                          <svg
                            class="h-4 w-4 transition-transform duration-200"
                            :class="{
                              'rotate-90': isCategoryExpanded(cat.categoryId),
                            }"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </button>
                        <span v-else class="w-5 mr-2"></span>
                        {{ cat.categoryName }}
                        <span
                          class="text-xs text-gray-400 dark:text-gray-500 ml-2"
                        >
                          ({{ cat.transactionCount }} tx)
                        </span>
                      </div>
                      <!-- Progress bar -->
                      <div
                        v-if="getBudgetForCategory(cat.categoryId) > 0"
                        class="w-full max-w-[200px] bg-gray-200 dark:bg-slate-700 rounded-full h-1.5 mt-2 ml-7"
                      >
                        <div
                          class="h-1.5 rounded-full transition-all duration-300"
                          :class="getProgressBarClass(cat)"
                          :style="{
                            width: `${Math.min(getUtilizationPercent(cat), 100)}%`,
                          }"
                        />
                      </div>
                    </td>
                    <td
                      class="py-3 text-right text-gray-700 dark:text-gray-300"
                    >
                      {{ formatCurrency(cat.averagePerMonth) }}
                    </td>
                    <td class="py-3">
                      <div class="flex flex-col items-center gap-1">
                        <div class="flex items-center gap-2">
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
                            class="p-1.5 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
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
                        <!-- Percentage adjustment buttons -->
                        <div
                          v-if="getBudgetForCategory(cat.categoryId) > 0"
                          class="flex items-center gap-1"
                        >
                          <button
                            v-for="adjust in [-10, -5, 5, 10]"
                            :key="adjust"
                            type="button"
                            class="px-1.5 py-0.5 text-xs font-medium rounded border transition-colors"
                            :class="
                              adjust > 0
                                ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                                : 'border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30'
                            "
                            @click="
                              adjustBudgetByPercent(cat.categoryId, adjust)
                            "
                          >
                            {{ adjust > 0 ? '+' : '' }}{{ adjust }}%
                          </button>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 text-center">
                      <span
                        v-if="getBudgetForCategory(cat.categoryId) > 0"
                        class="text-xs font-medium px-2 py-1 rounded"
                        :class="getUtilizationBadgeClass(cat)"
                      >
                        {{ Math.round(getUtilizationPercent(cat)) }}%
                      </span>
                      <span
                        v-else
                        class="text-xs text-gray-400 dark:text-gray-500"
                        >-</span
                      >
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
                  <!-- Subcategory rows -->
                  <template
                    v-if="
                      isCategoryExpanded(cat.categoryId) &&
                      hasSubcategories(cat)
                    "
                  >
                    <tr
                      v-for="sub in cat.subcategories"
                      :key="`${cat.categoryId}-${sub.subcategory}`"
                      class="bg-gray-50 dark:bg-slate-800/50"
                    >
                      <td class="py-2 pl-10">
                        <span class="text-sm text-gray-500 dark:text-gray-400">
                          {{ sub.subcategory || 'Sans sous-categorie' }}
                        </span>
                        <span
                          class="text-xs text-gray-400 dark:text-gray-500 ml-2"
                        >
                          ({{ sub.transactionCount }} tx)
                        </span>
                      </td>
                      <td
                        class="py-2 text-right text-sm text-gray-500 dark:text-gray-400"
                      >
                        {{ formatCurrency(sub.averagePerMonth) }}
                      </td>
                      <td colspan="3"></td>
                    </tr>
                  </template>
                </template>
              </tbody>
            </table>
          </div>

          <!-- Mobile cards -->
          <div class="sm:hidden space-y-4">
            <div
              v-for="cat in sortedExpenseCategories"
              :key="cat.categoryId"
              class="bg-gray-50 dark:bg-slate-800 rounded-lg p-4"
            >
              <!-- Header with category name and utilization badge -->
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <button
                    v-if="hasSubcategories(cat)"
                    type="button"
                    class="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    @click="toggleCategoryExpanded(cat.categoryId)"
                  >
                    <svg
                      class="h-4 w-4 transition-transform duration-200"
                      :class="{
                        'rotate-90': isCategoryExpanded(cat.categoryId),
                      }"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                  <span class="font-medium text-gray-900 dark:text-gray-100">{{
                    cat.categoryName
                  }}</span>
                  <span
                    v-if="getBudgetForCategory(cat.categoryId) > 0"
                    class="text-xs font-medium px-1.5 py-0.5 rounded"
                    :class="getUtilizationBadgeClass(cat)"
                  >
                    {{ Math.round(getUtilizationPercent(cat)) }}%
                  </span>
                </div>
                <span class="text-xs text-gray-400 dark:text-gray-500"
                  >({{ cat.transactionCount }} tx)</span
                >
              </div>

              <!-- Progress bar -->
              <div
                v-if="getBudgetForCategory(cat.categoryId) > 0"
                class="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2 mb-3"
              >
                <div
                  class="h-2 rounded-full transition-all duration-300"
                  :class="getProgressBarClass(cat)"
                  :style="{
                    width: `${Math.min(getUtilizationPercent(cat), 100)}%`,
                  }"
                />
              </div>

              <!-- Average display -->
              <div class="flex items-center justify-between mb-3">
                <span class="text-sm text-gray-500 dark:text-gray-400"
                  >Moyenne:</span
                >
                <span class="text-gray-700 dark:text-gray-300">{{
                  formatCurrency(cat.averagePerMonth)
                }}</span>
              </div>

              <!-- Budget input -->
              <div class="flex items-center gap-2 mb-2">
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

              <!-- Percentage adjustment buttons -->
              <div
                v-if="getBudgetForCategory(cat.categoryId) > 0"
                class="flex flex-wrap gap-1 mb-3"
              >
                <button
                  v-for="adjust in [-10, -5, 5, 10]"
                  :key="adjust"
                  type="button"
                  class="px-2.5 py-1.5 text-xs font-medium rounded min-h-[36px]"
                  :class="
                    adjust > 0
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700'
                  "
                  @click="adjustBudgetByPercent(cat.categoryId, adjust)"
                >
                  {{ adjust > 0 ? '+' : '' }}{{ adjust }}%
                </button>
              </div>

              <!-- Difference -->
              <div
                class="text-right pt-2 border-t border-gray-200 dark:border-slate-700"
              >
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

              <!-- Subcategories section (mobile) -->
              <div
                v-if="
                  isCategoryExpanded(cat.categoryId) && hasSubcategories(cat)
                "
                class="mt-3 pt-3 border-t border-gray-200 dark:border-slate-700 space-y-2"
              >
                <div
                  class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2"
                >
                  Sous-categories
                </div>
                <div
                  v-for="sub in cat.subcategories"
                  :key="`${cat.categoryId}-${sub.subcategory}-mobile`"
                  class="flex justify-between items-center text-sm pl-2"
                >
                  <span class="text-gray-600 dark:text-gray-400">
                    {{ sub.subcategory || 'Sans sous-categorie' }}
                    <span class="text-xs text-gray-400 dark:text-gray-500">
                      ({{ sub.transactionCount }} tx)
                    </span>
                  </span>
                  <span class="text-gray-500 dark:text-gray-400">
                    {{ formatCurrency(sub.averagePerMonth) }}/mois
                  </span>
                </div>
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
        <BudgetSavingsSummary
          :current-savings="currentSavings"
          :target-savings="targetSavings"
          :potential-gain="potentialGain"
          :savings-progress-percent="savingsProgressPercent"
        />
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
