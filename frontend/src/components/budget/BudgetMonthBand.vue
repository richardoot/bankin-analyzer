<script setup lang="ts">
  import { computed } from 'vue'
  import type { BudgetMonthReading } from '@/lib/budgetMonth'
  import {
    DATA_HUE,
    STATE_BADGE_CLASSES,
    STATE_COLORS,
    type StateTone,
  } from '@/lib/stateTints'
  import {
    formatDate,
    formatEuros as euros,
    formatMonth,
    formatSignedEuros as signedEuros,
    formatSignedPercent as gapLabel,
    plural,
  } from '@/lib/formatters'
  import {
    BADGE,
    BADGE_LINE,
    DETAIL,
    FIGURE,
    FIGURE_UNIT,
    LINK,
    TILE,
    TILES_GRID,
    TILE_TITLE,
    figureClass,
  } from '@/components/budget/bandTiles'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import type { SegmentedOption } from '@/components/ui/SegmentedControl.vue'
  import BudgetMonthRead from '@/components/budget/BudgetMonthRead.vue'
  import SparklineChart from '@/components/budget/SparklineChart.vue'
  import { useMediaQuery } from '@/composables/useMediaQuery'

  /**
   * « Ce mois-ci » of the Budget page (agent-os/product/budget-refonte.md,
   * lot 1), on the model of the dashboard's `MonthBand`: the month read in
   * four tiles — what it spent against the envelope at this point of the
   * month, what is left to spend, the savings the plan makes, the
   * envelopes it spends past — and the « Mois lu » selector that chooses
   * the month.
   *
   * The figures are in the text's ink; colour carries the state alone:
   * teal under the envelope, amber over it, grey within ±5 %. Never red.
   * Presentational: the page computes the reading (`budgetMonthReading`)
   * and owns the month read.
   */
  const props = defineProps<{
    reading: BudgetMonthReading
    /** The plan's first day, ISO: said while the plan has not begun. */
    planStart: string
    /** The started plan months the selector offers, oldest first. */
    monthOptions: {
      ym: string
      short: string
      full: string
      isRunning: boolean
    }[]
    /** The month read, or null for « Moyenne du plan ». */
    selectedMonth: string | null
    /** The plan's complete months: « Moyenne du plan » needs one. */
    completeMonthsCount: number
  }>()

  const emit = defineEmits<{
    'select-month': [ym: string | null]
    /** The first envelope spent past: the page scrolls to its row. */
    'show-envelope': [categoryId: string]
    /** No reference income: the way to the plan's edit mode. */
    edit: []
  }>()

  /** « 1er », « 23 ». */
  const dayLabel = (day: number): string => (day === 1 ? '1er' : String(day))

  const isFuture = computed(() => props.reading.kind === 'future')

  const title = computed(() => {
    const r = props.reading
    if (r.kind === 'average') {
      const n = r.savingsActualMonths
      return `Moyenne du plan · ${n} mois clos`
    }
    if (r.kind === 'month' && r.month) {
      if (r.isRunning && r.asOfDay !== null) {
        const name = formatMonth(r.month, {
          style: 'long',
          year: false,
          capitalize: false,
        })
        return `Ce mois-ci · ${name}, au ${dayLabel(r.asOfDay)}`
      }
      return formatMonth(r.month, { style: 'long', year: false })
    }
    return 'Ce mois-ci'
  })

  /** « 1er novembre »: the plan's first day, without its year. */
  const planStartLabel = computed(() =>
    formatDate(props.planStart, 'long')
      .replace(/^1 /, '1er ')
      .replace(/\s\d{4}$/, '')
  )

  const subtitle = computed(() => {
    const r = props.reading
    if (r.kind === 'future')
      return `Le plan commence le ${planStartLabel.value}`
    if (r.kind === 'average') return 'Par mois, sur les mois clos du plan'
    if (r.isRunning) return 'L’enveloppe est ramenée au jour du mois'
    return 'L’enveloppe du mois est le budget total du plan'
  })

  // ── « Mois lu » ─────────────────────────────────────────────────────────
  const monthSegments = computed<SegmentedOption<string | null>[]>(() => [
    ...props.monthOptions.map(option => ({
      value: option.ym,
      label: option.short,
      testId: `budget-month-${option.ym}`,
      title: option.isRunning ? `${option.full}, en cours` : option.full,
    })),
    // The average reads the complete months: none yet, nothing to average.
    ...(props.completeMonthsCount > 0
      ? [
          {
            value: null,
            label: 'Moyenne du plan',
            shortLabel: 'Moyenne',
            testId: 'budget-month-average',
            title: `Moyenne des ${props.completeMonthsCount} mois clos`,
          },
        ]
      : []),
  ])

  /** The month still running, marked with a dot in « Mois lu ». */
  const runningMonth = computed(
    () => props.monthOptions.find(m => m.isRunning)?.ym
  )

  // ── Tiles ───────────────────────────────────────────────────────────────
  const spentTile = computed(() => {
    const r = props.reading
    if (r.spent === null || r.spentGap === null) return null
    const { tone, ratio } = r.spentGap
    const badge = tone === 'neutral' ? 'dans l’enveloppe' : gapLabel(ratio)
    const note = r.isRunning ? 'à ce stade du mois' : 'vs l’enveloppe'
    let detail: string
    if (r.isRunning && r.asOfDay !== null) {
      detail = `${euros(r.envelopeToDate)} d’enveloppe au ${dayLabel(r.asOfDay)} · ${euros(r.envelope)} pour le mois`
    } else if (r.kind === 'average') {
      detail = `${euros(r.envelope)} d’enveloppe par mois`
    } else {
      detail = `${euros(r.envelope)} d’enveloppe pour le mois`
    }
    return { value: r.spent, tone, badge, note, detail }
  })

  const remainingTile = computed(() => {
    const r = props.reading
    if (r.remaining === null) return null
    const overspent = r.remaining < 0
    let badge: string
    if (overspent) badge = `dépassé de ${euros(-r.remaining)}`
    else if (r.daysLeft !== null)
      badge =
        r.daysLeft === 0
          ? 'pour aujourd’hui'
          : `pour ${r.daysLeft} ${plural(r.daysLeft, 'jour')}`
    else if (r.kind === 'average') badge = 'par mois'
    else badge = 'sur le mois'
    return {
      value: r.remaining,
      overspent,
      tone: (overspent ? 'over' : 'neutral') as StateTone,
      badge,
    }
  })

  const savingsTile = computed(() => {
    const r = props.reading
    if (r.savingsPlanned === null) return null
    const badge = r.savingsGap
      ? {
          tone: r.savingsGap.tone,
          text: `${signedEuros(r.savingsGap.amount)} vs ${euros(r.savingsDecided ?? 0)} décidés`,
        }
      : { tone: 'neutral' as StateTone, text: 'pas d’objectif' }
    const detail =
      r.savingsActual === null
        ? 'pas encore de mois clos'
        : `${euros(r.savingsActual)}/mois réalisés sur ${r.savingsActualMonths} mois clos`
    // Which income the savings are drawn from: the real one once a month
    // is complete, the one typed at creation until then.
    const base = r.savingsBase
    const basis =
      base?.source === 'actual'
        ? `sur les revenus moyens de ${base.months} mois clos (${euros(base.amount)})`
        : `sur les revenus de référence saisis (${euros(base?.amount ?? 0)})`
    return {
      value: r.savingsPlanned,
      negative: r.savingsPlanned < 0,
      badge,
      detail,
      basis,
    }
  })

  const envelopesTile = computed(() => {
    const r = props.reading
    if (r.kind === 'future') return null
    const over = r.envelopesOver
    const first = over[0]
    const rest = over.length - 1
    return {
      count: over.length,
      total: r.envelopesCount,
      suffix:
        r.envelopesCount === 0
          ? 'enveloppe'
          : `sur ${r.envelopesCount} ${plural(over.length, 'dépassée')}`,
      tone: (first ? 'over' : 'neutral') as StateTone,
      badge: first
        ? `${first.categoryName}${rest > 0 ? ` et ${rest} ${plural(rest, 'autre')}` : ''}`
        : r.envelopesCount === 0
          ? 'aucune enveloppe'
          : 'toutes tenues',
      firstId: first?.categoryId ?? null,
    }
  })

  /** The last point of the sparkline says the state of the month read. */
  const sparkTone = computed<StateTone>(
    () => props.reading.spentGap?.tone ?? 'neutral'
  )

  /** Below `sm` the tiles stand two by two: the sparkline narrows with them. */
  const isPhone = useMediaQuery('(max-width: 639.98px)')
  const sparkWidth = computed(() => (isPhone.value ? 100 : 120))
