import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { TrendInsightDto, TrendsResponseDto } from '@/lib/api'
import { useFiltersStore } from '@/stores/filters'
import { TRENDS_SHOWN, useSpendingTrends } from './useSpendingTrends'

const { getSpendingTrends } = vi.hoisted(() => ({
  getSpendingTrends: vi.fn(),
}))
vi.mock('@/lib/api', () => ({
  api: { getSpendingTrends },
}))

function insight(id: string): TrendInsightDto {
  return {
    kind: 'amount',
    unit: { type: 'category', id, categoryId: id, name: id, icon: null },
    direction: 'up',
    tone: 'neutral',
    current: 312,
    reference: 226,
    delta: 86,
    deltaPct: 38.1,
    sentence: `${id} : 312 € en septembre.`,
    windows: {
      current: { start: '2026-09-01', end: '2026-09-30' },
      reference: { start: '2026-03-01', end: '2026-08-31' },
    },
    series: [226, 226, 226, 226, 226, 226, 312],
    score: 86,
  }
}

function response(
  overrides: Partial<TrendsResponseDto> = {}
): TrendsResponseDto {
  return {
    month: '2026-09',
    reading: 'everyday',
    window: 6,
    completeMonths: 12,
    insights: [insight('restaurants')],
    quietSentence: null,
    availableMonths: ['2026-09', '2026-08'],
    horizons: [],
    digest: null,
    ...overrides,
  }
}

function setup() {
  const reading = ref<'everyday' | 'real'>('everyday')
  const deductReimbursements = ref(true)
  const deductPendingReimbursements = ref(true)
  const trends = useSpendingTrends({
    reading,
    deductReimbursements,
    deductPendingReimbursements,
  })
  return { trends, reading, deductReimbursements, deductPendingReimbursements }
}

describe('useSpendingTrends', () => {
  beforeEach(() => {
    getSpendingTrends.mockReset()
    getSpendingTrends.mockResolvedValue(response())
    vi.mocked(localStorage.getItem).mockReturnValue(null)
  })

  it('reads the last closed month in the remembered window, with the dashboard reading', async () => {
    const { trends } = setup()

    await trends.fetchTrends()

    expect(getSpendingTrends).toHaveBeenCalledWith({
      month: undefined,
      window: 6,
      reading: 'everyday',
      deductReimbursements: true,
      deductPendingReimbursements: true,
    })
    expect(trends.data.value?.month).toBe('2026-09')
    expect(trends.isLoading.value).toBe(false)
  })

  it('reads again when the reading or a reimbursement switch changes', async () => {
    const { trends, reading, deductReimbursements } = setup()
    await trends.fetchTrends()

    reading.value = 'real'
    await flushPromises()
    deductReimbursements.value = false
    await flushPromises()

    expect(getSpendingTrends.mock.calls.map(([q]) => q)).toEqual([
      expect.objectContaining({ reading: 'everyday' }),
      expect.objectContaining({ reading: 'real', deductReimbursements: true }),
      expect.objectContaining({ reading: 'real', deductReimbursements: false }),
    ])
  })

  it('keeps the window as a preference, and reads again with it', async () => {
    const { trends } = setup()
    await trends.fetchTrends()

    trends.setWindow(12)
    await flushPromises()

    expect(useFiltersStore().trendsWindow).toBe(12)
    expect(getSpendingTrends).toHaveBeenLastCalledWith(
      expect.objectContaining({ window: 12 })
    )
  })

  it('reads another closed month when one is picked, folded again', async () => {
    const { trends } = setup()
    await trends.fetchTrends()
    trends.toggleExpanded()

    trends.setMonth('2026-08')
    await flushPromises()

    expect(getSpendingTrends).toHaveBeenLastCalledWith(
      expect.objectContaining({ month: '2026-08' })
    )
    expect(trends.expanded.value).toBe(false)
  })

  it('keeps the latest answer when two cross', async () => {
    let answerFirst: (value: TrendsResponseDto) => void = () => {}
    getSpendingTrends
      .mockImplementationOnce(
        () =>
          new Promise<TrendsResponseDto>(resolve => {
            answerFirst = resolve
          })
      )
      .mockResolvedValueOnce(response({ window: 3 }))
    const { trends } = setup()

    const first = trends.fetchTrends()
    const second = trends.fetchTrends()
    await second
    answerFirst(response({ window: 12 }))
    await first

    expect(trends.data.value?.window).toBe(3)
    expect(trends.isLoading.value).toBe(false)
  })

  it('says it failed, and keeps what it showed', async () => {
    const { trends } = setup()
    await trends.fetchTrends()
    getSpendingTrends.mockRejectedValueOnce(
      new Error('Impossible de charger les tendances')
    )

    await trends.fetchTrends()

    expect(trends.error.value).toBe('Impossible de charger les tendances')
    expect(trends.data.value?.month).toBe('2026-09')
  })

  it('shows five lines, then all of them on demand', async () => {
    getSpendingTrends.mockResolvedValue(
      response({
        insights: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(insight),
      })
    )
    const { trends } = setup()
    await trends.fetchTrends()

    expect(trends.visibleInsights.value).toHaveLength(TRENDS_SHOWN)
    expect(trends.hiddenCount.value).toBe(2)

    trends.toggleExpanded()
    await nextTick()
    expect(trends.visibleInsights.value).toHaveLength(7)
  })

  it('counts the months still missing, and tells a shortened window', async () => {
    const { trends } = setup()

    getSpendingTrends.mockResolvedValueOnce(
      response({ completeMonths: 1, window: 1, insights: [] })
    )
    await trends.fetchTrends()
    expect(trends.missingMonths.value).toBe(2)
    expect(trends.isWindowShortened.value).toBe(false)

    getSpendingTrends.mockResolvedValueOnce(
      response({ completeMonths: 4, window: 4 })
    )
    await trends.fetchTrends()
    expect(trends.missingMonths.value).toBe(0)
    expect(trends.isWindowShortened.value).toBe(true)
  })

  it('says in one line which long comparisons wait for more history, once the habits can speak', async () => {
    const { trends } = setup()
    const horizons = [
      {
        kind: 'record' as const,
        months: 12,
        missing: 2,
        sentence:
          'Les records sur un an demandent 12 mois complets : il en manque 2.',
      },
      {
        kind: 'yearAgo' as const,
        months: 13,
        missing: 3,
        sentence:
          "La comparaison avec l'an dernier demande 13 mois complets : il en manque 3.",
      },
    ]

    getSpendingTrends.mockResolvedValueOnce(
      response({ completeMonths: 9, horizons })
    )
    await trends.fetchTrends()
    expect(trends.horizonsLine.value).toBe(
      "Les records sur un an demandent 12 mois complets : il en manque 2. La comparaison avec l'an dernier demande 13 mois complets : il en manque 3."
    )

    // Under three months the card says that first, and only that.
    getSpendingTrends.mockResolvedValueOnce(
      response({ completeMonths: 1, window: 1, horizons })
    )
    await trends.fetchTrends()
    expect(trends.horizonsLine.value).toBeNull()

    getSpendingTrends.mockResolvedValueOnce(response())
    await trends.fetchTrends()
    expect(trends.horizonsLine.value).toBeNull()
  })
})
