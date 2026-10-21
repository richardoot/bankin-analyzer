<script setup lang="ts">
  import PageShell from '@/components/ui/PageShell.vue'
  import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
  import { api } from '@/lib/api'
  import type {
    AmortizedPurchaseDto,
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
  import BudgetAmortizedSection from '@/components/budget/BudgetAmortizedSection.vue'
  import {
    isAmortizationCarrier,
    purchasesWithSlicesIn,
    smoothedSourceIds,
  } from '@/lib/amortization'
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
  import { formatMonth } from '@/lib/formatters'
  import { monthWindow, transactionsLink } from '@/lib/transactionsLink'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import { useSuppressTabBar } from '@/composables/useMobileNavigation'

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
  /**
   * How the last save went, said in the edit bar next to the button that
   * asked. « saved » keeps the bar on screen a moment after edit mode has
   * ended; « error » keeps the draft and the bar until it is saved or
   * dropped.
   */
  const saveStatus = ref<'idle' | 'saved' | 'error'>('idle')
  const saveError = ref<string | null>(null)
  let saveStatusTimer: ReturnType<typeof setTimeout> | null = null
  const error = ref<string | null>(null)

  // ── Comparison state ────────────────────────────────────────────────────
  const comparisonPreset = ref<ComparisonPreset>('none')
  const comparisonCustomStart = ref('')
  const comparisonCustomEnd = ref('')
  const comparisonRange = ref<ComparisonRange | null>(null)
  const yearAgoAvailable = ref(false)

  const deductReimbursements = ref(true)
  // A debt still owed: one preference shared with the dashboard, kept by the
  // backend. The switch reads and writes the store.
  const deductPendingReimbursements = computed<boolean>({
    get: () => filtersStore.deductPendingReimbursements,
    set: value => {
      void filtersStore.setDeductPendingReimbursements(value)
    },
  })

  const sortOrder = ref<SortOrder>('amount-desc')

  /**
   * The envelopes being edited. Until "Enregistrer" is pressed this is a
   * draft: `savedBudgets` holds what the server actually has, which is what
   * "Annuler" restores and what the modified-count is measured against.
   */
  const budgetInputs = ref<Map<string, number>>(new Map())
  const savedBudgets = ref<Map<string, number>>(new Map())
  const isEditing = ref(false)
  // The edit bar takes the tab bar's place below lg while it shows.
  useSuppressTabBar(() => isEditing.value || saveStatus.value === 'saved')

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

  /**
   * The expense categories the page reads. The real reading must look as it
   * did before smoothing: a category only slices of smoothed purchases reach
   * is left out there, its real figures being zero anyway.
   */
  const visibleExpenseCategories = computed(() => {
    const categories = statistics.value?.expensesByCategory ?? []
    return breakdownMode.value === 'real'
      ? categories.filter(c => !isAmortizationCarrier(c))
      : categories
  })

  /**
   * The smoothed purchases the everyday reading spreads over the window —
   * none in the real reading, which counts each one whole at its date. They
   * feed the « Achats lissés en cours » list and the links of every figure
   * that counts their slices.
   */
  const everydayPurchases = computed<AmortizedPurchaseDto[]>(() =>
    breakdownMode.value === 'everyday'
      ? (statistics.value?.amortizedPurchases ?? [])
      : []
  )

  /** Those with a slice inside the plan itself, not only its comparison. */
  const planSmoothedPurchases = computed(() => {
    const current = plan.value
    if (!current) return []
    return purchasesWithSlicesIn(everydayPurchases.value, {
      from: current.startDate.slice(0, 7),
      to: current.endDate.slice(0, 7),
    })
  })

  /** The category's smoothed purchases, for the links of its row. */
  function smoothedPurchasesOf(
    category: CategoryAverageDto
  ): AmortizedPurchaseDto[] {
    return everydayPurchases.value.filter(
      p => p.categoryId === category.categoryId
    )
  }

  /**
   * Whether a smoothed purchase has a slice in the plan, whichever reading
   * is on: what offers the choice of reading and says what it changes.
   */
  const hasAmortizedInPlan = computed(() => {
    const current = plan.value
    if (!current) return false
    return (
      purchasesWithSlicesIn(statistics.value?.amortizedPurchases, {
        from: current.startDate.slice(0, 7),
        to: current.endDate.slice(0, 7),
      }).length > 0
    )
  })

  const visibleIncomeCategories = computed(
    () => statistics.value?.incomeByCategory ?? []
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

  /**
   * The plan's total, the same figure everywhere on the page: over every
   * entry of the plan, not only the categories the statistics happen to
   * list (an envelope on a category that spent nothing this window would
   * otherwise vanish from the summary while the edit bar still counts it).
   */
  const totalBudget = computed(() => draftPlanTotal.value)

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

  /**
   * Links to the Transactions page. Every figure here is netted, shared
   * and read in the active mode; the list is none of that, so each link
   * carries `gross` and the list says so.
   */
  /** In « Vie courante » every figure leaves the events out: so do links. */
  const everydayFilter = computed(() =>
    breakdownMode.value === 'everyday' ? ('exclude' as const) : undefined
  )

  function openMonthTransactions(ym: string): void {
    void router.push(
      transactionsLink({
        type: 'EXPENSE',
        month: ym,
        exceptional: everydayFilter.value,
        alsoIds: smoothedSourceIds(everydayPurchases.value, {
          from: ym,
          to: ym,
        }),
        gross: true,
        label: `Dépenses · ${formatMonth(ym, { capitalize: false })}`,
      })
    )
  }

  function openCategoryMonth(cat: CategoryAverageDto, ym: string): void {
    void router.push(
      transactionsLink({
        type: 'EXPENSE',
        categoryId: cat.categoryId,
        month: ym,
        exceptional: everydayFilter.value,
        alsoIds: smoothedSourceIds(everydayPurchases.value, {
          categoryId: cat.categoryId,
          from: ym,
          to: ym,
        }),
        gross: true,
        label: `${cat.categoryName} · ${formatMonth(ym, { capitalize: false })}`,
      })
    )
  }

  /** The whole window the statistics cover, behind the subcategory lines. */
  const breakdownWindow = computed(() => {
    const range = referenceDateRange.value
    if (!range) return null
    return {
      from: range.startDate.slice(0, 10),
      to: range.endDate.slice(0, 10),
    }
  })

  /** The comparison months, behind « Historique ». */
  const historicalWindow = computed(() => {
    const range = comparisonRange.value
    if (!range) return null
    return { from: range.startDate, to: range.endDate, label: range.label }
  })

  /**
   * The months behind « Réel »: the one isolated, or the plan from its first
   * day to today — the average reads complete months only, the list shows
   * the running one too, which is what the running one is for.
   */
  const actualWindow = computed(() => {
    const current = plan.value
    if (!current) return null
    if (selectedMonth.value) {
      const window = monthWindow(selectedMonth.value)
      if (!window) return null
      return { ...window, label: monthLabelFor(selectedMonth.value) }
    }
    const today = new Date().toISOString().slice(0, 10)
    const end = current.endDate.slice(0, 10)
    return {
      from: current.startDate.slice(0, 10),
      to: end < today ? end : today,
      label: 'plan',
    }
  })

  /** "2026-08" → "Août 2026". */
  const monthLabelFor = (ym: string): string =>
    formatMonth(ym, { style: 'long' })

  /**
   * The months the user can isolate, newest last, each flagged when it is the
   * one still running — that month is worth offering (it is the one being
   * lived) but must never be read as a finished month.
   */
  const monthOptions = computed(() =>
    comparison.selectableMonths.value.map(ym => ({
      ym,
      short: formatMonth(ym, { year: false }),
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

  // Isolating a month happens in one place, the period band above the table
  // (BudgetTableControls): the chart and the month-by-month grid only reflect
  // the choice. Three places to set the same thing were two too many.

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
      smoothedIds: smoothedSourceIds(everydayPurchases.value, {
        from: option.ym,
        to: option.ym,
      }),
    }))
  )

  const matrixRows = computed<MatrixRow[]>(() => {
    const indices = comparison.selectableMonths.value.map(ym =>
      comparison.monthLabels.value.indexOf(ym)
    )
    const everyday = breakdownMode.value === 'everyday'
    const months = comparison.selectableMonths.value
    return sortedCategories.value.map(cat => {
      const series = comparison.seriesFor(cat)
      const row: MatrixRow = {
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        categoryIcon: cat.categoryIcon ?? null,
        budget: getBudgetForCategory(cat.categoryId),
        amounts: indices.map(i => (i >= 0 ? (series?.[i] ?? 0) : 0)),
      }
      // Read « Vie courante », a cell says the slices it holds and links
      // to their purchases, whatever month they are dated in.
      const slices = cat.amortizedMonthlyAmounts
      if (everyday && slices) {
        row.amortized = indices.map(i => (i >= 0 ? (slices[i] ?? 0) : 0))
        row.smoothedIds = months.map(ym =>
          smoothedSourceIds(everydayPurchases.value, {
            categoryId: cat.categoryId,
            from: ym,
            to: ym,
          })
        )
      }
      return row
    })
  })

  /** One column is just the row list again — the grid earns its space at two. */
  const showMonthlyMatrix = computed(() => matrixMonths.value.length >= 2)

  function categoryChartData(cat: CategoryAverageDto) {
    const labels = (statistics.value?.monthLabels ?? []).map(ym =>
      formatMonth(ym, { year: false })
    )
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
      await Promise.all([fetchStatistics(), fetchProjects()])
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
      // The projects too: they are read over the plan's own window.
      await Promise.all([
        fetchStatistics(),
        checkYearAgoAvailability(),
        fetchProjects(),
      ])
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
    await Promise.all([
      fetchStatistics(),
      checkYearAgoAvailability(),
      fetchProjects(),
    ])
  }

  // ── Editing ──────────────────────────────────────────────────────────────
  // Nothing on this page writes on its own any more. Every path that changes
  // an envelope — the inputs, the bulk buttons, clicking a reference figure —
  // is only reachable in edit mode, and only reaches the server through
  // "Enregistrer". That is what makes "Annuler" able to promise anything, and
  // what stops a stray click on a number in a table from rewriting a plan.

  function clearSaveStatus(): void {
    if (saveStatusTimer) clearTimeout(saveStatusTimer)
    saveStatusTimer = null
    saveStatus.value = 'idle'
    saveError.value = null
  }

  function enterEditMode(): void {
    clearSaveStatus()
    budgetInputs.value = new Map(savedBudgets.value)
    isEditing.value = true
  }

  function cancelEdit(): void {
    clearSaveStatus()
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
      clearSaveStatus()
      const updated = await api.updateBudgetPlan(plan.value.id, { entries })
      plan.value = updated
      adoptPlanEntries(updated)
      saveStatus.value = 'saved'
      saveStatusTimer = setTimeout(clearSaveStatus, 4000)
    } catch (err) {
      // The draft survives on purpose: a failed save must not silently throw
      // away what the user typed.
      saveStatus.value = 'error'
      saveError.value =
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

  /**
   * What « Reprendre les moyennes » would copy: the historical average when
   * a comparison is on, else the actual to date, else nothing to offer.
   * The button says which, so the user knows what lands in the envelopes.
   */
  const averagesSource = computed<'historical' | 'actual' | 'none'>(() => {
    if (showHistoricalColumn.value) return 'historical'
    if (showActualColumn.value) return 'actual'
    return 'none'
  })

  function applyAverageToAll() {
    if (averagesSource.value === 'none') return
    for (const cat of visibleExpenseCategories.value) {
      const ref =
        averagesSource.value === 'historical'
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
    if (saveStatusTimer) clearTimeout(saveStatusTimer)
  })

  onBeforeRouteLeave(() => {
    if (!hasUnsavedChanges.value) return true
    return window.confirm(
      'Des modifications de budget ne sont pas enregistrées. Quitter la page ?'
    )
  })

  // A toggle or a new comparison refetches the figures. Shown while it runs,
  // and said when it fails — otherwise a switch reads "on" over figures that
  // are still "off". Only the latest request may write its outcome.
  const isRefreshingStatistics = ref(false)
  const statisticsError = ref<string | null>(null)
  let statisticsRequest = 0

  async function refreshStatistics(): Promise<void> {
    const request = ++statisticsRequest
    isRefreshingStatistics.value = true
    statisticsError.value = null
    try {
      await fetchStatistics()
    } catch (err) {
      if (request !== statisticsRequest) return
      statisticsError.value =
        err instanceof Error
          ? err.message
          : 'Impossible de mettre à jour les chiffres'
    } finally {
      if (request === statisticsRequest) isRefreshingStatistics.value = false
    }
  }

  watch(
    [comparisonRange, deductReimbursements, deductPendingReimbursements],
    () => {
      if (!plan.value) return
      void refreshStatistics()
    }
  )
</script>

<template>
  <PageShell width="wide">
    <BudgetPlanHeader
      :plan="plan"
      :is-loading="isLoading"
      :plan-count="planCount"
      :is-editing="isEditing"
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
        <BaseButton data-testid="empty-create-button" @click="openCreateModal">
          Créer un budget
        </BaseButton>
        <BaseButton
          v-if="planCount > 0"
          variant="ghost"
          data-testid="empty-history-button"
          @click="isHistoryOpen = true"
        >
          Voir l'historique ({{ planCount }})
        </BaseButton>
      </div>
    </div>

    <!-- Plan content -->
    <template v-else>
      <!-- Filters card: reference period + reimbursement toggles -->
      <BaseCard bordered data-testid="budget-filters-card" class="mb-6">
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
            class="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 sm:flex sm:flex-wrap sm:items-center sm:gap-6 dark:border-slate-700"
          >
            <label
              for="budget-deduct-reimbursements"
              class="flex min-h-[44px] cursor-pointer items-center gap-2.5 select-none sm:min-h-0"
            >
              <ToggleSwitch
                id="budget-deduct-reimbursements"
                :checked="deductReimbursements"
                label="Déduire les remboursements reçus"
                @change="deductReimbursements = $event"
              />
              <span
                class="text-left text-xs leading-tight text-gray-700 sm:text-sm dark:text-gray-300"
              >
                <span class="sm:hidden">Déduire les remb. reçus</span>
                <span class="hidden sm:inline"
                  >Déduire les remboursements reçus</span
                >
              </span>
            </label>
            <label
              for="budget-deduct-pending"
              class="flex min-h-[44px] cursor-pointer items-center gap-2.5 select-none sm:min-h-0"
            >
              <ToggleSwitch
                id="budget-deduct-pending"
                :checked="deductPendingReimbursements"
                label="Déduire les remboursements en attente"
                @change="deductPendingReimbursements = $event"
              />
              <span
                class="text-left text-xs leading-tight text-gray-700 sm:text-sm dark:text-gray-300"
              >
                <span class="sm:hidden">Déduire les remb. en attente</span>
                <span class="hidden sm:inline"
                  >Déduire les remboursements en attente</span
                >
              </span>
            </label>
          </div>

          <p
            v-if="isRefreshingStatistics"
            role="status"
            data-testid="budget-statistics-refreshing"
            class="text-xs text-gray-500 dark:text-gray-400"
          >
            Mise à jour des chiffres…
          </p>
          <InlineAlert
            v-else-if="statisticsError"
            data-testid="budget-statistics-error"
            retry-label="Réessayer"
            retry-test-id="budget-statistics-retry"
            @retry="refreshStatistics"
          >
            Les chiffres n'ont pas pu être mis à jour : ils correspondent encore
            aux réglages précédents. {{ statisticsError }}
          </InlineAlert>
        </div>
      </BaseCard>

      <!-- The verdict first — « am I on track » is what the page is opened
           for — then the chart it is read from. -->
      <div class="mb-6">
        <BudgetSavingsSummary
          :plan-label="plan.name"
          :plan-income-avg="chartAverageIncome"
          :plan-budget-total="totalBudget"
          :plan-actual-expense-avg="planActualExpenseAvg"
          :plan-actual-income-avg="planActualIncomeAvg"
          :complete-plan-months-count="comparison.completePlanMonthsCount.value"
          :is-plan-finished="comparison.isPlanFinished.value"
          :actual-period-label="selectedMonth ? actualPeriodLabel : null"
          :month-progress="comparison.selectedMonthProgress.value"
          :comparison="summaryComparisonProps"
        />
      </div>

      <!-- Monthly expenses chart -->
      <BaseCard
        v-if="monthlyTotalExpenses.length >= 2 && statistics?.monthLabels"
        class="mb-6"
      >
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
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
          @select-month="openMonthTransactions"
        />
      </BaseCard>

      <!-- Month-by-month grid: which envelope drifts, and when. The
             averages above cannot answer that — they average it away. -->
      <BudgetMonthlyMatrix
        v-if="showMonthlyMatrix"
        :months="matrixMonths"
        :rows="matrixRows"
        :selected-month="selectedMonth"
        :exceptional="everydayFilter"
      />

      <!-- Expense category list -->
      <BaseCard bordered>
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
          :has-amortized="hasAmortizedInPlan"
          :averages-source="averagesSource"
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

        <BudgetAmortizedSection
          :purchases="planSmoothedPurchases"
          :current-month="currentYearMonth()"
        />

        <!-- One grid for the whole table: the header and every row are
             subgrids of it, so each `auto` track is sized over all the rows
             and a column falls on one vertical. Below `sm` the rows keep
             their own three-column grid. -->
        <div
          data-testid="budget-table"
          class="sm:grid sm:gap-x-6 sm:[grid-template-columns:var(--row-grid)]"
          :style="{ '--row-grid': rowGridTemplate }"
        >
          <div
            data-testid="budget-table-header"
            class="hidden sm:grid sm:col-span-full sm:grid-cols-subgrid px-4 pb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-slate-700"
          >
            <span>Catégorie</span>
            <span
              v-if="showHistoricalColumn"
              class="text-right text-indigo-600 dark:text-indigo-400"
            >
              Historique
              <span
                class="block text-[10px] font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400"
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
                class="block text-[10px] font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400"
              >
                {{ actualPeriodLabel }}
              </span>
            </span>
            <span class="text-right w-24">Tendance</span>
          </div>

          <!-- Empty list -->
          <div
            v-if="sortedCategories.length === 0"
            class="sm:col-span-full py-12 text-center text-sm text-gray-500 dark:text-gray-400"
          >
            Aucune catégorie de dépense sur cette période.
          </div>

          <!-- Category rows -->
          <div
            v-else
            class="divide-y divide-gray-100 sm:col-span-full sm:grid sm:grid-cols-subgrid dark:divide-slate-700"
          >
            <BudgetCategoryRow
              v-for="cat in sortedCategories"
              :key="cat.categoryId"
              :category="cat"
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
              :breakdown-mode="breakdownMode"
              :historical-window="historicalWindow"
              :actual-window="actualWindow"
              :month-keys="statistics?.monthLabels ?? []"
              :breakdown-window="breakdownWindow"
              :amortized-average="
                breakdownMode === 'everyday'
                  ? comparison.planActualAmortizedAverage(cat)
                  : 0
              "
              :smoothed-purchases="smoothedPurchasesOf(cat)"
              @select-month="ym => openCategoryMonth(cat, ym)"
              @toggle-expand="toggleCategoryExpanded(cat.categoryId)"
              @update-budget="value => updateBudgetInput(cat.categoryId, value)"
              @apply-budget="amount => setBudgetValue(cat.categoryId, amount)"
            />
          </div>
        </div>
      </BaseCard>

      <BudgetEditBar
        v-if="isEditing || saveStatus === 'saved'"
        :dirty-count="dirtyCategoryIds.length"
        :saved-total="savedPlanTotal"
        :draft-total="draftPlanTotal"
        :delta="draftDelta"
        :saving="isSaving"
        :status="saveStatus"
        :error-message="saveError"
        @save="saveBudget"
        @cancel="cancelEdit"
      />
    </template>

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
  </PageShell>
</template>
