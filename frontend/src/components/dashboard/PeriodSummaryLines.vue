<script setup lang="ts">
  /**
   * The three lines under « Où part l'argent » (agent-os/product/
   * dashboard-refonte.md, lot 4): what came in and what the period kept,
   * the events it carried, the families' episodes of the year. Each says
   * its figure in a sentence; the detail is a link away, or unfolds in
   * place (the events, lot 5).
   *
   * What the period kept is income less every expense — never a rate on
   * the transfers to savings (the product rule of 2026-10-21) — over the
   * same closed months as the income it is read against.
   */
  import { computed } from 'vue'
  import { RouterLink, type RouteLocationRaw } from 'vue-router'
  import type {
    CategoryDataDto,
    ExceptionalEventDto,
    TagFamilyOfYearDto,
  } from '@/lib/api'
  import { formatCompactCurrency } from '@/lib/formatters'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'

  const props = withDefaults(
    defineProps<{
      /** The income per month over the averaged months. */
      averageIncome: number
      /** Income less every expense, per month, over the same months. */
      averageSavings: number
      /** How many months the averages divide by. */
      periodMonths: number
      /** Whether those are closed months, or the current month alone. */
      closedMonths?: boolean
      /** The income by category over the period, biggest first. */
      incomeSources: CategoryDataDto[]
      /** The period's income on the Transactions page. */
      incomeLink: RouteLocationRaw
      /** The events of the period, biggest first. */
      events: ExceptionalEventDto[]
      /** The tag families over the current calendar year. */
      families: TagFamilyOfYearDto[]
      /** Whether an event touches the period: the episodes line needs one. */
      hasExceptionalExpenses: boolean
    }>(),
    { closedMonths: true }
  )

  /** Above this share a second source of income earns a bar of its own. */
  const SECOND_SOURCE_SHARE = 0.05
  /** How many names a line spells before it stops. */
  const MAX_NAMES = 3

  const euros = (value: number) => formatCompactCurrency(value)

  function percent(share: number): string {
    const value = share * 100
    // Below one percent, a rounded « 0 % » would read as nothing.
    if (value > 0 && value < 1) return '<\u202f1\u202f%'
    return `${Math.round(value)}\u202f%`
  }

  const monthsLabel = computed(() =>
    props.closedMonths
      ? `sur ${props.periodMonths} mois clos`
      : 'sur le mois en cours'
  )

  /** The sources with income, their share of the whole. */
  const sources = computed(() => {
    const positive = props.incomeSources.filter(s => s.amount > 0)
    const total = positive.reduce((sum, s) => sum + s.amount, 0)
    if (total <= 0) return []
    return [...positive]
      .sort((a, b) => b.amount - a.amount)
      .map(s => ({
        id: s.categoryId,
        name: s.category,
        share: s.amount / total,
      }))
  })

  /** « Revenus d'activité 99 %, remboursements 1 % », then the rest. */
  const sourcesLabel = computed(() => {
    const shown = sources.value.slice(0, MAX_NAMES)
    const rest = sources.value
      .slice(MAX_NAMES)
      .reduce((sum, s) => sum + s.share, 0)
    const parts = shown.map(s => `${s.name} ${percent(s.share)}`)
    if (rest > 0) parts.push(`autres ${percent(rest)}`)
    return parts.join(', ')
  })

  /** The first source, then all the others: two tones of the one hue. */
  const sourcesBar = computed(() => {
    const [first, second] = sources.value
    if (!first || !second || second.share <= SECOND_SOURCE_SHARE) return null
    return { first: first.share, rest: 1 - first.share }
  })

  const savingsRate = computed(() =>
    props.averageIncome > 0 ? props.averageSavings / props.averageIncome : null
  )

  const savingsLabel = computed(() => {
    const kept = props.averageSavings >= 0
    const amount = `${kept ? 'épargne' : 'déficit'} ${euros(Math.abs(props.averageSavings))} par mois`
    if (savingsRate.value === null) return amount
    return `${amount}, ${percent(Math.abs(savingsRate.value))} des revenus`
  })

  const eventsTotal = computed(() =>
    props.events.reduce((sum, e) => sum + e.amount, 0)
  )
  const eventsLabel = computed(() => {
    const n = props.events.length
    return `${n} événement${n > 1 ? 's' : ''} sur la période`
  })
  const eventNames = computed(() => props.events.slice(0, MAX_NAMES))

  const showEpisodes = computed(
    () => props.hasExceptionalExpenses && props.families.length > 0
  )
  const episodesYear = computed(
    () => props.families[0]?.year ?? new Date().getFullYear()
  )
  const episodesTotal = computed(() =>
    props.families.reduce((sum, f) => sum + f.spent, 0)
  )
  const familiesLabel = computed(() =>
    props.families
      .slice(0, MAX_NAMES)
      .map(f => `${f.name} ${euros(f.spent)}`)
      .join(', ')
  )
