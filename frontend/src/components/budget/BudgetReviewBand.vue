<script setup lang="ts">
  import { computed } from 'vue'
  import type { BudgetReviewReading } from '@/lib/budgetMonth'
  import type { TagBudgetSummaryDto } from '@/lib/api'
  import {
    DATA_HUE,
    STATE_BADGE_CLASSES,
    STATE_COLORS,
    gapOf,
    type StateTone,
  } from '@/lib/stateTints'
  import {
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
   * « Bilan du plan » of the Budget page (agent-os/product/budget-refonte.md,
   * lot 6): the band a finished plan shows in place of « Ce mois-ci », its
   * sister. Four tiles — what the plan spent against its envelope, the
   * savings it actually made against the ones decided, the envelopes it
   * held, the projects against their reserve — and the same « Mois lu »
   * selector, which offers « Le plan » (the default) then each month.
   *
   * The figures are in the text's ink; colour carries the state alone:
   * teal under the envelope, amber over it, grey within ±5 %. Never red.
   * Presentational: the page computes the reading (`budgetReviewReading`)
   * and owns the month read.
   */
  const props = defineProps<{
    reading: BudgetReviewReading
    /** « Printemps 2026 ». */
    planName: string
    /** The plan's first and last days, ISO. */
    planStart: string
    planEnd: string
    /** The plan months the selector offers, oldest first. */
    monthOptions: {
      ym: string
      short: string
      full: string
      isRunning: boolean
    }[]
    /** The month read, or null for « Le plan ». */
    selectedMonth: string | null
    /** The projects of the plan's window; null while loading or failed. */
    projects: Pick<TagBudgetSummaryDto, 'totalBudget'> | null
    /** The plan's project reserve; null when it carries none. */
    projectReserve: number | null
  }>()

  const emit = defineEmits<{
    'select-month': [ym: string | null]
    /** The first envelope spent past: the page scrolls to its row. */
    'show-envelope': [categoryId: string]
  }>()

  /** Below half a cent, an amount is rounding, not money. */
  const TOLERANCE = 0.005
  /** How many envelopes spent past the badge names before « et N autres ». */
  const NAMED = 3

  const isPlan = computed(() => props.reading.kind !== 'month')

  // ── The heading ─────────────────────────────────────────────────────────
  const title = computed(() => `Bilan du plan · ${props.planName}`)

  /** How many calendar months the plan spans, from its dates. */
  const planMonthCount = computed(() => {
    const [sy, sm] = props.planStart.slice(0, 7).split('-').map(Number)
    const [ey, em] = props.planEnd.slice(0, 7).split('-').map(Number)
    if (!sy || !sm || !ey || !em) return 0
    return (ey - sy) * 12 + (em - sm) + 1
  })

  /** « janvier → juin 2026 », the year on both ends when they differ. */
  const planSpan = computed(() => {
    const start = props.planStart.slice(0, 7)
    const end = props.planEnd.slice(0, 7)
    const long = (ym: string, year: boolean) =>
      formatMonth(ym, { style: 'long', capitalize: false, year })
    if (start === end) return long(end, true)
    return `${long(start, start.slice(0, 4) !== end.slice(0, 4))} → ${long(end, true)}`
  })

  const subtitle = computed(() => {
    const r = props.reading
    if (r.kind === 'month' && r.month) {
      return `${formatMonth(r.month, { style: 'long' })}, un des ${planMonthCount.value} mois du plan`
    }
    return `${planSpan.value} · ${planMonthCount.value} mois`
  })

  // ── « Mois lu » ─────────────────────────────────────────────────────────
  const monthSegments = computed<SegmentedOption<string | null>[]>(() => [
    {
      value: null,
      label: 'Le plan',
      testId: 'budget-month-average',
      title: 'Le plan entier, en moyenne par mois',
    },
    ...props.monthOptions.map(option => ({
      value: option.ym,
      label: option.short,
      testId: `budget-month-${option.ym}`,
      title: option.full,
    })),
  ])

  // ── Tiles ───────────────────────────────────────────────────────────────
  const spentTile = computed(() => {
    const r = props.reading
    if (r.spent === null || r.spentGap === null) return null
    const { tone, ratio } = r.spentGap
    const badge =
      tone === 'neutral'
        ? 'dans l’enveloppe'
        : `${gapLabel(ratio)} vs ${euros(r.envelope)} d’enveloppe`
    const detail =
      isPlan.value && r.spentTotal !== null
        ? `${euros(r.spentTotal)} sur ${euros(r.envelopeTotal)} d’enveloppe sur le plan`
        : `${euros(r.envelope)} d’enveloppe pour le mois`
    return { value: r.spent, tone, badge, detail }
  })

  /** The sparkline's last point: the plan's last month against the envelope. */
  const sparkTone = computed<StateTone>(() => {
    const series = props.reading.spentSeries
    const last = series[series.length - 1]
    return last === undefined
      ? 'neutral'
      : gapOf(last, props.reading.envelope).tone
  })

  const savingsTile = computed(() => {
    const r = props.reading
    if (r.savingsRealized === null || r.incomeRead === null) return null
    const badge = r.savingsRealizedGap
      ? {
          tone: r.savingsRealizedGap.tone,
          text: `${signedEuros(r.savingsRealizedGap.amount)} vs ${euros(r.savingsDecided ?? 0)} décidés`,
        }
      : { tone: 'neutral' as StateTone, text: 'pas d’objectif' }
    const income = `Revenus ${euros(r.incomeRead)} − dépensé`
    const detail =
      isPlan.value && r.savingsRealizedTotal !== null
        ? `${income} · ${euros(r.savingsRealizedTotal)} sur le plan`
        : income
    return {
      value: r.savingsRealized,
      negative: r.savingsRealized < 0,
      badge,
      detail,
    }
  })

  const envelopesTile = computed(() => {
    const r = props.reading
    const over = r.envelopesOver
    const first = over[0]
    const names = over.slice(0, NAMED).map(o => o.categoryName)
    const rest = over.length - names.length
    let badge: string
    if (first) {
      badge = `${names.join(', ')}${rest > 0 ? ` et ${rest} ${plural(rest, 'autre')}` : ''}`
    } else if (r.envelopesCount === 0) badge = 'aucune enveloppe'
    else badge = 'toutes tenues'
    return {
      held: r.envelopesHeld,
      total: r.envelopesCount,
      tone: (first ? 'over' : 'neutral') as StateTone,
      badge,
      note: isPlan.value ? 'en moyenne sur le plan' : 'sur le mois',
      firstId: first?.categoryId ?? null,
      link: over.length > 1 ? 'Voir les lignes ↓' : 'Voir la ligne ↓',
    }
  })

  const projectsTile = computed(() => {
    if (!props.projects) return null
    const committed = props.projects.totalBudget
    const reserve = props.projectReserve
    let badge: { tone: StateTone; text: string }
    if (reserve === null) badge = { tone: 'neutral', text: 'pas de réserve' }
    else if (committed - reserve > TOLERANCE)
      badge = {
        tone: 'over',
        text: `réserve dépassée de ${euros(committed - reserve)}`,
      }
    else
      badge = { tone: 'neutral', text: `reste ${euros(reserve - committed)}` }
    return {
      committed,
      unit: reserve === null ? ' engagés' : ` sur ${euros(reserve)}`,
      badge,
      // The reserve is the plan's: a month read does not split it.
      detail: isPlan.value ? 'engagés sur le plan' : 'engagés sur tout le plan',
    }
  })

  /** Below `sm` the tiles stand two by two: the sparkline narrows with them. */
  const isPhone = useMediaQuery('(max-width: 639.98px)')
  const sparkWidth = computed(() => (isPhone.value ? 100 : 120))
</script>

<template>
  <BaseCard
    as="section"
    data-testid="budget-review-band"
    aria-labelledby="budget-review-title"
  >
    <header
      class="mb-3 flex flex-col gap-3 max-sm:flex-row max-sm:items-start max-sm:justify-between sm:mb-4 lg:flex-row lg:items-start lg:justify-between"
    >
      <div class="min-w-0">
        <h2
          id="budget-review-title"
          class="text-lg font-semibold text-gray-900 dark:text-gray-100"
          data-testid="budget-review-title"
        >
          {{ title }}
        </h2>
        <p :class="DETAIL" data-testid="budget-review-subtitle">
          {{ subtitle }}
        </p>
      </div>

      <!-- « Mois lu »: the plan as a whole, then each of its months. It
           steers the band and the figures of the rows. -->
      <BudgetMonthRead
        :model-value="selectedMonth"
        :options="monthSegments"
        @update:model-value="emit('select-month', $event)"
      />
    </header>

    <div :class="TILES_GRID" data-testid="budget-review-tiles">
      <!-- Spent, per month on the plan, against the envelope. -->
      <article :class="TILE" data-testid="budget-tile-spent">
        <h3 :class="TILE_TITLE">Dépensé</h3>
        <template v-if="spentTile">
          <p :class="FIGURE" data-testid="budget-month-value-spent">
            {{ euros(spentTile.value)
            }}<span v-if="isPlan" :class="FIGURE_UNIT"> par mois</span>
          </p>
          <p :class="BADGE_LINE">
            <span
              :class="[BADGE, STATE_BADGE_CLASSES[spentTile.tone]]"
              :data-tone="spentTile.tone"
              data-testid="budget-badge-spent"
              >{{ spentTile.badge }}</span
            >
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
        </template>
        <template v-else>
          <p :class="FIGURE" data-testid="budget-month-value-spent">—</p>
          <p :class="DETAIL">pas de mois clos</p>
        </template>
      </article>

      <!-- The savings made: income − spending, against the ones decided. -->
      <article :class="TILE" data-testid="budget-tile-savings">
        <h3 :class="TILE_TITLE">Épargne réalisée</h3>
        <template v-if="savingsTile">
          <p
            :class="figureClass(savingsTile.negative)"
            data-testid="budget-month-value-savings"
          >
            {{ euros(savingsTile.value)
            }}<span v-if="isPlan" :class="FIGURE_UNIT"> par mois</span>
          </p>
          <p :class="BADGE_LINE">
            <span
              :class="[BADGE, STATE_BADGE_CLASSES[savingsTile.badge.tone]]"
              :data-tone="savingsTile.badge.tone"
              data-testid="budget-badge-savings"
              >{{ savingsTile.badge.text }}</span
            >
          </p>
          <p :class="DETAIL" data-testid="budget-detail-savings">
            {{ savingsTile.detail }}
          </p>
        </template>
        <template v-else>
          <p :class="FIGURE" data-testid="budget-month-value-savings">—</p>
          <p :class="DETAIL">pas de mois clos</p>
        </template>
      </article>

      <!-- The envelopes held, on average over the plan or on the month. -->
      <article :class="TILE" data-testid="budget-tile-envelopes">
        <h3 :class="TILE_TITLE">Enveloppes tenues</h3>
        <p :class="FIGURE" data-testid="budget-month-value-envelopes">
          {{ envelopesTile.held
          }}<span :class="FIGURE_UNIT">{{
            ` sur ${envelopesTile.total}`
          }}</span>
        </p>
        <p :class="BADGE_LINE">
          <span
            :class="[BADGE, STATE_BADGE_CLASSES[envelopesTile.tone]]"
            :data-tone="envelopesTile.tone"
            data-testid="budget-badge-envelopes"
            >{{ envelopesTile.badge }}</span
          >
        </p>
        <p :class="DETAIL" data-testid="budget-detail-envelopes">
          {{ envelopesTile.note }}
        </p>
        <button
          v-if="envelopesTile.firstId"
          type="button"
          :class="LINK"
          data-testid="budget-envelopes-link"
          @click="emit('show-envelope', envelopesTile.firstId)"
        >
          {{ envelopesTile.link }}
        </button>
      </article>

      <!-- The projects, against the reserve the plan set aside. -->
      <article :class="TILE" data-testid="budget-tile-projects">
        <h3 :class="TILE_TITLE">Projets</h3>
        <template v-if="projectsTile">
          <p :class="FIGURE" data-testid="budget-month-value-projects">
            {{ euros(projectsTile.committed)
            }}<span :class="FIGURE_UNIT">{{ projectsTile.unit }}</span>
          </p>
          <p :class="BADGE_LINE">
            <span
              :class="[BADGE, STATE_BADGE_CLASSES[projectsTile.badge.tone]]"
              :data-tone="projectsTile.badge.tone"
              data-testid="budget-badge-projects"
              >{{ projectsTile.badge.text }}</span
            >
          </p>
          <p :class="DETAIL" data-testid="budget-detail-projects">
            {{ projectsTile.detail }}
          </p>
        </template>
        <p v-else :class="FIGURE" data-testid="budget-month-value-projects">
          —
        </p>
      </article>
    </div>
  </BaseCard>
</template>
