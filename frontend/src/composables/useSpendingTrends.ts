import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import {
  api,
  type TrendInsightDto,
  type TrendReading,
  type TrendWindow,
  type TrendsResponseDto,
} from '@/lib/api'
import { useFiltersStore } from '@/stores/filters'
import { TREND_GROUPS, trendGroupOf, type TrendGroupKey } from '@/lib/trends'

/** What « L'essentiel » shows: the five largest gaps, every kind together. */
export const TRENDS_SHOWN = 5
/** Under this many complete months, the habit trends are silent. */
export const TRENDS_MIN_HISTORY = 3

export interface TrendGroup {
  key: TrendGroupKey
  title: string
  /** The group's tab: « Abonnements », « Catégories »… */
  tab: string
  insights: TrendInsightDto[]
}

/** The card's tabs: the five largest gaps, then one per group. */
export type TrendTab = 'essential' | TrendGroupKey

export interface GroupedTrendInsights {
  /** The lines to file: a warning, above the groups and in none. */
  toFile: TrendInsightDto[]
  /** The groups that have a line, in their order, the score kept inside. */
  groups: TrendGroup[]
}

/**
 * Files the lines the card shows under their group (`trendGroupOf`): the
 * same lines in the same score order, only sorted under a title. A group
 * with no line is left out.
 */
export function groupTrendInsights(
  insights: readonly TrendInsightDto[]
): GroupedTrendInsights {
  const toFile: TrendInsightDto[] = []
  const byGroup = new Map<TrendGroupKey, TrendInsightDto[]>()
  for (const insight of insights) {
    const key = trendGroupOf(insight)
    if (key === null) {
      toFile.push(insight)
      continue
    }
    const lines = byGroup.get(key) ?? []
    lines.push(insight)
    byGroup.set(key, lines)
  }
  const groups = TREND_GROUPS.flatMap(({ key, title, tab }) => {
    const lines = byGroup.get(key)
    return lines ? [{ key, title, tab, insights: lines }] : []
  })
  return { toFile, groups }
}

export interface SpendingTrendsInputs {
  /** The dashboard's reading, « Vie courante » or « Tout ». */
  reading: MaybeRefOrGetter<TrendReading>
  deductReimbursements: MaybeRefOrGetter<boolean>
  deductPendingReimbursements: MaybeRefOrGetter<boolean>
}

/**
 * « Ce qui change » (agent-os/product/spending-trends.md): a closed month
 * against the habit of the months before it.
 *
 * Its own request, apart from the summary: the dashboard's figures never
 * wait for it, and a failure here never touches them. It follows the
 * dashboard's reading and reimbursement switches, never its period — a
 * trend reads one closed month, whatever window is shown above. The month
 * is the card's own choice (the last closed one until picked); the window
 * is a remembered preference, like the period.
 */
export function useSpendingTrends(inputs: SpendingTrendsInputs) {
  const filtersStore = useFiltersStore()

  const data = ref<TrendsResponseDto | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  /** The month picked on the card; null reads the last closed month. */
  const month = ref<string | null>(null)
  const referenceWindow = computed<TrendWindow>(() => filtersStore.trendsWindow)
  /** The tab picked; never remembered past the session. */
  const tab = ref<TrendTab>('essential')

  // A later answer always wins: switching the window twice quickly must not
  // leave the first answer on screen.
  let sequence = 0

  async function fetchTrends(): Promise<void> {
    const request = ++sequence
    isLoading.value = true
    error.value = null
    try {
      const result = await api.getSpendingTrends({
        month: month.value ?? undefined,
        window: referenceWindow.value,
        reading: toValue(inputs.reading),
        deductReimbursements: toValue(inputs.deductReimbursements),
        deductPendingReimbursements: toValue(
          inputs.deductPendingReimbursements
        ),
      })
      if (request !== sequence) return
      data.value = result
    } catch (err) {
      if (request !== sequence) return
      error.value =
        err instanceof Error
          ? err.message
          : 'Impossible de charger les tendances'
    } finally {
      if (request === sequence) isLoading.value = false
    }
  }

  watch(
    () => [
      month.value,
      referenceWindow.value,
      toValue(inputs.reading),
      toValue(inputs.deductReimbursements),
      toValue(inputs.deductPendingReimbursements),
    ],
    () => {
      void fetchTrends()
    }
  )

  function setMonth(value: string): void {
    month.value = value
  }

  function setWindow(value: TrendWindow): void {
    filtersStore.setTrendsWindow(value)
  }

  const insights = computed<TrendInsightDto[]>(() => data.value?.insights ?? [])
  /** Every line, filed: the lines to file apart, each group with all of its lines. */
  const grouped = computed(() => groupTrendInsights(insights.value))
  /** The lines to file: one alert beside the tabs, never a tile. */
  const toFile = computed<TrendInsightDto | null>(
    () => grouped.value.toFile[0] ?? null
  )
  /** The trends themselves, in score order, the lines to file left out. */
  const habits = computed(() =>
    insights.value.filter(insight => insight.kind !== 'uncategorized')
  )
  /** « L'essentiel »: the five largest gaps, whatever their group. */
  const essentials = computed(() => habits.value.slice(0, TRENDS_SHOWN))
  /** How many trends « L'essentiel » leaves to the groups. */
  const otherCount = computed(() =>
    Math.max(0, habits.value.length - TRENDS_SHOWN)
  )
  const groups = computed(() => grouped.value.groups)
  /** The group with the most lines, the first in order on a tie. */
  const busiestGroup = computed<TrendGroupKey | null>(() => {
    let best: TrendGroup | null = null
    for (const group of groups.value) {
      if (!best || group.insights.length > best.insights.length) best = group
    }
    return best?.key ?? null
  })
  /**
   * The tab shown: the one picked while its group still has a line, « L'essentiel »
   * otherwise — another month may leave a group empty.
   */
  const activeTab = computed<TrendTab>(() =>
    tab.value === 'essential' ||
    groups.value.some(group => group.key === tab.value)
      ? tab.value
      : 'essential'
  )
  /** The tiles of the tab shown. */
  const activeInsights = computed<TrendInsightDto[]>(() =>
    activeTab.value === 'essential'
      ? essentials.value
      : (groups.value.find(group => group.key === activeTab.value)?.insights ??
        [])
  )

  function setTab(value: TrendTab): void {
    tab.value = value
  }

  /** Months of history still missing before the habit trends can speak. */
  const missingMonths = computed(() => {
    if (!data.value) return 0
    return Math.max(0, TRENDS_MIN_HISTORY - data.value.completeMonths)
  })

  /**
   * The long comparisons (drift, savings, records, last year) the history
   * cannot make yet, in one line; null once it can, or while the habits
   * themselves are still waiting — the card says that first.
   */
  const horizonsLine = computed<string | null>(() => {
    const horizons = data.value?.horizons ?? []
    if (missingMonths.value > 0 || horizons.length === 0) return null
    return horizons.map(h => h.sentence).join(' ')
  })

  /** The window asked for, longer than the history: the header says so. */
  const isWindowShortened = computed(
    () =>
      data.value !== null &&
      missingMonths.value === 0 &&
      data.value.window < referenceWindow.value
  )

  return {
    data,
    isLoading,
    error,
    month,
    referenceWindow,
    insights,
    toFile,
    habits,
    essentials,
    otherCount,
    groups,
    busiestGroup,
    activeTab,
    activeInsights,
    missingMonths,
    horizonsLine,
    isWindowShortened,
    fetchTrends,
    setMonth,
    setWindow,
    setTab,
  }
}