</script>

<template>
  <BaseCard
    as="section"
    data-testid="budget-month-band"
    aria-labelledby="budget-month-title"
  >
    <header
      class="mb-3 flex flex-col gap-3 max-sm:flex-row max-sm:items-start max-sm:justify-between sm:mb-4 lg:flex-row lg:items-start lg:justify-between"
    >
      <div class="min-w-0">
        <h2
          id="budget-month-title"
          class="text-lg font-semibold text-gray-900 dark:text-gray-100"
          data-testid="budget-month-title"
        >
          {{ title }}
        </h2>
        <p :class="DETAIL" data-testid="budget-month-subtitle">
          {{ subtitle }}
        </p>
      </div>

      <!-- « Mois lu »: the started months of the plan, then the average.
           It steers the band and the figures of the rows. -->
      <BudgetMonthRead
        :model-value="selectedMonth"
        :options="monthSegments"
        :running-value="runningMonth"
        @update:model-value="emit('select-month', $event)"
      />
    </header>

    <div :class="TILES_GRID" data-testid="budget-month-tiles">
      <!-- Before the plan: what it will hold, no spending yet. -->
      <article v-if="isFuture" :class="TILE" data-testid="budget-tile-envelope">
        <h3 :class="TILE_TITLE">Enveloppe</h3>
        <p :class="FIGURE" data-testid="budget-month-value-envelope">
          {{ euros(reading.envelope)
          }}<span :class="FIGURE_UNIT"> par mois</span>
        </p>
        <p :class="DETAIL">
          {{ reading.envelopesCount }}
          {{ plural(reading.envelopesCount, 'enveloppe') }}
        </p>
      </article>

      <!-- Spent, against the envelope at this point of the month. -->
      <article v-if="spentTile" :class="TILE" data-testid="budget-tile-spent">
        <h3 :class="TILE_TITLE">Dépensé</h3>
        <p :class="FIGURE" data-testid="budget-month-value-spent">
          {{ euros(spentTile.value) }}
        </p>
        <p
          :class="[BADGE_LINE, 'flex flex-wrap items-center gap-x-1.5 gap-y-1']"
        >
          <span
            :class="[BADGE, STATE_BADGE_CLASSES[spentTile.tone]]"
            :data-tone="spentTile.tone"
            data-testid="budget-badge-spent"
            >{{ spentTile.badge }}</span
          >
          <span class="text-gray-500 dark:text-gray-400">{{
            spentTile.note
          }}</span>
        </p>
        <p :class="DETAIL" data-testid="budget-detail-spent">
          {{ spentTile.detail }}
        </p>
        <SparklineChart
          v-if="reading.spentSeries.length >= 2"
          class="mt-auto pt-1"
          :data="reading.spentSeries"
          :reference="reading.envelope"
          baseline="zero"
          :color="DATA_HUE"
          :end-color="STATE_COLORS[sparkTone]"
          :width="sparkWidth"
          label="Dépenses des mois du plan, l’enveloppe en pointillé"
          data-testid="budget-sparkline-spent"
        />
      </article>

      <!-- What is left to finish the month: the envelope − spent. -->
      <article
        v-if="remainingTile"
        class="flex min-w-0 flex-col gap-1 rounded-lg sm:gap-1.5 border border-teal-100 bg-teal-50/60 p-3 sm:p-4 dark:border-teal-900/50 dark:bg-teal-900/10"
        data-testid="budget-tile-remaining"
      >
        <h3 :class="TILE_TITLE">Reste à dépenser</h3>
        <p
          :class="figureClass(remainingTile.overspent)"
          data-testid="budget-month-value-remaining"
        >
          {{ euros(remainingTile.value) }}
        </p>
        <p :class="BADGE_LINE">
          <span
            :class="[BADGE, STATE_BADGE_CLASSES[remainingTile.tone]]"
            :data-tone="remainingTile.tone"
            data-testid="budget-badge-remaining"
            >{{ remainingTile.badge }}</span
          >
        </p>
        <p :class="DETAIL">Enveloppe du mois − dépensé</p>
      </article>

      <!-- The savings the plan makes: the income of the complete months
           (the reference income before any) − envelope. -->
      <article :class="TILE" data-testid="budget-tile-savings">
        <h3 :class="TILE_TITLE">Épargne</h3>
        <template v-if="savingsTile">
          <p
            :class="figureClass(savingsTile.negative)"
            data-testid="budget-month-value-savings"
          >
            {{ euros(savingsTile.value)
            }}<span :class="FIGURE_UNIT"> par mois prévus</span>
          </p>
          <p :class="BADGE_LINE">
            <span
              :class="[BADGE, STATE_BADGE_CLASSES[savingsTile.badge.tone]]"
              :data-tone="savingsTile.badge.tone"
              data-testid="budget-badge-savings"
              >{{ savingsTile.badge.text }}</span
            >
          </p>
          <p :class="DETAIL" data-testid="budget-savings-basis">
            {{ savingsTile.basis }}
          </p>
          <p :class="DETAIL" data-testid="budget-detail-savings">
            {{ savingsTile.detail }}
          </p>
        </template>
        <template v-else>
          <p :class="FIGURE" data-testid="budget-month-value-savings">—</p>
          <p :class="DETAIL" data-testid="budget-savings-no-income">
            Revenus de référence non renseignés
          </p>
          <button
            type="button"
            :class="LINK"
            data-testid="budget-savings-edit"
            @click="emit('edit')"
          >
            Modifier le budget →
          </button>
        </template>
      </article>

      <!-- The envelopes the month read spends past. -->
      <article
        v-if="envelopesTile"
        :class="TILE"
        data-testid="budget-tile-envelopes"
      >
        <h3 :class="TILE_TITLE">Enveloppes</h3>
        <p :class="FIGURE" data-testid="budget-month-value-envelopes">
          {{ envelopesTile.count
          }}<span :class="FIGURE_UNIT">{{ ` ${envelopesTile.suffix}` }}</span>
        </p>
        <p :class="BADGE_LINE">
          <span
            :class="[BADGE, STATE_BADGE_CLASSES[envelopesTile.tone]]"
            :data-tone="envelopesTile.tone"
            data-testid="budget-badge-envelopes"
            >{{ envelopesTile.badge }}</span
          >
        </p>
        <button
          v-if="envelopesTile.firstId"
          type="button"
          :class="LINK"
          data-testid="budget-envelopes-link"
          @click="emit('show-envelope', envelopesTile.firstId)"
        >
          Voir la ligne ↓
        </button>
      </article>
    </div>
  </BaseCard>
</template>
