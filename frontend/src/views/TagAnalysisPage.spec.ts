import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TagAnalysisPage from './TagAnalysisPage.vue'
import { api } from '@/lib/api'
import type { TagAnalysisDto, TransactionDto } from '@/lib/api'

vi.mock('vue3-apexcharts', () => ({
  default: {
    name: 'VueApexCharts',
    props: ['type', 'height', 'options', 'series'],
    template: '<div class="apexcharts-mock"></div>',
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'tag-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}
vi.mock('@/composables/useToast', () => ({
  useToast: () => mockToast,
}))

vi.mock('@/lib/api', () => ({
  api: {
    getTagAnalysis: vi.fn(),
    getTransactions: vi.fn(),
    detachTagFromTransaction: vi.fn(),
  },
}))

/** formatCurrency uses narrow no-break spaces; normalise before matching. */
const norm = (text: string) => text.replace(/\s+/g, ' ')

const baseTag = {
  id: 'tag-1',
  name: 'Vacances Italie',
  color: '#06b6d4',
  icon: null,
  isExceptional: true,
  eventStartDate: '2025-12-10',
  eventEndDate: '2025-12-14',
  budgetAmount: null,
}

const analysisWithBaseline: TagAnalysisDto = {
  tag: baseTag,
  totalExpenses: 1259,
  totalIncome: 50,
  net: -1209,
  transactionCount: 5,
  firstDate: '2025-12-03T00:00:00.000Z',
  lastDate: '2025-12-13T00:00:00.000Z',
  byCategory: [
    {
      categoryId: 'c-travel',
      categoryName: 'Voyages',
      categoryIcon: '✈️',
      type: 'EXPENSE',
      amount: 1163,
      transactionCount: 4,
      baselineAmount: 0,
      surplusAmount: 1163,
    },
    {
      categoryId: 'c-resto',
      categoryName: 'Restaurants',
      categoryIcon: '🍽️',
      type: 'EXPENSE',
      amount: 96,
      transactionCount: 1,
      baselineAmount: 25.83,
      surplusAmount: 70.17,
    },
    {
      categoryId: 'c-remb',
      categoryName: 'Remboursement',
      categoryIcon: null,
      type: 'INCOME',
      amount: 50,
      transactionCount: 1,
    },
  ],
  byMonth: [{ month: '2025-12', expenses: 1259, income: 50 }],
  baseline: {
    startDate: '2025-06-01',
    endDate: '2025-12-09',
    everydayDays: 192,
    eventDays: 5,
  },
  totalSurplus: 1233.17,
}

const transactions: TransactionDto[] = [
  {
    id: 'tx-1',
    date: '2025-12-03T00:00:00.000Z',
    description: "Billets d'avion Rome",
    amount: -428,
    type: 'EXPENSE',
    accountId: 'acc-1',
    account: 'Compte Courant',
    categoryName: 'Voyages',
    isPointed: false,
    createdAt: '2025-12-03T00:00:00.000Z',
  },
]

function mockAnalysis(analysis: TagAnalysisDto): void {
  vi.mocked(api.getTagAnalysis).mockResolvedValue(analysis)
  vi.mocked(api.getTransactions).mockResolvedValue({
    data: transactions,
    meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
  })
}

async function mountPage() {
  const wrapper = mount(TagAnalysisPage)
  await flushPromises()
  return wrapper
}

describe('TagAnalysisPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('real surplus', () => {
    it('shows the surplus, the reference spend and the reference window', async () => {
      mockAnalysis(analysisWithBaseline)

      const text = norm((await mountPage()).text())

      expect(text).toContain('Surcoût réel')
      expect(text).toContain('1 233,17 €')
      // Spent vs what an ordinary 5-day stretch would have cost (0 + 25,83).
      expect(text).toContain('1 259,00 €')
      expect(text).toContain('25,83 €')
      expect(text).toContain('5 jour(s)')
      // Reference window, formatted in French.
      expect(text).toContain('01/06/2025')
      expect(text).toContain('09/12/2025')
      expect(text).toContain('192 jours')
    })

    it('lists the baseline and the surplus for each expense category', async () => {
      mockAnalysis(analysisWithBaseline)

      const wrapper = await mountPage()
      const rows = wrapper.findAll('tbody tr')

      expect(rows).toHaveLength(3)

      const travel = norm(rows[0]?.text() ?? '')
      expect(travel).toContain('Voyages')
      expect(travel).toContain('1 163,00 €')
      expect(travel).toContain('+1 163,00 €')

      const resto = norm(rows[1]?.text() ?? '')
      expect(resto).toContain('Restaurants')
      expect(resto).toContain('25,83 €')
      expect(resto).toContain('+70,17 €')
    })

    it('leaves the baseline cells empty for income rows', async () => {
      mockAnalysis(analysisWithBaseline)

      const wrapper = await mountPage()
      const incomeCells = wrapper.findAll('tbody tr')[2]?.findAll('td') ?? []

      // Catégorie | Dépensé | En temps normal | Surcoût
      expect(incomeCells).toHaveLength(4)
      expect(incomeCells[2]?.text()).toBe('—')
      expect(incomeCells[3]?.text()).toBe('—')
    })

    it('renders a negative surplus without a plus sign', async () => {
      mockAnalysis({
        ...analysisWithBaseline,
        byCategory: [
          {
            categoryId: 'c-food',
            categoryName: 'Alimentation',
            categoryIcon: null,
            type: 'EXPENSE',
            amount: 80,
            transactionCount: 2,
            baselineAmount: 210,
            surplusAmount: -130,
          },
        ],
        totalSurplus: -130,
      })

      const text = norm((await mountPage()).text())

      expect(text).toContain('-130,00 €')
      expect(text).not.toContain('+-130')
    })

    it('discloses that fixed charges understate the surplus', async () => {
      mockAnalysis(analysisWithBaseline)

      const text = norm((await mountPage()).text())

      expect(text).toContain('sous-estimé')
    })
  })

  describe('additive events (no period declared)', () => {
    const additive: TagAnalysisDto = {
      ...analysisWithBaseline,
      tag: { ...baseTag, eventStartDate: null, eventEndDate: null },
      byCategory: analysisWithBaseline.byCategory.map(c => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        categoryIcon: c.categoryIcon,
        type: c.type,
        amount: c.amount,
        transactionCount: c.transactionCount,
      })),
      baseline: null,
      totalSurplus: null,
    }

    it('hides the surplus banner and invites declaring a period', async () => {
      mockAnalysis(additive)

      const text = norm((await mountPage()).text())

      expect(text).not.toContain('Surcoût réel')
      expect(text).toContain("Renseignez une période d'absence")
    })

    it('drops the baseline columns entirely', async () => {
      mockAnalysis(additive)

      const wrapper = await mountPage()

      const headers = wrapper.findAll('thead th').map(h => h.text())
      expect(headers).toEqual(['Catégorie', 'Dépensé'])
      expect(wrapper.findAll('tbody tr')[0]?.findAll('td')).toHaveLength(2)
    })

    it('still shows the amounts spent', async () => {
      mockAnalysis(additive)

      const text = norm((await mountPage()).text())

      expect(text).toContain('1 163,00 €')
      expect(text).toContain('Voyages')
    })
  })

  describe('detaching a transaction', () => {
    it('removes the row and refreshes the aggregates', async () => {
      mockAnalysis(analysisWithBaseline)
      vi.mocked(api.detachTagFromTransaction).mockResolvedValue(undefined)

      const wrapper = await mountPage()
      expect(wrapper.text()).toContain("Billets d'avion Rome")

      await wrapper
        .get('button[aria-label^="Retirer l\'étiquette"]')
        .trigger('click')
      await flushPromises()

      expect(api.detachTagFromTransaction).toHaveBeenCalledWith('tag-1', 'tx-1')
      // The analysis is refetched so totals and charts stay in sync.
      expect(api.getTagAnalysis).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).not.toContain("Billets d'avion Rome")
      expect(mockToast.success).toHaveBeenCalled()
    })

    it('keeps the row when the call fails', async () => {
      mockAnalysis(analysisWithBaseline)
      vi.mocked(api.detachTagFromTransaction).mockRejectedValue(
        new Error('boom')
      )

      const wrapper = await mountPage()
      await wrapper
        .get('button[aria-label^="Retirer l\'étiquette"]')
        .trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain("Billets d'avion Rome")
      expect(mockToast.error).toHaveBeenCalled()
    })
  })
})

