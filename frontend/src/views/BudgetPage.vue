<script setup lang="ts">
  import { ref, computed, onMounted, watch } from 'vue'
  import { api } from '@/lib/api'
  import type {
    BudgetPlanDto,
    BudgetStatisticsDto,
    CategoryAverageDto,
  } from '@/lib/api'
  import { useFiltersStore } from '@/stores/filters'
  import { formatCurrency } from '@/lib/formatters'
  import BudgetSavingsSummary from '@/components/budget/BudgetSavingsSummary.vue'
  import MonthlyExpensesChart from '@/components/budget/MonthlyExpensesChart.vue'
  import SparklineChart from '@/components/budget/SparklineChart.vue'
  import MonthlyBarChart from '@/components/charts/MonthlyBarChart.vue'
  import NewBudgetPlanModal from '@/components/budget/NewBudgetPlanModal.vue'
  import BudgetPlansHistoryModal from '@/components/budget/BudgetPlansHistoryModal.vue'
  import ComparisonSelector from '@/components/budget/ComparisonSelector.vue'
  import {
    useBudgetComparison,
    type ComparisonPreset,
    type ComparisonRange,
  } from '@/composables/useBudgetComparison'

  const filtersStore = useFiltersStore()

  // ── Sort options ─────────────────────────────────────────────────────────
  type SortOrder = 'amount-desc' | 'amount-asc' | 'difference-desc' | 'alpha'
  const sortOptions: { value: SortOrder; label: string }[] = [
    { value: 'amount-desc', label: 'Dépense (décroissant)' },
    { value: 'amount-asc', label: 'Dépense (croissant)' },
    { value: 'difference-desc', label: 'Économie potentielle' },
    { value: 'alpha', label: 'Alphabétique' },
  ]

  // ── State ────────────────────────────────────────────────────────────────
  const plan = ref<BudgetPlanDto | null>(null)
  const statistics = ref<BudgetStatisticsDto | null>(null)
  const isLoading = ref(false)
  const isSaving = ref(false)
  const saveSuccess = ref(false)
  const error = ref<string | null>(null)

  // ── Comparison state ────────────────────────────────────────────────────
  const comparisonPreset = ref<ComparisonPreset>('none')
  const comparisonCustomStart = ref('')
  const comparisonCustomEnd = ref('')
  const comparisonRange = ref<ComparisonRange | null>(null)
  const yearAgoAvailable = ref(false)

  const deductReimbursements = ref(true)
  const deductPendingReimbursements = ref(false)

  const sortOrder = ref<SortOrder>('amount-desc')
  const budgetInputs = ref<Map<string, number>>(new Map())
  const expandedCategories = ref<Set<string>>(new Set())

  const isModalOpen = ref(false)
  const isHistoryOpen = ref(false)
  /** Total number of plans known to exist — drives the "Voir l'historique" hint on the empty state */
  const planCount = ref(0)

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  // ── Helpers ──────────────────────────────────────────────────────────────
  function formatDateLabel(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  type PlanStatus = 'past' | 'current' | 'future'

  function planStatus(p: BudgetPlanDto | null): PlanStatus | null {
    if (!p) return null
    const today = new Date()
    const todayUtc = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    ).getTime()
    const start = new Date(`${p.startDate}T00:00:00Z`).getTime()
    const end = new Date(`${p.endDate}T23:59:59Z`).getTime()
    if (todayUtc < start) return 'future'
    if (todayUtc > end) return 'past'
    return 'current'
  }

  function getBudgetForCategory(categoryId: string): number {
    return budgetInputs.value.get(categoryId) ?? 0
  }

  // Per-category numbers used across the new layout. Each function may
  // return 0 when no data is available — the caller decides whether to
  // hide the column based on context.
  function getHistoricalAverage(category: CategoryAverageDto): number {
    return comparison.comparisonAverage(category)
  }

  function getPlanActualAverage(category: CategoryAverageDto): number {
    return comparison.planActualAverage(category)
  }

  /** Budget − Historical: positive = the budget leaves room vs the past. */
  function getMarginVsHistorical(category: CategoryAverageDto): number {
    return (
      getBudgetForCategory(category.categoryId) - getHistoricalAverage(category)
    )
  }

  /** Budget − Réel à date: positive = budget unspent so far. */
  function getRemainingVsActual(category: CategoryAverageDto): number {
    return (
      getBudgetForCategory(category.categoryId) - getPlanActualAverage(category)
    )
  }

  /**
   * Status badge inline on the row, derived from the most actionable signal.
   * Priority: actual overshoot ⚠ > budget covers history ✓ > nothing.
   */
  function getRowStatus(
    category: CategoryAverageDto
  ): 'over' | 'covered' | 'none' {
    const budget = getBudgetForCategory(category.categoryId)
    if (budget <= 0) return 'none'
    const actual = getPlanActualAverage(category)
    if (showActualColumn.value && actual > budget) return 'over'
    const hist = getHistoricalAverage(category)
    if (showHistoricalColumn.value && hist > 0 && budget >= hist)
      return 'covered'
    return 'none'
  }

  /** Sort value depending on what's the meaningful primary metric. */
  function getSortAmount(category: CategoryAverageDto): number {
    if (showHistoricalColumn.value) return getHistoricalAverage(category)
    if (showActualColumn.value) return getPlanActualAverage(category)
    return getBudgetForCategory(category.categoryId)
  }

  function getPotentialEconomy(category: CategoryAverageDto): number {
    return (
      getHistoricalAverage(category) - getBudgetForCategory(category.categoryId)
    )
  }

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

  // ── Computed ─────────────────────────────────────────────────────────────
  const currentPlanStatus = computed(() => planStatus(plan.value))

  const statusBadge = computed(() => {
    const s = currentPlanStatus.value
    if (s === 'current')
      return {
        label: 'En cours',
        class:
          'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
      }
    if (s === 'future')
      return {
        label: 'À venir',
        class:
          'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
      }
    if (s === 'past')
      return {
        label: 'Terminé',
        class: 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400',
      }
    return null
  })

  // The comparison composable derives the wider date range, the month
  // zones, and per-category averages from the statistics response.
  const comparison = useBudgetComparison({
    plan,
    comparison: comparisonRange,
    statistics,
  })

  /** Show the "Historique" column when a comparison range is selected. */
  const showHistoricalColumn = computed(() => comparisonRange.value !== null)
  /** Show the "Réel à date" column only when ≥1 plan month is complete. */
  const showActualColumn = computed(
    () => comparison.completePlanMonthsCount.value > 0
  )

  /**
   * Grid template for the category list — adapts to which columns are
   * visible. Always: name (1fr) + budget + sparkline. Optional: historical,
   * actual.
   */
  const rowGridTemplate = computed(() => {
    const cols = ['1fr']
    if (showHistoricalColumn.value) cols.push('auto')
    cols.push('auto') // budget
    if (showActualColumn.value) cols.push('auto')
    cols.push('auto') // sparkline
    return cols.join(' ')
  })

  /** Effective date range to fetch — envelops plan + comparison. */
  const referenceDateRange = computed<{
    startDate: string
    endDate: string
  } | null>(() => comparison.widerRange.value)

  const visibleExpenseCategories = computed(
    () =>
      statistics.value?.expensesByCategory?.filter(
        cat => !filtersStore.isExpenseCategoryGloballyHidden(cat.categoryName)
      ) ?? []
  )

  const visibleIncomeCategories = computed(
    () =>
      statistics.value?.incomeByCategory?.filter(
        cat => !filtersStore.isIncomeCategoryGloballyHidden(cat.categoryName)
      ) ?? []
  )

  const sortedCategories = computed(() => {
    const cats = [...visibleExpenseCategories.value]
    switch (sortOrder.value) {
      case 'amount-desc':
        return cats.sort((a, b) => getSortAmount(b) - getSortAmount(a))
      case 'amount-asc':
        return cats.sort((a, b) => getSortAmount(a) - getSortAmount(b))
      case 'difference-desc':
        return cats.sort(
          (a, b) => getPotentialEconomy(b) - getPotentialEconomy(a)
        )
      case 'alpha':
        return cats.sort((a, b) =>
          a.categoryName.localeCompare(b.categoryName, 'fr')
        )
      default:
        return cats
    }
  })

  /** Plan-zone aggregates (income + expense averages). */
  const planAggregates = computed(() =>
    comparison.aggregatesFor(visibleExpenseCategories.value)
  )
  const planIncomeAggregates = computed(() =>
    comparison.incomeAggregates(visibleIncomeCategories.value)
  )

  const planIncomeAvg = computed(() => planIncomeAggregates.value.planIncomeAvg)

  /** Actual averages restricted to plan months that are complete. */
  const planActualExpenseAvg = computed(
    () => planAggregates.value.planActualExpenseAvg
  )
  const planActualIncomeAvg = computed(
    () => planIncomeAggregates.value.planActualIncomeAvg
  )

  /** Comparison-zone aggregates — null when no comparison selected. */
  const comparisonExpenseAvg = computed(
    () => planAggregates.value.comparisonExpenseAvg
  )
  const comparisonIncomeAvg = computed(
    () => planIncomeAggregates.value.comparisonIncomeAvg
  )
  const planToDateIncomeAvg = computed(
    () => planIncomeAggregates.value.planToDateIncomeAvg
  )

  /**
   * Monthly income reference for the chart's "Revenus" line, its tooltip
   * savings, and the savings summary's fallback block. Must NOT default to
   * `planIncomeAvg`: that divides observed income by the plan's FULL month
   * count (incl. future, income-less months), so a 7-month plan with 2 elapsed
   * months understates income ~3.5×. Preference order:
   *   1. average over fully-elapsed plan months (most accurate),
   *   2. the comparison average when a comparison is selected,
   *   3. average over started plan months (elapsed + current) — de-diluted,
   *   4. the raw plan average as a last resort.
   */
  const chartAverageIncome = computed(() => {
    if (planActualIncomeAvg.value > 0) return planActualIncomeAvg.value
    if (comparisonIncomeAvg.value > 0) return comparisonIncomeAvg.value
    if (planToDateIncomeAvg.value > 0) return planToDateIncomeAvg.value
    return planIncomeAvg.value
  })

  const totalBudget = computed(() => {
    let total = 0
    for (const cat of visibleExpenseCategories.value) {
      total += budgetInputs.value.get(cat.categoryId) ?? 0
    }
    return total
  })

  /**
   * Comparison props for the savings summary — null when no comparison is set.
   */
  const summaryComparisonProps = computed(() => {
    if (!comparisonRange.value) return null
    return {
      label: comparisonRange.value.label,
      incomeAvg: comparisonIncomeAvg.value,
      expenseAvg: comparisonExpenseAvg.value,
    }
  })

  const monthlyTotalExpenses = computed(() => {
    const cats = visibleExpenseCategories.value
    if (cats.length === 0) return []
    const len = Math.max(...cats.map(c => c.monthlyAmounts?.length ?? 0))
    if (len === 0) return []
    const totals: number[] = new Array(len).fill(0)
    for (const cat of cats) {
      if (!cat.monthlyAmounts) continue
      for (let i = 0; i < cat.monthlyAmounts.length; i++) {
        const current = totals[i] ?? 0
        totals[i] = current + (cat.monthlyAmounts[i] ?? 0)
      }
    }
    return totals.map(v => Math.round(v * 100) / 100)
  })

  const MONTH_LABEL_FR: Record<string, string> = {
    '01': 'Jan',
    '02': 'Fév',
    '03': 'Mar',
    '04': 'Avr',
    '05': 'Mai',
    '06': 'Juin',
    '07': 'Juil',
    '08': 'Août',
    '09': 'Sep',
    '10': 'Oct',
    '11': 'Nov',
    '12': 'Déc',
  }

  function categoryChartData(cat: CategoryAverageDto) {
    const labels = (statistics.value?.monthLabels ?? []).map(ym => {
      const [, m] = ym.split('-')
      return MONTH_LABEL_FR[m ?? ''] ?? ym
    })
    return { labels, values: cat.monthlyAmounts ?? [] }
  }

  // ── Data loading ─────────────────────────────────────────────────────────
  async function fetchPlan() {
    plan.value = await api.getCurrentBudgetPlan()
    budgetInputs.value = new Map(
      (plan.value?.entries ?? []).map(e => [e.categoryId, e.amount])
    )
  }

  async function fetchStatistics() {
    const range = referenceDateRange.value
    if (!range) {
      statistics.value = null
      return
    }
    statistics.value = await api.getBudgetStatistics({
      startDate: range.startDate,
      endDate: range.endDate,
      deductReimbursements: deductReimbursements.value,
      deductPendingReimbursements: deductPendingReimbursements.value,
      includeMonthlyBreakdown: true,
    })
  }

  async function fetchPlanCount() {
    try {
      const summaries = await api.getBudgetPlans()
      planCount.value = summaries.length
    } catch {
      // Non-fatal — the count is just used to decide whether to show the
      // "Voir l'historique" hint, the rest of the page still renders.
    }
  }

  /**
   * Lightweight check: do we have any transaction data for the same window
   * one year before the plan? Drives whether the "Année dernière" preset is
   * offered in the comparison selector. One extra API call, fired once after
   * the plan is loaded.
   */
  async function checkYearAgoAvailability() {
    if (!plan.value) {
      yearAgoAvailable.value = false
      return
    }
    const planStart = plan.value.startDate.split('-')
    const planEnd = plan.value.endDate.split('-')
    const startYear = Number(planStart[0]) - 1
    const endYear = Number(planEnd[0]) - 1
    const start = `${startYear}-${planStart[1]}-${planStart[2]}`
    const end = `${endYear}-${planEnd[1]}-${planEnd[2]}`
    try {
      const stats = await api.getBudgetStatistics({
        startDate: start,
        endDate: end,
        deductReimbursements: false,
        deductPendingReimbursements: false,
        includeMonthlyBreakdown: false,
      })
      yearAgoAvailable.value = stats.totalExpenses > 0 || stats.totalIncome > 0
    } catch {
      yearAgoAvailable.value = false
    }
  }

  async function fetchData() {
    isLoading.value = true
    error.value = null
    try {
      await fetchPlan()
      await Promise.all([
        fetchStatistics(),
        fetchPlanCount(),
        checkYearAgoAvailability(),
      ])
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Erreur lors du chargement'
    } finally {
      isLoading.value = false
    }
  }

  async function onPlanDeleted(deletedId: string) {
    planCount.value = Math.max(0, planCount.value - 1)
    if (plan.value?.id !== deletedId) return

    // The displayed plan was the one that got deleted: clear local state
    // and try to fall back to whichever plan covers today.
    plan.value = null
    statistics.value = null
    budgetInputs.value = new Map()
    expandedCategories.value = new Set()

    isLoading.value = true
    error.value = null
    try {
      await fetchPlan()
      await fetchStatistics()
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Erreur lors du rechargement'
    } finally {
      isLoading.value = false
    }
  }

  async function loadPlanById(planId: string) {
    if (plan.value?.id === planId) {
      isHistoryOpen.value = false
      return
    }
    isLoading.value = true
    error.value = null
    try {
      const loaded = await api.getBudgetPlan(planId)
      plan.value = loaded
      budgetInputs.value = new Map(
        loaded.entries.map(e => [e.categoryId, e.amount])
      )
      isHistoryOpen.value = false
      await Promise.all([fetchStatistics(), checkYearAgoAvailability()])
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Erreur lors du chargement du plan'
    } finally {
      isLoading.value = false
    }
  }

  function openCreateModal() {
    error.value = null
    isModalOpen.value = true
  }

  async function onPlanCreated(created: BudgetPlanDto) {
    plan.value = created
    budgetInputs.value = new Map(
      created.entries.map(e => [e.categoryId, e.amount])
    )
    isModalOpen.value = false
    planCount.value++
    await Promise.all([fetchStatistics(), checkYearAgoAvailability()])
  }

  // ── Save (debounced) ─────────────────────────────────────────────────────
  function triggerAutoSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void saveBudget()
    }, 600)
  }

  async function saveBudget() {
    if (!plan.value) return
    const entries = Array.from(budgetInputs.value.entries())
      .filter(([, amount]) => amount > 0)
      .map(([categoryId, amount]) => ({ categoryId, amount }))
    try {
      isSaving.value = true
      const updated = await api.updateBudgetPlan(plan.value.id, { entries })
      plan.value = updated
      saveSuccess.value = true
      setTimeout(() => {
        saveSuccess.value = false
      }, 2000)
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Erreur lors de la sauvegarde'
    } finally {
      isSaving.value = false
    }
  }

  function updateBudgetInput(categoryId: string, value: string) {
    const num = parseFloat(value)
    budgetInputs.value.set(categoryId, Number.isFinite(num) ? num : 0)
    triggerAutoSave()
  }

  /** Apply an arbitrary amount to a category's budget input. */
  function setBudgetValue(categoryId: string, amount: number) {
    budgetInputs.value.set(categoryId, Math.round(amount))
    triggerAutoSave()
  }

  /** "Apply all averages" — prefer historical if available, else actual. */
  function applyAverageToAll() {
    for (const cat of visibleExpenseCategories.value) {
      const ref = showHistoricalColumn.value
        ? getHistoricalAverage(cat)
        : getPlanActualAverage(cat)
      if (ref > 0) {
        budgetInputs.value.set(cat.categoryId, Math.round(ref))
      }
    }
    triggerAutoSave()
  }

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

  function resetAllBudgets() {
    budgetInputs.value.clear()
    triggerAutoSave()
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  onMounted(() => {
    void fetchData()
  })

  watch(
    [comparisonRange, deductReimbursements, deductPendingReimbursements],
    () => {
      if (!plan.value) return
      void fetchStatistics()
    }
  )
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-slate-800 py-8 transition-colors">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6"
      >
        <div>
          <h1
            class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100"
          >
            Budget
          </h1>
          <p
            v-if="plan"
            class="mt-1 text-sm sm:text-base text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-x-1.5 gap-y-1"
          >
            <span class="font-medium text-gray-900 dark:text-gray-100">
              {{ plan.name }}
            </span>
            <span
              v-if="statusBadge"
              :data-testid="`plan-status-${currentPlanStatus}`"
              class="px-2 py-0.5 text-[11px] font-medium rounded-full"
              :class="statusBadge.class"
            >
              {{ statusBadge.label }}
            </span>
            <span class="text-gray-300 dark:text-gray-600">·</span>
            <span>
              {{ formatDateLabel(plan.startDate) }} →
              {{ formatDateLabel(plan.endDate) }}
            </span>
            <span class="text-gray-400 dark:text-gray-500">
              ({{ plan.monthCount }} mois)
            </span>
          </p>
          <p
            v-else-if="!isLoading"
            class="mt-1 text-sm sm:text-base text-gray-600 dark:text-gray-400"
          >
            Aucun budget en cours.
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            v-if="planCount > 0"
            type="button"
            data-testid="header-history-button"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            @click="isHistoryOpen = true"
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
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Historique
          </button>
          <button
            type="button"
            data-testid="header-new-plan-button"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors"
            @click="openCreateModal"
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            Nouveau budget
          </button>
        </div>

        <!-- Save indicator -->
        <div
          v-if="plan && (isSaving || saveSuccess)"
          class="flex items-center gap-2 text-sm shrink-0"
          aria-live="polite"
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
            <span class="text-gray-500 dark:text-gray-400">Sauvegarde…</span>
          </template>
          <template v-else>
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
            <span class="text-emerald-600 dark:text-emerald-400">
              Sauvegardé
            </span>
          </template>
        </div>
      </div>

      <!-- Error banner -->
      <div
        v-if="error"
        class="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm"
      >
        {{ error }}
      </div>

      <!-- Initial loading -->
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
          <span>Chargement…</span>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="!plan"
        data-testid="budget-empty-state"
        class="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-8 text-center"
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
            d="M9 7h6m-6 4h6m-6 4h6m-9 4h12a2 2 0 002-2V5a2 2 0 00-2-2H6a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
        <h2 class="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Aucun budget en cours
        </h2>
        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Crée un budget pour commencer à suivre tes dépenses prévues.
        </p>
        <div class="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            data-testid="empty-create-button"
            class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors"
            @click="openCreateModal"
          >
            Créer un budget
          </button>
          <button
            v-if="planCount > 0"
            type="button"
            data-testid="empty-history-button"
            class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            @click="isHistoryOpen = true"
          >
            Voir l'historique ({{ planCount }})
          </button>
        </div>
      </div>

      <!-- Plan content -->
      <template v-else>
        <!-- Filters card: reference period + reimbursement toggles -->
        <div
          data-testid="budget-filters-card"
          class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 border border-gray-200 dark:border-slate-700 p-4 sm:p-5 mb-6"
        >
          <div class="flex flex-col gap-3">
            <ComparisonSelector
              :plan="plan"
              :year-ago-available="yearAgoAvailable"
              :preset="comparisonPreset"
              :custom-start-date="comparisonCustomStart"
              :custom-end-date="comparisonCustomEnd"
              @update:preset="comparisonPreset = $event"
              @update:custom-start-date="comparisonCustomStart = $event"
              @update:custom-end-date="comparisonCustomEnd = $event"
              @update:range="comparisonRange = $event"
            />

            <div
              class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6 pt-3 border-t border-gray-100 dark:border-slate-700"
            >
              <button
                type="button"
                role="switch"
                :aria-checked="deductReimbursements"
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
        </div>

        <!-- Monthly expenses chart -->
        <div
          v-if="monthlyTotalExpenses.length >= 2 && statistics?.monthLabels"
          class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-4 sm:p-6 mb-6"
        >
          <h2
            class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1"
          >
            Évolution des dépenses mensuelles
          </h2>
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Lignes de référence : revenus moyens et budget total alloué.
          </p>
          <MonthlyExpensesChart
            :monthly-totals="monthlyTotalExpenses"
            :month-labels="statistics.monthLabels"
            :average-income="chartAverageIncome"
            :total-budget="totalBudget"
            :plan-start-month="plan.startDate.slice(0, 7)"
            :plan-end-month="plan.endDate.slice(0, 7)"
            :comparison-start-month="comparisonRange?.startMonth ?? ''"
            :comparison-end-month="comparisonRange?.endMonth ?? ''"
          />
        </div>

        <!-- Savings summary -->
        <div class="mb-6">
          <BudgetSavingsSummary
            :plan-label="plan.name"
            :plan-income-avg="chartAverageIncome"
            :plan-budget-total="totalBudget"
            :plan-actual-expense-avg="planActualExpenseAvg"
            :plan-actual-income-avg="planActualIncomeAvg"
            :complete-plan-months-count="
              comparison.completePlanMonthsCount.value
            "
            :is-plan-finished="comparison.isPlanFinished.value"
            :comparison="summaryComparisonProps"
          />
        </div>

        <!-- Expense category list -->
        <div
          class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 border border-gray-200 dark:border-slate-700 p-4 sm:p-5"
        >
          <div
            class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3"
          >
            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Dépenses par catégorie
            </h2>
            <div class="flex items-center gap-2">
              <label class="text-sm text-gray-500 dark:text-gray-400 shrink-0">
                Trier :
              </label>
              <select
                v-model="sortOrder"
                class="text-sm border border-gray-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
              >
                <option
                  v-for="opt in sortOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- Quick actions -->
          <div
            class="flex flex-wrap items-center gap-2 mb-4 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg"
          >
            <span class="text-xs text-gray-500 dark:text-gray-400 mr-1">
              Actions rapides :
            </span>
            <button
              type="button"
              class="px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
              @click="applyAverageToAll"
            >
              Appliquer toutes les moyennes
            </button>
            <button
              type="button"
              class="px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
              @click="adjustAllByPercent(-5)"
            >
              −5%
            </button>
            <button
              type="button"
              class="px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
              @click="adjustAllByPercent(5)"
            >
              +5%
            </button>
            <button
              type="button"
              class="ml-auto px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-200 dark:hover:border-red-800 rounded-md transition-colors"
              @click="resetAllBudgets"
            >
              Réinitialiser
            </button>
          </div>

          <!-- Column-count CSS variable drives both header & row grids so
               the table adapts to which columns are visible. -->
          <div
            class="hidden sm:grid gap-x-6 px-4 pb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-slate-700"
            :style="{
              '--row-grid': rowGridTemplate,
              gridTemplateColumns: 'var(--row-grid)',
            }"
          >
            <span>Catégorie</span>
            <span
              v-if="showHistoricalColumn"
              class="text-right text-indigo-600 dark:text-indigo-400"
            >
              Historique
              <span
                class="block text-[10px] font-normal normal-case tracking-normal text-indigo-400 dark:text-indigo-500"
              >
                {{ comparisonRange?.label }}
              </span>
            </span>
            <span class="text-right text-emerald-700 dark:text-emerald-400">
              Budget
              <span
                class="block text-[10px] font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500"
              >
                /mois
              </span>
            </span>
            <span
              v-if="showActualColumn"
              class="text-right text-red-600 dark:text-red-400"
            >
              Réel à date
              <span
                class="block text-[10px] font-normal normal-case tracking-normal text-red-400 dark:text-red-500"
              >
                {{ comparison.completePlanMonthsCount.value }} mois plan
              </span>
            </span>
            <span class="text-right w-24">Tendance</span>
          </div>

          <!-- Empty list -->
          <div
            v-if="sortedCategories.length === 0"
            class="py-12 text-center text-sm text-gray-500 dark:text-gray-400"
          >
            Aucune catégorie de dépense sur cette période.
          </div>

          <!-- Category rows -->
          <div v-else class="divide-y divide-gray-100 dark:divide-slate-700">
            <div
              v-for="cat in sortedCategories"
              :key="cat.categoryId"
              :data-testid="`budget-row-${cat.categoryName}`"
            >
              <!-- Row -->
              <div
                class="grid grid-cols-2 sm:[grid-template-columns:var(--row-grid)] sm:gap-x-6 gap-x-4 gap-y-2 sm:gap-y-0 items-center py-4 px-4 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
                :style="{ '--row-grid': rowGridTemplate }"
              >
                <!-- Name + chevron + status badge -->
                <button
                  type="button"
                  class="col-span-2 sm:col-span-1 flex items-center gap-2 min-w-0 text-left"
                  :aria-expanded="isCategoryExpanded(cat.categoryId)"
                  @click="toggleCategoryExpanded(cat.categoryId)"
                >
                  <svg
                    class="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform"
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
                  <span v-if="cat.categoryIcon" class="text-lg shrink-0">
                    {{ cat.categoryIcon }}
                  </span>
                  <span
                    class="font-medium text-gray-900 dark:text-gray-100 truncate"
                  >
                    {{ cat.categoryName }}
                  </span>
                  <!-- Status badge: over budget ⚠ or budget covers history ✓ -->
                  <span
                    v-if="getRowStatus(cat) === 'over'"
                    class="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded shrink-0 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                    title="Dépassement par rapport au budget"
                  >
                    ⚠ Dépassé
                  </span>
                  <span
                    v-else-if="getRowStatus(cat) === 'covered'"
                    class="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded shrink-0 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                    title="Le budget couvre la moyenne historique"
                  >
                    ✓ Couvert
                  </span>
                </button>

                <!-- Historique (conditional) -->
                <div
                  v-if="showHistoricalColumn"
                  class="sm:text-right text-sm tabular-nums leading-tight"
                >
                  <span class="sm:hidden text-xs text-gray-400 mr-1">
                    Historique :
                  </span>
                  <button
                    v-if="getHistoricalAverage(cat) > 0"
                    type="button"
                    class="text-indigo-600 dark:text-indigo-400 font-medium hover:underline decoration-dotted underline-offset-2"
                    :title="`Moyenne sur ${comparisonRange?.label} — cliquer pour appliquer comme budget`"
                    @click="
                      setBudgetValue(cat.categoryId, getHistoricalAverage(cat))
                    "
                  >
                    {{ formatCurrency(getHistoricalAverage(cat)) }}
                  </button>
                  <span v-else class="text-gray-400 dark:text-gray-500">—</span>
                </div>

                <!-- Budget input (emerald engagement) -->
                <div class="sm:text-right">
                  <div class="relative inline-block">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      :value="
                        getBudgetForCategory(cat.categoryId) > 0
                          ? getBudgetForCategory(cat.categoryId)
                          : ''
                      "
                      placeholder="—"
                      :data-testid="`budget-input-${cat.categoryName}`"
                      class="w-24 sm:w-28 pl-2 pr-7 py-1.5 text-sm text-right bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 dark:text-gray-100 tabular-nums font-medium"
                      @input="
                        updateBudgetInput(
                          cat.categoryId,
                          ($event.target as HTMLInputElement).value
                        )
                      "
                    />
                    <span
                      class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-emerald-500/70 dark:text-emerald-400/70 pointer-events-none"
                    >
                      €
                    </span>
                  </div>
                </div>

                <!-- Réel à date (conditional) -->
                <div
                  v-if="showActualColumn"
                  class="sm:text-right text-sm tabular-nums leading-tight"
                >
                  <span class="sm:hidden text-xs text-gray-400 mr-1">
                    Réel :
                  </span>
                  <button
                    v-if="getPlanActualAverage(cat) > 0"
                    type="button"
                    class="text-red-600 dark:text-red-400 font-medium hover:underline decoration-dotted underline-offset-2"
                    title="Moyenne réelle sur les mois complets du plan — cliquer pour appliquer comme budget"
                    @click="
                      setBudgetValue(cat.categoryId, getPlanActualAverage(cat))
                    "
                  >
                    {{ formatCurrency(getPlanActualAverage(cat)) }}
                  </button>
                  <span v-else class="text-gray-400 dark:text-gray-500">—</span>
                </div>

                <!-- Sparkline -->
                <div class="hidden sm:flex justify-end items-center w-24">
                  <SparklineChart
                    v-if="(cat.monthlyAmounts?.length ?? 0) >= 2"
                    :data="cat.monthlyAmounts ?? []"
                    color="#ef4444"
                  />
                </div>
              </div>

              <!-- Drill-down panel -->
              <div
                v-if="isCategoryExpanded(cat.categoryId)"
                class="bg-gray-50 dark:bg-slate-800/40 px-4 py-5 border-t border-gray-100 dark:border-slate-700 space-y-5"
              >
                <!-- Margin / remaining quick summary -->
                <div
                  v-if="
                    getBudgetForCategory(cat.categoryId) > 0 &&
                    (showHistoricalColumn || showActualColumn)
                  "
                  class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm"
                  :data-testid="`budget-row-detail-${cat.categoryName}`"
                >
                  <div
                    v-if="showHistoricalColumn"
                    class="rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 p-3"
                  >
                    <div
                      class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1"
                    >
                      Marge vs historique
                    </div>
                    <div
                      class="text-lg font-bold tabular-nums"
                      :class="
                        getMarginVsHistorical(cat) > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : getMarginVsHistorical(cat) < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-500'
                      "
                    >
                      {{ getMarginVsHistorical(cat) > 0 ? '+' : ''
                      }}{{ formatCurrency(getMarginVsHistorical(cat)) }}
                    </div>
                    <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      <template v-if="getMarginVsHistorical(cat) > 0">
                        Budget plus généreux que la moyenne passée
                      </template>
                      <template v-else-if="getMarginVsHistorical(cat) < 0">
                        Budget plus serré que la moyenne passée
                      </template>
                      <template v-else>
                        Budget aligné sur la moyenne passée
                      </template>
                    </p>
                  </div>
                  <div
                    v-if="showActualColumn"
                    class="rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 p-3"
                  >
                    <div
                      class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1"
                    >
                      Reste à dépenser
                    </div>
                    <div
                      class="text-lg font-bold tabular-nums"
                      :class="
                        getRemainingVsActual(cat) > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : getRemainingVsActual(cat) < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-500'
                      "
                    >
                      {{ getRemainingVsActual(cat) > 0 ? '+' : ''
                      }}{{ formatCurrency(getRemainingVsActual(cat)) }}
                    </div>
                    <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      <template v-if="getRemainingVsActual(cat) > 0">
                        Marge disponible vs la moyenne réelle
                      </template>
                      <template v-else-if="getRemainingVsActual(cat) < 0">
                        Dépassement par rapport au budget
                      </template>
                      <template v-else>Budget pile consommé</template>
                    </p>
                  </div>
                </div>

                <!-- Subcategories -->
                <div v-if="cat.subcategories && cat.subcategories.length > 0">
                  <h3
                    class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2"
                  >
                    Sous-catégories
                  </h3>
                  <div class="space-y-1">
                    <div
                      v-for="sub in cat.subcategories"
                      :key="sub.subcategory || '(sans sous-catégorie)'"
                      class="flex items-center gap-3 px-3 py-1.5 rounded text-sm bg-white dark:bg-slate-900"
                    >
                      <span
                        class="flex-1 truncate text-gray-700 dark:text-gray-300"
                      >
                        {{ sub.subcategory || '(sans sous-catégorie)' }}
                      </span>
                      <span
                        class="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0"
                      >
                        {{ sub.transactionCount }} tx
                      </span>
                      <span
                        class="font-medium text-gray-900 dark:text-gray-100 tabular-nums shrink-0"
                      >
                        {{ formatCurrency(sub.totalAmount) }}
                      </span>
                      <span
                        class="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0 hidden sm:inline"
                      >
                        {{ formatCurrency(sub.averagePerMonth) }}/mois
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Monthly evolution chart -->
                <div v-if="(cat.monthlyAmounts?.length ?? 0) >= 2">
                  <h3
                    class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2"
                  >
                    Évolution mensuelle
                  </h3>
                  <MonthlyBarChart
                    :data="categoryChartData(cat)"
                    :title="cat.categoryName"
                    color="#ef4444"
                  />
                </div>

                <!-- Reimbursement info -->
                <div
                  v-if="cat.reimbursement || cat.pendingReimbursement"
                  class="mt-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400"
                >
                  <span v-if="cat.reimbursement">
                    Remboursements reçus déduits :
                    <strong class="text-gray-700 dark:text-gray-300">
                      {{ formatCurrency(cat.reimbursement) }}
                    </strong>
                  </span>
                  <span v-if="cat.pendingReimbursement">
                    En attente déduits :
                    <strong class="text-gray-700 dark:text-gray-300">
                      {{ formatCurrency(cat.pendingReimbursement) }}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <NewBudgetPlanModal
      :open="isModalOpen"
      @close="isModalOpen = false"
      @created="onPlanCreated"
    />

    <BudgetPlansHistoryModal
      :open="isHistoryOpen"
      :active-plan-id="plan?.id ?? null"
      @close="isHistoryOpen = false"
      @select="loadPlanById"
      @deleted="onPlanDeleted"
    />
  </div>
</template>
