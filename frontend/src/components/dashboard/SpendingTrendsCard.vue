<script setup lang="ts">
  import { computed, onMounted } from 'vue'
  import { RouterLink } from 'vue-router'
  import type {
    TrendInsightDto,
    TrendPartDto,
    TrendPeriodDto,
    TrendReading,
    TrendWindow,
  } from '@/lib/api'
  import { useSpendingTrends } from '@/composables/useSpendingTrends'
  import { modelName, useTrendDigest } from '@/composables/useTrendDigest'
  import { TREND_WINDOWS } from '@/lib/trends'
  import { formatCurrency, formatDate, formatMonth } from '@/lib/formatters'
  import { NO_CATEGORY, transactionsLink } from '@/lib/transactionsLink'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import SparklineChart from '@/components/budget/SparklineChart.vue'
  import CategoryIcon from '@/components/CategoryIcon.vue'

  /**
   * « Ce qui change »: what moved in a closed month against the habit of
   * the months before it, in a few sentences the server wrote
   * (agent-os/product/spending-trends.md).
   *
   * Follows the dashboard's reading and reimbursement switches, never its
   * period: the header says which month it reads and against what. Five
   * lines, « Voir tout » for the rest; each opens its transactions, in the
   * month and in the reference — a merchant by its label, a recurring
   * charge by its series, with the recurrences screen beside it; a shift by
   * its two subcategories, the savings by their transfers. The long
   * comparisons the history cannot make yet are said in one quiet line.
   */
  const props = defineProps<{
    reading: TrendReading
    deductReimbursements: boolean
    deductPendingReimbursements: boolean
  }>()

  const {
    data,
    isLoading,
    error,
    referenceWindow,
    expanded,
    insights,
    visibleInsights,
    hiddenCount,
    missingMonths,
    horizonsLine,
    isWindowShortened,
    fetchTrends,
    setMonth,
    setWindow,
    toggleExpanded,
  } = useSpendingTrends({
    reading: () => props.reading,
    deductReimbursements: () => props.deductReimbursements,
    deductPendingReimbursements: () => props.deductPendingReimbursements,
  })

  onMounted(() => {
    void fetchTrends()
  })

  // The written paragraph (lot 5): asked once the list is here, never
  // before; its absence changes nothing above it.
  const {
    digest,
    isRegenerating,
    regenerate: regenerateDigest,
  } = useTrendDigest({
    trends: data,
    window: referenceWindow,
    deductReimbursements: () => props.deductReimbursements,
    deductPendingReimbursements: () => props.deductPendingReimbursements,
  })

  const windowOptions = TREND_WINDOWS.map(value => ({
    value,
    label: `${value} mois`,
    testId: `trends-window-${value}`,
  }))

  const monthLabel = (month: string): string =>
    formatMonth(`${month}-01`, { style: 'long' })
  const monthName = computed(() =>
    data.value
      ? formatMonth(`${data.value.month}-01`, {
          style: 'long',
          capitalize: false,
          year: false,
        })
      : ''
  )

  const READING_LABEL: Record<TrendReading, string> = {
    everyday: 'vie courante',
    real: 'toutes les dépenses',
  }

  /** « Septembre 2026, vie courante, par rapport aux 6 mois précédents ». */
  const heading = computed(() => {
    if (!data.value) return null
    const parts = [
      monthLabel(data.value.month),
      READING_LABEL[data.value.reading],
    ]
    if (missingMonths.value === 0) {
      parts.push(`par rapport aux ${data.value.window} mois précédents`)
    }
    return parts.join(', ')
  })

  /* ---------------------------------------------------------------- */
  /* One line                                                          */
  /* ---------------------------------------------------------------- */

  const MINUS = '−'

  function signed(value: number, text: string): string {
    return `${value < 0 ? MINUS : '+'}${text}`
  }

  /**
   * What came or went has no percentage: a word says it. A price says its
   * gap to the cent, as its sentence does.
   */
  const WORD_BADGES: Partial<
    Record<TrendInsightDto['kind'], (insight: TrendInsightDto) => string>
  > = {
    newHabit: () => 'Nouveau',
    lostHabit: () => 'Plus rien',
    subscription: insight => (insight.direction === 'up' ? 'Apparu' : 'Arrêté'),
    shift: () => 'Report',
    record: insight =>
      insight.record === 'low' ? 'Plus bas depuis un an' : 'Record 12 mois',
  }

  const WORD_LABELS: Partial<
    Record<TrendInsightDto['kind'], (insight: TrendInsightDto) => string>
  > = {
    newHabit: () => 'Nouvelle habitude',
    lostHabit: () => 'Habitude abandonnée',
    subscription: insight =>
      insight.direction === 'up' ? 'Abonnement apparu' : 'Abonnement arrêté',
    shift: () => 'Report entre deux sous-catégories',
    record: insight =>
      insight.record === 'low'
        ? 'Le mois le plus bas depuis un an'
        : 'Le mois le plus haut depuis un an',
  }

  /** The year a comparison with last year reads: « 2025 ». */
  const yearOf = (insight: TrendInsightDto): string =>
    insight.windows.reference.start.slice(0, 4)

  /** The gap the badge shows: a percentage when there is one. */
  function badgeText(insight: TrendInsightDto): string {
    const word = WORD_BADGES[insight.kind]
    if (word) return word(insight)
    if (insight.kind === 'uncategorized') return `${insight.current} à classer`
    if (insight.kind === 'price') {
      return signed(insight.delta, formatCurrency(Math.abs(insight.delta)))
    }
    if (insight.kind === 'share' || insight.kind === 'savings') {
      return signed(insight.delta, `${Math.round(Math.abs(insight.delta))} pts`)
    }
    // A slope, per month.
    if (insight.kind === 'drift' && insight.deltaPct !== null) {
      return signed(
        insight.deltaPct,
        `${Math.round(Math.abs(insight.deltaPct))} %/mois`
      )
    }
    if (insight.kind === 'yearAgo') {
      const gap =
        insight.deltaPct !== null
          ? signed(
              insight.deltaPct,
              `${Math.round(Math.abs(insight.deltaPct))} %`
            )
          : signed(insight.delta, `${Math.round(Math.abs(insight.delta))} €`)
      return `${gap} vs ${yearOf(insight)}`
    }
    if (insight.deltaPct !== null) {
      return signed(
        insight.deltaPct,
        `${Math.round(Math.abs(insight.deltaPct))} %`
      )
    }
    // Nothing in the habit to compare with: the gap itself.
    if (insight.kind === 'frequency') {
      return signed(insight.delta, String(Math.abs(insight.delta)))
    }
    // Whole euros, as the sentence writes them.
    const euros = Math.abs(insight.delta)
    return signed(
      insight.delta,
      euros >= 20 ? `${Math.round(euros)} €` : formatCurrency(euros)
    )
  }

  type Hue = 'success' | 'up' | 'down' | 'todo'

  function hueOf(insight: TrendInsightDto): Hue {
    if (insight.kind === 'uncategorized') return 'todo'
    if (insight.tone === 'success') return 'success'
    return insight.direction
  }

  /**
   * A rise is never a reproach: it reads in a calm blue, not in red. Only a
   * drop on a pleasure the user chose is green; the lines to file are the
   * one thing to do, in amber.
   */
  const BADGE_CLASSES: Record<Hue, string> = {
    success:
      'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    up: 'bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
    down: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-300',
    todo: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  }
  const SPARK_COLORS: Record<Hue, string> = {
    success: '#10b981',
    up: '#0ea5e9',
    down: '#64748b',
    todo: '#f59e0b',
  }
  const ARROWS: Record<Hue, string> = {
    success: '↓',
    up: '↑',
    down: '↓',
    todo: '',
  }

  /** A word badge says it all: no arrow beside it. */
  const arrowOf = (insight: TrendInsightDto): string =>
    WORD_BADGES[insight.kind] ? '' : ARROWS[hueOf(insight)]

  function badgeLabel(insight: TrendInsightDto): string {
    if (insight.kind === 'uncategorized') {
      return `${insight.current} dépenses à classer`
    }
    const word = WORD_LABELS[insight.kind]
    if (word) return word(insight)
    const way = insight.direction === 'up' ? 'hausse' : 'baisse'
    const WHAT: Partial<Record<TrendInsightDto['kind'], string>> = {
      price: 'Prix en',
      drift: 'En',
      savings: 'Épargne en',
      yearAgo: `Par rapport à ${yearOf(insight)}, en`,
    }
    const what = WHAT[insight.kind] ?? 'En'
    const regular = insight.kind === 'drift' ? ' régulière' : ''
    return `${what} ${way}${regular} : ${badgeText(insight)}`
  }

  /**
   * The unit's own icon — a merchant's or a series' is the one of the
   * category it is filed in, as on the recurrences screen — or a sign for
   * what has none.
   */
  function fallbackIcon(insight: TrendInsightDto): string {
    if (insight.unit.type === 'uncategorized') return '🏷️'
    if (insight.unit.type === 'structure') return '📊'
    if (insight.unit.type === 'merchant') return '🏪'
    if (insight.unit.type === 'recurrence') return '🔁'
    if (insight.unit.type === 'savings') return '💰'
    return '•'
  }

  /**
   * The filters a line's links share: what the unit is, in the dashboard's
   * reading. The figures are netted and shared — `gross` lets the list say
   * it shows full amounts. The lines to file are counted in both readings,
   * so their link never leaves the events out.
   */
  function unitFilters(insight: TrendInsightDto) {
    const reading = data.value?.reading ?? props.reading
    const exceptional =
      reading === 'everyday' && insight.kind !== 'uncategorized'
        ? ('exclude' as const)
        : undefined
    const base = { type: 'EXPENSE' as const, exceptional, gross: true }
    const { unit } = insight
    switch (unit.type) {
      case 'category':
        return { ...base, categoryId: unit.id }
      case 'subcategory':
        return {
          ...base,
          categoryId: unit.categoryId ?? undefined,
          subcategoryId: unit.id,
        }
      case 'structure':
        return unit.id === 'pleasure'
          ? { ...base, nature: 'PLEASURE' as const }
          : { ...base, rhythm: 'COMMITTED' as const }
      case 'uncategorized':
        return { ...base, categoryId: NO_CATEGORY }
      // The page has no merchant filter: its labels, by the word they share.
      case 'merchant':
        return { ...base, q: unit.search ?? unit.name }
      // The series' own lines, whatever their filing or the reading.
      case 'recurrence':
        return {
          type: 'EXPENSE' as const,
          gross: true,
          recurrence: unit.id,
          recurrenceLabel: unit.name,
        }
      // The transfers into a savings category: what the rate reads.
      case 'savings':
        return {
          type: 'TRANSFER' as const,
          gross: true,
          categoryIds: unit.categoryIds?.length ? unit.categoryIds : undefined,
        }
    }
  }

  /** The long run (11 to 15): lines that read a horizon of their own. */
  const LONG_RUN = new Set<TrendInsightDto['kind']>([
    'shift',
    'drift',
    'record',
    'yearAgo',
    'savings',
  ])

  /** « septembre 2026 », or « juillet 2026 – septembre 2026 » for several months. */
  function periodLabel(period: TrendPeriodDto): string {
    const options = { style: 'long', capitalize: false } as const
    const start = formatMonth(period.start, options)
    const end = formatMonth(period.end, options)
    return start === end ? start : `${start} – ${end}`
  }

  function monthLink(insight: TrendInsightDto) {
    return transactionsLink({
      ...unitFilters(insight),
      from: insight.windows.current.start,
      to: insight.windows.current.end,
      label: LONG_RUN.has(insight.kind)
        ? `${insight.unit.name} · ${periodLabel(insight.windows.current)}`
        : `${insight.unit.name} · ${formatMonth(insight.windows.current.start, { style: 'long', capitalize: false })}`,
    })
  }

  /** A shift opens each of its two subcategories in the month. */
  function partLink(insight: TrendInsightDto, part: TrendPartDto) {
    return transactionsLink({
      ...unitFilters({ ...insight, unit: part.unit }),
      from: insight.windows.current.start,
      to: insight.windows.current.end,
      label: `${part.unit.name} · ${periodLabel(insight.windows.current)}`,
    })
  }

  /**
   * The months the line compares with: the card's window for a habit, its
   * own horizon for the long run (the five months before, eleven, the same
   * month a year before, the quarter before).
   */
  function referenceLink(insight: TrendInsightDto) {
    return transactionsLink({
      ...unitFilters(insight),
      from: insight.windows.reference.start,
      to: insight.windows.reference.end,
      label: LONG_RUN.has(insight.kind)
        ? `${insight.unit.name} · ${periodLabel(insight.windows.reference)}`
        : `${insight.unit.name} · ${data.value?.window ?? ''} mois de référence`,
    })
  }

  /**
   * The months before, as a second link. A series is read on the
   * recurrences screen instead: its months before are its own history.
   */
  const hasReference = (insight: TrendInsightDto): boolean =>
    insight.kind !== 'uncategorized' && insight.unit.type !== 'recurrence'

  const showSkeleton = computed(() => !data.value && isLoading.value)
