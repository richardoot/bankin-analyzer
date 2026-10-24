<script setup lang="ts">
  import PageShell from '@/components/ui/PageShell.vue'
  import {
    ref,
    computed,
    nextTick,
    onMounted,
    onBeforeUnmount,
    watch,
  } from 'vue'
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
  import BudgetMonthBand from '@/components/budget/BudgetMonthBand.vue'
  import BudgetReviewBand from '@/components/budget/BudgetReviewBand.vue'
  import BudgetPlanningBand from '@/components/budget/BudgetPlanningBand.vue'
  import { budgetMonthReading, budgetReviewReading } from '@/lib/budgetMonth'
  import MonthlyExpensesChart from '@/components/budget/MonthlyExpensesChart.vue'
  import NewBudgetPlanModal from '@/components/budget/NewBudgetPlanModal.vue'
  import BudgetPlansHistoryModal from '@/components/budget/BudgetPlansHistoryModal.vue'
  import BudgetPlanHeader from '@/components/budget/BudgetPlanHeader.vue'
  import BudgetProjectsLine from '@/components/budget/BudgetProjectsLine.vue'
  import BudgetAmortizedLine from '@/components/budget/BudgetAmortizedLine.vue'
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
  import { budgetChartMonths } from '@/lib/budgetChartMonths'
  import { useIsMobile } from '@/composables/useMediaQuery'
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
  import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
  import { formatMonth } from '@/lib/formatters'
  import { monthWindow, transactionsLink } from '@/lib/transactionsLink'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import ReadingMenu from '@/components/dashboard/ReadingMenu.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import { useSuppressTabBar } from '@/composables/useMobileNavigation'
  import { useBudgetDraft } from '@/composables/useBudgetDraft'
  import TodoCard from '@/components/dashboard/TodoCard.vue'
  import {
    budgetTodoItems as composeBudgetTodoItems,
    categoriesWithoutEnvelope,
  } from '@/lib/budgetTodo'

  const filtersStore = useFiltersStore()
  const router = useRouter()
  const route = useRoute()

  // The reading — Vie courante or Tout, received reimbursements taken off
  // or not — is the one the dashboard and the trends read: kept by the
  // filters store, remembered in this browser, set from the « Lecture »
  // menu. Defaults to everyday: a holiday inside the plan must not read as
  // an overrun of the recurring budget.
  const breakdownMode = computed<BreakdownMode>({
    get: () => filtersStore.breakdownMode,
    set: mode => filtersStore.setBreakdownMode(mode),
  })

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

  const deductReimbursements = computed<boolean>({
    get: () => filtersStore.deductReimbursements,
    set: value => filtersStore.setDeductReimbursements(value),
  })
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
   * The envelopes and the reference income being edited: a draft until
   * « Enregistrer », restored by « Annuler » (useBudgetDraft).
   */
  const draft = useBudgetDraft(plan)
  const {
    referenceIncomeInput,
    savedReferenceIncome,
    getBudgetForCategory,
    getSavedBudget,
    isCategoryDirty,
    dirtyCategoryIds,
    referenceIncomeDirty,
    hasUnsavedChanges,
    savedPlanTotal,
    draftPlanTotal,
    draftDelta,
    updateBudgetInput,
    resetAllBudgets,
  } = draft
  const isEditing = ref(false)
  // The edit bar takes the tab bar's place below lg while it shows.
  useSuppressTabBar(() => isEditing.value || saveStatus.value === 'saved')

  /**
   * The month the user picked in « Mois lu »: a plan month, null for
   * « Moyenne du plan », undefined while nothing was picked — the page then
   * reads its default. Not persisted: which month you want to look at is a
   * question of the moment, unlike the reading. A plan switch drops it.
   */
  const monthChoice = ref<string | null | undefined>(undefined)

  /**
   * The plan month the page is reading, or null for the average over every
   * complete month. By default the running month while the plan runs —
   * « Ce mois-ci » is what the page is opened for — and the average
   * otherwise (a finished plan, one not begun yet).
   */
  const selectedMonth = computed<string | null>(() => {
    if (monthChoice.value !== undefined) return monthChoice.value
    const current = plan.value
    if (!current) return null
    const running = currentYearMonth()
    return running >= current.startDate.slice(0, 7) &&
      running <= current.endDate.slice(0, 7)
      ? running
      : null
  })

  const expandedCategories = ref<Set<string>>(new Set())

  /** Projects overlapping the plan, with spend vs envelope. */
  const projects = ref<TagBudgetSummaryDto | null>(null)

  /** Exceptional tags owned by the user, for the events of the period. */
  const exceptionalTags = ref<TagDto[]>([])

  const isModalOpen = ref(false)
  const isHistoryOpen = ref(false)
  /** Total number of plans known to exist — drives the "Voir l'historique" hint on the empty state */
  const planCount = ref(0)
  /**
   * The windows of every plan known to exist: whether one runs today,
   * when the plan shown is over (« À faire » then asks for the next one).
   */
  const planWindows = ref<{ id: string; startDate: string; endDate: string }[]>(
    []
  )

  // ── Helpers ──────────────────────────────────────────────────────────────
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
   * Priority: « Dépassé » (the actual past the envelope) > « Couvert » (the
   * envelope covers the history, edit mode only) > nothing.
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

  /**
   * Show the "Historique" column while editing with a comparison chosen.
   * The comparison itself outlives edit mode (Richard, 2026-10-24): the
   * chart draws its months in tracking too, but the history column,
   * « Couvert », the margins and the sort by history stay planning tools.
   */
  const showHistoricalColumn = computed(
    () => isEditing.value && comparisonRange.value !== null
  )
  /**
   * Show the "Réel" column as soon as there is a month to read. Isolating the
   * running month counts: it carries real spending even though it would never
   * qualify as a complete month.
   */
  const showActualColumn = computed(
    () => comparison.actualIndices.value.length > 0
  )

  /** Whether the plan has begun: the rows then draw its months. */
  const showMonthsColumn = computed(
    () => comparison.startedPlanIndices.value.length > 0
  )

  /**
   * Grid template for the category list — adapts to which columns are
   * visible. Tracking: name (1fr), [historical], the figure (the actual
   * over its envelope, or the envelope alone), [plan months], link.
   * Editing: name, [historical], the envelope field, [actual], [plan
   * months], link.
   */
  const rowGridTemplate = computed(() => {
    const cols = ['1fr']
    if (showHistoricalColumn.value) cols.push('auto')
    cols.push('auto') // the figure, or the envelope field
    if (isEditing.value && showActualColumn.value) cols.push('auto')
    if (showMonthsColumn.value) cols.push('auto') // plan months
    cols.push('auto') // link
    return cols.join(' ')
  })

  /**
   * The started plan months and a category's spending in each, both read
   * off `startedPlanIndices` so the two lists stay aligned.
   */
  const rowPlanMonths = computed(() =>
    comparison.startedPlanIndices.value.map(
      i => comparison.monthLabels.value[i] ?? ''
    )
  )

  function rowPlanMonthValues(cat: CategoryAverageDto): number[] {
    const series = comparison.seriesFor(cat)
    return comparison.startedPlanIndices.value.map(i => series?.[i] ?? 0)
  }

  /** « juin → octobre », the months the rows' charts draw. */
  const planMonthsSpan = computed(() => {
    const months = rowPlanMonths.value
    const first = months[0]
    const last = months[months.length - 1]
    if (!first || !last) return ''
    const name = (ym: string) =>
      formatMonth(ym, { style: 'long', year: false, capitalize: false })
    return first === last ? name(first) : `${name(first)} → ${name(last)}`
  })

  /** The isolated month, when the page reads one — the charts band it. */
  const rowSelectedMonth = computed(() =>
    comparison.selectedMonthIndex.value !== null ? selectedMonth.value : null
  )

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

  /**
   * The income of each complete plan month: the base of the planned
   * savings in « Planification », as in « Ce mois-ci ».
   */
  const completeMonthsIncome = computed(() =>
    comparison.completePlanIndices.value.map(i =>
      visibleIncomeCategories.value.reduce(
        (total, cat) => total + (cat.monthlyAmounts?.[i] ?? 0),
        0
      )
    )
  )

  /**
   * Income averaged over the complete plan months, whichever month is read:
   * a running month has received part of its income only.
   */
  const completeMonthsIncomeAvg = computed(() => {
    const indices = comparison.completePlanIndices.value
    if (indices.length === 0) return 0
    let total = 0
    for (const cat of visibleIncomeCategories.value) {
      for (const i of indices) total += cat.monthlyAmounts?.[i] ?? 0
    }
    return total / indices.length
  })

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
    if (completeMonthsIncomeAvg.value > 0) return completeMonthsIncomeAvg.value
    const income = comparison.incomeAggregates(visibleIncomeCategories.value)
    if (income.comparisonIncomeAvg > 0) return income.comparisonIncomeAvg
    if (income.planToDateIncomeAvg > 0) return income.planToDateIncomeAvg
    return income.planIncomeAvg
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
   * a started plan month — drives whether the mode selector is offered. Not
   * the month read: the running month without an event must not hide a
   * choice the shared preference may hold on « Tout ».
   */
  const hasExceptionalInPlan = computed(() =>
    visibleExpenseCategories.value.some(c => comparison.hasPlanExceptional(c))
  )

  /**
   * Exceptional events whose declared period overlaps the plan, listed in
   * « Projets de la période ». Tags without a period (a party at home)
   * cannot be placed in time and are therefore not listed — their spending
   * still shows in the rows' facts.
   */
  const planEvents = computed(() => {
    const current = plan.value
    if (!current) return []
    const start = current.startDate.slice(0, 10)
    const end = current.endDate.slice(0, 10)
    return exceptionalTags.value.filter(t => {
      if (!t.eventStartDate || !t.eventEndDate) return false
      return t.eventStartDate <= end && t.eventEndDate >= start
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
    monthChoice.value = ym
  }

  // Isolating a month happens in one place, « Mois lu » in the band of the
  // month (BudgetMonthBand): the rows, the chart and the month-by-month grid
  // only reflect the choice.

  /**
   * What every reading of the plan is computed from: the started plan
   * months and each category's spending in them, in the active reading.
   */
  const readingInput = computed(() => {
    const current = plan.value
    if (!current) return null
    const indices = comparison.startedPlanIndices.value
    return {
      plan: current,
      months: comparison.startedPlanMonths.value,
      completeMonthsCount: comparison.completePlanMonthsCount.value,
      categories: visibleExpenseCategories.value.map(cat => {
        const series = comparison.seriesFor(cat)
        return {
          categoryId: cat.categoryId,
          categoryName: cat.categoryName,
          amounts: indices.map(i => series?.[i] ?? 0),
        }
      }),
      income: indices.map(i =>
        visibleIncomeCategories.value.reduce(
          (total, cat) => total + (cat.monthlyAmounts?.[i] ?? 0),
          0
        )
      ),
    }
  })

  /**
   * What the band of the month reads: none while a started plan has no
   * figures (a failed statistics load) — without them it would say « Le plan
   * commence le … » of a plan already running. The error alert speaks alone.
   */
  const bandInput = computed(() => {
    const input = readingInput.value
    if (!input) return null
    if (!statistics.value && planStatus(input.plan) !== 'future') return null
    return input
  })

  /** « Ce mois-ci »: the month read. */
  const monthReading = computed(() => {
    const input = bandInput.value
    if (!input) return null
    return budgetMonthReading({
      ...input,
      selectedMonth: rowSelectedMonth.value,
      progress: comparison.selectedMonthProgress.value,
    })
  })

  /** The plan is over: the page reads its review (lot 6). */
  const isPlanFinished = computed(() => planStatus(plan.value) === 'past')

  /**
   * « Bilan du plan »: a finished plan, read whole (« Le plan », its
   * default) or one of its months.
   */
  const reviewReading = computed(() => {
    const input = bandInput.value
    if (!input || !isPlanFinished.value) return null
    return budgetReviewReading({
      ...input,
      selectedMonth: rowSelectedMonth.value,
      progress: null,
    })
  })

  /** « Voir la ligne »: the first envelope spent past, brought into view. */
  function showEnvelope(categoryId: string): void {
    document
      .getElementById(`budget-row-${categoryId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── « À faire » ──────────────────────────────────────────────────────────
  // The plan's few things to do (lib/budgetTodo.ts), on the dashboard's
  // card. Its lines link by route only: an anchor to a row or the projects
  // line, or this page with `?edit=1` / `?new=1`, which the page reads off
  // the URL once the plan is loaded, then drops (a reload must not reopen).

  /** Whether some plan covers today, the one shown or another. */
  const hasCurrentPlan = computed(() => {
    const month = currentYearMonth()
    const windows = plan.value
      ? [plan.value, ...planWindows.value]
      : planWindows.value
    return windows.some(
      w => w.startDate.slice(0, 7) <= month && month <= w.endDate.slice(0, 7)
    )
  })

  /**
   * Whether a plan starts after the one shown ends: the next one is made,
   * « À faire » no longer asks for it.
   */
  const hasNextPlan = computed(() => {
    const current = plan.value
    if (!current) return false
    const end = current.endDate.slice(0, 10)
    return planWindows.value.some(
      w => w.id !== current.id && w.startDate.slice(0, 10) > end
    )
  })

  const budgetTodoItems = computed(() => {
    const current = plan.value
    const status = planStatus(current)
    const input = readingInput.value
    if (!current || !status || !input) return []
    return composeBudgetTodoItems({
      plan: current,
      status,
      // A finished plan says the envelopes it spent past on average,
      // whichever month the band reads.
      reading:
        status === 'past'
          ? budgetMonthReading({
              ...input,
              selectedMonth: null,
              progress: null,
            })
          : monthReading.value,
      projects: projects.value,
      categoriesWithoutEnvelope: categoriesWithoutEnvelope({
        plan: current,
        completeMonthsCount: input.completeMonthsCount,
        categories: input.categories,
      }),
      hasCurrentPlan: hasCurrentPlan.value,
      hasNextPlan: hasNextPlan.value,
      currentMonth: currentYearMonth(),
    })
  })

  /**
   * The actions « À faire » links to: edit mode, a new plan, an anchor.
   * The router does not scroll within the page (`scrollBehavior`), so the
   * page brings the anchor into view itself. Each is read once, then taken
   * off the URL — the same line can be followed again, and a reload does
   * not reopen edit mode.
   */
  function consumeRouteActions(): void {
    if (isLoading.value) return
    const { edit, new: create, ...query } = route.query
    const hash = route.hash
    if (edit === undefined && create === undefined && !hash) return
    if (edit === '1' && plan.value && !isEditing.value) enterEditMode()
    if (create === '1' && !isEditing.value) openCreateModal()
    if (hash) {
      const id = decodeURIComponent(hash.slice(1))
      void nextTick(() => {
        document
          .getElementById(id)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
    void router.replace({ query, hash: '' })
  }

  watch(
    [() => route.query.edit, () => route.query.new, () => route.hash],
    consumeRouteActions
  )

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

  /**
   * The ranges « Dépenses et enveloppe par mois » draws: the plan's, and
   * the comparison's whenever one is chosen, in tracking as in editing
   * (Richard, 2026-10-24, back to the chart before lot 5).
   */
  const chartRanges = computed(() => ({
    planStartMonth: plan.value?.startDate.slice(0, 7),
    planEndMonth: plan.value?.endDate.slice(0, 7),
    comparisonStartMonth: comparisonRange.value?.startMonth,
    comparisonEndMonth: comparisonRange.value?.endMonth,
  }))

  /** The columns the chart would draw, in the statistics' order. */
  const chartMonths = computed(() =>
    budgetChartMonths(statistics.value?.monthLabels ?? [], {
      ...chartRanges.value,
      currentMonth: currentYearMonth(),
    })
  )

  /**
   * The chart's card shows as soon as a month of the plan has begun: it
   * carries « Comparer avec », which a one-month plan needs to draw a
   * second column. The chart itself waits for two.
   */
  const showChartCard = computed(() => chartMonths.value.length >= 1)
  const showMonthlyChart = computed(() => chartMonths.value.length >= 2)

  /**
   * « Dépenses et enveloppe par mois » is a native `details`, open on a
   * desk and folded below md, as the dashboard's chart is. `open` is an
   * attribute: the page follows the element's own toggle so a tap is
   * never undone by a render.
   */
  const isBelowMd = useIsMobile()
  const chartOpen = ref(!isBelowMd.value)
  function onChartToggle(event: Event): void {
    chartOpen.value = (event.target as HTMLDetailsElement).open
  }

  /**
   * The events' part of each month, stacked hatched on a row's drill-down
   * chart — in the real reading only, and only when a month carries any,
   * as on the dashboard's rows. « Vie courante » leaves them out of the
   * figures, so out of the chart.
   */
  function categoryChartOverlay(
    cat: CategoryAverageDto
  ): { values: number[]; label: string } | undefined {
    if (breakdownMode.value !== 'real' || !cat.monthlyAmounts) return undefined
    const events = comparison.exceptionalSeriesFor(cat)
    if (!events || !events.some(value => value !== 0)) return undefined
    return { values: events, label: 'événements' }
  }

  /**
   * A row's drill-down chart: the month in the active reading — under the
   * overlay, the real month less its events, so the stack adds up to the
   * real month.
   */
  function categoryChartData(cat: CategoryAverageDto) {
    const labels = (statistics.value?.monthLabels ?? []).map(ym =>
      formatMonth(ym, { year: false })
    )
    const overlay = categoryChartOverlay(cat)
    const values = overlay
      ? (cat.monthlyAmounts ?? []).map(
          (amount, i) =>
            Math.round((amount - (overlay.values[i] ?? 0)) * 100) / 100
        )
      : (comparison.seriesFor(cat) ?? [])
    return { labels, values }
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
   * Exceptional tags, to list the period's events under the projects.
   * Non-fatal: without them the rest of the page still reads.
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
      planWindows.value = summaries.map(({ id, startDate, endDate }) => ({
        id,
        startDate,
        endDate,
      }))
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
        fetchProjects(),
        fetchExceptionalTags(),
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
    planWindows.value = planWindows.value.filter(w => w.id !== deletedId)
    if (plan.value?.id !== deletedId) return

    // The displayed plan was the one that got deleted: clear local state
    // and try to fall back to whichever plan covers today.
    plan.value = null
    statistics.value = null
    adoptPlanEntries(null)
    monthChoice.value = undefined
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
      // one: the new plan opens on its default month until the user picks.
      monthChoice.value = undefined
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
    monthChoice.value = undefined
    isModalOpen.value = false
    planCount.value++
    planWindows.value = [
      ...planWindows.value,
      {
        id: created.id,
        startDate: created.startDate,
        endDate: created.endDate,
      },
    ]
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

  /**
   * Edit mode changes the page's question: « Planification » takes the
   * place of « Ce mois-ci », and the page brings it into view (lot 4).
   * `focusIncome` lands on the reference income's field, the way « Ce
   * mois-ci » offers when the plan has none.
   */
  function enterEditMode(options: { focusIncome?: boolean } = {}): void {
    clearSaveStatus()
    draft.restore()
    isEditing.value = true
    void nextTick(() => {
      document
        .querySelector('[data-testid="budget-planning-band"]')
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      if (options.focusIncome) {
        document
          .getElementById('budget-reference-income')
          ?.focus({ preventScroll: true })
      }
    })
  }

  function cancelEdit(): void {
    clearSaveStatus()
    draft.restore()
    isEditing.value = false
  }

  /**
   * « Choisir une comparaison »: « Comparer avec », on the chart's card,
   * brought to hand — the card unfolded first on a phone.
   */
  function chooseComparison(): void {
    chartOpen.value = true
    void nextTick(() => {
      const slot = document.getElementById('budget-comparison')
      slot?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      slot
        ?.querySelector<HTMLElement>('[data-testid^="comparison-option-"]')
        ?.focus({ preventScroll: true })
    })
  }

  /**
   * The comparison's monthly spending, the history « Marge vs historique »
   * weighs the draft against; null while no comparison is chosen.
   */
  const comparisonExpenseAvg = computed(() =>
    comparisonRange.value
      ? comparison.aggregatesFor(visibleExpenseCategories.value)
          .comparisonExpenseAvg
      : null
  )

  /** A freshly loaded plan: its entries are the new saved reference. */
  function adoptPlanEntries(loaded: BudgetPlanDto | null): void {
    draft.adopt(loaded)
    isEditing.value = false
  }

  async function saveBudget() {
    if (!plan.value) return
    const entries = draft.entriesToSave()
    try {
      isSaving.value = true
      clearSaveStatus()
      const updated = await api.updateBudgetPlan(plan.value.id, {
        entries,
        // Sent only when changed: null clears it, as the API reads it.
        ...(referenceIncomeDirty.value
          ? { referenceIncome: referenceIncomeInput.value }
          : {}),
      })
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

  /** A reference figure taken as the envelope: in edit mode only. */
  function setBudgetValue(categoryId: string, amount: number) {
    if (isEditing.value) draft.setBudgetValue(categoryId, amount)
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
      if (ref > 0) draft.setBudgetValue(cat.categoryId, ref)
    }
  }

  function adjustAllByPercent(percent: number) {
    draft.adjustAllByPercent(
      visibleExpenseCategories.value.map(c => c.categoryId),
      percent
    )
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
    void fetchData().then(consumeRouteActions)
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
    >
      <template #actions>
        <!-- The same reading as the dashboard's, behind the same button. -->
        <ReadingMenu
          v-model:breakdown-mode="breakdownMode"
          v-model:deduct-reimbursements="deductReimbursements"
          v-model:deduct-pending-reimbursements="deductPendingReimbursements"
          :has-exceptional-expenses="hasExceptionalInPlan"
          :has-amortized-expenses="hasAmortizedInPlan"
          :pending-sync-error="filtersStore.lastSyncError"
          compact
        />
      </template>
    </BudgetPlanHeader>

    <!-- A switch or a comparison refetches the figures: said in a line
         under the header while it runs, and with a retry when it fails. -->
    <p
      v-if="plan && isRefreshingStatistics"
      role="status"
      data-testid="budget-statistics-refreshing"
      class="-mt-3 mb-4 text-xs text-gray-500 dark:text-gray-400"
    >
      Mise à jour des chiffres…
    </p>
    <InlineAlert
      v-else-if="plan && statisticsError"
      class="mb-6"
      data-testid="budget-statistics-error"
      retry-label="Réessayer"
      retry-test-id="budget-statistics-retry"
      @retry="refreshStatistics"
    >
      Les chiffres n’ont pas pu être mis à jour : ils correspondent encore aux
      réglages précédents. {{ statisticsError }}
    </InlineAlert>

    <!-- A load that failed: the page's error alert, red as errors are. -->
    <InlineAlert v-if="error" class="mb-6" data-testid="budget-error">
      {{ error }}
    </InlineAlert>

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
          Voir l’historique ({{ planCount }})
        </BaseButton>
      </div>
    </div>

    <!-- Plan content -->
    <template v-else>
      <!-- « Ce mois-ci » first: holding the month is what the page is
           opened for. « Mois lu » lives in its header and steers the rows. -->
      <!-- A finished plan reads its review instead: « Bilan du plan »,
           « Le plan » by default in « Mois lu », or one of its months. -->
      <!-- Editing, the page asks what the plan foresees: « Planification »,
           the draft's figures, the edit bar's total. -->
      <BudgetPlanningBand
        v-if="isEditing"
        class="mb-6 scroll-mt-4"
        :plan-name="plan.name"
        :month-count="plan.monthCount"
        :reference-income="referenceIncomeInput"
        :saved-reference-income="savedReferenceIncome"
        :draft-total="draftPlanTotal"
        :saved-total="savedPlanTotal"
        :delta="draftDelta"
        :dirty-count="dirtyCategoryIds.length"
        :complete-months-income="completeMonthsIncome"
        :savings-target="plan.savingsTarget ?? null"
        :comparison-expense-avg="comparisonExpenseAvg"
        :comparison-label="comparisonRange?.label ?? null"
        @update:reference-income="referenceIncomeInput = $event"
        @choose-comparison="chooseComparison"
      />
      <BudgetReviewBand
        v-else-if="reviewReading"
        class="mb-6"
        :reading="reviewReading"
        :plan-name="plan.name"
        :plan-start="plan.startDate"
        :plan-end="plan.endDate"
        :month-options="monthOptions"
        :selected-month="rowSelectedMonth"
        :projects="projects"
        :project-reserve="plan.projectReserve ?? null"
        @select-month="selectMonth"
        @show-envelope="showEnvelope"
      />
      <BudgetMonthBand
        v-else-if="monthReading"
        class="mb-6"
        :reading="monthReading"
        :plan-start="plan.startDate"
        :month-options="monthOptions"
        :selected-month="rowSelectedMonth"
        :complete-months-count="comparison.completePlanMonthsCount.value"
        @select-month="selectMonth"
        @show-envelope="showEnvelope"
        @edit="enterEditMode({ focusIncome: true })"
      />

      <!-- The months, before the envelopes (Richard, 2026-10-24): a card
           open on a desk, folded below md as the dashboard's chart is,
           drawn once open (Apex measures its box, a folded one is 0px).
           « Comparer avec » lives here, in tracking as in editing: one
           selector, one state, the past drawn in grey beside the plan. -->
      <BaseCard
        v-if="showChartCard && statistics?.monthLabels"
        as="section"
        bordered
        padding="none"
        class="mb-6"
        data-testid="budget-chart-card"
        aria-labelledby="budget-chart-title"
      >
        <details
          data-testid="budget-chart-details"
          class="group"
          :open="chartOpen"
          @toggle="onChartToggle"
        >
          <summary
            data-testid="budget-chart-toggle"
            class="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:px-6 [&::-webkit-details-marker]:hidden"
          >
            <h2
              id="budget-chart-title"
              class="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              Dépenses et enveloppe par mois
            </h2>
            <span
              aria-hidden="true"
              class="text-xs text-gray-500 transition-transform group-open:rotate-180 dark:text-gray-400"
              >▾</span
            >
          </summary>
          <div v-if="chartOpen" class="space-y-3 px-4 pb-4 sm:px-6 sm:pb-6">
            <ComparisonSelector
              id="budget-comparison"
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
            <MonthlyExpensesChart
              v-if="showMonthlyChart"
              :monthly-totals="monthlyTotalExpenses"
              :month-labels="statistics.monthLabels"
              :average-income="chartAverageIncome"
              :total-budget="draftPlanTotal"
              :plan-start-month="chartRanges.planStartMonth"
              :plan-end-month="chartRanges.planEndMonth"
              :comparison-start-month="chartRanges.comparisonStartMonth"
              :comparison-end-month="chartRanges.comparisonEndMonth"
              :current-month="currentYearMonth()"
              @select-month="openMonthTransactions"
            />
            <p
              v-else
              data-testid="budget-chart-one-month"
              class="text-xs text-gray-500 dark:text-gray-400"
            >
              Un seul mois à dessiner : choisissez une comparaison pour voir les
              mois d’avant.
            </p>
          </div>
        </details>
      </BaseCard>

      <!-- Expense category list -->
      <BaseCard bordered>
        <BudgetTableControls
          v-model:sort-order="sortOrder"
          :editing="isEditing"
          :plan-is-past="planStatus(plan) === 'past'"
          :averages-source="averagesSource"
          @enter-edit="enterEditMode()"
          @apply-averages="applyAverageToAll"
          @adjust-percent="adjustAllByPercent"
          @reset="resetAllBudgets"
        >
        </BudgetTableControls>

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
            <span v-if="showHistoricalColumn" class="text-right">
              Historique
              <span
                class="block text-[10px] font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400"
              >
                {{ comparisonRange?.label }}
              </span>
            </span>
            <span v-if="isEditing || !showActualColumn" class="text-right">
              Enveloppe
              <span
                class="block text-[10px] font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400"
              >
                /mois
              </span>
            </span>
            <span v-if="showActualColumn" class="text-right">
              {{ selectedMonth ? 'Réel' : 'Réel à date' }}
              <span
                class="block text-[10px] font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400"
              >
                {{ actualPeriodLabel }}
              </span>
            </span>
            <span v-if="showMonthsColumn">
              Mois du plan
              <span
                data-testid="budget-months-header"
                class="block whitespace-nowrap text-[10px] font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400"
              >
                {{ planMonthsSpan }} ·
                <span
                  class="inline-block w-3 border-t border-dashed border-current align-middle"
                  aria-hidden="true"
                />
                <span class="sr-only">pointillé :</span>
                enveloppe
              </span>
            </span>
            <span aria-hidden="true" />
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
              :plan-months="rowPlanMonths"
              :plan-month-values="rowPlanMonthValues(cat)"
              :running-month="currentYearMonth()"
              :selected-month="rowSelectedMonth"
              :chart-data="categoryChartData(cat)"
              :chart-overlay="categoryChartOverlay(cat)"
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

        <!-- Under the envelopes, folded: the projects charged against the
             reserve, the smoothed purchases (everyday reading only), then
             the month-by-month grid. -->
        <div data-testid="budget-folded-lines" class="mt-2">
          <BudgetProjectsLine
            :projects="projects"
            :plan="plan"
            :events="planEvents"
            @open-tag="openTagAnalysis"
          />
          <BudgetAmortizedLine
            :purchases="planSmoothedPurchases"
            :current-month="currentYearMonth()"
          />

          <!-- Month by month, every envelope at once: folded everywhere,
               an occasional reading the rows already carry month by month. -->
          <details
            v-if="showMonthlyMatrix"
            data-testid="budget-matrix-details"
            class="group border-t border-gray-100 text-[13px] dark:border-slate-700"
          >
            <summary
              data-testid="budget-matrix-toggle"
              class="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 px-4 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 [&::-webkit-details-marker]:hidden"
            >
              <span class="font-semibold text-gray-900 dark:text-gray-100">
                Mois par mois
              </span>
              <span
                aria-hidden="true"
                class="text-xs text-gray-500 transition-transform group-open:rotate-180 dark:text-gray-400"
                >▾</span
              >
            </summary>
            <div class="px-4 pb-4">
              <BudgetMonthlyMatrix
                :months="matrixMonths"
                :rows="matrixRows"
                :selected-month="selectedMonth"
                :exceptional="everydayFilter"
              />
            </div>
          </details>
        </div>
      </BaseCard>

      <!-- « À faire » at the foot of the page (Richard, 2026-10-24): an
           envelope over, the project reserve overdrawn, a category without
           an envelope, the next plan. The dashboard's card; nothing
           rendered when nothing is to do, nor while editing. -->
      <TodoCard v-if="!isEditing" class="mt-6" :items="budgetTodoItems" />

      <BudgetEditBar
        v-if="isEditing || saveStatus === 'saved'"
        :dirty-count="dirtyCategoryIds.length"
        :income-changed="referenceIncomeDirty"
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
