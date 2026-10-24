<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    AmortizedPurchaseDto,
    CategoryAverageDto,
    SubcategoryAverageDto,
  } from '@/lib/api'
  import { isAmortizationCarrier, smoothedSourceIds } from '@/lib/amortization'
  import {
    formatCompactCurrency,
    formatCurrency,
    formatMonth,
  } from '@/lib/formatters'
  import MonthsVsBudgetChart from '@/components/budget/MonthsVsBudgetChart.vue'
  import MonthlyBarChart from '@/components/charts/MonthlyBarChart.vue'
  import IconChevronRight from '@/components/icons/IconChevronRight.vue'
  import SectionLabel from '@/components/ui/SectionLabel.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import { NO_CATEGORY, transactionsLink } from '@/lib/transactionsLink'
  import {
    DATA_HUE,
    STATE_BADGE_CLASSES,
    STATE_COLORS,
    gapOf,
    type StateTone,
  } from '@/lib/stateTints'

  /**
   * One category of the budget table: the row and its drill-down panel.
   *
   * Tracking, the row says one figure, one chart, one state: the actual
   * with its envelope under it (« 465 € sur 500 € »), the plan's months
   * against that envelope, the badge. Everything else — the events' share,
   * the smoothed slices, the historical figure's link — waits in the
   * drill-down panel. Editing brings back the three numbers side by side,
   * the one moment they are worth their room.
   *
   * Every figure arrives precomputed — averages, margins, prorata, dirty
   * state — so this component is a pure view over data the page derives
   * once, and the three ways a row can change a budget (typing, taking
   * the historical average, taking the actual) leave as events. The page
   * keeps the drafts, the sorting and the API. Taking a reference figure
   * is a visible « Reprendre » button under it, never the figure itself
   * dressed as a link: a number that rewrites an envelope when clicked
   * is a trap, not an affordance.
   */
  const props = defineProps<{
    category: CategoryAverageDto
    expanded: boolean
    editing: boolean
    showHistorical: boolean
    showActual: boolean
    historicalAverage: number
    actualAverage: number
    exceptionalAverage: number
    budget: number
    savedBudget: number
    dirty: boolean
    proratedBudget: number | null
    rowStatus: 'over' | 'covered' | 'none'
    marginVsHistorical: number
    remainingVsActual: number
    /**
     * The plan months already started (`YYYY-MM`) and the category's
     * spending in each, same order: the columns of the row's chart. Empty
     * on a plan that has not begun — no chart then.
     */
    planMonths: string[]
    planMonthValues: number[]
    /** The month still running, drawn lighter on the chart. */
    runningMonth?: string | undefined
    /** The month the page isolated, if any, drawn on a band. */
    selectedMonth?: string | null | undefined
    chartData: { labels: string[]; values: number[] }
    /**
     * The events' part of each month, stacked hatched on the drill-down
     * chart over `chartData` (then the rest of each month) — in the real
     * reading only, as on the dashboard's rows. Undefined otherwise.
     */
    chartOverlay?: { values: number[]; label: string } | undefined
    breakdownMode: 'real' | 'everyday'
    /**
     * The windows the two reference figures cover, for the links to the
     * Transactions page: the comparison months behind « Historique », the
     * plan months — or the one isolated — behind « Réel ». Each figure is
     * netted and shared, so its link carries `gross`.
     */
    historicalWindow?: { from: string; to: string; label: string } | null
    actualWindow?: { from: string; to: string; label: string } | null
    /** The `YYYY-MM` behind each bar of the drill-down chart. */
    monthKeys?: string[] | undefined
    /**
     * The whole window the statistics cover — what the subcategory lines
     * of the drill-down add up.
     */
    breakdownWindow?: { from: string; to: string } | null
    /**
     * Read « Vie courante »: the slices of smoothed purchases in « Réel »
     * — the « dont X € lissés ». 0 otherwise.
     */
    amortizedAverage?: number | undefined
    /**
     * Read « Vie courante »: the category's smoothed purchases, so a link
     * shows the ones whose slices its figure counts. Empty otherwise.
     */
    smoothedPurchases?: AmortizedPurchaseDto[] | undefined
  }>()

  const emit = defineEmits<{
    'toggle-expand': []
    'update-budget': [raw: string]
    'apply-budget': [amount: number]
    /** A bar of the drill-down chart was clicked — its `YYYY-MM`. */
    'select-month': [yearMonth: string]
  }>()

  /**
   * In « Vie courante » both reference figures leave the events out; their
   * links do the same.
   */
  function windowLink(window: { from: string; to: string; label: string }) {
    return transactionsLink({
      type: 'EXPENSE',
      categoryId: props.category.categoryId,
      from: window.from,
      to: window.to,
      exceptional: props.breakdownMode === 'everyday' ? 'exclude' : undefined,
      alsoIds: smoothedSourceIds(props.smoothedPurchases, {
        categoryId: props.category.categoryId,
        from: window.from.slice(0, 7),
        to: window.to.slice(0, 7),
      }),
      gross: true,
      label: `${props.category.categoryName} · ${window.label}`,
    })
  }

  /** The events' share of « Réel », on its own: what « dont / hors » names. */
  function exceptionalLink(window: {
    from: string
    to: string
    label: string
  }) {
    return transactionsLink({
      type: 'EXPENSE',
      categoryId: props.category.categoryId,
      from: window.from,
      to: window.to,
      exceptional: 'only',
      gross: true,
      label: `${props.category.categoryName} · événements · ${window.label}`,
    })
  }

  function subcategoryName(sub: SubcategoryAverageDto): string {
    return sub.subcategory || 'sans sous-catégorie'
  }

  /**
   * Whether a line reads « Vie courante »: only a line a smoothed purchase
   * touches carries its own everyday figures; every other line keeps the
   * one it always had, events included.
   */
  function readsEveryday(sub: SubcategoryAverageDto): boolean {
    return (
      props.breakdownMode === 'everyday' && sub.everydayAmount !== undefined
    )
  }

  /**
   * The lines shown: in the real reading, not the ones the backend added for
   * slices alone — that reading must look as it did before smoothing.
   */
  const subcategoryLines = computed(() =>
    (props.category.subcategories ?? []).filter(
      sub => props.breakdownMode !== 'real' || !isAmortizationCarrier(sub)
    )
  )

  /**
   * A subcategory line opens the rows it sums, by the subcategory's id —
   * `none` for the rows filed under none. Its figure counts every row,
   * events included, so the link never narrows on them — unless the line
   * reads « Vie courante », when it leaves the events out and adds the
   * smoothed purchases whose slices it counts, like its figure.
   */
  function subcategoryLink(sub: SubcategoryAverageDto) {
    const window = props.breakdownWindow
    if (!window) return null
    const everyday = readsEveryday(sub)
    return transactionsLink({
      type: 'EXPENSE',
      categoryId: props.category.categoryId,
      subcategoryId: sub.subcategoryId ?? NO_CATEGORY,
      from: window.from,
      to: window.to,
      exceptional: everyday ? 'exclude' : undefined,
      alsoIds: everyday
        ? smoothedSourceIds(props.smoothedPurchases, {
            categoryId: props.category.categoryId,
            subcategoryId: sub.subcategoryId,
            from: window.from.slice(0, 7),
            to: window.to.slice(0, 7),
          })
        : undefined,
      gross: true,
      label: `${props.category.categoryName} · ${subcategoryName(sub)}`,
    })
  }
  /** Below a cent, a month is not « above » its envelope — as on the chart. */
  const TOLERANCE = 0.005

  /** « octobre »: a month named in a sentence. */
  function monthName(ym: string): string {
    return formatMonth(ym, { style: 'long', year: false, capitalize: false })
  }

  /** The envelope under the figure: « sur 500 € », or « sans enveloppe ». */
  const envelopeNote = computed(() =>
    props.budget > TOLERANCE
      ? `sur ${formatCompactCurrency(props.budget)}`
      : 'sans enveloppe'
  )

  /**
   * The chart said in words, for a screen reader: « 5 mois, 2 au-dessus de
   * l'enveloppe de 133 €, octobre en cours ».
   */
  const chartLabel = computed(() => {
    const parts = [`${props.planMonths.length} mois`]
    if (props.budget > TOLERANCE) {
      const over = props.planMonthValues.filter(
        v => v > props.budget + TOLERANCE
      ).length
      parts.push(
        `${over === 0 ? 'aucun' : over} au-dessus de l'enveloppe de ${formatCompactCurrency(props.budget)}`
      )
    } else {
      parts.push('sans enveloppe')
    }
    const running = props.runningMonth
    if (running && props.planMonths.includes(running)) {
      parts.push(`${monthName(running)} en cours`)
    }
    const selected = props.selectedMonth
    if (selected && props.planMonths.includes(selected)) {
      parts.push(`${monthName(selected)} isolé`)
    }
    return parts.join(', ')
  })

  /**
   * The window behind the row's figure, for its one link: the actual's
   * when the row reads it, the comparison's otherwise. No link on a
   * figure at zero — there is nothing to open.
   */
  const figureWindow = computed(() => {
    if (props.showActual) {
      return props.actualWindow && props.actualAverage > 0
        ? props.actualWindow
        : null
    }
    return props.showHistorical &&
      props.historicalWindow &&
      props.historicalAverage > 0
      ? props.historicalWindow
      : null
  })

  /** The smoothed purchases whose slices « dont X € lissés » counts. */
  const amortizedLink = computed(() => {
    const window = props.actualWindow
    if (!window) return null
    const ids = smoothedSourceIds(props.smoothedPurchases, {
      categoryId: props.category.categoryId,
      from: window.from.slice(0, 7),
      to: window.to.slice(0, 7),
    })
    if (!ids) return null
    return transactionsLink({
      ids,
      gross: true,
      label: `${props.category.categoryName} · achats lissés · ${window.label}`,
    })
  })

  /** Whether the drill-down has anything to say under the tiles. */
  const showExceptional = computed(
    () => props.showActual && props.exceptionalAverage > TOLERANCE
  )
  const showAmortized = computed(
    () =>
      props.showActual &&
      props.breakdownMode === 'everyday' &&
      (props.amortizedAverage ?? 0) > TOLERANCE
  )
  /**
   * The state of the figure against its envelope: to date on a month still
   * running, whole otherwise — the same rule as « Ce mois-ci ». Neutral
   * within ±5 % or without an envelope.
   */
  const envelopeTone = computed<StateTone>(
    () => gapOf(props.actualAverage, props.proratedBudget ?? props.budget).tone
  )

  const envelopeBadge = computed(() => {
    if (envelopeTone.value === 'under') return 'sous l’enveloppe'
    if (envelopeTone.value === 'over') return 'au-dessus de l’enveloppe'
    return 'dans l’enveloppe'
  })

  /**
   * « 3 mois sur 4 sous l'enveloppe »: the plan months already closed —
   * the running one is not judged on a total it has not reached — held
   * within the envelope. Null with no closed month or no envelope.
   */
  const monthsHeld = computed(() => {
    if (props.budget <= TOLERANCE) return null
    const closed = props.planMonthValues.filter(
      (_, i) => props.planMonths[i] !== props.runningMonth
    )
    if (closed.length === 0) return null
    const held = closed.filter(v => v <= props.budget + TOLERANCE).length
    return `${held} mois sur ${closed.length} sous l’enveloppe`
  })

  /** The envelope's fact, only once there is an actual to read it with. */
  const showEnvelopeFacts = computed(
    () => props.showActual && props.budget > TOLERANCE
  )

  /** « Marge vs historique », a planning fact: in edit mode only. */
  const showMargin = computed(
    () =>
      props.editing &&
      props.showHistorical &&
      props.budget > TOLERANCE &&
      props.historicalAverage > 0
  )

  const signedCurrency = (value: number): string =>
    `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCurrency(Math.abs(value))}`

  /** The drill-down chart's dashed line: the envelope, when there is one. */
  const chartReference = computed(() =>
    props.budget > TOLERANCE ? props.budget : undefined
  )

  const showHistoricalLink = computed(
    () =>
      props.showHistorical &&
      !!props.historicalWindow &&
      props.historicalAverage > 0
  )
