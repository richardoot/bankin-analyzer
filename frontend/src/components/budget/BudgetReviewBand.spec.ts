import { describe, it, expect, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import {
  budgetReviewReading,
  type BudgetMonthInput,
  type BudgetReviewReading,
} from '@/lib/budgetMonth'
import BudgetReviewBand from './BudgetReviewBand.vue'

vi.mock('@/composables/useMediaQuery', () => ({
  useMediaQuery: () => ref(false),
}))

enableAutoUnmount(afterEach)

/**
 * « Printemps 2026 », January → March, finished: 1 850 € a month on two
 * envelopes. Alimentation spends past its envelope on average, Restaurants
 * et bars holds.
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
    months: ['2026-01', '2026-02', '2026-03'],
    completeMonthsCount: 3,
    selectedMonth: null,
    progress: null,
    categories: [
      {
        categoryId: 'food',
        categoryName: 'Alimentation',
        amounts: [1600, 1800, 2200],
      },
      {
        categoryId: 'bars',
        categoryName: 'Restaurants et bars',
        amounts: [100, 140, 150],
      },
    ],
    income: [2600, 2600, 2600],
    ...overrides,
  }
}

const OPTIONS = [
  { ym: '2026-01', short: 'Janv.', full: 'Janvier 2026', isRunning: false },
  { ym: '2026-02', short: 'Févr.', full: 'Février 2026', isRunning: false },
  { ym: '2026-03', short: 'Mars', full: 'Mars 2026', isRunning: false },
]

/** Spaces as one plain space: the formatters use narrow no-break ones. */
const text = (s: string): string => s.replace(/\s+/g, ' ').trim()

function mountBand(
  reading: BudgetReviewReading = budgetReviewReading(input()),
  props: Partial<InstanceType<typeof BudgetReviewBand>['$props']> = {}
) {
  return mount(BudgetReviewBand, {
    props: {
      reading,
      planName: 'Printemps 2026',
      planStart: '2026-01-01',
      planEnd: '2026-03-31',
      monthOptions: OPTIONS,
      selectedMonth: reading.month,
      projects: { totalBudget: 1191 },
      projectReserve: 900,
      ...props,
    },
  })
}

describe('BudgetReviewBand', () => {
  it('names the plan and its months', () => {
    const wrapper = mountBand()
    expect(wrapper.get('[data-testid="budget-review-title"]').text()).toBe(
      'Bilan du plan · Printemps 2026'
    )
    expect(wrapper.get('[data-testid="budget-review-subtitle"]').text()).toBe(
      'janvier → mars 2026 · 3 mois'
    )
  })

  it('offers « Le plan » first, chosen by default, then each month', () => {
    const wrapper = mountBand()
    const buttons = wrapper
      .get('[data-testid="budget-month-read"]')
      .findAll('button')
    expect(buttons.map(b => text(b.text()))).toEqual([
      'Le plan',
      'Janv.',
      'Févr.',
      'Mars',
    ])
    expect(
      wrapper
        .get('[data-testid="budget-month-average"]')
        .attributes('aria-checked')
    ).toBe('true')
  })

  it('emits the month chosen, and « Le plan »', async () => {
    const wrapper = mountBand()
    await wrapper.get('[data-testid="budget-month-2026-02"]').trigger('click')
    const month = mountBand(
      budgetReviewReading(input({ selectedMonth: '2026-02' }))
    )
    await month.get('[data-testid="budget-month-average"]').trigger('click')
    expect(wrapper.emitted('select-month')).toEqual([['2026-02']])
    expect(month.emitted('select-month')).toEqual([[null]])
  })

  it('reads the spending per month against the envelope, and the plan’s totals', () => {
    const wrapper = mountBand()
    const tile = wrapper.get('[data-testid="budget-tile-spent"]')
    // (1 700 + 1 940 + 2 350) / 3 = 1 997 a month, +8 % on 1 850.
    expect(
      text(tile.get('[data-testid="budget-month-value-spent"]').text())
    ).toBe('1 997 € par mois')
    const badge = tile.get('[data-testid="budget-badge-spent"]')
    expect(text(badge.text())).toBe('+8 % vs 1 850 € d’enveloppe')
    expect(badge.attributes('data-tone')).toBe('over')
    expect(text(tile.get('[data-testid="budget-detail-spent"]').text())).toBe(
      '5 990 € sur 5 550 € d’enveloppe sur le plan'
    )
    expect(tile.find('[data-testid="budget-sparkline-spent"]').exists()).toBe(
      true
    )
  })

  it('reads the savings made against the decided ones', () => {
    const wrapper = mountBand()
    const tile = wrapper.get('[data-testid="budget-tile-savings"]')
    expect(tile.text()).toContain('Épargne réalisée')
    // 2 600 − 1 997 = 603 a month, +103 € on 500 € decided: teal.
    expect(
      text(tile.get('[data-testid="budget-month-value-savings"]').text())
    ).toBe('603 € par mois')
    const badge = tile.get('[data-testid="budget-badge-savings"]')
    expect(text(badge.text())).toBe('+103 € vs 500 € décidés')
    expect(badge.attributes('data-tone')).toBe('under')
    expect(text(tile.get('[data-testid="budget-detail-savings"]').text())).toBe(
      'Revenus 2 600 € − dépensé · 1 810 € sur le plan'
    )
  })

  it('says the savings in amber when the plan spent more than it earned', () => {
    const wrapper = mountBand(
      budgetReviewReading(input({ income: [1500, 1500, 1500] }))
    )
    const value = wrapper.get('[data-testid="budget-month-value-savings"]')
    expect(value.classes()).toContain('text-amber-700')
    expect(
      wrapper
        .get('[data-testid="budget-badge-savings"]')
        .attributes('data-tone')
    ).toBe('over')
  })

  it('counts the envelopes held and names the ones spent past', async () => {
    const wrapper = mountBand()
    const tile = wrapper.get('[data-testid="budget-tile-envelopes"]')
    expect(
      text(tile.get('[data-testid="budget-month-value-envelopes"]').text())
    ).toBe('1 sur 2')
    const badge = tile.get('[data-testid="budget-badge-envelopes"]')
    expect(badge.text()).toBe('Alimentation')
    expect(badge.attributes('data-tone')).toBe('over')
    expect(tile.text()).toContain('en moyenne sur le plan')
    await tile.get('[data-testid="budget-envelopes-link"]').trigger('click')
    expect(wrapper.emitted('show-envelope')).toEqual([['food']])
  })

  it('says « toutes tenues » in grey when every envelope held', () => {
    const wrapper = mountBand(
      budgetReviewReading(
        input({
          categories: [
            {
              categoryId: 'food',
              categoryName: 'Alimentation',
              amounts: [1600, 1600, 1600],
            },
          ],
        })
      )
    )
    const badge = wrapper.get('[data-testid="budget-badge-envelopes"]')
    expect(badge.text()).toBe('toutes tenues')
    expect(badge.attributes('data-tone')).toBe('neutral')
    expect(wrapper.find('[data-testid="budget-envelopes-link"]').exists()).toBe(
      false
    )
  })

  it('reads the projects against the reserve', () => {
    const over = mountBand()
    const tile = over.get('[data-testid="budget-tile-projects"]')
    expect(
      text(tile.get('[data-testid="budget-month-value-projects"]').text())
    ).toBe('1 191 € sur 900 €')
    const badge = tile.get('[data-testid="budget-badge-projects"]')
    expect(text(badge.text())).toBe('réserve dépassée de 291 €')
    expect(badge.attributes('data-tone')).toBe('over')

    const held = mountBand(undefined, { projects: { totalBudget: 600 } })
    const heldBadge = held.get('[data-testid="budget-badge-projects"]')
    expect(text(heldBadge.text())).toBe('reste 300 €')
    expect(heldBadge.attributes('data-tone')).toBe('neutral')

    const none = mountBand(undefined, { projectReserve: null })
    expect(
      text(none.get('[data-testid="budget-month-value-projects"]').text())
    ).toBe('1 191 € engagés')
    expect(none.get('[data-testid="budget-badge-projects"]').text()).toBe(
      'pas de réserve'
    )
  })

  it('reads one month when one is chosen, with the same tiles', () => {
    const wrapper = mountBand(
      budgetReviewReading(input({ selectedMonth: '2026-01' }))
    )
    expect(wrapper.get('[data-testid="budget-review-subtitle"]').text()).toBe(
      'Janvier 2026, un des 3 mois du plan'
    )
    expect(
      text(wrapper.get('[data-testid="budget-month-value-spent"]').text())
    ).toBe('1 700 €')
    expect(
      text(wrapper.get('[data-testid="budget-detail-spent"]').text())
    ).toBe('1 850 € d’enveloppe pour le mois')
    expect(
      text(wrapper.get('[data-testid="budget-month-value-savings"]').text())
    ).toBe('900 €')
    expect(
      text(wrapper.get('[data-testid="budget-detail-savings"]').text())
    ).toBe('Revenus 2 600 € − dépensé')
    expect(
      text(wrapper.get('[data-testid="budget-month-value-envelopes"]').text())
    ).toBe('2 sur 2')
    expect(wrapper.get('[data-testid="budget-detail-projects"]').text()).toBe(
      'engagés sur tout le plan'
    )
    for (const id of ['spent', 'savings', 'envelopes', 'projects']) {
      expect(wrapper.find(`[data-testid="budget-tile-${id}"]`).exists()).toBe(
        true
      )
    }
  })

  it('writes no figure in red, green or primary', () => {
    const html = mountBand().html()
    expect(html).not.toMatch(/(?:text|bg)-(?:red|green|emerald|indigo)-\d/)
    expect(html).not.toContain('✓')
    expect(html).not.toContain('⚠')
  })
})
