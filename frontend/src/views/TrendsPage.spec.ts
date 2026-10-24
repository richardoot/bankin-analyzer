import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  mount,
  flushPromises,
  enableAutoUnmount,
  RouterLinkStub,
} from '@vue/test-utils'
import { ref } from 'vue'
import type { TrendInsightDto, TrendsResponseDto } from '@/lib/api'
import { resetTrendDigestSession } from '@/composables/useTrendDigest'
import TrendsPage from './TrendsPage.vue'

enableAutoUnmount(afterEach)

vi.mock('@/composables/useMediaQuery', () => ({
  useMediaQuery: () => ref(false),
}))

const {
  getSpendingTrends,
  getTrendDigest,
  getCategories,
  getDashboardSummary,
} = vi.hoisted(() => ({
  getSpendingTrends: vi.fn(),
  getTrendDigest: vi.fn(),
  getCategories: vi.fn(),
  getDashboardSummary: vi.fn(),
}))
vi.mock('@/lib/api', () => ({
  api: {
    getSpendingTrends,
    getTrendDigest,
    regenerateTrendDigest: vi.fn(),
    getCategories,
    getDashboardSummary,
  },
}))

// The reading lives in the filters store: reactive here, as it is there.
const filters = vi.hoisted(() => ({
  deductPendingReimbursements: true,
  setDeductPendingReimbursements: vi.fn(),
  lastSyncError: null as string | null,
  breakdownMode: 'everyday' as 'everyday' | 'real',
  deductReimbursements: true,
  setBreakdownMode: vi.fn(),
}))
vi.mock('@/stores/filters', async () => {
  const { reactive } = await import('vue')
  const state = reactive(filters)
  return {
    useFiltersStore: () => ({
      get deductPendingReimbursements() {
        return state.deductPendingReimbursements
      },
      setDeductPendingReimbursements: filters.setDeductPendingReimbursements,
      get breakdownMode() {
        return state.breakdownMode
      },
      setBreakdownMode: (mode: 'everyday' | 'real') => {
        filters.setBreakdownMode(mode)
        state.breakdownMode = mode
      },
      get deductReimbursements() {
        return state.deductReimbursements
      },
      setDeductReimbursements: (value: boolean) => {
        state.deductReimbursements = value
      },
      get lastSyncError() {
        return state.lastSyncError
      },
      timePeriod: '1y',
      trendsWindow: 6,
      setTrendsWindow: vi.fn(),
      getDateRangeFromPeriod: vi.fn(() => ({
        startDate: null,
        endDate: null,
      })),
    }),
  }
})
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({
    accounts: [],
    load: vi.fn().mockResolvedValue(undefined),
    getDivisor: vi.fn(() => 1),
  }),
}))

const windows = {
  current: { start: '2026-09-01', end: '2026-09-30' },
  reference: { start: '2026-03-01', end: '2026-08-31' },
}

function trend(id: string, score: number): TrendInsightDto {
  return {
    kind: 'amount',
    unit: {
      type: 'subcategory',
      id,
      categoryId: 'cat-dining',
      name: id,
      icon: null,
    },
    direction: 'up',
    tone: 'neutral',
    current: 312,
    reference: 226,
    delta: 86,
    deltaPct: 38.1,
    sentence: `${id} : en hausse.`,
    windows,
    series: [226, 226, 226, 226, 226, 226, 312],
    score,
  }
}

function response(): TrendsResponseDto {
  return {
    month: '2026-09',
    reading: 'everyday',
    window: 6,
    completeMonths: 12,
    insights: [
      trend('Restaurant', 500),
      trend('Bars', 400),
      trend('Cinéma', 300),
      trend('Livres', 200),
      trend('Concerts', 150),
      trend('Jeux', 100),
    ],
    quietSentence: null,
    headline: 'Septembre : plus de restaurant.',
    availableMonths: ['2026-09', '2026-08'],
    horizons: [],
    digest: null,
  }
}

