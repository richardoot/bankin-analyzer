import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  mount,
  flushPromises,
  enableAutoUnmount,
  RouterLinkStub,
} from '@vue/test-utils'
import type { TrendInsightDto, TrendsResponseDto } from '@/lib/api'
import {
  parseTransactionsQuery,
  type TransactionsLinkFilters,
} from '@/lib/transactionsLink'
import { resetTrendDigestSession } from '@/composables/useTrendDigest'
import SpendingTrendsCard from './SpendingTrendsCard.vue'

enableAutoUnmount(afterEach)

const { getSpendingTrends, getTrendDigest, regenerateTrendDigest } = vi.hoisted(
  () => ({
    getSpendingTrends: vi.fn(),
    getTrendDigest: vi.fn(),
    regenerateTrendDigest: vi.fn(),
  })
)
vi.mock('@/lib/api', () => ({
  api: { getSpendingTrends, getTrendDigest, regenerateTrendDigest },
}))

const windows = {
  current: { start: '2026-09-01', end: '2026-09-30' },
  reference: { start: '2026-03-01', end: '2026-08-31' },
}

const restaurant: TrendInsightDto = {
  kind: 'amount',
  unit: {
    type: 'subcategory',
    id: 'sub-restaurant',
    categoryId: 'cat-dining',
    name: 'Restaurant',
    icon: '🍽️',
  },
  direction: 'up',
  tone: 'neutral',
  current: 312,
  reference: 226,
  delta: 86,
  deltaPct: 38.1,
  sentence:
    "Restaurant : 312 € en septembre, +38 % par rapport à l'habitude des 6 mois précédents (226 €).",
  windows,
  series: [226, 226, 226, 226, 226, 226, 312],
  score: 86,
}

const delivery: TrendInsightDto = {
  kind: 'frequency',
  unit: {
    type: 'subcategory',
    id: 'sub-delivery',
    categoryId: 'cat-dining',
    name: 'Fast-food et livraison',
    icon: null,
  },
  direction: 'down',
  tone: 'success',
  current: 3,
  reference: 9,
  delta: -6,
  deltaPct: -66.7,
  sentence:
    "Fast-food et livraison : vous avez réduit la fréquence, 3 achats en septembre contre 9 par mois d'habitude sur les 6 mois précédents.",
  windows,
  series: [9, 9, 9, 9, 9, 9, 3],
  score: 90,
}

const groceries: TrendInsightDto = {
  ...restaurant,
  kind: 'basket',
  unit: {
    type: 'category',
    id: 'cat-food',
    categoryId: 'cat-food',
    name: 'Alimentation',
    icon: '🛒',
  },
  direction: 'down',
  tone: 'neutral',
  delta: -14,
  deltaPct: -22.6,
  sentence: 'Alimentation : en baisse.',
}

const pleasureShare: TrendInsightDto = {
  ...restaurant,
  kind: 'share',
  unit: {
    type: 'structure',
    id: 'pleasure',
    categoryId: null,
    name: 'Part plaisir',
    icon: null,
  },
  current: 31,
  reference: 26,
  delta: 5.2,
  deltaPct: null,
  sentence:
    "La part plaisir de la vie courante passe à 31 % en septembre, contre 26 % d'habitude sur les 6 mois précédents.",
}

const toFile: TrendInsightDto = {
  kind: 'uncategorized',
  unit: {
    type: 'uncategorized',
    id: 'uncategorized',
    categoryId: null,
    name: 'À classer',
    icon: null,
  },
  direction: 'up',
  tone: 'neutral',
  current: 12,
  reference: 80,
  delta: 12,
  deltaPct: null,
  sentence:
    '12 dépenses de septembre sont à classer : les tendances ne les lisent pas.',
  windows,
  series: [0, 0, 1, 0, 0, 2, 12],
  score: 340,
}

const picard: TrendInsightDto = {
  kind: 'frequency',
  unit: {
    type: 'merchant',
    id: 'picard surgeles',
    categoryId: 'cat-food',
    name: 'Picard',
    icon: null,
    search: 'picard',
  },
  direction: 'up',
  tone: 'neutral',
  current: 6,
  reference: 2,
  delta: 4,
  deltaPct: 200,
  sentence:
    "Picard : 6 achats en septembre, contre 2 par mois d'habitude sur les 6 mois précédents, soit 180 € contre 60 €.",
  windows,
  series: [2, 2, 2, 2, 2, 2, 6],
  score: 120,
}

const sushi: TrendInsightDto = {
  ...picard,
  kind: 'newHabit',
  unit: { ...picard.unit, id: 'sushi bar', name: 'Sushi Bar', icon: '🍽️' },
  current: 4,
  reference: 0,
  delta: 4,
  deltaPct: null,
  sentence:
    'Sushi Bar : nouveau, 4 achats depuis août (136 €), aucun sur les 6 mois précédents.',
  windows: {
    current: { start: '2026-08-01', end: '2026-09-30' },
    reference: { start: '2026-02-01', end: '2026-07-31' },
  },
}

