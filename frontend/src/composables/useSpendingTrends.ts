import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import {
  api,
  type TrendInsightDto,
  type TrendReading,
  type TrendWindow,
  type TrendsResponseDto,
} from '@/lib/api'
import { useFiltersStore } from '@/stores/filters'

/** What the card shows before « Voir tout ». */
export const TRENDS_SHOWN = 5
/** Under this many complete months, the habit trends are silent. */
export const TRENDS_MIN_HISTORY = 3

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
  const expanded = ref(false)

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
    expanded.value = false
    month.value = value
  }

  function setWindow(value: TrendWindow): void {
    filtersStore.setTrendsWindow(value)
  }

  function toggleExpanded(): void {
    expanded.value = !expanded.value
  }

  const insights = computed<TrendInsightDto[]>(() => data.value?.insights ?? [])
  const visibleInsights = computed(() =>
    expanded.value ? insights.value : insights.value.slice(0, TRENDS_SHOWN)
  )
  const hiddenCount = computed(() =>
    Math.max(0, insights.value.length - TRENDS_SHOWN)
  )

  /** Months of history still missing before the habit trends can speak. */
  const missingMonths = computed(() => {
    if (!data.value) return 0
    return Math.max(0, TRENDS_MIN_HISTORY - data.value.completeMonths)
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
    expanded,
    insights,
    visibleInsights,
    hiddenCount,
    missingMonths,
    isWindowShortened,
    fetchTrends,
    setMonth,
    setWindow,
    toggleExpanded,
  }
}
