<script setup lang="ts">
  import { computed } from 'vue'
  import { RouterLink } from 'vue-router'
  import type { DashboardMonthDto, TrendReading } from '@/lib/api'
  import { DASHBOARD_THRESHOLDS } from '@/lib/dashboardThresholds'
  import {
    DATA_HUE,
    STATE_BADGE_CLASSES,
    STATE_COLORS,
    gapOf,
    type StateTone,
  } from '@/lib/stateTints'
  import { formatCompactCurrency, formatMonth } from '@/lib/formatters'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
  import SparklineChart from '@/components/budget/SparklineChart.vue'
  import { useMediaQuery } from '@/composables/useMediaQuery'

  /**
   * « Ce mois-ci » (agent-os/product/dashboard-refonte.md, lot 1): the
   * current month to date, in four tiles — the spending against the habit
   * at this point of the month, the income, what is still to come, what is
   * left to live on.
   *
   * The figures are in the text's ink; the colour carries the state alone:
   * teal under the habit, amber over it, grey within ±5 % or when there is
   * nothing to compare. Never red. Presentational: the page owns the
   * request (`useMonthData`) and a failure stays here, with its retry.
   */
  const props = withDefaults(
    defineProps<{
      data: DashboardMonthDto | null
      /** « Vie courante » or « Tout »: names the spending tile. */
      reading: TrendReading
      isLoading?: boolean | undefined
      error?: string | null | undefined
    }>(),
    { isLoading: false, error: null }
  )

  const emit = defineEmits<{ retry: [] }>()

  const PERCENT = new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: 0,
    signDisplay: 'exceptZero',
  })
  const SHARE = new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: 0,
  })

  const euros = (value: number): string => formatCompactCurrency(value)

  /** « −17 % », « +16 % »: a typographic minus, as the trends write it. */
  const gapLabel = (ratio: number): string =>
    PERCENT.format(ratio).replace('-', '−')

  /** « 1er », « 23 ». */
  const dayLabel = (day: number): string => (day === 1 ? '1er' : String(day))

  const title = computed(() => {
    if (!props.data) return 'Ce mois-ci'
    const name = formatMonth(props.data.month, {
      style: 'long',
      capitalize: false,
      year: false,
    })
    return `Ce mois-ci · ${name}, au ${dayLabel(props.data.asOfDay)}`
  })

  const NO_HABIT = "pas encore d'habitude"

  const spentTile = computed(() => {
    const d = props.data
    if (!d) return null
    const label = props.reading === 'real' ? 'Dépenses' : 'Vie courante'
    if (d.habit === null || d.habitToDate === null) {
      return {
        label,
        tone: 'neutral' as StateTone,
        badge: NO_HABIT,
        badgeNote: null,
        detail: `${d.habitMonths} mois clos d'historique, l'habitude en demande 3`,
      }
    }
    const { tone, ratio } = gapOf(d.spent, d.habitToDate)
    return {
      label,
      tone,
      badge: tone === 'neutral' ? "dans l'habitude" : gapLabel(ratio),
      badgeNote: 'à ce stade du mois',
      detail: `${euros(d.habitToDate)} attendus au ${dayLabel(d.asOfDay)} · ${euros(d.habit)} par mois d'habitude`,
    }
  })

  /**
   * The income: « X attendus » while it has not reached 80 % of the
   * expected income — the salary has not landed yet — then the gap. A gap
   * on income is no alarm: it stays grey.
   */
  const incomeTile = computed(() => {
    const d = props.data
    if (!d) return null
    if (d.incomeExpected === null) {
      return { badge: NO_HABIT, detail: null }
    }
    const waiting =
      d.incomeReceived <
      d.incomeExpected * DASHBOARD_THRESHOLDS.incomeExpectedShare
    const { tone, ratio } = gapOf(d.incomeReceived, d.incomeExpected)
    return {
      badge: waiting
        ? `${euros(d.incomeExpected)} attendus`
        : tone === 'neutral'
          ? "dans l'habitude"
          : gapLabel(ratio),
      detail: `${euros(d.incomeExpected)} par mois d'habitude`,
    }
  })

  const lastDay = computed(() =>
    props.data ? dayLabel(props.data.daysInMonth) : ''
  )

  const upcomingTile = computed(() => {
    const d = props.data
    if (!d) return null
    const count = d.upcoming.length
    const badge =
      count === 0
        ? `rien d'ici le ${lastDay.value}`
        : `${count} prélèvement${count > 1 ? 's' : ''} d'ici le ${lastDay.value}`
    const asOf = `${d.month}-${String(d.asOfDay).padStart(2, '0')}`
    const names = d.upcoming.slice(0, 3).map(u => ({
      id: u.id,
      name: u.name,
      // Expected earlier this month and not charged yet: still to come.
      late:
        u.nextExpected < asOf
          ? `attendu le ${dayLabel(Number(u.nextExpected.slice(8, 10)))}`
          : null,
    }))
    return { badge, names, more: Math.max(0, count - names.length) }
  })

  const remainingTile = computed(() => {
    const d = props.data
    if (!d) return null
    if (d.remainingToLive === null) {
      return { overspent: false, badge: NO_HABIT }
    }
    const overspent = d.remainingToLive < 0
    return {
      overspent,
      badge: overspent
        ? 'dépassé'
        : d.remainingShare === null
          ? null
          : `${SHARE.format(d.remainingShare)} du revenu attendu`,
    }
  })

  const showSkeleton = computed(() => props.isLoading && !props.data)

  /**
   * Below `sm` the tiles stand two by two: a 390px phone leaves a tile
   * about 130px inside, a 360px one less — the sparkline narrows with it.
   */
  const isPhone = useMediaQuery('(max-width: 639.98px)')
  const sparkWidth = computed(() => (isPhone.value ? 100 : 120))