async function mountPage() {
  const wrapper = mount(TrendsPage, {
    attachTo: document.body,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return wrapper
}

describe('TrendsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetTrendDigestSession()
    filters.deductPendingReimbursements = true
    filters.lastSyncError = null
    filters.breakdownMode = 'everyday'
    filters.deductReimbursements = true
    getSpendingTrends.mockResolvedValue(response())
    getTrendDigest.mockResolvedValue(null)
    getCategories.mockResolvedValue([
      { id: 'cat-dining', name: 'Sorties', type: 'EXPENSE', createdAt: '' },
      { id: 'cat-salary', name: 'Salaire', type: 'INCOME', createdAt: '' },
    ])
    vi.mocked(localStorage.getItem).mockReturnValue(null)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('introduces itself as the trends of the everyday life', async () => {
    const wrapper = await mountPage()

    expect(wrapper.get('h1').text()).toBe('Tendances')
    expect(wrapper.text()).toContain('Ce qui change dans la vie courante')
  })

  it('mounts the full card: month, window, tabs, every trend and the paragraph to unfold', async () => {
    const wrapper = await mountPage()

    const card = wrapper.get('[data-testid="spending-trends"]')
    expect(card.find('[data-testid="trends-month"]').exists()).toBe(true)
    expect(card.find('[data-testid="trends-window-6"]').exists()).toBe(true)
    expect(card.find('[role="tablist"]').exists()).toBe(true)
    expect(card.find('[data-testid="trends-more"]').exists()).toBe(true)
    expect(card.find('[data-testid="trends-digest-toggle"]').exists()).toBe(
      true
    )
    expect(card.findAll('[data-testid="trends-list"] article')).toHaveLength(5)
    expect(card.find('[data-testid="trends-all-link"]').exists()).toBe(false)
  })

  it('asks the trends alone, never the dashboard summary', async () => {
    await mountPage()

    expect(getSpendingTrends).toHaveBeenCalledTimes(1)
    expect(getSpendingTrends).toHaveBeenCalledWith({
      month: undefined,
      window: 6,
      reading: 'everyday',
      deductReimbursements: true,
      deductPendingReimbursements: true,
    })
    expect(getDashboardSummary).not.toHaveBeenCalled()
  })

  it('names a subcategory’s parent from the expense categories', async () => {
    const wrapper = await mountPage()

    expect(wrapper.get('[data-testid="trends-list"]').text()).toContain(
      'Sorties'
    )
  })

  it('carries the « Lecture » menu: the reading, remembered, and the switches', async () => {
    const wrapper = await mountPage()

    const button = wrapper.get('[data-testid="reading-menu-button"]')
    expect(button.text()).toBe(
      'Lecture : vie courante · remboursements déduits'
    )
    await button.trigger('click')

    await wrapper.get('[data-testid="breakdown-mode-real"]').trigger('click')
    await flushPromises()
    // Kept by the store, the one reading of every page.
    expect(filters.setBreakdownMode).toHaveBeenCalledWith('real')
    expect(getSpendingTrends).toHaveBeenLastCalledWith(
      expect.objectContaining({ reading: 'real', deductReimbursements: true })
    )
    expect(wrapper.text()).toContain('Ce qui change dans toutes les dépenses')

    await wrapper
      .get('[data-testid="toggle-deduct-reimbursements"]')
      .trigger('click')
    await flushPromises()
    expect(getSpendingTrends).toHaveBeenLastCalledWith(
      expect.objectContaining({ reading: 'real', deductReimbursements: false })
    )

    await wrapper.get('[data-testid="toggle-deduct-pending"]').trigger('click')
    expect(filters.setDeductPendingReimbursements).toHaveBeenCalledWith(false)
  })

  it('opens on the reading the store keeps', async () => {
    filters.breakdownMode = 'real'
    await mountPage()

    expect(getSpendingTrends).toHaveBeenCalledWith(
      expect.objectContaining({ reading: 'real' })
    )
  })
})
