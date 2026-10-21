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
    availableMonths: ['2026-09', '2026-08', '2026-07'],
    horizons: [],
    digest: null,
    ...overrides,
  }
}

async function mountCard(
  props: Partial<InstanceType<typeof SpendingTrendsCard>['$props']> = {}
) {
  const wrapper = mount(SpendingTrendsCard, {
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

/** The filters a row's links open, read back the way the page reads them. */
function linksOf(wrapper: Wrapper, kind: string): TransactionsLinkFilters[] {
  const row = wrapper.find(`[data-testid="trend-${kind}"]`)
  const links: Array<{ props: (key: 'to') => unknown }> =
    row.findAllComponents(RouterLinkStub)
  return links.map(link => {
    const to = link.props('to') as { query: Record<string, string> }
    return parseTransactionsQuery(to.query)
  })
}

describe('SpendingTrendsCard', () => {
  beforeEach(() => {
    getSpendingTrends.mockReset()
    getSpendingTrends.mockResolvedValue(response())
    // No paragraph unless a test writes one: the list is the card.
    resetTrendDigestSession()
    getTrendDigest.mockReset()
    getTrendDigest.mockResolvedValue(null)
    regenerateTrendDigest.mockReset()
    vi.mocked(localStorage.getItem).mockReturnValue(null)
  })

  it('says which month it reads, in which reading, against what', async () => {
    const wrapper = await mountCard()

    expect(wrapper.find('[data-testid="trends-heading"]').text()).toBe(
      'Septembre 2026, vie courante, par rapport aux 6 mois précédents'
    )
    // The period above does not move it: the card says so.
    expect(wrapper.text()).toContain(
      'Un mois clos, quelle que soit la période choisie plus haut'
    )
  })

  it('shows each trend as its sentence, with a signed badge coloured by direction and tone', async () => {
    const wrapper = await mountCard()

    expect(
      wrapper.findAll('[data-testid="trend-sentence"]').map(s => s.text())
    ).toEqual(
      [toFile, delivery, restaurant, groceries, pleasureShare].map(
        i => i.sentence
      )
    )
    const badges = wrapper.findAll('[data-testid="trend-badge"]')
    expect(badges.map(b => b.text().replace(/\s+/g, ' '))).toEqual([
      '12 à classer',
      '↓ −67 %',
      '↑ +38 %',
      '↓ −23 %',
      '↑ +5 pts',
    ])
    expect(badges.map(b => b.classes().find(c => c.startsWith('bg-')))).toEqual(
      ['bg-amber-50', 'bg-emerald-50', 'bg-sky-50', 'bg-gray-100', 'bg-sky-50']
    )
    expect(badges[2]?.attributes('aria-label')).toBe('En hausse : +38 %')
  })

  it('opens the month and the reference of a subcategory, in the reading of the dashboard', async () => {
    const wrapper = await mountCard()

    expect(linksOf(wrapper, 'amount')).toEqual([
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

    expect(linksOf(wrapper, 'basket').map(f => f.categoryId)).toEqual([
      'cat-food',
      'cat-food',
    ])
    // « Tout »: nothing is left out.
    expect(linksOf(wrapper, 'basket').map(f => f.exceptional)).toEqual([
      undefined,
      undefined,
    ])
    expect(linksOf(wrapper, 'share').map(f => f.nature)).toEqual([
      'PLEASURE',
      'PLEASURE',
    ])
  })

  it('opens the lines to file of the month, events included, with no reference', async () => {
    const wrapper = await mountCard()

    expect(linksOf(wrapper, 'uncategorized')).toEqual([
      {
        type: 'EXPENSE',
        categoryId: 'none',
        from: '2026-09-01',
        to: '2026-09-30',
        gross: true,
        label: 'À classer · septembre 2026',
      },
    ])
  })

  it('shows five lines, and the rest on the spot', async () => {
    getSpendingTrends.mockResolvedValue(
      response({
        insights: [
          toFile,
          delivery,
          restaurant,
          groceries,
          pleasureShare,
          { ...restaurant, unit: { ...restaurant.unit, id: 'sub-bar' } },
          { ...restaurant, unit: { ...restaurant.unit, id: 'sub-cafe' } },
        ],
      })
    )
    const wrapper = await mountCard()
    const toggle = wrapper.find('[data-testid="trends-toggle"]')

    expect(wrapper.findAll('[data-testid="trend-sentence"]')).toHaveLength(5)
    expect(toggle.text()).toBe('Voir tout (7)')
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    expect(wrapper.findAll('[data-testid="trend-sentence"]')).toHaveLength(7)
    expect(toggle.text()).toBe('Réduire')
  })

  it('offers no « Voir tout » when everything fits', async () => {
    const wrapper = await mountCard()
    expect(wrapper.find('[data-testid="trends-toggle"]').exists()).toBe(false)
  })

  it('says how many months are missing on a short history, lines to file still shown', async () => {
    getSpendingTrends.mockResolvedValue(
      response({ completeMonths: 1, window: 1, insights: [toFile] })
    )
    const wrapper = await mountCard()

    expect(wrapper.find('[data-testid="trends-short-history"]').text()).toBe(
      'Encore 2 mois de transactions et les tendances apparaîtront.'
    )
    expect(wrapper.find('[data-testid="trends-heading"]').text()).toBe(
      'Septembre 2026, vie courante'
    )
    expect(wrapper.find('[data-testid="trend-uncategorized"]').exists()).toBe(
      true
    )
  })

  it('says nothing changed in the words of the calculation', async () => {
    getSpendingTrends.mockResolvedValue(
      response({
        insights: [],
        quietSentence:
          "Rien de notable en septembre : la vie courante est dans l'habitude.",
      })
    )
    const wrapper = await mountCard()

    expect(wrapper.find('[data-testid="trends-quiet"]').text()).toBe(
      "Rien de notable en septembre : la vie courante est dans l'habitude."
    )
    expect(wrapper.find('[data-testid="trends-list"]').exists()).toBe(false)
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
    const wrapper = mount(SpendingTrendsCard, {
      props: {
        reading: 'everyday',
        deductReimbursements: true,
        deductPendingReimbursements: true,
      },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await flushPromises()

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
      await wrapper.find('[data-testid="trends-toggle"]').trigger('click')

      const badges = wrapper.findAll('[data-testid="trend-badge"]')
      expect(badges.map(b => b.text().replace(/\s+/g, ' '))).toEqual([
        '↑ +200 %',
        'Nouveau',
        'Plus rien',
        'Apparu',
        'Arrêté',
        expect.stringMatching(/^↑ \+2,50\s€$/),
      ])
      expect(badges.map(b => b.attributes('aria-label'))).toEqual([
        'En hausse : +200 %',
        'Nouvelle habitude',
        'Habitude abandonnée',
        'Abonnement apparu',
        'Abonnement arrêté',
        expect.stringMatching(/^Prix en hausse : \+2,50\s€$/),
      ])
      // A charge is never a reproach nor a success: blue up, grey down.
      expect(
        badges.slice(3).map(b => b.classes().find(c => c.startsWith('bg-')))
      ).toEqual(['bg-sky-50', 'bg-gray-100', 'bg-sky-50'])
    })

    it('opens a merchant by the word of its labels, in the month and the reference', async () => {
      const wrapper = await mountCard()

      expect(linksOf(wrapper, 'frequency')).toEqual([
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
      const icon = wrapper.find('[data-testid="trend-frequency"] span')
      expect(icon.text()).toBe('🏪')
    })

    it('opens a recurring charge by its series, and the recurrences screen beside it', async () => {
      const wrapper = await mountCard()
      const row = wrapper.find('[data-testid="trend-subscription"]')
      const links = row.findAllComponents(RouterLinkStub)

      expect(links).toHaveLength(2)
      const month = links[0]?.props('to') as { query: Record<string, string> }
      expect(parseTransactionsQuery(month.query)).toEqual({
        type: 'EXPENSE',
        recurrence: '30:basic fit',
        recurrenceLabel: 'Basic Fit',
        from: '2026-07-01',
        to: '2026-09-30',
        gross: true,
        label: 'Basic Fit · juillet 2026',
      })
      expect(links[1]?.props('to')).toBe('/recurrences')
      expect(row.find('[data-testid="trend-reference-link"]').exists()).toBe(
        false
      )
      expect(row.find('[data-testid="trend-recurrences-link"]').text()).toBe(
        'Les récurrences'
      )
    })
  })

  describe('the long run (lot 3)', () => {
    beforeEach(() => {
      getSpendingTrends.mockResolvedValue(response({ insights: LOT_3 }))
    })

    it('badges a shift, a slope, a record, last year and savings in their own terms', async () => {
      const wrapper = await mountCard()

      const badges = wrapper.findAll('[data-testid="trend-badge"]')
      expect(badges.map(b => b.text().replace(/\s+/g, ' '))).toEqual([
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

    it('opens a shift by its two subcategories in the month, and its category on the reference', async () => {
      const wrapper = await mountCard()
      const row = wrapper.find('[data-testid="trend-shift"]')

      expect(
        row.findAll('[data-testid="trend-part-link"]').map(l => l.text())
      ).toEqual(['Fast-food et livraison', 'Restaurant'])
      expect(row.find('[data-testid="trend-month-link"]').exists()).toBe(false)
      const base = {
        type: 'EXPENSE',
        exceptional: 'exclude',
        gross: true,
      }
      expect(linksOf(wrapper, 'shift')).toEqual([
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
    })

    it('opens the long horizons on their own months, never the window of the card', async () => {
      const wrapper = await mountCard()

      expect(linksOf(wrapper, 'drift')[1]).toMatchObject({
        categoryId: 'cat-food',
        from: '2026-04-01',
        to: '2026-08-31',
        label: 'Alimentation · avril 2026 – août 2026',
      })
      expect(linksOf(wrapper, 'yearAgo')[1]).toMatchObject({
        categoryId: 'cat-gifts',
        from: '2025-09-01',
        to: '2025-09-30',
        label: 'Cadeaux · septembre 2025',
      })
    })

    it('opens the savings by their transfers, over the quarter and the one before', async () => {
      const wrapper = await mountCard()

      expect(linksOf(wrapper, 'savings')).toEqual([
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
      expect(wrapper.find('[data-testid="trend-savings"] span').text()).toBe(
        '💰'
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

  it('lets the sparkline go on a phone, never the sentence or the badge', async () => {
    const wrapper = await mountCard()
    const row = wrapper.find('[data-testid="trend-amount"]')

    const spark = row.find('[data-testid="trend-sparkline"]')
    expect(spark.classes()).toEqual(
      expect.arrayContaining(['hidden', 'sm:block'])
    )
    expect(spark.find('svg').exists()).toBe(true)
    for (const id of ['trend-sentence', 'trend-badge']) {
      expect(row.find(`[data-testid="${id}"]`).classes()).not.toContain(
        'hidden'
      )
    }
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

    it('asks for it after the list, with the list’s month and the window asked', async () => {
      const order: string[] = []
      getSpendingTrends.mockImplementation(() => {
        order.push('trends')
        return Promise.resolve(response())
      })
      getTrendDigest.mockImplementation(() => {
        order.push('digest')
        return Promise.resolve(paragraph)
      })

      await mountCard({ deductPendingReimbursements: false })

      expect(order).toEqual(['trends', 'digest'])
      expect(getTrendDigest).toHaveBeenCalledWith({
        month: '2026-09',
        reading: 'everyday',
        window: 6,
        deductReimbursements: true,
        deductPendingReimbursements: false,
      })
    })

    it('shows the paragraph under the list, with its mention, model and date', async () => {
      getTrendDigest.mockResolvedValue(paragraph)
      const wrapper = await mountCard()

      const block = wrapper.find('[data-testid="trends-digest"]')
      expect(block.exists()).toBe(true)
      expect(block.find('[data-testid="trends-digest-text"]').text()).toBe(
        paragraph.text
      )
      expect(
        block.find('[data-testid="trends-digest-mention"]').text()
      ).toMatch(
        /^Rédigé par l'IA à partir des tendances ci-dessus · Claude Haiku 5\.5 · le 1 octobre 2026$/
      )
      // Under the list, never above it.
      const html = wrapper.html()
      expect(html.indexOf('data-testid="trends-list"')).toBeLessThan(
        html.indexOf('data-testid="trends-digest"')
      )
      // Not hidden on a phone.
      expect(block.classes()).not.toContain('hidden')
    })

    it('changes nothing in the card without a paragraph', async () => {
      const wrapper = await mountCard()

      expect(wrapper.find('[data-testid="trends-digest"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-testid="trend-sentence"]')).toHaveLength(5)
    })

    it('stays quiet when the paragraph fails to load', async () => {
      getTrendDigest.mockRejectedValue(new Error('500'))
      const wrapper = await mountCard()

      expect(wrapper.find('[data-testid="trends-digest"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="trends-error"]').exists()).toBe(false)
    })

    it('writes it again on « Régénérer », the button disabled meanwhile', async () => {
      getTrendDigest.mockResolvedValue(paragraph)
      let finish: (value: typeof paragraph) => void = () => undefined
      regenerateTrendDigest.mockReturnValue(
        new Promise(resolve => {
          finish = resolve
        })
      )
      const wrapper = await mountCard()
      const button = wrapper.find('[data-testid="trends-digest-regenerate"]')
      expect(button.text()).toBe('Régénérer')

      await button.trigger('click')
      expect(button.attributes('disabled')).toBeDefined()
      expect(button.text()).toBe('Rédaction…')

      finish({ ...paragraph, text: 'Autrement dit, septembre.' })
      await flushPromises()
      expect(wrapper.find('[data-testid="trends-digest-text"]').text()).toBe(
        'Autrement dit, septembre.'
      )
      expect(button.attributes('disabled')).toBeUndefined()
    })
  })
})