</script>

<template>
  <BaseCard
    as="section"
    data-testid="month-band"
    aria-labelledby="month-band-title"
  >
    <header class="mb-3 sm:mb-4">
      <h2
        id="month-band-title"
        class="text-lg font-semibold text-gray-900 dark:text-gray-100"
        data-testid="month-band-title"
      >
        {{ title }}
      </h2>
      <p class="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
        L'habitude est la médiane des six mois clos précédents
      </p>
    </header>

    <!-- First load: the band's shape, never the page's. -->
    <div
      v-if="showSkeleton"
      class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4"
      aria-busy="true"
      data-testid="month-loading"
    >
      <SkeletonBlock v-for="n in 4" :key="n" class="h-28 rounded-lg" />
    </div>

    <!-- A failure stays in the band, quiet: the page below is intact. -->
    <p
      v-if="error"
      class="text-sm text-gray-500 dark:text-gray-400"
      :class="data ? 'mb-3' : ''"
      role="status"
      data-testid="month-error"
    >
      La lecture du mois n'a pas pu être chargée ·
      <button
        type="button"
        class="font-medium text-primary-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400"
        data-testid="month-retry"
        :disabled="isLoading"
        @click="emit('retry')"
      >
        {{ isLoading ? 'Nouvelle tentative…' : 'Réessayer' }}
      </button>
    </p>

    <div
      v-if="data"
      class="grid grid-cols-2 gap-3 transition-opacity duration-200 sm:gap-4 md:grid-cols-4"
      :class="isLoading ? 'opacity-60' : 'opacity-100'"
      :aria-busy="isLoading"
    >
      <!-- Spent to date, against the habit at this point of the month. -->
      <article
        v-if="spentTile"
        class="flex min-w-0 flex-col gap-1 rounded-lg sm:gap-1.5 border border-gray-200 p-3 sm:p-4 dark:border-slate-700"
        data-testid="month-tile-spent"
      >
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">
          {{ spentTile.label }}
        </h3>
        <p
          class="text-[22px] leading-tight font-semibold sm:text-2xl text-gray-900 tabular-nums dark:text-gray-100"
          data-testid="month-value-spent"
        >
          {{ euros(data.spent) }}
        </p>
        <p
          class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] sm:text-xs"
        >
          <span
            class="inline-flex max-w-full items-center rounded-md px-2 py-0.5 font-semibold tabular-nums sm:rounded-full sm:whitespace-nowrap"
            :class="STATE_BADGE_CLASSES[spentTile.tone]"
            :data-tone="spentTile.tone"
            data-testid="month-badge-spent"
            >{{ spentTile.badge }}</span
          >
          <span
            v-if="spentTile.badgeNote"
            class="text-gray-500 dark:text-gray-400"
            >{{ spentTile.badgeNote }}</span
          >
        </p>
        <p
          class="text-[11px] sm:text-xs text-gray-500 tabular-nums dark:text-gray-400"
          data-testid="month-detail-spent"
        >
          {{ spentTile.detail }}
        </p>
        <SparklineChart
          class="mt-auto pt-1"
          :data="data.spentSeries"
          :reference="data.habit ?? undefined"
          baseline="zero"
          :color="DATA_HUE"
          :end-color="STATE_COLORS[spentTile.tone]"
          :width="sparkWidth"
          :label="`${spentTile.label} des mois clos et du mois en cours`"
          data-testid="month-sparkline-spent"
        />
      </article>

      <!-- Income received to date. -->
      <article
        v-if="incomeTile"
        class="flex min-w-0 flex-col gap-1 rounded-lg sm:gap-1.5 border border-gray-200 p-3 sm:p-4 dark:border-slate-700"
        data-testid="month-tile-income"
      >
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">
          Revenus
        </h3>
        <p
          class="text-[22px] leading-tight font-semibold sm:text-2xl text-gray-900 tabular-nums dark:text-gray-100"
          data-testid="month-value-income"
        >
          {{ euros(data.incomeReceived) }}
        </p>
        <p class="text-[11px] sm:text-xs">
          <span
            class="inline-flex max-w-full items-center rounded-md px-2 py-0.5 font-semibold tabular-nums sm:rounded-full sm:whitespace-nowrap"
            :class="STATE_BADGE_CLASSES.neutral"
            data-tone="neutral"
            data-testid="month-badge-income"
            >{{ incomeTile.badge }}</span
          >
        </p>
        <p
          v-if="incomeTile.detail"
          class="text-[11px] sm:text-xs text-gray-500 tabular-nums dark:text-gray-400"
        >
          {{ incomeTile.detail }}
        </p>
        <SparklineChart
          class="mt-auto pt-1"
          :data="data.incomeSeries"
          :reference="data.incomeExpected ?? undefined"
          baseline="zero"
          :color="DATA_HUE"
          :end-color="STATE_COLORS.neutral"
          :width="sparkWidth"
          label="Revenus des mois clos"
          data-testid="month-sparkline-income"
        />
      </article>

      <!-- What the active recurrences still charge this month. -->
      <article
        v-if="upcomingTile"
        class="flex min-w-0 flex-col gap-1 rounded-lg sm:gap-1.5 border border-gray-200 p-3 sm:p-4 dark:border-slate-700"
        data-testid="month-tile-upcoming"
      >
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">
          À venir
        </h3>
        <p
          class="text-[22px] leading-tight font-semibold sm:text-2xl text-gray-900 tabular-nums dark:text-gray-100"
          data-testid="month-value-upcoming"
        >
          {{ euros(data.upcomingTotal) }}
        </p>
        <p class="text-[11px] sm:text-xs">
          <span
            class="inline-flex max-w-full items-center rounded-md px-2 py-0.5 font-semibold tabular-nums sm:rounded-full sm:whitespace-nowrap"
            :class="STATE_BADGE_CLASSES.neutral"
            data-tone="neutral"
            data-testid="month-badge-upcoming"
            >{{ upcomingTile.badge }}</span
          >
        </p>
        <ul
          v-if="upcomingTile.names.length > 0"
          class="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400"
          data-testid="month-upcoming-names"
        >
          <li
            v-for="item in upcomingTile.names"
            :key="item.id"
            class="truncate"
          >
            {{ item.name
            }}<span v-if="item.late" class="text-gray-400 dark:text-gray-500">
              · {{ item.late }}</span
            >
          </li>
          <li v-if="upcomingTile.more > 0">
            et {{ upcomingTile.more }} autre{{
              upcomingTile.more > 1 ? 's' : ''
            }}
          </li>
        </ul>
        <RouterLink
          to="/recurrences"
          class="relative mt-auto self-start pt-1 text-[11px] font-medium text-primary-700 sm:text-xs pointer-coarse:before:absolute pointer-coarse:before:-inset-x-1 pointer-coarse:before:-inset-y-3 pointer-coarse:before:content-[''] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400"
          data-testid="month-link-recurrences"
        >
          Les récurrences →
        </RouterLink>
      </article>

      <!-- What is left: expected income − spent − still to come. -->
      <article
        v-if="remainingTile"
        class="flex min-w-0 flex-col gap-1 rounded-lg sm:gap-1.5 border border-teal-100 bg-teal-50/60 p-3 sm:p-4 dark:border-teal-900/50 dark:bg-teal-900/10"
        data-testid="month-tile-remaining"
      >
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">
          Reste à vivre
        </h3>
        <p
          class="text-[22px] leading-tight font-semibold sm:text-2xl tabular-nums"
          :class="
            remainingTile.overspent
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-gray-900 dark:text-gray-100'
          "
          data-testid="month-value-remaining"
        >
          {{
            data.remainingToLive === null ? '—' : euros(data.remainingToLive)
          }}
        </p>
        <p v-if="remainingTile.badge" class="text-[11px] sm:text-xs">
          <span
            class="inline-flex max-w-full items-center rounded-md px-2 py-0.5 font-semibold tabular-nums sm:rounded-full sm:whitespace-nowrap"
            :class="
              remainingTile.overspent
                ? STATE_BADGE_CLASSES.over
                : STATE_BADGE_CLASSES.neutral
            "
            :data-tone="remainingTile.overspent ? 'over' : 'neutral'"
            data-testid="month-badge-remaining"
            >{{ remainingTile.badge }}</span
          >
        </p>
        <p class="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
          Revenus attendus − dépensé − à venir
        </p>
      </article>
    </div>
  </BaseCard>
</template>
