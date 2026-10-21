import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type {
  TrendDigestDto,
  TrendInsightDto,
  TrendWindow,
  TrendsResponseDto,
} from '@/lib/api'
import {
  modelName,
  resetTrendDigestSession,
  useTrendDigest,
} from './useTrendDigest'

const { getTrendDigest, regenerateTrendDigest } = vi.hoisted(() => ({
  getTrendDigest: vi.fn(),
  regenerateTrendDigest: vi.fn(),
}))
vi.mock('@/lib/api', () => ({
  api: { getTrendDigest, regenerateTrendDigest },
}))

const insight = {
  kind: 'amount',
  unit: { type: 'category', id: 'r', categoryId: 'r', name: 'R', icon: null },
  direction: 'up',
  tone: 'neutral',
  current: 312,
  reference: 226,
  delta: 86,
  deltaPct: 38,
  sentence: 'R : 312 €.',
  windows: {
    current: { start: '2026-09-01', end: '2026-09-30' },
    reference: { start: '2026-03-01', end: '2026-08-31' },
  },
  series: [],
  score: 86,
} as TrendInsightDto

function trends(overrides: Partial<TrendsResponseDto> = {}): TrendsResponseDto {
  return {
    month: '2026-09',
    reading: 'everyday',
    window: 6,
    completeMonths: 12,
    insights: [insight],
    quietSentence: null,
    headline: null,
    availableMonths: ['2026-09'],
    horizons: [],
    digest: null,
    ...overrides,
  }
}

function digest(overrides: Partial<TrendDigestDto> = {}): TrendDigestDto {
  return {
    month: '2026-09',
    reading: 'everyday',
    window: 6,
    text: 'Septembre en quelques phrases.',
    model: 'claude-haiku-5-5',
    generatedAt: '2026-10-01T09:00:00.000Z',
    ...overrides,
  }
}

function setup(initial: TrendsResponseDto | null = null) {
  const list = ref<TrendsResponseDto | null>(initial)
  const window = ref<TrendWindow>(6)
  const composable = useTrendDigest({
    trends: list,
    window,
    deductReimbursements: () => true,
    deductPendingReimbursements: () => false,
  })
  return { list, window, ...composable }
}

describe('useTrendDigest', () => {
  beforeEach(() => {
    resetTrendDigestSession()
    getTrendDigest.mockReset()
    regenerateTrendDigest.mockReset()
    getTrendDigest.mockResolvedValue(digest())
  })

  it('waits for the list: nothing is asked before it', async () => {
    const { list, digest: paragraph } = setup()
    await flushPromises()
    expect(getTrendDigest).not.toHaveBeenCalled()

    list.value = trends()
    await flushPromises()

    expect(getTrendDigest).toHaveBeenCalledWith({
      month: '2026-09',
      reading: 'everyday',
      window: 6,
      deductReimbursements: true,
      deductPendingReimbursements: false,
    })
    expect(paragraph.value?.text).toBe('Septembre en quelques phrases.')
  })

  it('asks with the window asked for, not the one the history shortened', async () => {
    const { list, window } = setup()
    window.value = 12
    // Seven months of history: the list reads 7, the paragraph is keyed 12.
    list.value = trends({ window: 7 })
    await flushPromises()
    expect(getTrendDigest).toHaveBeenLastCalledWith(
      expect.objectContaining({ window: 12 })
    )
  })

  it('asks nothing when the list has nothing to tell', async () => {
    setup(trends({ insights: [], quietSentence: 'Rien de notable.' }))
    await flushPromises()
    expect(getTrendDigest).not.toHaveBeenCalled()
  })

  it('reads a failure as no paragraph, quietly', async () => {
    getTrendDigest.mockRejectedValue(new Error('500'))
    const { digest: paragraph, isLoading } = setup(trends())
    await flushPromises()
    expect(paragraph.value).toBeNull()
    expect(isLoading.value).toBe(false)
  })

  it('does not ask again in the session for a month that had none', async () => {
    getTrendDigest.mockResolvedValue(null)
    setup(trends())
    await flushPromises()
    setup(trends())
    await flushPromises()
    expect(getTrendDigest).toHaveBeenCalledTimes(1)

    // Another window is another paragraph.
    const other = setup()
    other.window.value = 3
    other.list.value = trends()
    await flushPromises()
    expect(getTrendDigest).toHaveBeenCalledTimes(2)
  })

  it('drops the paragraph of another month the moment the list changes', async () => {
    const { list, digest: paragraph } = setup(trends())
    await flushPromises()
    expect(paragraph.value).not.toBeNull()

    let resolve: (value: TrendDigestDto | null) => void = () => undefined
    getTrendDigest.mockReturnValue(
      new Promise(r => {
        resolve = r
      })
    )
    list.value = trends({ month: '2026-08' })
    await flushPromises()
    expect(paragraph.value).toBeNull()

    resolve(digest({ month: '2026-08', text: 'Août.' }))
    await flushPromises()
    expect(paragraph.value?.text).toBe('Août.')
  })

  it('writes again on « Régénérer », busy while it does', async () => {
    const { regenerate, digest: paragraph, isRegenerating } = setup(trends())
    await flushPromises()
    regenerateTrendDigest.mockResolvedValue(digest({ text: 'Autrement dit.' }))

    const pending = regenerate()
    expect(isRegenerating.value).toBe(true)
    await pending

    expect(regenerateTrendDigest).toHaveBeenCalledWith(
      expect.objectContaining({ month: '2026-09', window: 6 })
    )
    expect(paragraph.value?.text).toBe('Autrement dit.')
    expect(isRegenerating.value).toBe(false)
  })

  it('keeps the paragraph when « Régénérer » fails', async () => {
    const { regenerate, digest: paragraph } = setup(trends())
    await flushPromises()
    regenerateTrendDigest.mockRejectedValue(new Error('429'))

    await regenerate()

    expect(paragraph.value?.text).toBe('Septembre en quelques phrases.')
  })

  it('names the model', () => {
    expect(modelName('claude-haiku-5-5')).toBe('Claude Haiku 5.5')
    expect(modelName('claude-other')).toBe('claude-other')
  })
})
