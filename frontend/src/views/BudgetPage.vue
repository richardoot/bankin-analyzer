<script setup lang="ts">
  import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
  import { api } from '@/lib/api'
  import type {
    BudgetPlanDto,
    BudgetStatisticsDto,
    CategoryAverageDto,
    TagBudgetSummaryDto,
    TagDto,
  } from '@/lib/api'
  import { useFiltersStore } from '@/stores/filters'
  import BudgetSavingsSummary from '@/components/budget/BudgetSavingsSummary.vue'
  import MonthlyExpensesChart from '@/components/budget/MonthlyExpensesChart.vue'
  import NewBudgetPlanModal from '@/components/budget/NewBudgetPlanModal.vue'
  import BudgetPlansHistoryModal from '@/components/budget/BudgetPlansHistoryModal.vue'
  import BudgetPlanHeader from '@/components/budget/BudgetPlanHeader.vue'
  import BudgetProjectsSection from '@/components/budget/BudgetProjectsSection.vue'
  import BudgetCategoryRow from '@/components/budget/BudgetCategoryRow.vue'
  import BudgetTableControls from '@/components/budget/BudgetTableControls.vue'
  import BudgetEditBar from '@/components/budget/BudgetEditBar.vue'
  import { type SortOrder } from '@/components/budget/sortOptions'
  import { planStatus } from '@/components/budget/planStatus'
  import BudgetMonthlyMatrix from '@/components/budget/BudgetMonthlyMatrix.vue'
  import type {
    MatrixMonth,
    MatrixRow,
  } from '@/components/budget/BudgetMonthlyMatrix.vue'
  import ComparisonSelector from '@/components/budget/ComparisonSelector.vue'
  import {
    useBudgetComparison,
    type BreakdownMode,
    type ComparisonPreset,
    type ComparisonRange,
  } from '@/composables/useBudgetComparison'
  import { useRouter, onBeforeRouteLeave } from 'vue-router'

  const filtersStore = useFiltersStore()
  const router = useRouter()

  // Real vs everyday tracking, persisted so the choice survives a reload.
  // Defaults to everyday: a holiday inside the plan must not read as an
  // overrun of the recurring budget.
  const BREAKDOWN_MODE_KEY = 'budget-breakdown-mode'
  const breakdownMode = ref<BreakdownMode>(
    localStorage.getItem(BREAKDOWN_MODE_KEY) === 'real' ? 'real' : 'everyday'
  )

  function setBreakdownMode(mode: BreakdownMode): void {
    breakdownMode.value = mode
    try {
      localStorage.setItem(BREAKDOWN_MODE_KEY, mode)
    } catch {
      // Private browsing: the choice simply does not persist.
    }
  }

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

  /**
   * The envelopes being edited. Until "Enregistrer" is pressed this is a
   * draft: `savedBudgets` holds what the server actually has, which is what
   * "Annuler" restores and what the modified-count is measured against.
   */
  const budgetInputs = ref<Map<string, number>>(new Map())
  const savedBudgets = ref<Map<string, number>>(new Map())
  const isEditing = ref(false)

  /**
   * The plan month the page is reading, or null for the average over every
   * complete month. Not persisted: which month you want to look at is a
   * question of the moment, unlike the breakdown mode.
   */
  const selectedMonth = ref<string | null>(null)

  const expandedCategories = ref<Set<string>>(new Set())

  /** Exceptional tags owned by the user, for the events band. */
  const exceptionalTags = ref<TagDto[]>([])

  /** Projects overlapping the plan, with spend vs envelope. */
  const projects = ref<TagBudgetSummaryDto | null>(null)

  const isModalOpen = ref(false)
  const isHistoryOpen = ref(false)
  /** Total number of plans known to exist — drives the "Voir l'historique" hint on the empty state */
  const planCount = ref(0)

  // ── Helpers ──────────────────────────────────────────────────────────────
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

  /**
   * Exceptional share of the row's "Réel à date". Shown as an annotation in
   * both modes: in everyday it is what was left out, in real it is what
   * inflates the figure. Either way the money stays visible.
   */
  function getExceptionalAverage(category: CategoryAverageDto): number {
    return comparison.planActualExceptionalAverage(category)
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
  // The comparison composable derives the wider date range, the month
  // zones, and per-category averages from the statistics response.
  const comparison = useBudgetComparison({
    plan,
    comparison: comparisonRange,
    statistics,
    mode: breakdownMode,
    selectedMonth,
  })

  /** Show the "Historique" column when a comparison range is selected. */
  const showHistoricalColumn = computed(() => comparisonRange.value !== null)
  /**
   * Show the "Réel" column as soon as there is a month to read. Isolating the
   * running month counts: it carries real spending even though it would never
   * qualify as a complete month.
   */
  const showActualColumn = computed(
    () => comparison.actualIndices.value.length > 0
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
        cat => !filtersStore.isExpenseCategoryGloballyHidden(cat.categoryId)
      ) ?? []
  )

  const visibleIncomeCategories = computed(
    () =>
      statistics.value?.incomeByCategory?.filter(
        cat => !filtersStore.isIncomeCategoryGloballyHidden(cat.categoryId)
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
      const series = comparison.seriesFor(cat)
      if (!series) continue
      for (let i = 0; i < series.length; i++) {
        const current = totals[i] ?? 0
        totals[i] = current + (series[i] ?? 0)
      }
    }
    return totals.map(v => Math.round(v * 100) / 100)
  })

  /**
   * True when at least one visible category carries exceptional spending in
   * the elapsed plan months — drives whether the mode selector is offered.
   */
  const hasExceptionalInPlan = computed(() =>
    visibleExpenseCategories.value.some(c => getExceptionalAverage(c) > 0.005)
  )

  /**
   * Exceptional events whose declared period overlaps the analysed window.
   * Tags without a period (a party at home) cannot be placed in time and are
   * therefore not listed — their spending still shows in the row annotations.
   */
  const planEvents = computed(() => {
    const range = referenceDateRange.value
    if (!range) return []
    return exceptionalTags.value.filter(t => {
      if (!t.eventStartDate || !t.eventEndDate) return false
      return (
        t.eventStartDate <= range.endDate && t.eventEndDate >= range.startDate
      )
    })
  })

  function openTagAnalysis(tagId: string): void {
    void router.push(`/tags/${tagId}`)
  }

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

  const MONTH_FULL_FR: Record<string, string> = {
    '01': 'Janvier',
    '02': 'Février',
    '03': 'Mars',
    '04': 'Avril',
    '05': 'Mai',
    '06': 'Juin',
    '07': 'Juillet',
    '08': 'Août',
    '09': 'Septembre',
    '10': 'Octobre',
    '11': 'Novembre',
    '12': 'Décembre',
  }

  /** "2026-08" → "Août 2026". */
  function monthLabelFor(ym: string): string {
    const [year, month] = ym.split('-')
    return `${MONTH_FULL_FR[month ?? ''] ?? ym} ${year ?? ''}`.trim()
  }

  /**
   * The months the user can isolate, newest last, each flagged when it is the
   * one still running — that month is worth offering (it is the one being
   * lived) but must never be read as a finished month.
   */
  const monthOptions = computed(() =>
    comparison.selectableMonths.value.map(ym => ({
      ym,
      short: `${MONTH_LABEL_FR[ym.split('-')[1] ?? ''] ?? ym}`,
      full: monthLabelFor(ym),
      isRunning: ym === currentYearMonth(),
    }))
  )

  function currentYearMonth(): string {
    const today = new Date()
    return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`
  }

  function selectMonth(ym: string | null): void {
    selectedMonth.value = ym
  }

  /**
   * A bar was clicked. Comparison and future months are on the same chart and
   * have no per-month reading to offer, so they are ignored rather than
   * selected into an empty view. Clicking the month already isolated releases
   * it — the same click that got you in gets you out.
   */
  function onChartMonthSelected(ym: string): void {
    if (!comparison.selectableMonths.value.includes(ym)) return
    selectedMonth.value = selectedMonth.value === ym ? null : ym
  }

  /** Label describing what the "Réel" figures currently cover. */
  const actualPeriodLabel = computed(() => {
    const progress = comparison.selectedMonthProgress.value
    if (selectedMonth.value && comparison.selectedMonthIndex.value !== null) {
      const label = monthLabelFor(selectedMonth.value)
      return progress
        ? `${label} · en cours, ${progress.elapsedDays}/${progress.totalDays} j`
        : label
    }
    const count = comparison.completePlanMonthsCount.value
    return `Moyenne · ${count} mois complet${count > 1 ? 's' : ''}`
  })

  /**
   * A budget's fair share of the running month, shown next to the envelope so
   * a half-finished month can be judged on pace rather than on a total it was
   * never going to reach by now. Null whenever the month is complete — there
   * is nothing to prorate then, and the envelope stands as it is.
   */
  function getProratedBudget(categoryId: string): number | null {
    const progress = comparison.selectedMonthProgress.value
    if (!progress) return null
    const budget = getBudgetForCategory(categoryId)
    if (budget <= 0) return null
    return (budget * progress.elapsedDays) / progress.totalDays
  }

  /**
   * The month-by-month grid. Built here rather than in the component so the
   * amounts go through the same `seriesFor` as every other figure on the page
   * — the everyday/real toggle must not stop at the table's edge.
   */
  const matrixMonths = computed<MatrixMonth[]>(() =>
    monthOptions.value.map(option => ({
      ym: option.ym,
      label: option.short,
      isRunning: option.isRunning,
    }))
  )

  const matrixRows = computed<MatrixRow[]>(() => {
    const indices = comparison.selectableMonths.value.map(ym =>
      comparison.monthLabels.value.indexOf(ym)
    )
    return sortedCategories.value.map(cat => {
      const series = comparison.seriesFor(cat)
      return {
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        categoryIcon: cat.categoryIcon ?? null,
        budget: getBudgetForCategory(cat.categoryId),
        amounts: indices.map(i => (i >= 0 ? (series?.[i] ?? 0) : 0)),
      }
    })
  })

  /** One column is just the row list again — the grid earns its space at two. */
  const showMonthlyMatrix = computed(() => matrixMonths.value.length >= 2)

  function categoryChartData(cat: CategoryAverageDto) {
    const labels = (statistics.value?.monthLabels ?? []).map(ym => {
      const [, m] = ym.split('-')
      return MONTH_LABEL_FR[m ?? ''] ?? ym
    })
    return { labels, values: comparison.seriesFor(cat) ?? [] }
  }

  // ── Data loading ─────────────────────────────────────────────────────────
  async function fetchPlan() {
    plan.value = await api.getCurrentBudgetPlan()
    adoptPlanEntries(plan.value)
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

  /**
   * Exceptional tags, used to name the events behind the amber annotations.
   * Non-fatal: without them the amounts still show, only the links are lost.
   */
  async function fetchExceptionalTags() {
    try {
      const tags = await api.getTags()
      exceptionalTags.value = tags.filter(t => t.isExceptional)
    } catch {
      exceptionalTags.value = []
    }
  }

  /** Projects overlapping the plan, weighed against their envelopes. */
  async function fetchProjects() {
    if (!plan.value) {
      projects.value = null
      return
    }
    try {
      projects.value = await api.getTagBudgetSummary({
        startDate: plan.value.startDate,
        endDate: plan.value.endDate,
      })
    } catch {
      projects.value = null
    }
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
        fetchExceptionalTags(),
        fetchProjects(),
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
    adoptPlanEntries(null)
    selectedMonth.value = null
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
      adoptPlanEntries(loaded)
      // The months on offer belong to the plan that was showing, not to this
      // one: keep the new plan on its average until the user picks again.
      selectedMonth.value = null
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
    adoptPlanEntries(created)
    selectedMonth.value = null
    isModalOpen.value = false
    planCount.value++
    await Promise.all([fetchStatistics(), checkYearAgoAvailability()])
  }

  // ── Editing ──────────────────────────────────────────────────────────────
  // Nothing on this page writes on its own any more. Every path that changes
  // an envelope — the inputs, the bulk buttons, clicking a reference figure —
  // is only reachable in edit mode, and only reaches the server through
  // "Enregistrer". That is what makes "Annuler" able to promise anything, and
  // what stops a stray click on a number in a table from rewriting a plan.

  function enterEditMode(): void {
    budgetInputs.value = new Map(savedBudgets.value)
    isEditing.value = true
  }

  function cancelEdit(): void {
    budgetInputs.value = new Map(savedBudgets.value)
    isEditing.value = false
  }

  /** Categories whose draft envelope differs from what the server holds. */
  const dirtyCategoryIds = computed(() => {
    const ids = new Set([
      ...savedBudgets.value.keys(),
      ...budgetInputs.value.keys(),
    ])
    const changed: string[] = []
    for (const id of ids) {
      const before = savedBudgets.value.get(id) ?? 0
      const after = budgetInputs.value.get(id) ?? 0
      if (before !== after) changed.push(id)
    }
    return changed
  })

  const hasUnsavedChanges = computed(() => dirtyCategoryIds.value.length > 0)

  /** Envelope the server holds for a category — the "before" of the diff. */
  function getSavedBudget(categoryId: string): number {
    return savedBudgets.value.get(categoryId) ?? 0
  }

  function isCategoryDirty(categoryId: string): boolean {
    return getSavedBudget(categoryId) !== getBudgetForCategory(categoryId)
  }

  /**
   * Totals of the whole plan, saved and draft. Deliberately over every entry
   * rather than over the visible categories: an envelope on a category that
   * spent nothing this window is absent from the statistics, and dropping it
   * from the total would make the figure disagree with the plan itself.
   */
  function sumOf(budgets: Map<string, number>): number {
    let total = 0
    for (const amount of budgets.values()) total += amount
    return total
  }

  const savedPlanTotal = computed(() => sumOf(savedBudgets.value))
  const draftPlanTotal = computed(() => sumOf(budgetInputs.value))
  const draftDelta = computed(() => draftPlanTotal.value - savedPlanTotal.value)

  /** Take the entries of a freshly loaded plan as the new saved reference. */
  function adoptPlanEntries(loaded: BudgetPlanDto | null): void {
    savedBudgets.value = new Map(
      (loaded?.entries ?? []).map(e => [e.categoryId, e.amount])
    )
    budgetInputs.value = new Map(savedBudgets.value)
    isEditing.value = false
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
      adoptPlanEntries(updated)
      saveSuccess.value = true
      setTimeout(() => {
        saveSuccess.value = false
      }, 2000)
    } catch (err) {
      // The draft survives on purpose: a failed save must not silently throw
      // away what the user typed.
      error.value =
        err instanceof Error ? err.message : 'Erreur lors de la sauvegarde'
    } finally {
      isSaving.value = false
    }
  }

  function updateBudgetInput(categoryId: string, value: string) {
    const num = parseFloat(value)
    budgetInputs.value.set(categoryId, Number.isFinite(num) ? num : 0)
  }

  /** Apply an arbitrary amount to a category's budget input. */
  function setBudgetValue(categoryId: string, amount: number) {
    if (!isEditing.value) return
    budgetInputs.value.set(categoryId, Math.round(amount))
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
  }

  // No confirmation needed: emptying the draft is undone by "Annuler", and
  // nothing has left the browser until "Enregistrer".
  function resetAllBudgets() {
    budgetInputs.value.clear()
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * A draft only lives in this component, so anything that unmounts it throws
   * the draft away. The two exits the page cannot disable — closing the tab
   * and routing away through an event or project chip — get a prompt instead.
   */
  function warnOnUnload(event: BeforeUnloadEvent): void {
    if (!hasUnsavedChanges.value) return
    event.preventDefault()
    event.returnValue = ''
  }

  onMounted(() => {
    window.addEventListener('beforeunload', warnOnUnload)
    void fetchData()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', warnOnUnload)
  })

  onBeforeRouteLeave(() => {
    if (!hasUnsavedChanges.value) return true
    return window.confirm(
      'Des modifications de budget ne sont pas enregistrées. Quitter la page ?'
    )
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
  <div
    class="min-h-screen bg-gray-50 dark:bg-slate-800 py-6 sm:py-8 transition-colors"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <BudgetPlanHeader
        :plan="plan"
        :is-loading="isLoading"
        :plan-count="planCount"
        :is-editing="isEditing"
        :is-saving="isSaving"
        :save-success="saveSuccess"
        @open-history="isHistoryOpen = true"
        @create="openCreateModal"
      />

      <!-- Error banner -->
      <div
        v-if="error"
        role="alert"
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
          class="mx-auto h-12 w-12 text-gray-500 dark:text-gray-400"
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
          Créez un budget pour commencer à suivre vos dépenses prévues.
        </p>
        <div class="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            data-testid="empty-create-button"
            class="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 dark:bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors"
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
                      ? 'bg-primary-500'
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
                      ? 'bg-primary-500'
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
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
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
            @select-month="onChartMonthSelected"
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
            :actual-period-label="selectedMonth ? actualPeriodLabel : null"
            :comparison="summaryComparisonProps"
          />
        </div>

        <!-- Month-by-month grid: which envelope drifts, and when. The
             averages above cannot answer that — they average it away. -->
        <BudgetMonthlyMatrix
          v-if="showMonthlyMatrix"
          :months="matrixMonths"
          :rows="matrixRows"
          :selected-month="selectedMonth"
          @select-month="onChartMonthSelected"
        />

        <!-- Expense category list -->
        <div
          class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 border border-gray-200 dark:border-slate-700 p-4 sm:p-5"
        >
          <BudgetTableControls
            v-model:sort-order="sortOrder"
            :editing="isEditing"
            :month-options="monthOptions"
            :selected-month="selectedMonth"
            :complete-months-count="comparison.completePlanMonthsCount.value"
            :actual-period-label="actualPeriodLabel"
            :plan-is-past="planStatus(plan) === 'past'"
            :has-exceptional="hasExceptionalInPlan"
            :breakdown-mode="breakdownMode"
            :plan-events="planEvents"
            @enter-edit="enterEditMode"
            @select-month="selectMonth"
            @apply-averages="applyAverageToAll"
            @adjust-percent="adjustAllByPercent"
            @reset="resetAllBudgets"
            @set-mode="setBreakdownMode"
            @open-tag="openTagAnalysis"
          />

          <BudgetProjectsSection
            :projects="projects"
            :plan="plan"
            @open-tag="openTagAnalysis"
          />

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
            <span class="text-right text-primary-700 dark:text-primary-400">
              Budget
              <span
                class="block text-[10px] font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400"
              >
                /mois
              </span>
            </span>
            <span
              v-if="showActualColumn"
              class="text-right text-red-600 dark:text-red-400"
            >
              {{ selectedMonth ? 'Réel' : 'Réel à date' }}
              <span
                class="block text-[10px] font-normal normal-case tracking-normal text-red-400 dark:text-red-500"
              >
                {{ actualPeriodLabel }}
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
            <BudgetCategoryRow
              v-for="cat in sortedCategories"
              :key="cat.categoryId"
              :category="cat"
              :row-grid="rowGridTemplate"
              :expanded="isCategoryExpanded(cat.categoryId)"
              :editing="isEditing"
              :show-historical="showHistoricalColumn"
              :show-actual="showActualColumn"
              :historical-average="getHistoricalAverage(cat)"
              :actual-average="getPlanActualAverage(cat)"
              :exceptional-average="getExceptionalAverage(cat)"
              :budget="getBudgetForCategory(cat.categoryId)"
              :saved-budget="getSavedBudget(cat.categoryId)"
              :dirty="isCategoryDirty(cat.categoryId)"
              :prorated-budget="getProratedBudget(cat.categoryId)"
              :row-status="getRowStatus(cat)"
              :margin-vs-historical="getMarginVsHistorical(cat)"
              :remaining-vs-actual="getRemainingVsActual(cat)"
              :sparkline="comparison.seriesFor(cat) ?? []"
              :chart-data="categoryChartData(cat)"
              :comparison-label="comparisonRange?.label"
              :actual-period-label="actualPeriodLabel"
              :breakdown-mode="breakdownMode"
              @toggle-expand="toggleCategoryExpanded(cat.categoryId)"
              @update-budget="value => updateBudgetInput(cat.categoryId, value)"
              @apply-budget="amount => setBudgetValue(cat.categoryId, amount)"
            />
          </div>
        </div>

        <BudgetEditBar
          v-if="isEditing"
          :dirty-count="dirtyCategoryIds.length"
          :saved-total="savedPlanTotal"
          :draft-total="draftPlanTotal"
          :delta="draftDelta"
          :saving="isSaving"
          @save="saveBudget"
          @cancel="cancelEdit"
        />
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
