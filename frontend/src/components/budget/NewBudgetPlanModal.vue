<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useModalA11y } from '@/composables/useModalA11y'
  import { api } from '@/lib/api'
  import type {
    BudgetPlanDto,
    BudgetPlanSummaryDto,
    BudgetStatisticsDto,
    CategoryAverageDto,
    CategoryDto,
  } from '@/lib/api'
  import StepIndicator from '@/components/ui/StepIndicator.vue'
  import PlanStepPeriod from './wizard/PlanStepPeriod.vue'
  import PlanStepSource from './wizard/PlanStepSource.vue'
  import PlanStepEnvelopes from './wizard/PlanStepEnvelopes.vue'
  import type { EnvelopeRow } from './wizard/PlanStepEnvelopes.vue'
  import { useFiltersStore } from '@/stores/filters'

  // ── Props / emits ────────────────────────────────────────────────────────
  const props = defineProps<{
    open: boolean
  }>()

  const emit = defineEmits<{
    (e: 'close'): void
    (e: 'created', plan: BudgetPlanDto): void
  }>()

  // Escape closes, Tab stays inside, focus returns to the opener after.
  const modalPanelRef = ref<HTMLElement | null>(null)
  useModalA11y({
    isOpen: () => props.open,
    onClose: () => onClose(),
    panel: modalPanelRef,
  })

  const filtersStore = useFiltersStore()

  /** Drop categories the user has globally hidden so they don't pollute the preview. */
  function isHidden(categoryId: string): boolean {
    return filtersStore.isExpenseCategoryGloballyHidden(categoryId)
  }

  function isHiddenIncome(categoryId: string): boolean {
    return filtersStore.isIncomeCategoryGloballyHidden(categoryId)
  }

  // ── Step 1 state ─────────────────────────────────────────────────────────
  type Preset = 'next-month' | 'next-quarter' | 'next-year' | 'custom'
  const preset = ref<Preset>('next-month')
  const startMonth = ref('') // YYYY-MM
  const endMonth = ref('') // YYYY-MM
  const name = ref('')
  const userEditedName = ref(false)

  // ── Step 2 state ─────────────────────────────────────────────────────────
  type InitSource = 'averages' | 'copy' | 'empty'
  const initSource = ref<InitSource>('averages')
  type LookbackOption = '3m' | '6m' | '12m'
  const lookback = ref<LookbackOption>('6m')
  /**
   * Which historical figure seeds the envelopes.
   * - 'everyday' : the recurring lifestyle, with one-off events (holidays,
   *   birthdays) taken out — otherwise a single trip in the lookback window
   *   gets budgeted every month of the plan.
   * - 'all'      : the raw average, events included.
   */
  type SeedBasis = 'everyday' | 'all'
  const seedBasis = ref<SeedBasis>('everyday')
  const copyFromPlanId = ref<string | null>(null)
  const previewEntries = ref<Map<string, number>>(new Map())
  const previewCategories = ref<CategoryAverageDto[]>([])
  // Reimbursement toggles for the averages preview (mirror BudgetPage defaults)
  const deductReimbursements = ref(true)
  const deductPendingReimbursements = ref(false)
  /**
   * Monthly income average over the lookback period — used as the reference
   * for "Épargne prévue" in step 2. We fetch this independently from the
   * categories preview so it stays available even when the user picks
   * "Copier un plan existant" or "Partir de zéro".
   */
  const referenceIncomeAvg = ref(0)
  const referenceIncomeLabel = ref('')

  // ── General state ────────────────────────────────────────────────────────
  const step = ref<1 | 2 | 3>(1)
  const STEP_LABELS = ['Période', 'Base de départ', 'Enveloppes & épargne']
  const isLoadingPreview = ref(false)
  const isSubmitting = ref(false)
  const error = ref<string | null>(null)

  // History for "copy" option (loaded once when the user picks copy)
  const existingPlans = ref<BudgetPlanSummaryDto[]>([])
  const isLoadingPlans = ref(false)

  /**
   * All EXPENSE categories owned by the user (fetched once when step 2 is
   * entered). Used to ensure every category appears in the preview even
   * when there's no historical data for it.
   */
  const allExpenseCategories = ref<CategoryDto[]>([])

  // ── Helpers ──────────────────────────────────────────────────────────────
  const MONTH_NAMES_FR = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
  ]

  function ymToParts(ym: string): { year: number; month: number } | null {
    const match = /^(\d{4})-(\d{2})$/.exec(ym)
    if (!match) return null
    return { year: Number(match[1]), month: Number(match[2]) }
  }

  function startDateOfMonth(ym: string): string {
    return `${ym}-01`
  }

  function endDateOfMonth(ym: string): string {
    const parts = ymToParts(ym)
    if (!parts) return ''
    // Day 0 of the next month gives the last day of the current month
    const last = new Date(Date.UTC(parts.year, parts.month, 0))
    const d = String(last.getUTCDate()).padStart(2, '0')
    return `${ym}-${d}`
  }

  function monthCount(startYm: string, endYm: string): number {
    const s = ymToParts(startYm)
    const e = ymToParts(endYm)
    if (!s || !e) return 0
    return Math.max(0, (e.year - s.year) * 12 + (e.month - s.month) + 1)
  }

  function shiftMonth(year: number, month: number, delta: number) {
    const total = (year - 1) * 12 + (month - 1) + delta
    return { year: Math.floor(total / 12) + 1, month: (total % 12) + 1 }
  }

  function ymOf(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`
  }

  function formatMonthLabel(ym: string): string {
    const parts = ymToParts(ym)
    if (!parts) return ym
    return `${MONTH_NAMES_FR[parts.month - 1]} ${parts.year}`
  }

  function suggestedName(startYm: string, endYm: string): string {
    if (!startYm || !endYm) return ''
    if (startYm === endYm) return `Budget ${formatMonthLabel(startYm)}`
    const s = ymToParts(startYm)
    const e = ymToParts(endYm)
    if (s && e && s.year === e.year) {
      return `Budget ${MONTH_NAMES_FR[s.month - 1]}–${MONTH_NAMES_FR[e.month - 1]} ${s.year}`
    }
    return `Budget ${formatMonthLabel(startYm)} → ${formatMonthLabel(endYm)}`
  }

  // ── Apply preset ─────────────────────────────────────────────────────────
  function applyPreset(p: Preset) {
    preset.value = p
    if (p === 'custom') return
    const now = new Date()
    const next = shiftMonth(now.getFullYear(), now.getMonth() + 1, 1) // next month
    if (p === 'next-month') {
      const ym = ymOf(next.year, next.month)
      startMonth.value = ym
      endMonth.value = ym
    } else if (p === 'next-quarter') {
      const start = next
      const end = shiftMonth(start.year, start.month, 2)
      startMonth.value = ymOf(start.year, start.month)
      endMonth.value = ymOf(end.year, end.month)
    } else if (p === 'next-year') {
      const start = next
      const end = shiftMonth(start.year, start.month, 11)
      startMonth.value = ymOf(start.year, start.month)
      endMonth.value = ymOf(end.year, end.month)
    }
  }

  // Auto-update name when range changes (unless user manually edited it)
  watch([startMonth, endMonth], ([s, e]) => {
    if (!userEditedName.value) {
      name.value = suggestedName(s, e)
    }
  })

  // ── Computed validation for step 1 ───────────────────────────────────────
  const step1Error = computed<string | null>(() => {
    if (!startMonth.value || !endMonth.value) return 'Renseignez la plage'
    const s = ymToParts(startMonth.value)
    const e = ymToParts(endMonth.value)
    if (!s || !e) return 'Format de mois invalide'
    if (e.year < s.year || (e.year === s.year && e.month < s.month)) {
      return 'La date de fin doit être après la date de début'
    }
    if (!name.value.trim()) return 'Donnez un nom au budget'
    return null
  })

  const planMonthCount = computed(() =>
    monthCount(startMonth.value, endMonth.value)
  )

  // ── Step 2: load preview ─────────────────────────────────────────────────
  function lookbackRange(opt: LookbackOption): {
    startDate: string
    endDate: string
  } | null {
    const startParts = ymToParts(startMonth.value)
    if (!startParts) return null
    // End the lookback at the last day of the most recent FULLY-ELAPSED
    // month — either the month before the plan starts, or the month before
    // today, whichever is earlier. Including the current (incomplete) month
    // would distort the average: the backend divides observed totals by the
    // full month count, so a partial month makes the average look smaller
    // than reality (the symptom is wrong "Revenus moyens" / "Épargne prévue"
    // values in the modal).
    const monthBeforePlan = shiftMonth(startParts.year, startParts.month, -1)
    const today = new Date()
    const monthBeforeToday = shiftMonth(
      today.getFullYear(),
      today.getMonth() + 1, // shiftMonth expects 1-based months
      -1
    )
    const planKey = monthBeforePlan.year * 12 + monthBeforePlan.month
    const todayKey = monthBeforeToday.year * 12 + monthBeforeToday.month
    const endParts = planKey < todayKey ? monthBeforePlan : monthBeforeToday
    const endYm = ymOf(endParts.year, endParts.month)
    const monthsBack = opt === '3m' ? 3 : opt === '6m' ? 6 : 12
    const startBack = shiftMonth(
      endParts.year,
      endParts.month,
      -(monthsBack - 1)
    )
    const startYm = ymOf(startBack.year, startBack.month)
    return {
      startDate: startDateOfMonth(startYm),
      endDate: endDateOfMonth(endYm),
    }
  }

  /**
   * Monthly figure a category is seeded with, per the active basis. Falls back
   * to the raw average when the backend sent no split (copied plans, older
   * responses) so the modal degrades to its previous behaviour.
   */
  function seedBasisAmount(cat: CategoryAverageDto): number {
    if (
      seedBasis.value === 'everyday' &&
      cat.everydayAveragePerMonth !== undefined
    ) {
      return cat.everydayAveragePerMonth
    }
    return cat.averagePerMonth
  }

  /**
   * Only categories that actually have a historical amount get a prefilled
   * input — others stay empty so the user must opt in.
   */
  function seedEntriesFrom(categories: CategoryAverageDto[]): void {
    previewEntries.value = new Map(
      categories
        .filter(c => !isHidden(c.categoryId) && seedBasisAmount(c) > 0)
        .map(c => [c.categoryId, Math.round(seedBasisAmount(c))])
    )
  }

  /** Exceptional share excluded from a row, 0 when the basis is 'all'. */
  function excludedFromSeed(cat: CategoryAverageDto): number {
    if (seedBasis.value !== 'everyday') return 0
    if (cat.everydayAveragePerMonth === undefined) return 0
    return cat.averagePerMonth - cat.everydayAveragePerMonth
  }

  const hasExceptionalInLookback = computed(() =>
    previewCategories.value.some(c => excludedFromSeed(c) > 0.005)
  )

  async function loadAveragesPreview() {
    const range = lookbackRange(lookback.value)
    if (!range) return
    isLoadingPreview.value = true
    error.value = null
    try {
      const statsPromise: Promise<BudgetStatisticsDto> =
        api.getBudgetStatistics({
          startDate: range.startDate,
          endDate: range.endDate,
          deductReimbursements: deductReimbursements.value,
          deductPendingReimbursements: deductPendingReimbursements.value,
          // When deducting pendings during budget planning, include every
          // currently-active pending request — not only those whose linked
          // expense falls inside the lookback window.
          includeAllPendingReimbursements: deductPendingReimbursements.value,
          includeMonthlyBreakdown: false,
        })
      const [stats] = await Promise.all([
        statsPromise,
        loadAllExpenseCategories(),
      ])
      previewCategories.value = mergeCategoriesWithStats(
        stats.expensesByCategory.filter(c => !isHidden(c.categoryId))
      )
      seedEntriesFrom(stats.expensesByCategory)
      // Income reference comes "for free" with this query; keep it for the
      // "Épargne prévue" indicator at the bottom of step 2.
      referenceIncomeAvg.value = computeIncomeReference(stats)
      referenceIncomeLabel.value = lookbackLabel(lookback.value)
      captureExceptionalReference(stats)
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Échec du chargement des moyennes'
    } finally {
      isLoadingPreview.value = false
    }
  }

  /**
   * Fetches just the monthly income average for the lookback period.
   * Called when the user picks a non-"averages" source so the "Épargne
   * prévue" indicator stays useful.
   */
  async function loadIncomeReference() {
    const range = lookbackRange(lookback.value)
    if (!range) return
    try {
      const stats = await api.getBudgetStatistics({
        startDate: range.startDate,
        endDate: range.endDate,
        deductReimbursements: true,
        deductPendingReimbursements: false,
        includeMonthlyBreakdown: false,
      })
      referenceIncomeAvg.value = computeIncomeReference(stats)
      referenceIncomeLabel.value = lookbackLabel(lookback.value)
      captureExceptionalReference(stats)
    } catch {
      referenceIncomeAvg.value = 0
      referenceIncomeLabel.value = ''
      lookbackExceptionalPerMonth.value = 0
    }
  }

  function lookbackLabel(opt: LookbackOption): string {
    if (opt === '3m') return '3 mois précédents'
    if (opt === '6m') return '6 mois précédents'
    return '12 mois précédents'
  }

  /**
   * Average monthly income over the lookback period.
   *
   * Sum of every income category total, MINUS:
   *   • reimbursement-associated income categories — already excluded by the
   *     backend (they live in `reimbursementsByExpenseCategory`, not
   *     `incomeByCategory`).
   *   • income categories the user has globally hidden in their preferences
   *     — applied here on the client.
   * …divided by `periodMonths` (calendar months in the lookback).
   *
   * Falls back to the backend's `averageMonthlyIncome` when no income
   * categories are returned (defensive — the backend always populates
   * `incomeByCategory` in practice).
   */
  function computeIncomeReference(stats: BudgetStatisticsDto): number {
    if (stats.periodMonths <= 0) return 0
    if (stats.incomeByCategory.length === 0) {
      return stats.averageMonthlyIncome
    }
    let totalVisible = 0
    for (const cat of stats.incomeByCategory) {
      if (isHiddenIncome(cat.categoryId)) continue
      totalVisible += cat.totalAmount
    }
    return totalVisible / stats.periodMonths
  }

  /** Load every expense category owned by the user once. */
  async function loadAllExpenseCategories() {
    if (allExpenseCategories.value.length > 0) return
    try {
      const all = await api.getCategories()
      allExpenseCategories.value = all.filter(
        c => c.type === 'EXPENSE' && !c.isExcludedFromBudget
      )
    } catch (err) {
      error.value =
        err instanceof Error
          ? err.message
          : 'Échec du chargement des catégories'
    }
  }

  /**
   * Build the preview list: every visible expense category, enriched with
   * `averagePerMonth` (+ reimbursement metadata) when available in the
   * stats response. Sort by historical average desc, then alpha so the
   * categories with no data fall at the bottom.
   */
  function mergeCategoriesWithStats(
    statsExpenses: CategoryAverageDto[]
  ): CategoryAverageDto[] {
    const statsById = new Map(statsExpenses.map(c => [c.categoryId, c]))
    const merged = allExpenseCategories.value
      .filter(c => !isHidden(c.id))
      .map<CategoryAverageDto>(cat => {
        const stat = statsById.get(cat.id)
        if (stat) return stat
        // No stats data for this category — minimal placeholder so the row
        // still renders (with "—" for the average and an empty input).
        const placeholder: CategoryAverageDto = {
          categoryId: cat.id,
          categoryName: cat.name,
          totalAmount: 0,
          transactionCount: 0,
          averagePerMonth: 0,
        }
        if (cat.icon) placeholder.categoryIcon = cat.icon
        return placeholder
      })
    return merged.sort((a, b) => {
      const av = a.averagePerMonth
      const bv = b.averagePerMonth
      if (av !== bv) return bv - av
      return a.categoryName.localeCompare(b.categoryName, 'fr')
    })
  }

  async function loadCopyPreview() {
    if (!copyFromPlanId.value) {
      await loadAllExpenseCategories()
      previewCategories.value = mergeCategoriesWithStats([])
      previewEntries.value = new Map()
      return
    }
    isLoadingPreview.value = true
    error.value = null
    try {
      const [source] = await Promise.all([
        api.getBudgetPlan(copyFromPlanId.value),
        loadAllExpenseCategories(),
      ])
      const visibleEntries = source.entries.filter(e => !isHidden(e.categoryId))
      const copiedAsAverages: CategoryAverageDto[] = visibleEntries.map(e => {
        const dto: CategoryAverageDto = {
          categoryId: e.categoryId,
          categoryName: e.categoryName,
          totalAmount: e.amount,
          transactionCount: 0,
          // We surface the copied amount in the "Moy." column so the user
          // can compare it side-by-side with their input.
          averagePerMonth: e.amount,
        }
        if (e.categoryIcon) dto.categoryIcon = e.categoryIcon
        return dto
      })
      previewCategories.value = mergeCategoriesWithStats(copiedAsAverages)
      previewEntries.value = new Map(
        visibleEntries.map(e => [e.categoryId, e.amount])
      )
    } catch (err) {
      error.value =
        err instanceof Error
          ? err.message
          : 'Échec du chargement du plan source'
    } finally {
      isLoadingPreview.value = false
    }
  }

  async function loadPlansList() {
    if (existingPlans.value.length > 0) return
    isLoadingPlans.value = true
    try {
      existingPlans.value = await api.getBudgetPlans()
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Échec du chargement des plans'
    } finally {
      isLoadingPlans.value = false
    }
  }

  // Switching the basis only re-seeds: the stats already carry both figures,
  // no need to hit the API again.
  watch(seedBasis, () => {
    if (step.value !== 2 || initSource.value !== 'averages') return
    seedEntriesFrom(previewCategories.value)
  })

  // Refresh the preview when the source / lookback / source plan / toggles change
  watch(
    [
      initSource,
      lookback,
      copyFromPlanId,
      step,
      deductReimbursements,
      deductPendingReimbursements,
    ],
    async ([source, , , stepValue], [, , , previousStepValue]) => {
      if (stepValue !== 2) return
      // Coming back from the envelopes must not reload: a reload re-seeds
      // the entries and would wipe what was just typed on step 3. Loading
      // happens on 1 → 2 and on any option change while step 2 is active.
      if (previousStepValue === 3) return
      if (source === 'averages') {
        // loadAveragesPreview already populates referenceIncomeAvg
        await loadAveragesPreview()
      } else if (source === 'copy') {
        await loadPlansList()
        await Promise.all([loadCopyPreview(), loadIncomeReference()])
      } else {
        // "Partir de zéro" — show every visible expense category with empty
        // inputs so the user can fill the ones they care about.
        await Promise.all([loadAllExpenseCategories(), loadIncomeReference()])
        previewCategories.value = mergeCategoriesWithStats([])
        previewEntries.value = new Map()
      }
    }
  )

  // ── Step transitions ─────────────────────────────────────────────────────
  function nextStep() {
    error.value = null
    if (step.value === 1) {
      if (step1Error.value) {
        error.value = step1Error.value
        return
      }
      step.value = 2
    } else if (step.value === 2) {
      step.value = 3
    }
  }

  function prevStep() {
    error.value = null
    if (step.value === 3) step.value = 2
    else if (step.value === 2) step.value = 1
  }

  // ── Manual entry edit ────────────────────────────────────────────────────
  function setEntryAmount(catId: string, value: string) {
    const num = parseFloat(value)
    if (Number.isFinite(num) && num > 0) {
      previewEntries.value.set(catId, num)
    } else {
      previewEntries.value.delete(catId)
    }
  }

  function getEntryAmount(catId: string): number {
    return previewEntries.value.get(catId) ?? 0
  }

  /** Ce que l'étape 3 affiche : une ligne précalculée par catégorie. */
  const envelopeRows = computed<EnvelopeRow[]>(() =>
    previewCategories.value.map(category => ({
      category,
      amount: getEntryAmount(category.categoryId),
      seedAverage: seedBasisAmount(category),
      excluded: excludedFromSeed(category),
    }))
  )

  const previewTotal = computed(() => {
    let total = 0
    for (const v of previewEntries.value.values()) total += v
    return total
  })

  /**
   * Projected monthly savings if the user applies this budget — assumes
   * the income observed on the lookback period stays similar.
   */
  const projectedSavings = computed(
    () => referenceIncomeAvg.value - previewTotal.value
  )

  /** True only when we actually have an income reference to display. */
  const showSavingsIndicator = computed(() => referenceIncomeAvg.value > 0)

  /**
   * Monthly amount the user decides to set aside. An input of the plan, not a
   * residual — null means they haven't decided, and the modal falls back to
   * showing the leftover the way it always did.
   */
  const savingsTarget = ref<number | null>(null)

  function setSavingsTarget(raw: string): void {
    const trimmed = raw.trim()
    if (trimmed === '') {
      savingsTarget.value = null
      return
    }
    const parsed = Number(trimmed)
    savingsTarget.value = Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }

  /**
   * Exceptional spend per month observed over the lookback window. Kept
   * per-month on purpose: annualising a 3-month window would be a guess.
   */
  const lookbackExceptionalPerMonth = ref(0)

  /** What the plan leaves for one-off projects, per month. */
  const monthlyProjectReserve = computed<number | null>(() => {
    if (savingsTarget.value === null) return null
    return referenceIncomeAvg.value - savingsTarget.value - previewTotal.value
  })

  /** Same figure over the whole plan — a project envelope is a total. */
  const planProjectReserve = computed<number | null>(() => {
    const monthly = monthlyProjectReserve.value
    if (monthly === null) return null
    return monthly * planMonthCount.value
  })

  /**
   * Gap between what the plan affords for projects and what the user's events
   * have actually cost. Negative means the plan is not financeable.
   */
  const reserveGap = computed<number | null>(() => {
    const monthly = monthlyProjectReserve.value
    if (monthly === null || lookbackExceptionalPerMonth.value <= 0) return null
    return monthly - lookbackExceptionalPerMonth.value
  })

  /** Records the observed exceptional spend from a statistics response. */
  function captureExceptionalReference(stats: BudgetStatisticsDto): void {
    if (stats.periodMonths <= 0 || !stats.totalExceptionalExpenses) {
      lookbackExceptionalPerMonth.value = 0
      return
    }
    lookbackExceptionalPerMonth.value =
      stats.totalExceptionalExpenses / stats.periodMonths
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function submit() {
    if (step1Error.value) {
      error.value = step1Error.value
      return
    }
    isSubmitting.value = true
    error.value = null
    try {
      const entries = Array.from(previewEntries.value.entries())
        .filter(([, amount]) => amount > 0)
        .map(([categoryId, amount]) => ({ categoryId, amount }))
      const created = await api.createBudgetPlan({
        name: name.value.trim(),
        startDate: startDateOfMonth(startMonth.value),
        endDate: endDateOfMonth(endMonth.value),
        entries,
        // Both halves of the equation travel together: a target without the
        // income it was decided against cannot produce a reserve.
        ...(savingsTarget.value !== null && referenceIncomeAvg.value > 0
          ? {
              savingsTarget: round2(savingsTarget.value),
              referenceIncome: round2(referenceIncomeAvg.value),
            }
          : {}),
      })
      emit('created', created)
      reset()
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Échec de la création du budget'
    } finally {
      isSubmitting.value = false
    }
  }

  function reset() {
    step.value = 1
    preset.value = 'next-month'
    applyPreset('next-month')
    userEditedName.value = false
    initSource.value = 'averages'
    lookback.value = '6m'
    copyFromPlanId.value = null
    previewEntries.value = new Map()
    previewCategories.value = []
    allExpenseCategories.value = []
    deductReimbursements.value = true
    deductPendingReimbursements.value = false
    referenceIncomeAvg.value = 0
    referenceIncomeLabel.value = ''
    savingsTarget.value = null
    lookbackExceptionalPerMonth.value = 0
    seedBasis.value = 'everyday'
    error.value = null
  }

  function round2(value: number): number {
    return Math.round(value * 100) / 100
  }

  function onClose() {
    if (isSubmitting.value) return
    reset()
    emit('close')
  }

  // Initialize defaults the first time the modal opens
  watch(
    () => props.open,
    open => {
      if (open && !startMonth.value) {
        applyPreset('next-month')
      }
    },
    { immediate: true }
  )
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="modalPanelRef"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      data-testid="new-budget-plan-modal"
      role="dialog"
      aria-modal="true"
      @click.self="onClose"
    >
      <div
        class="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700"
        >
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Nouveau budget
            </h2>
            <StepIndicator
              class="mt-2 justify-start"
              :steps="STEP_LABELS"
              :current="step"
            />
          </div>
          <button
            type="button"
            class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            :disabled="isSubmitting"
            @click="onClose"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto px-5 py-4">
          <!-- Step 1 : the period and the name -->
          <PlanStepPeriod
            v-if="step === 1"
            v-model:start-month="startMonth"
            v-model:end-month="endMonth"
            v-model:name="name"
            :preset="preset"
            :plan-month-count="planMonthCount"
            @set-preset="applyPreset"
            @name-edited="userEditedName = true"
          />

          <!-- Step 2 : how the envelopes start -->
          <PlanStepSource
            v-else-if="step === 2"
            v-model:init-source="initSource"
            v-model:lookback="lookback"
            v-model:seed-basis="seedBasis"
            v-model:deduct-reimbursements="deductReimbursements"
            v-model:deduct-pending-reimbursements="deductPendingReimbursements"
            v-model:copy-from-plan-id="copyFromPlanId"
            :existing-plans="existingPlans"
            :is-loading-plans="isLoadingPlans"
            :has-exceptional-in-lookback="hasExceptionalInLookback"
          />

          <!-- Step 3 : the envelopes themselves, and the savings equation -->
          <PlanStepEnvelopes
            v-else
            :rows="envelopeRows"
            :is-loading="isLoadingPreview"
            :copy-without-plan="initSource === 'copy' && !copyFromPlanId"
            :preview-total="previewTotal"
            :show-savings-indicator="showSavingsIndicator"
            :reference-income-avg="referenceIncomeAvg"
            :reference-income-label="referenceIncomeLabel"
            :projected-savings="projectedSavings"
            :savings-target="savingsTarget"
            :monthly-project-reserve="monthlyProjectReserve"
            :plan-project-reserve="planProjectReserve"
            :plan-month-count="planMonthCount"
            :reserve-gap="reserveGap"
            :lookback-exceptional-per-month="lookbackExceptionalPerMonth"
            @update-entry="setEntryAmount"
            @set-savings="setSavingsTarget"
          />

          <!-- Error banner -->
          <div
            v-if="error"
            class="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-3 py-2 rounded-lg text-sm"
            data-testid="modal-error"
          >
            {{ error }}
          </div>
        </div>

        <!-- Footer -->
        <div
          class="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-slate-700"
        >
          <button
            v-if="step > 1"
            type="button"
            data-testid="prev-step-button"
            class="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
            :disabled="isSubmitting"
            @click="prevStep"
          >
            ← Retour
          </button>
          <span v-else />
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
              :disabled="isSubmitting"
              @click="onClose"
            >
              Annuler
            </button>
            <button
              v-if="step < 3"
              type="button"
              data-testid="next-step-button"
              class="px-4 py-1.5 text-sm font-medium bg-primary-600 dark:bg-primary-500 text-white rounded-md hover:bg-primary-700 dark:hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              @click="nextStep"
            >
              Suivant →
            </button>
            <button
              v-else
              type="button"
              data-testid="create-plan-button"
              class="px-4 py-1.5 text-sm font-medium bg-primary-600 dark:bg-primary-500 text-white rounded-md hover:bg-primary-700 dark:hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              :disabled="isSubmitting"
              @click="submit"
            >
              <svg
                v-if="isSubmitting"
                class="animate-spin h-4 w-4"
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
              Créer le budget
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