</script>

<template>
  <!-- A subgrid of the page's table from `sm`: the columns are the
       table's, sized over every row. -->
  <!-- The id is the anchor « Voir la ligne » and « À faire » scroll to. -->
  <div
    :id="`budget-row-${category.categoryId}`"
    :data-testid="`budget-row-${category.categoryName}`"
    class="sm:col-span-full sm:grid sm:grid-cols-subgrid"
  >
    <!-- Row. Tracking on a phone: the name, the figure on its right, the
         link; the historical figure under them. Editing on a phone: the
         name, then the three numbers side by side. -->
    <div
      class="col-span-full grid sm:grid-cols-subgrid sm:gap-x-6 gap-x-3 gap-y-2 sm:gap-y-0 items-center py-3 sm:py-4 px-4 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
      :class="editing ? 'grid-cols-3' : 'grid-cols-[minmax(0,1fr)_auto_auto]'"
    >
      <!-- Name + chevron + status badge -->
      <button
        type="button"
        class="flex items-center gap-2 min-w-0 text-left sm:col-span-1 sm:col-start-auto sm:row-start-auto"
        :class="editing ? 'col-span-2' : 'col-start-1 row-start-1'"
        :aria-expanded="expanded"
        @click="emit('toggle-expand')"
      >
        <IconChevronRight
          class="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0 transition-transform"
          :class="{ 'rotate-90': expanded }"
        />
        <span v-if="category.categoryIcon" class="text-lg shrink-0">
          {{ category.categoryIcon }}
        </span>
        <span class="font-medium text-gray-900 dark:text-gray-100 truncate">
          {{ category.categoryName }}
        </span>
        <!-- Status badge: the envelope spent past, in the state amber.
             « Couvert » (the envelope covers the history) is a planning
             fact: in edit mode only. -->
        <span
          v-if="rowStatus === 'over'"
          :data-testid="`budget-status-${category.categoryName}`"
          data-tone="over"
          class="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded shrink-0"
          :class="STATE_BADGE_CLASSES.over"
          title="Dépassement par rapport au budget"
        >
          Dépassé
        </span>
        <span
          v-else-if="rowStatus === 'covered' && editing"
          :data-testid="`budget-status-${category.categoryName}`"
          data-tone="neutral"
          class="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded shrink-0"
          :class="STATE_BADGE_CLASSES.neutral"
          title="Le budget couvre la moyenne historique"
        >
          Couvert
        </span>
      </button>

      <!-- Historique (when a comparison is chosen), in plain ink; its
           link waits in the drill-down panel. -->
      <div
        v-if="showHistorical"
        class="text-sm tabular-nums leading-tight sm:block sm:text-right sm:col-span-1 sm:row-start-auto"
        :class="
          editing
            ? 'text-right'
            : 'col-span-3 row-start-2 flex items-baseline justify-between gap-2'
        "
      >
        <span
          class="block text-[10px] uppercase tracking-wide text-gray-500 sm:hidden dark:text-gray-400"
          >Historique</span
        >
        <span
          v-if="historicalAverage > 0"
          class="text-gray-700 dark:text-gray-300"
        >
          {{ formatCurrency(historicalAverage) }}
        </span>
        <span v-else class="text-gray-500 dark:text-gray-400">—</span>
        <BaseButton
          v-if="editing && historicalAverage > 0"
          variant="ghost"
          size="sm"
          class="mt-0.5 !px-1.5 !py-0.5 !text-xs"
          :aria-label="`Reprendre la moyenne historique de ${category.categoryName} (${formatCurrency(historicalAverage)}) comme budget`"
          :data-testid="`budget-take-historical-${category.categoryName}`"
          @click="emit('apply-budget', historicalAverage)"
        >
          Reprendre
        </BaseButton>
      </div>

      <!-- Editing: the envelope field, then « Réel » beside it. -->
      <template v-if="editing">
        <div class="text-right">
          <span
            class="block text-[10px] uppercase tracking-wide text-gray-500 sm:hidden dark:text-gray-400"
            >Enveloppe</span
          >
          <div class="relative inline-block w-full sm:w-auto">
            <input
              type="number"
              min="0"
              step="1"
              :value="budget > 0 ? budget : ''"
              placeholder="—"
              inputmode="decimal"
              :data-testid="`budget-input-${category.categoryName}`"
              class="w-full min-h-[40px] sm:min-h-0 sm:w-28 pl-2 pr-7 py-1.5 text-sm text-right bg-white dark:bg-slate-900 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 dark:text-gray-100 tabular-nums font-medium"
              :class="
                dirty
                  ? 'border-primary-500 dark:border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-primary-300 dark:border-primary-800'
              "
              @input="
                emit('update-budget', ($event.target as HTMLInputElement).value)
              "
            />
            <span
              class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none"
            >
              €
            </span>
            <!-- What this envelope was before the draft touched it. -->
            <span
              v-if="dirty"
              :data-testid="`budget-was-${category.categoryName}`"
              class="block text-[10px] text-gray-500 dark:text-gray-400 line-through tabular-nums text-right"
            >
              {{ formatCurrency(savedBudget) }}
            </span>
          </div>
        </div>

        <div
          v-if="showActual"
          class="text-right text-sm tabular-nums leading-tight"
        >
          <span
            class="block text-[10px] uppercase tracking-wide text-gray-500 sm:hidden dark:text-gray-400"
            >Réel</span
          >
          <span
            v-if="actualAverage > 0"
            class="font-semibold text-gray-900 dark:text-gray-100"
          >
            {{ formatCurrency(actualAverage) }}
          </span>
          <span v-else class="text-gray-500 dark:text-gray-400">—</span>
          <BaseButton
            v-if="actualAverage > 0"
            variant="ghost"
            size="sm"
            class="mt-0.5 !px-1.5 !py-0.5 !text-xs"
            :aria-label="`Reprendre le réel de ${category.categoryName} (${formatCurrency(actualAverage)}) comme budget`"
            :data-testid="`budget-take-actual-${category.categoryName}`"
            @click="emit('apply-budget', actualAverage)"
          >
            Reprendre
          </BaseButton>
        </div>
      </template>

      <!-- Tracking: the figure — the actual over its envelope, or the
           envelope alone before the plan has a month to read. -->
      <div
        v-else
        class="col-start-2 row-start-1 text-right text-sm tabular-nums leading-tight whitespace-nowrap sm:col-start-auto sm:row-start-auto"
      >
        <!-- « 162 € sur 150 € », one figure in the ink. -->
        <span
          v-if="showActual"
          class="block text-gray-900 dark:text-gray-100"
          :data-testid="`budget-figure-${category.categoryName}`"
        >
          <span class="font-semibold">{{
            actualAverage > 0 ? formatCurrency(actualAverage) : '—'
          }}</span>
          {{ ' ' }}
          <span :data-testid="`budget-value-${category.categoryName}`">{{
            envelopeNote
          }}</span>
        </span>
        <template v-else>
          <span
            v-if="budget > 0"
            :data-testid="`budget-value-${category.categoryName}`"
            class="block font-semibold text-gray-900 dark:text-gray-100"
          >
            {{ formatCurrency(budget) }}
          </span>
          <span
            v-else
            :data-testid="`budget-value-${category.categoryName}`"
            class="block text-xs text-gray-500 dark:text-gray-400"
          >
            sans enveloppe
          </span>
        </template>
        <!-- On a month still running, the envelope's fair share to date —
             so a half-finished month is judged on pace. -->
        <span
          v-if="proratedBudget !== null"
          :data-testid="`budget-prorata-${category.categoryName}`"
          class="block text-xs text-gray-500 dark:text-gray-400"
          title="Part du budget correspondant aux jours écoulés"
        >
          {{ formatCompactCurrency(proratedBudget ?? 0) }} à ce jour
        </span>
      </div>

      <!-- Mois du plan: each started month against the envelope — the
           draft's while editing, so the dashed line follows the field. -->
      <div v-if="planMonths.length > 0" class="hidden sm:flex items-center">
        <MonthsVsBudgetChart
          :values="planMonthValues"
          :months="planMonths"
          :budget="budget"
          :running-month="runningMonth"
          :selected-month="selectedMonth ?? undefined"
          :label="chartLabel"
        />
      </div>

      <!-- The one link of the row: the transactions behind its figure. -->
      <div
        class="col-start-3 row-start-1 flex justify-end sm:col-start-auto sm:row-start-auto"
      >
        <TransactionsLink
          v-if="figureWindow"
          :to="windowLink(figureWindow)"
          :subject="`${category.categoryName} · ${figureWindow.label}`"
          icon-only
          :data-testid="`budget-actual-link-${category.categoryName}`"
        />
      </div>
    </div>

    <!-- Drill-down panel -->
    <div
      v-if="expanded"
      class="col-span-full min-w-0 bg-gray-50 dark:bg-slate-800/40 px-4 py-5 border-t border-gray-100 dark:border-slate-700 space-y-5"
    >
      <!-- What the row's figure leaves unsaid, in one list of facts in the
           ink, each with the rows behind it: what is left of the envelope
           and the months held, the margin on the history (edit mode), the
           comparison's figure, the events' share, the smoothed slices. -->
      <ul
        v-if="
          showEnvelopeFacts ||
          showMargin ||
          showHistoricalLink ||
          showExceptional ||
          showAmortized
        "
        :data-testid="`budget-row-facts-${category.categoryName}`"
        class="space-y-1 text-xs text-gray-500 tabular-nums dark:text-gray-400"
      >
        <li
          v-if="showEnvelopeFacts"
          :data-testid="`budget-row-envelope-${category.categoryName}`"
          class="flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <span v-if="remainingVsActual >= 0">
            Reste
            <strong class="font-semibold text-gray-900 dark:text-gray-100">{{
              formatCurrency(remainingVsActual)
            }}</strong>
            sur l’enveloppe
          </span>
          <span v-else>
            Dépassement de
            <strong class="font-semibold text-gray-900 dark:text-gray-100">{{
              formatCurrency(-remainingVsActual)
            }}</strong>
            sur l’enveloppe
          </span>
          <template v-if="monthsHeld">
            <span aria-hidden="true">·</span>
            <span
              :data-testid="`budget-row-months-held-${category.categoryName}`"
            >
              {{ monthsHeld }}
            </span>
          </template>
          <span
            :data-testid="`budget-row-badge-${category.categoryName}`"
            :data-tone="envelopeTone"
            class="rounded-full px-2 py-0.5 font-semibold"
            :class="STATE_BADGE_CLASSES[envelopeTone]"
          >
            {{ envelopeBadge }}
          </span>
        </li>
        <li
          v-if="showMargin"
          :data-testid="`budget-row-margin-${category.categoryName}`"
        >
          Marge vs historique :
          <strong class="font-semibold text-gray-900 dark:text-gray-100">{{
            signedCurrency(marginVsHistorical)
          }}</strong>
          par mois
        </li>
        <li
          v-if="showHistoricalLink && historicalWindow"
          class="flex flex-wrap items-center gap-x-2"
        >
          <span>
            Historique · {{ historicalWindow.label }} :
            <strong class="font-semibold text-gray-900 dark:text-gray-100">{{
              formatCurrency(historicalAverage)
            }}</strong>
            par mois
          </span>
          <TransactionsLink
            :to="windowLink(historicalWindow)"
            :subject="`${category.categoryName} · ${historicalWindow.label}`"
            :data-testid="`budget-historical-link-${category.categoryName}`"
          >
            Voir
          </TransactionsLink>
        </li>
        <!-- The event share, said in words: « hors » when the everyday
             reading left it out, « dont » when the real one counts it. -->
        <li v-if="showExceptional" class="flex flex-wrap items-center gap-x-2">
          <span :data-testid="`budget-exceptional-${category.categoryName}`">
            Réel {{ breakdownMode === 'everyday' ? 'hors' : 'dont' }}
            <strong class="font-semibold text-gray-900 dark:text-gray-100">{{
              formatCurrency(exceptionalAverage)
            }}</strong>
            d'événements
          </span>
          <TransactionsLink
            v-if="actualWindow"
            :to="exceptionalLink(actualWindow)"
            :subject="`${category.categoryName} · événements · ${actualWindow.label}`"
            :data-testid="`budget-exceptional-link-${category.categoryName}`"
          >
            Voir
          </TransactionsLink>
        </li>
        <!-- Read « Vie courante », the slices of smoothed purchases the
             figure counts in place of the purchases themselves. -->
        <li v-if="showAmortized" class="flex flex-wrap items-center gap-x-2">
          <span :data-testid="`budget-amortized-${category.categoryName}`">
            Réel dont
            <strong class="font-semibold text-gray-900 dark:text-gray-100">{{
              formatCurrency(amortizedAverage ?? 0)
            }}</strong>
            lissés
          </span>
          <TransactionsLink
            v-if="amortizedLink"
            :to="amortizedLink"
            :subject="`${category.categoryName} · achats lissés`"
            :data-testid="`budget-amortized-row-link-${category.categoryName}`"
          >
            Voir
          </TransactionsLink>
        </li>
      </ul>

      <!-- Subcategories -->
      <div v-if="subcategoryLines.length > 0">
        <SectionLabel as="h3" class="mb-2"> Sous-catégories </SectionLabel>
        <div class="space-y-1">
          <div
            v-for="sub in subcategoryLines"
            :key="sub.subcategoryId ?? '(sans sous-catégorie)'"
            class="flex items-center gap-3 py-1.5 pl-3 pr-1 rounded text-sm bg-white dark:bg-slate-900"
          >
            <span class="flex-1 truncate text-gray-700 dark:text-gray-300">
              {{ sub.subcategory || '(sans sous-catégorie)' }}
            </span>
            <span
              class="hidden text-xs text-gray-500 tabular-nums shrink-0 sm:inline dark:text-gray-400"
            >
              {{ sub.transactionCount }} tx
            </span>
            <span
              class="font-medium text-gray-900 dark:text-gray-100 tabular-nums shrink-0 text-right"
              :data-testid="`budget-subcategory-amount-${category.categoryName}-${sub.subcategory || 'none'}`"
            >
              {{
                formatCurrency(
                  readsEveryday(sub)
                    ? (sub.everydayAmount ?? sub.totalAmount)
                    : sub.totalAmount
                )
              }}
              <span
                v-if="readsEveryday(sub) && (sub.amortizedAmount ?? 0) > 0.005"
                class="block text-[10px] font-normal text-teal-700 dark:text-teal-400"
              >
                dont {{ formatCurrency(sub.amortizedAmount ?? 0) }} lissés
              </span>
            </span>
            <span
              class="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0 hidden sm:inline"
            >
              {{
                formatCurrency(
                  readsEveryday(sub)
                    ? (sub.everydayAveragePerMonth ?? sub.averagePerMonth)
                    : sub.averagePerMonth
                )
              }}/mois
            </span>
            <TransactionsLink
              v-if="subcategoryLink(sub)"
              :to="subcategoryLink(sub)!"
              :subject="`${category.categoryName} · ${subcategoryName(sub)}`"
              icon-only
              class="-my-1"
              :data-testid="`budget-subcategory-link-${category.categoryName}-${sub.subcategory || 'none'}`"
            />
          </div>
        </div>
      </div>

      <!-- Monthly evolution chart -->
      <div v-if="(category.monthlyAmounts?.length ?? 0) >= 2">
        <SectionLabel as="h3" class="mb-2"> Évolution mensuelle </SectionLabel>
        <!-- A bar opens its month; the links beside the figures above
             are the keyboard way to the same category. The dashed line
             is the envelope; in the real reading the events stack
             hatched on the rest of each month, as on the dashboard. -->
        <MonthlyBarChart
          :data="chartData"
          :title="category.categoryName"
          :color="DATA_HUE"
          :negative-color="STATE_COLORS.neutral"
          :months="monthKeys"
          :reference="chartReference"
          :overlay="chartOverlay"
          @select-month="month => emit('select-month', month)"
        />
      </div>

      <!-- Reimbursement info -->
      <div
        v-if="category.reimbursement || category.pendingReimbursement"
        class="mt-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400"
      >
        <span v-if="category.reimbursement">
          Remboursements reçus déduits :
          <strong class="text-gray-700 dark:text-gray-300">
            {{ formatCurrency(category.reimbursement) }}
          </strong>
        </span>
        <span v-if="category.pendingReimbursement">
          En attente déduits :
          <strong class="text-gray-700 dark:text-gray-300">
            {{ formatCurrency(category.pendingReimbursement) }}
          </strong>
        </span>
      </div>
    </div>
  </div>
</template>
