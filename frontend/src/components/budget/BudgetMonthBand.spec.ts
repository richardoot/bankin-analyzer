import { describe, it, expect, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import {
  budgetMonthReading,
  type BudgetMonthInput,
  type BudgetMonthReading,
} from '@/lib/budgetMonth'
import BudgetMonthBand from './BudgetMonthBand.vue'

/** Below `sm`, when set: « Mois lu » becomes a link and a sheet. */
const phone = vi.hoisted(() => ({ value: false }))
vi.mock('@/composables/useMediaQuery', () => ({
  useMediaQuery: () => ref(phone.value),
}))

enableAutoUnmount(afterEach)
afterEach(() => {
  phone.value = false
  document.body.innerHTML = ''
})

/**
 * « Automne 2026 », 1 850 € a month on two envelopes, read on 23 October:
 * July → September complete, October running.
 */
function input(overrides: Partial<BudgetMonthInput> = {}): BudgetMonthInput {
  return {
    plan: {
      entries: [
        {
          id: 'e1',
          categoryId: 'food',
          categoryName: 'Alimentation',
          amount: 1700,
        },
        {
          id: 'e2',
          categoryId: 'bars',
          categoryName: 'Restaurants et bars',
          amount: 150,
        },
      ],
      referenceIncome: 2465,
      savingsTarget: 500,
    },
    months: ['2026-07', '2026-08', '2026-09', '2026-10'],
    completeMonthsCount: 3,
    selectedMonth: '2026-10',
    progress: { elapsedDays: 23, totalDays: 31 },
    categories: [
      {
        categoryId: 'food',
        categoryName: 'Alimentation',
        amounts: [1600, 1800, 1500, 867],
      },
      {
        categoryId: 'bars',
        categoryName: 'Restaurants et bars',
        amounts: [190, 140, 150, 162],
      },
    ],
    income: [2600, 2600, 2600, 0],
    ...overrides,
  }
}

const OPTIONS = [
  { ym: '2026-07', short: 'Juil.', full: 'Juillet 2026', isRunning: false },
  { ym: '2026-08', short: 'Août', full: 'Août 2026', isRunning: false },
  { ym: '2026-09', short: 'Sept.', full: 'Septembre 2026', isRunning: false },
  { ym: '2026-10', short: 'Oct.', full: 'Octobre 2026', isRunning: true },
]

/** Spaces as one plain space: the formatters use narrow no-break ones. */
const text = (s: string): string => s.replace(/\s+/g, ' ').trim()

function mountBand(
  reading: BudgetMonthReading = budgetMonthReading(input()),
  props: Partial<InstanceType<typeof BudgetMonthBand>['$props']> = {}
) {
  return mount(BudgetMonthBand, {
    props: {
      reading,
      planStart: '2026-07-01',
      monthOptions: OPTIONS,
      selectedMonth: reading.month,
      completeMonthsCount: 3,
      ...props,
    },
  })
}

describe('BudgetMonthBand', () => {
  it('names the running month and the day it is read at', () => {
    const wrapper = mountBand()
    expect(wrapper.get('[data-testid="budget-month-title"]').text()).toBe(
      'Ce mois-ci · octobre, au 23'
    )
    expect(wrapper.text()).toContain('L’enveloppe est ramenée au jour du mois')
  })

  it('names a closed month, and the average', () => {
    const closed = mountBand(
      budgetMonthReading(input({ selectedMonth: '2026-09', progress: null }))
    )
    expect(closed.get('[data-testid="budget-month-title"]').text()).toBe(
      'Septembre'
    )

    const average = mountBand(
      budgetMonthReading(input({ selectedMonth: null, progress: null }))
    )
    expect(average.get('[data-testid="budget-month-title"]').text()).toBe(
      'Moyenne du plan · 3 mois clos'
    )
  })

  it('reads the spending against the envelope at this point of the month', () => {
    const wrapper = mountBand()
    const tile = wrapper.get('[data-testid="budget-tile-spent"]')
    expect(
      text(tile.get('[data-testid="budget-month-value-spent"]').text())
    ).toBe('1 029 €')
    const badge = tile.get('[data-testid="budget-badge-spent"]')
    // 1 029 against 1 373 to date: −25 %, teal.
    expect(text(badge.text())).toBe('−25 %')
    expect(badge.attributes('data-tone')).toBe('under')
    expect(badge.classes()).toContain('bg-teal-50')
    expect(tile.text()).toContain('à ce stade du mois')
    expect(text(tile.get('[data-testid="budget-detail-spent"]').text())).toBe(
      '1 373 € d’enveloppe au 23 · 1 850 € pour le mois'
    )
    // The figure wears the spending's blue, never a state colour.
    expect(
      tile.get('[data-testid="budget-month-value-spent"]').classes()
    ).toContain('text-blue-700')
  })

  it('draws the plan months, the envelope as reference', () => {
    const wrapper = mountBand()
    const spark = wrapper.findComponent({ name: 'SparklineChart' })
    expect(spark.props()).toMatchObject({
      data: [1790, 1940, 1650, 1029],
      reference: 1850,
      baseline: 'zero',
      color: '#60a5fa',
      endColor: '#14b8a6',
    })
  })

  it('says a month over its envelope in amber, never red', () => {
    const real = budgetMonthReading(
      input({
        categories: [
          {
            categoryId: 'food',
            categoryName: 'Alimentation',
            amounts: [1600, 1800, 1500, 1767],
          },
          {
            categoryId: 'bars',
            categoryName: 'Restaurants et bars',
            amounts: [190, 140, 150, 162],
          },
        ],
      })
    )
    const wrapper = mountBand(real)
    const badge = wrapper.get('[data-testid="budget-badge-spent"]')
    expect(badge.attributes('data-tone')).toBe('over')
    expect(wrapper.html()).not.toMatch(/(?:text|bg)-red-/)
  })

  it('judges a closed month against the whole envelope', () => {
    const wrapper = mountBand(
      budgetMonthReading(input({ selectedMonth: '2026-07', progress: null }))
    )
    const tile = wrapper.get('[data-testid="budget-tile-spent"]')
    expect(text(tile.get('[data-testid="budget-detail-spent"]').text())).toBe(
      '1 850 € d’enveloppe pour le mois'
    )
    expect(tile.text()).not.toContain('à ce stade du mois')
    // 1 790 on 1 850: −3 %, within the envelope.
    expect(tile.get('[data-testid="budget-badge-spent"]').text()).toBe(
      'dans l’enveloppe'
    )
  })

  it('says what is left, for the days left on the running month', () => {
    const wrapper = mountBand()
    const tile = wrapper.get('[data-testid="budget-tile-remaining"]')
    expect(
      text(tile.get('[data-testid="budget-month-value-remaining"]').text())
    ).toBe('821 €')
    expect(tile.get('[data-testid="budget-badge-remaining"]').text()).toBe(
      'pour 8 jours'
    )
    expect(tile.classes()).toContain('bg-teal-50/60')

    const closed = mountBand(
      budgetMonthReading(input({ selectedMonth: '2026-09', progress: null }))
    )
    expect(closed.get('[data-testid="budget-badge-remaining"]').text()).toBe(
      'sur le mois'
    )
  })

  it('says an overrun of the month in amber', () => {
    const wrapper = mountBand(
      budgetMonthReading(input({ selectedMonth: '2026-08', progress: null }))
    )
    const value = wrapper.get('[data-testid="budget-month-value-remaining"]')
    // The typographic minus, never the hyphen Intl writes.
    expect(text(value.text())).toBe('−90 €')
    expect(value.classes()).toContain('text-amber-700')
    const badge = wrapper.get('[data-testid="budget-badge-remaining"]')
    expect(text(badge.text())).toBe('dépassé de 90 €')
    expect(badge.attributes('data-tone')).toBe('over')
  })

  it('weighs the planned savings, on the closed months’ income, against the decided ones', () => {
    const wrapper = mountBand()
    const tile = wrapper.get('[data-testid="budget-tile-savings"]')
    // 2 600 received on average over three closed months − 1 850.
    expect(
      text(tile.get('[data-testid="budget-month-value-savings"]').text())
    ).toBe('750 € par mois prévus')
    const badge = tile.get('[data-testid="budget-badge-savings"]')
    expect(text(badge.text())).toBe('+250 € vs 500 € décidés')
    expect(badge.attributes('data-tone')).toBe('under')
    expect(text(tile.get('[data-testid="budget-savings-basis"]').text())).toBe(
      'sur les revenus moyens de 3 mois clos (2 600 €)'
    )
    // (2 600 − 5 380 / 3) ≈ 807 over the three closed months.
    expect(text(tile.get('[data-testid="budget-detail-savings"]').text())).toBe(
      '807 €/mois réalisés sur 3 mois clos'
    )
  })

  it('says « pas d’objectif » without a decided target, and no closed month yet', () => {
    const wrapper = mountBand(
      budgetMonthReading(
        input({
          plan: { ...input().plan, savingsTarget: null },
          months: ['2026-10'],
          completeMonthsCount: 0,
          categories: [
            {
              categoryId: 'food',
              categoryName: 'Alimentation',
              amounts: [867],
            },
          ],
          income: [0],
        })
      ),
      { completeMonthsCount: 0, monthOptions: OPTIONS.slice(3) }
    )
    const badge = wrapper.get('[data-testid="budget-badge-savings"]')
    expect(badge.text()).toBe('pas d’objectif')
    expect(badge.attributes('data-tone')).toBe('neutral')
    expect(wrapper.get('[data-testid="budget-detail-savings"]').text()).toBe(
      'pas encore de mois clos'
    )
    // No closed month: the reference income typed at creation, said so.
    expect(
      text(wrapper.get('[data-testid="budget-month-value-savings"]').text())
    ).toBe('615 € par mois prévus')
    expect(
      text(wrapper.get('[data-testid="budget-savings-basis"]').text())
    ).toBe('sur les revenus de référence saisis (2 465 €)')
  })

  it('points to the edit mode with neither a closed month nor a reference income', async () => {
    const wrapper = mountBand(
      budgetMonthReading(
        input({
          plan: { ...input().plan, referenceIncome: null },
          months: ['2026-10'],
          completeMonthsCount: 0,
          categories: [
            {
              categoryId: 'food',
              categoryName: 'Alimentation',
              amounts: [867],
            },
          ],
          income: [0],
        })
      ),
      { completeMonthsCount: 0, monthOptions: OPTIONS.slice(3) }
    )
    const tile = wrapper.get('[data-testid="budget-tile-savings"]')
    expect(tile.text()).toContain('Revenus de référence non renseignés')
    expect(tile.find('[data-testid="budget-badge-savings"]').exists()).toBe(
      false
    )
    await tile.get('[data-testid="budget-savings-edit"]').trigger('click')
    expect(wrapper.emitted('edit')).toHaveLength(1)
  })

  it('names the first envelope spent past, and scrolls to it', async () => {
    const wrapper = mountBand()
    const tile = wrapper.get('[data-testid="budget-tile-envelopes"]')
    expect(
      text(tile.get('[data-testid="budget-month-value-envelopes"]').text())
    ).toBe('1 sur 2 dépassée')
    const badge = tile.get('[data-testid="budget-badge-envelopes"]')
    expect(badge.text()).toBe('Restaurants et bars')
    expect(badge.attributes('data-tone')).toBe('over')
    await tile.get('[data-testid="budget-envelopes-link"]').trigger('click')
    expect(wrapper.emitted('show-envelope')).toEqual([['bars']])
  })

  it('counts the others after the first', () => {
    const wrapper = mountBand(
      budgetMonthReading(
        input({
          categories: [
            {
              categoryId: 'food',
              categoryName: 'Alimentation',
              amounts: [0, 0, 0, 1800],
            },
            {
              categoryId: 'bars',
              categoryName: 'Restaurants et bars',
              amounts: [0, 0, 0, 162],
            },
          ],
        })
      )
    )
    expect(
      text(wrapper.get('[data-testid="budget-month-value-envelopes"]').text())
    ).toBe('2 sur 2 dépassées')
    expect(wrapper.get('[data-testid="budget-badge-envelopes"]').text()).toBe(
      'Alimentation et 1 autre'
    )
  })

  it('says « toutes tenues » in grey when none is spent past', () => {
    const wrapper = mountBand(
      budgetMonthReading(input({ selectedMonth: '2026-09', progress: null }))
    )
    const badge = wrapper.get('[data-testid="budget-badge-envelopes"]')
    expect(badge.text()).toBe('toutes tenues')
    expect(badge.attributes('data-tone')).toBe('neutral')
    expect(wrapper.find('[data-testid="budget-envelopes-link"]').exists()).toBe(
      false
    )
  })

  it('offers the started months then « Moyenne du plan », the running one marked', async () => {
    const wrapper = mountBand()
    const selector = wrapper.get('[data-testid="budget-month-selector"]')
    expect(selector.text()).toContain('Mois lu')
    const read = selector.get('[data-testid="budget-month-read"]')
    const options = read.findAll('[role="radio"]')
    expect(options.map(o => o.attributes('data-testid'))).toEqual([
      'budget-month-2026-07',
      'budget-month-2026-08',
      'budget-month-2026-09',
      'budget-month-2026-10',
      'budget-month-average',
    ])
    expect(
      read
        .get('[data-testid="budget-month-2026-10"]')
        .attributes('aria-checked')
    ).toBe('true')
    expect(
      read
        .get('[data-testid="budget-month-2026-10"]')
        .find('[data-testid="budget-month-running-mark"]')
        .exists()
    ).toBe(true)
    expect(
      read
        .get('[data-testid="budget-month-2026-09"]')
        .find('[data-testid="budget-month-running-mark"]')
        .exists()
    ).toBe(false)

    await read.get('[data-testid="budget-month-average"]').trigger('click')
    await read.get('[data-testid="budget-month-2026-08"]').trigger('click')
    expect(wrapper.emitted('select-month')).toEqual([[null], ['2026-08']])
  })

  it('offers no average before a month is closed', () => {
    const wrapper = mountBand(undefined, {
      completeMonthsCount: 0,
      monthOptions: OPTIONS.slice(3),
    })
    expect(wrapper.find('[data-testid="budget-month-average"]').exists()).toBe(
      false
    )
  })

  it('says when the plan begins, without spending or remaining', () => {
    const future = budgetMonthReading(
      input({
        months: [],
        completeMonthsCount: 0,
        selectedMonth: null,
        progress: null,
        categories: [],
        income: [],
      })
    )
    const wrapper = mountBand(future, {
      planStart: '2026-11-01',
      monthOptions: [],
      completeMonthsCount: 0,
    })
    expect(wrapper.text()).toContain('Le plan commence le 1er novembre')
    expect(wrapper.find('[data-testid="budget-tile-spent"]').exists()).toBe(
      false
    )
    expect(wrapper.find('[data-testid="budget-tile-remaining"]').exists()).toBe(
      false
    )
    expect(wrapper.find('[data-testid="budget-tile-envelopes"]').exists()).toBe(
      false
    )
    expect(wrapper.find('[data-testid="budget-month-selector"]').exists()).toBe(
      false
    )
    expect(
      text(wrapper.get('[data-testid="budget-month-value-envelope"]').text())
    ).toBe('1 850 € par mois')
    expect(
      text(wrapper.get('[data-testid="budget-month-value-savings"]').text())
    ).toBe('615 € par mois prévus')
  })

  describe('on a phone (sm)', () => {
    it('stands the tiles two by two, the figures at 22 px', () => {
      phone.value = true
      const wrapper = mountBand()
      const tiles = wrapper.get('[data-testid="budget-month-tiles"]')
      expect(tiles.classes()).toEqual(
        expect.arrayContaining(['grid-cols-2', 'md:grid-cols-4'])
      )
      expect(
        wrapper.get('[data-testid="budget-month-value-spent"]').classes()
      ).toContain('text-[22px]')
    })

    it('says « Mois lu » as a link that opens a sheet of the months', async () => {
      phone.value = true
      const wrapper = mount(BudgetMonthBand, {
        props: {
          reading: budgetMonthReading(input()),
          planStart: '2026-07-01',
          monthOptions: OPTIONS,
          selectedMonth: '2026-10',
          completeMonthsCount: 3,
        },
        attachTo: document.body,
      })
      // No segment of six months scrolling out of sight.
      expect(wrapper.find('[data-testid="budget-month-read"]').exists()).toBe(
        false
      )
      const trigger = wrapper.get('[data-testid="budget-month-read-trigger"]')
      expect(text(trigger.text())).toBe('Mois lu : oct. ▾')

      await trigger.trigger('click')
      const sheet = document.body.querySelector(
        '[data-testid="budget-month-read-sheet"]'
      )
      expect(sheet).not.toBeNull()
      const options = Array.from(
        sheet?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []
      )
      // The four started months, then the average, one per line.
      expect(options.map(o => o.textContent?.trim())).toEqual([
        'Juillet 2026',
        'Août 2026',
        'Septembre 2026',
        'Octobre 2026, en cours',
        'Moyenne des 3 mois clos',
      ])
      expect(
        options.find(o => o.getAttribute('aria-checked') === 'true')
          ?.textContent
      ).toContain('Octobre 2026')

      sheet
        ?.querySelector<HTMLButtonElement>(
          '[data-testid="budget-month-2026-08"]'
        )
        ?.click()
      expect(wrapper.emitted('select-month')).toEqual([['2026-08']])
    })
  })
})