</script>

<template>
  <div
    data-testid="period-summary-lines"
    class="divide-y divide-gray-100 border-t border-gray-100 text-[13px] text-gray-600 dark:divide-slate-800 dark:border-slate-800 dark:text-gray-400"
  >
    <!-- Income, and what the period kept of it. -->
    <div
      data-testid="summary-line-income"
      class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 py-2.5"
    >
      <p class="min-w-0 flex-1 tabular-nums">
        <span class="font-medium text-gray-900 dark:text-gray-100"
          >Revenus</span
        >
        ·
        <span class="font-semibold text-gray-900 dark:text-gray-100">{{
          euros(averageIncome)
        }}</span>
        par mois {{ monthsLabel }}
        <template v-if="sources.length > 0 && !sourcesBar">
          · <span data-testid="income-sources">{{ sourcesLabel }}</span>
        </template>
        · <span data-testid="income-savings">{{ savingsLabel }}</span>
      </p>
      <TransactionsLink
        :to="incomeLink"
        subject="Revenus de la période"
        data-testid="income-transactions-link"
      >
        Transactions
      </TransactionsLink>
      <!-- A second source above 5 %: the composition as a bar of two
           tones of the one data hue, the names under it. -->
      <div
        v-if="sourcesBar"
        class="flex w-full min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
      >
        <div
          data-testid="income-sources-bar"
          role="img"
          :aria-label="sourcesLabel"
          class="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 sm:max-w-60 dark:bg-slate-800"
        >
          <div
            class="h-full bg-blue-400"
            :style="{ width: `${sourcesBar.first * 100}%` }"
          />
          <div
            class="h-full bg-blue-200 dark:bg-blue-300/60"
            :style="{ width: `${sourcesBar.rest * 100}%` }"
          />
        </div>
        <span data-testid="income-sources" class="tabular-nums">{{
          sourcesLabel
        }}</span>
      </div>
    </div>

    <!-- The events of the period: their detail unfolds here (lot 5). -->
    <div
      v-if="events.length > 0"
      data-testid="summary-line-events"
      class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
    >
      <p class="min-w-0 flex-1 tabular-nums">
        <span class="font-medium text-gray-900 dark:text-gray-100">{{
          eventsLabel
        }}</span>
        ·
        <span class="font-semibold text-gray-900 dark:text-gray-100">{{
          euros(eventsTotal)
        }}</span>
        ·
        <template v-for="(event, index) in eventNames" :key="event.id"
          ><template v-if="index > 0">, </template
          ><RouterLink
            :to="`/tags/${event.id}`"
            class="hover:text-gray-900 hover:underline dark:hover:text-gray-100"
            :data-testid="`summary-event-${event.id}`"
            >{{ event.name }}</RouterLink
          ></template
        ><template v-if="events.length > MAX_NAMES">
          et {{ events.length - MAX_NAMES }}
          {{ events.length - MAX_NAMES > 1 ? 'autres' : 'autre' }}</template
        >
      </p>
      <button
        type="button"
        data-testid="events-toggle"
        class="text-xs font-medium text-gray-400 dark:text-gray-500"
        aria-expanded="false"
        disabled
      >
        Déplier
      </button>
    </div>

    <!-- The families over the calendar year, whatever the period. -->
    <div
      v-if="showEpisodes"
      data-testid="summary-line-episodes"
      class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
    >
      <p class="min-w-0 flex-1 tabular-nums">
        <span class="font-medium text-gray-900 dark:text-gray-100"
          >Épisodes {{ episodesYear }}</span
        >
        ·
        <span class="font-semibold text-gray-900 dark:text-gray-100">{{
          euros(episodesTotal)
        }}</span>
        · {{ familiesLabel }}
      </p>
      <RouterLink
        to="/tags"
        class="text-xs font-medium text-primary-700 hover:underline dark:text-primary-400"
        data-testid="episodes-link"
      >
        Les familles →
      </RouterLink>
    </div>
  </div>
</template>