describe('TagAnalysisPage — project envelope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const withEnvelope = (budgetAmount: number | null): TagAnalysisDto => ({
    ...analysisWithBaseline,
    tag: { ...baseTag, budgetAmount },
  })

  it('weighs the spend against the envelope', async () => {
    mockAnalysis(withEnvelope(1500))

    const wrapper = await mountPage()
    const block = wrapper.get('[data-testid="tag-envelope"]')
    const text = norm(block.text())

    // 1 259 spent of a 1 500 envelope → 241 left.
    expect(text).toContain('241,00 €')
    expect(text).toContain('Reste')
    expect(text).toContain('1 500,00 €')
    // The surplus is shown alongside, but is not what the bar measures.
    expect(text).toContain('1 233,17 €')
  })

  it('flags an overrun rather than capping the bar', async () => {
    mockAnalysis(withEnvelope(1000))

    const wrapper = await mountPage()
    const text = norm(wrapper.get('[data-testid="tag-envelope"]').text())

    expect(text).toContain('Dépassement')
    expect(text).toContain('259,00 €')
  })

  it('hides the block when no envelope was declared', async () => {
    mockAnalysis(withEnvelope(null))

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="tag-envelope"]').exists()).toBe(false)
  })

  it('keeps the period nudge out of the way when a surplus exists', async () => {
    // Regression: the envelope block sits between the surplus banner and the
    // nudge, so the nudge must not chain off it.
    mockAnalysis(withEnvelope(1500))

    const text = norm((await mountPage()).text())

    expect(text).toContain('Surcoût réel')
    expect(text).not.toContain("Renseignez une période d'absence")
  })
})
