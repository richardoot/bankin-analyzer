import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { TrendInsightDto, TrendsResponseDto } from '@/lib/api'
import { useFiltersStore } from '@/stores/filters'
import {
  TRENDS_SHOWN,
  groupTrendInsights,
  useSpendingTrends,
} from './useSpendingTrends'

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

function as(
  id: string,
  kind: TrendInsightDto['kind'],
  type: TrendInsightDto['unit']['type']
): TrendInsightDto {
  const base = insight(id)
  return { ...base, kind, unit: { ...base.unit, type } }
}

describe('groupTrendInsights', () => {
  const ids = (lines: TrendInsightDto[]) => lines.map(l => l.unit.id)

  it('lays the groups in their order, the score kept inside each', () => {
    const { toFile, groups } = groupTrendInsights([
      as('share', 'share', 'structure'),
      as('bars', 'amount', 'subcategory'),
      as('netflix', 'subscription', 'recurrence'),
      as('cafe', 'frequency', 'merchant'),
      as('food', 'drift', 'category'),
      as('rent', 'price', 'recurrence'),
    ])
    expect(toFile).toEqual([])
    expect(groups.map(g => g.title)).toEqual([
      'Abonnements et charges',
      'Catégories',
      'Enseignes',
      "Vue d'ensemble",
    ])
    expect(groups.map(g => ids(g.insights))).toEqual([
      ['netflix', 'rent'],
      ['bars', 'food'],
      ['cafe'],
      ['share'],
    ])
  })

  it('leaves out a group with no line', () => {
    const { groups } = groupTrendInsights([
      as('bars', 'amount', 'subcategory'),
      as('gym', 'lostHabit', 'subcategory'),
    ])
    expect(groups.map(g => g.key)).toEqual(['categories'])
    expect(groups.flatMap(g => ids(g.insights))).toEqual(['bars', 'gym'])
  })

  it('keeps the lines to file apart, in no group', () => {
    const { toFile, groups } = groupTrendInsights([
      as('bars', 'amount', 'subcategory'),
      as('none', 'uncategorized', 'uncategorized'),
    ])
    expect(ids(toFile)).toEqual(['none'])
    expect(groups.flatMap(g => ids(g.insights))).toEqual(['bars'])
  })

  it('has nothing to file from nothing', () => {
    expect(groupTrendInsights([])).toEqual({ toFile: [], groups: [] })
  })
})

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
    headline: null,
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

  it('reads another closed month when one is picked', async () => {
    const { trends } = setup()
    await trends.fetchTrends()

    trends.setMonth('2026-08')
    await flushPromises()

    expect(getSpendingTrends).toHaveBeenLastCalledWith(
      expect.objectContaining({ month: '2026-08' })
    )
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

  it("keeps the five largest gaps for « L'essentiel », the lines to file apart", async () => {
    getSpendingTrends.mockResolvedValue(
      response({
        insights: [
          as('none', 'uncategorized', 'uncategorized'),
          ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(insight),
        ],
      })
    )
    const { trends } = setup()
    await trends.fetchTrends()

    expect(trends.toFile.value?.unit.id).toBe('none')
    expect(trends.habits.value).toHaveLength(7)
    expect(trends.essentials.value.map(i => i.unit.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ])
    expect(TRENDS_SHOWN).toBe(5)
    expect(trends.otherCount.value).toBe(2)
    expect(trends.activeTab.value).toBe('essential')
    expect(trends.activeInsights.value).toEqual(trends.essentials.value)
  })

  it('files every line under its group, and shows the tab picked', async () => {
    const lines: TrendInsightDto[] = [
      as('a', 'share', 'structure'),
      as('b', 'amount', 'category'),
      as('c', 'subscription', 'recurrence'),
      as('d', 'newHabit', 'merchant'),
      as('e', 'basket', 'subcategory'),
      as('f', 'savings', 'savings'),
      as('g', 'price', 'recurrence'),
      as('h', 'drift', 'category'),
    ]
    getSpendingTrends.mockResolvedValue(response({ insights: lines }))
    const { trends } = setup()
    await trends.fetchTrends()

    expect(
      trends.groups.value.map(g => [
        g.key,
        g.tab,
        g.insights.map(i => i.unit.id),
      ])
    ).toEqual([
      ['charges', 'Abonnements', ['c', 'g']],
      ['categories', 'Catégories', ['b', 'e', 'h']],
      ['merchants', 'Enseignes', ['d']],
      ['overview', "Vue d'ensemble", ['a', 'f']],
    ])
    // The most lines, the first in order on a tie.
    expect(trends.busiestGroup.value).toBe('categories')

    trends.setTab('charges')
    await nextTick()
    expect(trends.activeTab.value).toBe('charges')
    expect(trends.activeInsights.value.map(i => i.unit.id)).toEqual(['c', 'g'])
  })

  it("falls back on « L'essentiel » when the group picked has no line left", async () => {
    getSpendingTrends.mockResolvedValueOnce(
      response({
        insights: [
          as('c', 'subscription', 'recurrence'),
          as('b', 'amount', 'category'),
        ],
      })
    )
    const { trends } = setup()
    await trends.fetchTrends()
    trends.setTab('charges')

    getSpendingTrends.mockResolvedValueOnce(
      response({ insights: [as('b', 'amount', 'category')] })
    )
    await trends.fetchTrends()

    expect(trends.activeTab.value).toBe('essential')
    expect(trends.busiestGroup.value).toBe('categories')
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