const uberEats: TrendInsightDto = {
  ...picard,
  kind: 'lostHabit',
  unit: { ...picard.unit, id: 'uber eats', name: 'Uber Eats' },
  direction: 'down',
  tone: 'success',
  current: 0,
  reference: 4,
  delta: -4,
  deltaPct: null,
  sentence:
    "Uber Eats : vous avez arrêté, plus aucun achat en septembre, contre 4 par mois d'habitude sur les 6 mois précédents (86 €).",
}

const gym: TrendInsightDto = {
  kind: 'subscription',
  unit: {
    type: 'recurrence',
    id: '30:basic fit',
    categoryId: 'cat-leisure',
    name: 'Basic Fit',
    icon: '🏋️',
  },
  direction: 'up',
  tone: 'neutral',
  current: 32.49,
  reference: 0,
  delta: 32.49,
  deltaPct: null,
  sentence:
    'Nouvel abonnement : Basic Fit, 29,99 € toutes les 4 semaines depuis juillet.',
  windows: {
    current: { start: '2026-07-01', end: '2026-09-30' },
    reference: { start: '2026-04-01', end: '2026-06-30' },
  },
  series: [0, 0, 0, 0, 30, 30, 30],
  score: 32.49,
}

const piano: TrendInsightDto = {
  ...gym,
  unit: {
    ...gym.unit,
    id: '150:simply piano',
    name: 'Simply Piano',
    icon: null,
  },
  direction: 'down',
  current: 0,
  reference: 150,
  delta: -150,
  sentence:
    'Abonnement arrêté : Simply Piano, 150,00 € par mois, dernier prélèvement en juin.',
}

const netflix: TrendInsightDto = {
  ...gym,
  kind: 'price',
  unit: { ...gym.unit, id: '16:netflix', name: 'Netflix' },
  current: 15.99,
  reference: 13.49,
  delta: 2.5,
  deltaPct: 18.5,
  sentence: 'Netflix : 15,99 € par mois depuis juillet, contre 13,49 €.',
  score: 2.5,
}

const shift: TrendInsightDto = {
  kind: 'shift',
  unit: {
    type: 'category',
    id: 'cat-dining',
    categoryId: 'cat-dining',
    name: 'Restaurants et bars',
    icon: '🍽️',
  },
  direction: 'down',
  tone: 'neutral',
  current: 357,
  reference: 361,
  delta: -4,
  deltaPct: -1.1,
  sentence:
    "Restaurants et bars en septembre : moins de livraison de repas (−6 achats), plus de restaurant (+86 €) que d'habitude sur les 6 mois précédents, un report plutôt qu'une économie.",
  windows,
  series: [361, 361, 361, 361, 361, 361, 357],
  score: 90,
  parts: [
    {
      unit: { ...delivery.unit },
      kind: 'frequency',
      direction: 'down',
      delta: -6,
      amountDelta: -90,
    },
    {
      unit: { ...restaurant.unit },
      kind: 'amount',
      direction: 'up',
      delta: 86,
      amountDelta: 86,
    },
  ],
}

const drift: TrendInsightDto = {
  kind: 'drift',
  unit: {
    type: 'category',
    id: 'cat-food',
    categoryId: 'cat-food',
    name: 'Alimentation',
    icon: '🛒',
  },
  direction: 'up',
  tone: 'neutral',
  current: 520,
  reference: 420,
  delta: 100,
  deltaPct: 4.2,
  sentence:
    'Alimentation : en hausse régulière depuis 6 mois, +4 % par mois (520 € en septembre).',
  windows: {
    current: { start: '2026-09-01', end: '2026-09-30' },
    reference: { start: '2026-04-01', end: '2026-08-31' },
  },
  series: [400, 420, 440, 460, 480, 500, 520],
  score: 100,
}

const lowest: TrendInsightDto = {
  ...drift,
  kind: 'record',
  unit: { ...drift.unit, id: 'cat-transport', name: 'Transport' },
  direction: 'down',
  record: 'low',
  current: 45,
  reference: 120,
  delta: -75,
  deltaPct: -62.5,
  sentence:
    "Transport : 45 € en septembre, le plus bas depuis un an (120 € par mois d'habitude sur les 11 mois précédents).",
  windows: {
    current: { start: '2026-09-01', end: '2026-09-30' },
    reference: { start: '2025-10-01', end: '2026-08-31' },
  },
  score: 75,
}

const yearAgo: TrendInsightDto = {
  ...drift,
  kind: 'yearAgo',
  unit: { ...drift.unit, id: 'cat-gifts', name: 'Cadeaux' },
  current: 210,
  reference: 180,
  delta: 30,
  deltaPct: 16.7,
  sentence:
    'Cadeaux : 210 € en septembre, contre 180 € en septembre 2025 (+17 %).',
  windows: {
    current: { start: '2026-09-01', end: '2026-09-30' },
    reference: { start: '2025-09-01', end: '2025-09-30' },
  },
  score: 30,
}

