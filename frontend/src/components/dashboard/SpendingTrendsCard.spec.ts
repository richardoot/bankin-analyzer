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
import SpendingTrendsCard from './SpendingTrendsCard.vue'

enableAutoUnmount(afterEach)

const { getSpendingTrends } = vi.hoisted(() => ({
  getSpendingTrends: vi.fn(),
}))
vi.mock('@/lib/api', () => ({
  api: { getSpendingTrends },
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
})