</script>

<template>
  <BaseCard
    as="section"
    data-testid="spending-trends"
    aria-labelledby="spending-trends-title"
  >
    <div
      class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="min-w-0">
        <h2
          id="spending-trends-title"
          class="text-lg font-semibold text-gray-900 dark:text-gray-100"
        >
          Ce qui change
        </h2>
        <p
          v-if="heading"
          class="text-sm text-gray-700 dark:text-gray-300"
          data-testid="trends-heading"
        >
          {{ heading }}
          <span
            v-if="isWindowShortened"
            class="text-gray-500 dark:text-gray-400"
            data-testid="trends-window-shortened"
          >
            (l'historique ne couvre pas encore {{ referenceWindow }} mois)
          </span>
        </p>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Un mois clos, quelle que soit la période choisie plus haut ; la
          lecture et les remboursements suivent le tableau de bord.
        </p>
      </div>

      <div
        v-if="data"
        class="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end"
      >
        <BaseField
          v-if="data.availableMonths.length > 1"
          as="select"
          size="sm"
          label="Mois lu"
          label-hidden
          data-testid="trends-month"
          :model-value="data.month"
          @update:model-value="setMonth(String($event))"
        >
          <option
            v-for="option in data.availableMonths"
            :key="option"
            :value="option"
          >
            {{ monthLabel(option) }}
          </option>
        </BaseField>
        <SegmentedControl
          :model-value="referenceWindow"
          size="sm"
          label="Fenêtre de référence"
          :options="windowOptions"
          @update:model-value="setWindow($event as TrendWindow)"
        />
      </div>
    </div>

    <!-- First load: the list's shape, never the dashboard's. -->
    <div v-if="showSkeleton" aria-busy="true" data-testid="trends-loading">
      <SkeletonBlock :lines="3" />
    </div>

    <!-- A failure stays in the card, quiet: the figures above are intact. -->
    <p
      v-if="error"
      class="text-sm text-gray-500 dark:text-gray-400"
      role="status"
      data-testid="trends-error"
    >
      Les tendances n'ont pas pu être chargées.
      <button
        type="button"
        class="ml-1 font-medium text-primary-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400"
        data-testid="trends-retry"
        @click="fetchTrends()"
      >
        Réessayer
      </button>
    </p>

    <div
      v-if="data"
      class="transition-opacity duration-200"
      :class="isLoading ? 'opacity-60' : 'opacity-100'"
      :aria-busy="isLoading"
    >
      <p
        v-if="missingMonths > 0"
        class="text-sm text-gray-700 dark:text-gray-300"
        data-testid="trends-short-history"
      >
        Encore {{ missingMonths }} mois de transactions et les tendances
        apparaîtront.
      </p>

      <ul
        v-if="visibleInsights.length > 0"
        id="spending-trends-list"
        class="divide-y divide-gray-100 dark:divide-slate-800"
        data-testid="trends-list"
      >
        <li
          v-for="insight in visibleInsights"
          :key="`${insight.kind}-${insight.unit.type}-${insight.unit.id}`"
          class="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
          :data-testid="`trend-${insight.kind}`"
        >
          <span
            class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-base dark:bg-slate-800"
            aria-hidden="true"
          >
            <CategoryIcon
              v-if="insight.unit.icon"
              :icon="insight.unit.icon"
              :name="insight.unit.name"
            />
            <template v-else>{{ fallbackIcon(insight) }}</template>
          </span>

          <div class="min-w-0 flex-1">
            <p
              class="text-sm text-gray-900 dark:text-gray-100"
              data-testid="trend-sentence"
            >
              {{ insight.sentence }}
            </p>
            <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <template v-if="insight.parts?.length">
                <TransactionsLink
                  v-for="part in insight.parts"
                  :key="part.unit.id"
                  :to="partLink(insight, part)"
                  :subject="`${part.unit.name} en ${monthName}`"
                  data-testid="trend-part-link"
                >
                  {{ part.unit.name }}
                </TransactionsLink>
              </template>
              <TransactionsLink
                v-else
                :to="monthLink(insight)"
                :subject="`${insight.unit.name} en ${monthName}`"
                data-testid="trend-month-link"
              >
                Voir les transactions
              </TransactionsLink>
              <TransactionsLink
                v-if="hasReference(insight)"
                :to="referenceLink(insight)"
                :subject="`${insight.unit.name} sur la référence`"
                data-testid="trend-reference-link"
              >
                La référence
              </TransactionsLink>
              <RouterLink
                v-if="insight.unit.type === 'recurrence'"
                to="/recurrences"
                class="text-xs font-medium text-primary-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400"
                :aria-label="`Voir ${insight.unit.name} dans les récurrences`"
                data-testid="trend-recurrences-link"
              >
                Les récurrences
              </RouterLink>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-3">
            <!-- On a phone the sparkline gives way; sentence and badge stay. -->
            <div class="hidden sm:block" data-testid="trend-sparkline">
              <SparklineChart
                :data="insight.series"
                :width="72"
                :height="24"
                :color="SPARK_COLORS[hueOf(insight)]"
              />
            </div>
            <span
              class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums"
              :class="BADGE_CLASSES[hueOf(insight)]"
              :aria-label="badgeLabel(insight)"
              data-testid="trend-badge"
            >
              <span v-if="arrowOf(insight)" aria-hidden="true">{{
                arrowOf(insight)
              }}</span>
              {{ badgeText(insight) }}
            </span>
          </div>
        </li>
      </ul>

      <p
        v-if="data.quietSentence"
        class="text-sm text-gray-700 dark:text-gray-300"
        :class="visibleInsights.length > 0 ? 'mt-3' : ''"
        data-testid="trends-quiet"
      >
        {{ data.quietSentence }}
      </p>

      <!-- What the history is still too short to compare: said, not an error. -->
      <p
        v-if="horizonsLine"
        class="mt-3 text-xs text-gray-500 dark:text-gray-400"
        data-testid="trends-horizons"
      >
        {{ horizonsLine }}
      </p>

      <button
        v-if="hiddenCount > 0"
        type="button"
        class="mt-3 min-h-[44px] text-sm font-medium text-primary-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:min-h-0 dark:text-primary-400"
        :aria-expanded="expanded"
        aria-controls="spending-trends-list"
        data-testid="trends-toggle"
        @click="toggleExpanded"
      >
        {{ expanded ? 'Réduire' : `Voir tout (${insights.length})` }}
      </button>

      <!-- Under the list, the month told in a few sentences; on a phone too. -->
      <figure
        v-if="digest"
        class="mt-4 border-t border-gray-100 pt-4 dark:border-slate-800"
        data-testid="trends-digest"
      >
        <blockquote
          class="text-sm leading-relaxed text-gray-800 dark:text-gray-200"
          data-testid="trends-digest-text"
        >
          {{ digest.text }}
        </blockquote>
        <figcaption
          class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400"
        >
          <span data-testid="trends-digest-mention">
            Rédigé par l'IA à partir des tendances ci-dessus ·
            {{ modelName(digest.model) }} · le
            {{ formatDate(digest.generatedAt, 'long') }}
          </span>
          <button
            type="button"
            class="min-h-[44px] font-medium text-primary-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-wait disabled:opacity-60 sm:min-h-0 dark:text-primary-400"
            :disabled="isRegenerating"
            :aria-busy="isRegenerating"
            data-testid="trends-digest-regenerate"
            @click="regenerateDigest()"
          >
            {{ isRegenerating ? 'Rédaction…' : 'Régénérer' }}
          </button>
        </figcaption>
      </figure>
    </div>
  </BaseCard>
</template>