const savings: TrendInsightDto = {
  kind: 'savings',
  unit: {
    type: 'savings',
    id: 'savings',
    categoryId: null,
    name: 'Épargne',
    icon: null,
    categoryIds: ['cat-livret', 'cat-pea'],
  },
  direction: 'up',
  tone: 'neutral',
  current: 18,
  reference: 12,
  delta: 6,
  deltaPct: null,
  sentence:
    "Épargne : 18 % du revenu de juillet à septembre, contre 12 % d'avril à juin ; reste à vivre 1 450 € par mois, contre 1 620 €.",
  windows: {
    current: { start: '2026-07-01', end: '2026-09-30' },
    reference: { start: '2026-04-01', end: '2026-06-30' },
  },
  series: [12, 12, 12, 12, 18, 18, 18],
  score: 180,
  remainingToLive: { current: 1450, reference: 1620 },
}

/** The long run: lot 3's rows. */
const LOT_3 = [shift, drift, lowest, yearAgo, savings]

/** Merchants and charges: lot 2's rows. */
const LOT_2 = [picard, sushi, uberEats, gym, piano, netflix]

function response(
  overrides: Partial<TrendsResponseDto> = {}
): TrendsResponseDto {
  return {
    month: '2026-09',
    reading: 'everyday',
    window: 6,
    completeMonths: 12,
    insights: [toFile, delivery, restaurant, groceries, pleasureShare],
    quietSentence: null,
    headline:
      'Septembre : vous avez réduit vos achats en fast-food et livraison, et plus de dépenses en restaurant.',
    availableMonths: ['2026-09', '2026-08', '2026-07'],
    horizons: [],
    digest: null,
    ...overrides,
  }
}

async function mountCard(
  props: Partial<InstanceType<typeof SpendingTrendsCard>['$props']> = {},
  attach = false
) {
  const wrapper = mount(SpendingTrendsCard, {
    ...(attach ? { attachTo: document.body } : {}),
    props: {
      reading: 'everyday',
      deductReimbursements: true,
      deductPendingReimbursements: true,
      ...props,
    },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountCard>>

/** The filters a link opens, read back the way the page reads them. */
function filtersOf(link: { props: (key: 'to') => unknown }) {
  const to = link.props('to') as { query: Record<string, string> }
  return parseTransactionsQuery(to.query)
}

/**
 * The filters a tile's links open, its details unfolded: the month's
 * transactions in the footer, then the second links — a phone's copy of
 * the month's link left out.
 */
async function linksOf(
  wrapper: Wrapper,
  kind: string
): Promise<TransactionsLinkFilters[]> {
  const tile = wrapper.find(`[data-testid="trend-${kind}"]`)
  const toggle = tile.find('[data-testid="trend-details-toggle"]')
  if (toggle.attributes('aria-expanded') === 'false') {
    await toggle.trigger('click')
  }
  const links: Array<{
    props: (key: 'to') => unknown
    attributes: (key: string) => string | undefined
  }> = tile.findAllComponents(RouterLinkStub)
  return links
    .filter(
      link =>
        !['trend-month-link-compact', 'trend-recurrences-link'].includes(
          link.attributes('data-testid') ?? ''
        )
    )
    .map(filtersOf)
}

const texts = (wrapper: Wrapper, selector: string): string[] =>
  wrapper.findAll(selector).map(el => el.text().replace(/\s+/g, ' ').trim())

const tabKeys = (wrapper: Wrapper): string[] =>
  wrapper
    .findAll('[role="tab"]')
    .map(tab =>
      (tab.attributes('id') ?? '').replace('spending-trends-tab-', '')
    )

const selectedTab = (wrapper: Wrapper): string | undefined =>
  wrapper
    .findAll('[role="tab"]')
    .find(tab => tab.attributes('aria-selected') === 'true')
    ?.attributes('id')

const tiles = (wrapper: Wrapper): string[] =>
  wrapper
    .findAll('[data-testid="trends-list"] article')
    .map(tile => tile.attributes('data-testid') ?? '')

describe('SpendingTrendsCard', () => {
  beforeEach(() => {
    getSpendingTrends.mockReset()
    getSpendingTrends.mockResolvedValue(response())
    resetTrendDigestSession()
    getTrendDigest.mockReset()
    getTrendDigest.mockResolvedValue(null)
    regenerateTrendDigest.mockReset()
    vi.mocked(localStorage.getItem).mockReturnValue(null)
  })

  it('says which month it reads, in which reading, against what', async () => {
    const wrapper = await mountCard()

    expect(wrapper.find('[data-testid="trends-heading"]').text()).toBe(
      'Septembre 2026, vie courante · par rapport aux 6 mois précédents'
    )
    // The period above does not move it: the card says so, in small.
    const scope = wrapper.find('[data-testid="trends-scope"]')
    expect(scope.text()).toBe(
      'Un mois clos, quelle que soit la période choisie plus haut'
    )
    expect(scope.classes()).toContain('text-xs')
  })

  describe('the tabs', () => {
    it('opens on « L’essentiel », then one tab per group with its count', async () => {
      getSpendingTrends.mockResolvedValue(
        response({
          insights: [toFile, delivery, restaurant, gym, picard, pleasureShare],
        })
      )
      const wrapper = await mountCard()

      expect(wrapper.find('[role="tablist"]').exists()).toBe(true)
      expect(tabKeys(wrapper)).toEqual([
        'essential',
        'charges',
        'categories',
        'merchants',
        'overview',
      ])
      expect(texts(wrapper, '[role="tab"]')).toEqual([
        "L'essentiel 5",
        'Abonnements 1',
        'Catégories 2',
        'Enseignes 1',
        "Vue d'ensemble 1",
      ])
      expect(selectedTab(wrapper)).toBe('spending-trends-tab-essential')
      const panel = wrapper.find('[role="tabpanel"]')
      expect(panel.attributes('aria-labelledby')).toBe(
        'spending-trends-tab-essential'
      )
      for (const tab of wrapper.findAll('[role="tab"]')) {
        expect(tab.attributes('aria-controls')).toBe(panel.attributes('id'))
      }
      // One tab stop: the selected one.
      expect(
        wrapper.findAll('[role="tab"]').map(t => t.attributes('tabindex'))
      ).toEqual(['0', '-1', '-1', '-1', '-1'])
    })

    it('shows a group’s every trend when its tab is picked', async () => {
      getSpendingTrends.mockResolvedValue(
        response({ insights: [toFile, ...LOT_2, restaurant] })
      )
      const wrapper = await mountCard()

      await wrapper.find('[data-testid="trends-tab-charges"]').trigger('click')

      expect(selectedTab(wrapper)).toBe('spending-trends-tab-charges')
      expect(tiles(wrapper)).toEqual([
        'trend-subscription',
        'trend-subscription',
        'trend-price',
      ])
      // The headline is « L'essentiel »'s alone.
      expect(wrapper.find('[data-testid="trends-headline"]').exists()).toBe(
        false
      )
    })

    it('moves along the tabs with the arrows, Home and End, the focus following', async () => {
      getSpendingTrends.mockResolvedValue(
        response({ insights: [delivery, gym, picard, pleasureShare] })
      )
      const wrapper = await mountCard({}, true)
      const tab = (key: string) =>
        wrapper.find(`[data-testid="trends-tab-${key}"]`)

      await tab('essential').trigger('keydown', { key: 'ArrowRight' })
      await flushPromises()
      expect(selectedTab(wrapper)).toBe('spending-trends-tab-charges')
      expect(document.activeElement?.id).toBe('spending-trends-tab-charges')

      await tab('charges').trigger('keydown', { key: 'End' })
      await flushPromises()
      expect(selectedTab(wrapper)).toBe('spending-trends-tab-overview')

      await tab('overview').trigger('keydown', { key: 'ArrowRight' })
      await flushPromises()
      expect(selectedTab(wrapper)).toBe('spending-trends-tab-essential')

      await tab('essential').trigger('keydown', { key: 'ArrowLeft' })
      await flushPromises()
      expect(selectedTab(wrapper)).toBe('spending-trends-tab-overview')

      await tab('overview').trigger('keydown', { key: 'Home' })
      await flushPromises()
      expect(selectedTab(wrapper)).toBe('spending-trends-tab-essential')
      expect(document.activeElement?.id).toBe('spending-trends-tab-essential')
    })

    it('starts again on « L’essentiel » at the next opening', async () => {
      const first = await mountCard()
      await first.find('[data-testid="trends-tab-categories"]').trigger('click')
      first.unmount()

      const second = await mountCard()
      expect(selectedTab(second)).toBe('spending-trends-tab-essential')
    })
  })

  describe('« L’essentiel »', () => {
    it('tells the two largest gaps in a sentence above the tiles', async () => {
      const wrapper = await mountCard()

      const headline = wrapper.find('[data-testid="trends-headline"]')
      expect(headline.text()).toBe(
        'Septembre : vous avez réduit vos achats en fast-food et livraison, et plus de dépenses en restaurant.'
      )
      expect(headline.classes()).toEqual(
        expect.arrayContaining(['font-semibold', 'sm:text-xl'])
      )
    })

    it('shows the five largest gaps of every kind, the lines to file left out', async () => {
      getSpendingTrends.mockResolvedValue(
        response({
          insights: [toFile, savings, delivery, gym, restaurant, picard, drift],
        })
      )
      const wrapper = await mountCard()

      expect(tiles(wrapper)).toEqual([
        'trend-savings',
        'trend-frequency',
        'trend-subscription',
        'trend-amount',
        'trend-frequency',
      ])
    })

    it('ends on the other trends, and opens the busiest group from there', async () => {
      getSpendingTrends.mockResolvedValue(
        response({
          insights: [toFile, delivery, restaurant, gym, piano, netflix, picard],
        })
      )
      const wrapper = await mountCard()

      const more = wrapper.find('[data-testid="trends-more"]')
      expect(more.text().replace(/\s+/g, ' ')).toBe(
        '1 autre tendance ce mois-ci Voir par groupe'
      )
      await more.find('button').trigger('click')
      await flushPromises()

      // Three charges against two categories and one merchant.
      expect(selectedTab(wrapper)).toBe('spending-trends-tab-charges')
      expect(wrapper.find('[data-testid="trends-more"]').exists()).toBe(false)
    })

    it('has no « other trends » tile when the five say it all', async () => {
      const wrapper = await mountCard()
      expect(wrapper.find('[data-testid="trends-more"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="trends-toggle"]').exists()).toBe(false)
    })

    it('falls back on the quiet sentence when the server sends no headline', async () => {
      getSpendingTrends.mockResolvedValue(
        response({ headline: null, quietSentence: 'Rien de notable.' })
      )
      const wrapper = await mountCard()
      expect(wrapper.find('[data-testid="trends-headline"]').text()).toBe(
        'Rien de notable.'
      )
    })
  })

  describe('a tile', () => {
    it('shows the unit, the measure, the month large and the habit beside it', async () => {
      getSpendingTrends.mockResolvedValue(
        response({
          insights: [
            {
              ...delivery,
              tone: 'neutral',
              direction: 'up',
              current: 8,
              reference: 3.5,
            },
          ],
        })
      )
      const wrapper = await mountCard({
        categoryNames: { 'cat-dining': 'Restaurants et bars' },
      })
      const tile = wrapper.find('[data-testid="trend-frequency"]')

      expect(tile.find('[data-testid="trend-title"]').text()).toBe(
        'Fast-food et livraison'
      )
      expect(tile.find('[data-testid="trend-subtitle"]').text()).toBe(
        'Restaurants et bars · plus souvent'
      )
      expect(
        tile.find('[data-testid="trend-figure"]').text().replace(/\s+/g, ' ')
      ).toBe('8 achats')
      expect(tile.find('[data-testid="trend-usual"]').text()).toBe(
        "d'habitude 3,5 par mois"
      )
      expect(tile.find('[data-testid="trend-month-link"]').text()).toBe(
        'Transactions'
      )
    })

    it('badges each gap signed, coloured by direction and tone', async () => {
      const wrapper = await mountCard()

      const badges = wrapper.findAll('[data-testid="trend-badge"]')
      expect(texts(wrapper, '[data-testid="trend-badge"]')).toEqual([
        '↓ −67 %',
        '↑ +38 %',
        '↓ −23 %',
        '↑ +5 pts',
      ])
      expect(
        badges.map(b => b.classes().find(c => c.startsWith('bg-')))
      ).toEqual(['bg-emerald-50', 'bg-sky-50', 'bg-gray-100', 'bg-sky-50'])
      expect(badges[1]?.attributes('aria-label')).toBe('En hausse : +38 %')
    })

    it('keeps its full sentence as its description, and shows it with the second links on demand', async () => {
      const wrapper = await mountCard()
      const tile = wrapper.find('[data-testid="trend-amount"]')
      const sentence = tile.find('[data-testid="trend-sentence"]')
      const toggle = tile.find('[data-testid="trend-details-toggle"]')

      expect(tile.attributes('aria-describedby')).toBe(
        sentence.attributes('id')
      )
      expect(sentence.text()).toBe(restaurant.sentence)
      const details = tile.find('[data-testid="trend-details"]')
      expect(details.classes()).toContain('sr-only')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(toggle.attributes('aria-label')).toBe('Détails : Restaurant')
      expect(toggle.attributes('aria-controls')).toBe(
        tile.find('[data-testid="trend-details"]').attributes('id')
      )
      expect(tile.find('[data-testid="trend-reference-link"]').exists()).toBe(
        false
      )

      await toggle.trigger('click')
      expect(toggle.attributes('aria-expanded')).toBe('true')
      expect(details.classes()).not.toContain('sr-only')
      expect(tile.find('[data-testid="trend-reference-link"]').text()).toBe(
        'La référence'
      )
    })

    it('opens the month and the reference of a subcategory, in the reading of the dashboard', async () => {
      const wrapper = await mountCard()

      expect(await linksOf(wrapper, 'amount')).toEqual([
        {
          type: 'EXPENSE',
          categoryId: 'cat-dining',
          subcategoryId: 'sub-restaurant',
          from: '2026-09-01',
          to: '2026-09-30',
          exceptional: 'exclude',
          gross: true,
          label: 'Restaurant · septembre 2026',
        },
        {
          type: 'EXPENSE',
          categoryId: 'cat-dining',
          subcategoryId: 'sub-restaurant',
          from: '2026-03-01',
          to: '2026-08-31',
          exceptional: 'exclude',
          gross: true,
          label: 'Restaurant · 6 mois de référence',
        },
      ])
    })

    it('opens a category, and a share by its nature', async () => {
      getSpendingTrends.mockResolvedValue(response({ reading: 'real' }))
      const wrapper = await mountCard({ reading: 'real' })

      const basket = await linksOf(wrapper, 'basket')
      expect(basket.map(f => f.categoryId)).toEqual(['cat-food', 'cat-food'])
      // « Tout »: nothing is left out.
      expect(basket.map(f => f.exceptional)).toEqual([undefined, undefined])
      expect((await linksOf(wrapper, 'share')).map(f => f.nature)).toEqual([
        'PLEASURE',
        'PLEASURE',
      ])
    })

    it('folds into one row on a phone: the figure under the name, the badge beside it, no sparkline', async () => {
      const wrapper = await mountCard()
      const tile = wrapper.find('[data-testid="trend-amount"]')

      const compact = tile.find('[data-testid="trend-compact"]')
      expect(compact.classes()).toContain('sm:hidden')
      expect(compact.text().replace(/\s+/g, ' ')).toBe(
        "312 € · d'habitude 226 €"
      )
      const badge = tile.find('[data-testid="trend-badge-compact"]')
      expect(badge.classes()).toContain('sm:hidden')
      expect(badge.text().replace(/\s+/g, ' ')).toBe('↑ +38 %')
      // The figures, the sparkline and the footer are a tablet's.
      for (const id of ['trend-figures', 'trend-footer']) {
        expect(tile.find(`[data-testid="${id}"]`).classes()).toEqual(
          expect.arrayContaining(['hidden', 'sm:flex'])
        )
      }
      expect(tile.find('[data-testid="trend-sparkline"] svg').exists()).toBe(
        true
      )
      expect(tile.find('[data-testid="trend-subtitle"]').classes()).toEqual(
        expect.arrayContaining(['hidden', 'sm:block'])
      )
    })
  })

  describe('the lines to file', () => {
    it('are an amber alert beside the tabs, and a band under them on a phone or a tablet, never a tile', async () => {
      const wrapper = await mountCard()

      const alert = wrapper.find('[data-testid="trends-to-file"]')
      expect(alert.text()).toContain('12 dépenses à classer')
      expect(alert.classes()).toEqual(
        expect.arrayContaining(['hidden', 'lg:inline-flex', 'text-amber-700'])
      )
      const band = wrapper.find('[data-testid="trends-to-file-compact"]')
      expect(band.classes()).toEqual(
        expect.arrayContaining(['lg:hidden', 'bg-amber-50'])
      )
      expect(wrapper.find('[data-testid="trend-uncategorized"]').exists()).toBe(
        false
      )
    })

    it('open the month’s lines to file, events included', async () => {
      const wrapper = await mountCard()
      const link = wrapper
        .findAllComponents(RouterLinkStub)
        .find(l => l.attributes('data-testid') === 'trends-to-file')

      expect(link && filtersOf(link)).toEqual({
        type: 'EXPENSE',
        categoryId: 'none',
        from: '2026-09-01',
        to: '2026-09-30',
        gross: true,
        label: 'À classer · septembre 2026',
      })
    })
  })

  it('says how many months are missing on a short history, lines to file still shown', async () => {
    getSpendingTrends.mockResolvedValue(
      response({
        completeMonths: 1,
        window: 1,
        insights: [toFile],
        headline: null,
      })
    )
    const wrapper = await mountCard()

    expect(wrapper.find('[data-testid="trends-short-history"]').text()).toBe(
      'Encore 2 mois de transactions et les tendances apparaîtront.'
    )
    expect(wrapper.find('[data-testid="trends-heading"]').text()).toBe(
      'Septembre 2026, vie courante'
    )
    expect(wrapper.find('[data-testid="trends-to-file"]').text()).toContain(
      '12 dépenses à classer'
    )
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
  })

  it('says nothing changed in the words of the calculation, with no tabs', async () => {
    getSpendingTrends.mockResolvedValue(
      response({
        insights: [toFile],
        headline: null,
        quietSentence:
          "Rien de notable en septembre : la vie courante est dans l'habitude.",
      })
    )
    const wrapper = await mountCard()

    expect(wrapper.find('[data-testid="trends-quiet"]').text()).toBe(
      "Rien de notable en septembre : la vie courante est dans l'habitude."
    )
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="trends-list"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="trends-to-file"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="trends-digest-toggle"]').exists()).toBe(
      false
    )
  })

  it('says a window longer than the history was shortened', async () => {
    getSpendingTrends.mockResolvedValue(
      response({ completeMonths: 4, window: 4 })
    )
    const wrapper = await mountCard()

    expect(
      wrapper.find('[data-testid="trends-heading"]').text().replace(/\s+/g, ' ')
    ).toContain(
      "par rapport aux 4 mois précédents (l'historique ne couvre pas encore 6 mois)"
    )
  })

  it('shows its shape while loading', async () => {
    getSpendingTrends.mockReturnValue(new Promise(() => {}))
    const wrapper = await mountCard()

    expect(wrapper.find('[data-testid="trends-loading"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="trends-list"]').exists()).toBe(false)
  })

  it('fails quietly, and tries again on demand', async () => {
    getSpendingTrends.mockRejectedValueOnce(new Error('boom'))
    const wrapper = await mountCard()

    const error = wrapper.find('[data-testid="trends-error"]')
    expect(error.text()).toContain("Les tendances n'ont pas pu être chargées.")
    expect(error.attributes('role')).toBe('status')

    await wrapper.find('[data-testid="trends-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="trends-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="trends-list"]').exists()).toBe(true)
  })

  it('reads another closed month from its selector', async () => {
    const wrapper = await mountCard()
    const select = wrapper.find('[data-testid="trends-month"]')

    expect(select.findAll('option').map(o => o.text())).toEqual([
      'Septembre 2026',
      'Août 2026',
      'Juillet 2026',
    ])
    await select.setValue('2026-08')
    await flushPromises()

    expect(getSpendingTrends).toHaveBeenLastCalledWith(
      expect.objectContaining({ month: '2026-08' })
    )
  })

  it('reads another window from its selector', async () => {
    const wrapper = await mountCard()

    await wrapper.find('[data-testid="trends-window-12"]').trigger('click')
    await flushPromises()

    expect(getSpendingTrends).toHaveBeenLastCalledWith(
      expect.objectContaining({ window: 12 })
    )
  })

  it('follows the reading and the switches of the dashboard', async () => {
    const wrapper = await mountCard()

    await wrapper.setProps({ reading: 'real', deductReimbursements: false })
    await flushPromises()

    expect(getSpendingTrends).toHaveBeenLastCalledWith(
      expect.objectContaining({ reading: 'real', deductReimbursements: false })
    )
  })

  describe('merchants and recurring charges', () => {
    beforeEach(() => {
      getSpendingTrends.mockResolvedValue(response({ insights: LOT_2 }))
    })

    it('says what came or went in a word, and a price by its gap to the cent', async () => {
      const wrapper = await mountCard()
      await wrapper.find('[data-testid="trends-tab-charges"]').trigger('click')

      const badges = wrapper.findAll('[data-testid="trend-badge"]')
      expect(texts(wrapper, '[data-testid="trend-badge"]')).toEqual([
        'Apparu',
        'Arrêté',
        expect.stringMatching(/^↑ \+2,50\s€$/),
      ])
      expect(badges.map(b => b.attributes('aria-label'))).toEqual([
        'Abonnement apparu',
        'Abonnement arrêté',
        expect.stringMatching(/^Prix en hausse : \+2,50\s€$/),
      ])
      // A charge is never a reproach nor a success: blue up, grey down.
      expect(
        badges.map(b => b.classes().find(c => c.startsWith('bg-')))
      ).toEqual(['bg-sky-50', 'bg-gray-100', 'bg-sky-50'])

      await wrapper
        .find('[data-testid="trends-tab-merchants"]')
        .trigger('click')
      expect(texts(wrapper, '[data-testid="trend-badge"]')).toEqual([
        '↑ +200 %',
        'Nouveau',
        'Plus rien',
      ])
    })

    it('opens a merchant by the word of its labels, in the month and the reference', async () => {
      const wrapper = await mountCard()

      expect(await linksOf(wrapper, 'frequency')).toEqual([
        {
          type: 'EXPENSE',
          q: 'picard',
          from: '2026-09-01',
          to: '2026-09-30',
          exceptional: 'exclude',
          gross: true,
          label: 'Picard · septembre 2026',
        },
        {
          type: 'EXPENSE',
          q: 'picard',
          from: '2026-03-01',
          to: '2026-08-31',
          exceptional: 'exclude',
          gross: true,
          label: 'Picard · 6 mois de référence',
        },
      ])
      // A merchant without an icon of its own still shows a sign.
      expect(
        wrapper
          .find('[data-testid="trend-frequency"] [data-testid="trend-icon"]')
          .text()
      ).toBe('🏪')
    })

    it('opens a recurring charge by its series, and the recurrences screen beside it', async () => {
      const wrapper = await mountCard()
      const filters = await linksOf(wrapper, 'subscription')
      const tile = wrapper.find('[data-testid="trend-subscription"]')

      expect(filters[0]).toEqual({
        type: 'EXPENSE',
        recurrence: '30:basic fit',
        recurrenceLabel: 'Basic Fit',
        from: '2026-07-01',
        to: '2026-09-30',
        gross: true,
        label: 'Basic Fit · juillet 2026',
      })
      expect(tile.find('[data-testid="trend-reference-link"]').exists()).toBe(
        false
      )
      const recurrences = tile.find('[data-testid="trend-recurrences-link"]')
      expect(recurrences.text()).toBe('Les récurrences')
      const stubs: Array<{
        props: (key: 'to') => unknown
        attributes: (key: string) => string | undefined
      }> = tile.findAllComponents(RouterLinkStub)
      expect(
        stubs
          .find(l => l.attributes('data-testid') === 'trend-recurrences-link')
          ?.props('to')
      ).toBe('/recurrences')
    })
  })

  describe('the long run (lot 3)', () => {
    beforeEach(() => {
      getSpendingTrends.mockResolvedValue(response({ insights: LOT_3 }))
    })

    it('badges a shift, a slope, a record, last year and savings in their own terms', async () => {
      const wrapper = await mountCard()

      const badges = wrapper.findAll('[data-testid="trend-badge"]')
      expect(texts(wrapper, '[data-testid="trend-badge"]')).toEqual([
        'Report',
        '↑ +4 %/mois',
        'Plus bas depuis un an',
        '↑ +17 % vs 2025',
        '↑ +6 pts',
      ])
      expect(badges.map(b => b.attributes('aria-label'))).toEqual([
        'Report entre deux sous-catégories',
        'En hausse régulière : +4 %/mois',
        'Le mois le plus bas depuis un an',
        'Par rapport à 2025, en hausse : +17 % vs 2025',
        'Épargne en hausse : +6 pts',
      ])
    })

    it('opens a shift’s category in the month, its two subcategories and its reference behind « Détails »', async () => {
      const wrapper = await mountCard()
      const base = { type: 'EXPENSE', exceptional: 'exclude', gross: true }

      expect(await linksOf(wrapper, 'shift')).toEqual([
        {
          ...base,
          categoryId: 'cat-dining',
          from: '2026-09-01',
          to: '2026-09-30',
          label: 'Restaurants et bars · septembre 2026',
        },
        {
          ...base,
          categoryId: 'cat-dining',
          subcategoryId: 'sub-delivery',
          from: '2026-09-01',
          to: '2026-09-30',
          label: 'Fast-food et livraison · septembre 2026',
        },
        {
          ...base,
          categoryId: 'cat-dining',
          subcategoryId: 'sub-restaurant',
          from: '2026-09-01',
          to: '2026-09-30',
          label: 'Restaurant · septembre 2026',
        },
        {
          ...base,
          categoryId: 'cat-dining',
          from: '2026-03-01',
          to: '2026-08-31',
          label: 'Restaurants et bars · mars 2026 – août 2026',
        },
      ])
      expect(
        texts(
          wrapper.find('[data-testid="trend-shift"]') as unknown as Wrapper,
          '[data-testid="trend-part-link"]'
        )
      ).toEqual(['Fast-food et livraison', 'Restaurant'])
    })

    it('opens the long horizons on their own months, never the window of the card', async () => {
      const wrapper = await mountCard()

      expect((await linksOf(wrapper, 'drift'))[1]).toMatchObject({
        categoryId: 'cat-food',
        from: '2026-04-01',
        to: '2026-08-31',
        label: 'Alimentation · avril 2026 – août 2026',
      })
      expect((await linksOf(wrapper, 'yearAgo'))[1]).toMatchObject({
        categoryId: 'cat-gifts',
        from: '2025-09-01',
        to: '2025-09-30',
        label: 'Cadeaux · septembre 2025',
      })
    })

    it('opens the savings by their transfers, over the quarter and the one before', async () => {
      const wrapper = await mountCard()

      expect(await linksOf(wrapper, 'savings')).toEqual([
        {
          type: 'TRANSFER',
          categoryIds: ['cat-livret', 'cat-pea'],
          from: '2026-07-01',
          to: '2026-09-30',
          gross: true,
          label: 'Épargne · juillet 2026 – septembre 2026',
        },
        {
          type: 'TRANSFER',
          categoryIds: ['cat-livret', 'cat-pea'],
          from: '2026-04-01',
          to: '2026-06-30',
          gross: true,
          label: 'Épargne · avril 2026 – juin 2026',
        },
      ])
      const tile = wrapper.find('[data-testid="trend-savings"]')
      expect(tile.find('[data-testid="trend-icon"]').text()).toBe('💰')
      expect(tile.find('[data-testid="trend-month-link"]').text()).toBe(
        'Virements'
      )
    })

    it('says quietly which long comparisons the history is still too short for', async () => {
      getSpendingTrends.mockResolvedValue(
        response({
          completeMonths: 8,
          horizons: [
            {
              kind: 'record',
              months: 12,
              missing: 3,
              sentence:
                'Les records sur un an demandent 12 mois complets : il en manque 3.',
            },
            {
              kind: 'yearAgo',
              months: 13,
              missing: 4,
              sentence:
                "La comparaison avec l'an dernier demande 13 mois complets : il en manque 4.",
            },
          ],
        })
      )
      const wrapper = await mountCard()

      const line = wrapper.find('[data-testid="trends-horizons"]')
      expect(line.text()).toBe(
        "Les records sur un an demandent 12 mois complets : il en manque 3. La comparaison avec l'an dernier demande 13 mois complets : il en manque 4."
      )
      expect(line.attributes('role')).toBeUndefined()
      expect(line.classes()).toContain('text-xs')
    })

    it('says nothing of the long run while the habits still wait for their months', async () => {
      getSpendingTrends.mockResolvedValue(
        response({
          completeMonths: 1,
          window: 1,
          insights: [],
          headline: null,
          horizons: [
            {
              kind: 'drift',
              months: 6,
              missing: 4,
              sentence:
                'La dérive sur 6 mois demande 6 mois complets : il en manque 4.',
            },
          ],
        })
      )
      const wrapper = await mountCard()

      expect(
        wrapper.find('[data-testid="trends-short-history"]').exists()
      ).toBe(true)
      expect(wrapper.find('[data-testid="trends-horizons"]').exists()).toBe(
        false
      )
    })
  })

  describe('the written paragraph (lot 5)', () => {
    const paragraph = {
      month: '2026-09',
      reading: 'everyday' as const,
      window: 6,
      text: 'En septembre, les restaurants montent à 312 €.',
      model: 'claude-haiku-5-5',
      generatedAt: '2026-10-01T09:00:00.000Z',
    }

    it('shows the paragraph under the tiles, with its mention, model and date', async () => {
      getTrendDigest.mockResolvedValue(paragraph)
      const wrapper = await mountCard()

      const block = wrapper.find('[data-testid="trends-digest"]')
      expect(block.find('[data-testid="trends-digest-text"]').text()).toBe(
        paragraph.text
      )
      expect(
        block.find('[data-testid="trends-digest-mention"]').text()
      ).toMatch(/Claude Haiku 5\.5 · le 1 octobre 2026$/)
    })

    it('changes nothing in the card without a paragraph', async () => {
      const wrapper = await mountCard()
      expect(wrapper.find('[data-testid="trends-digest"]').exists()).toBe(false)
      expect(tiles(wrapper)).toHaveLength(4)
    })
  })
})
