import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import BudgetMonthlyMatrix from './BudgetMonthlyMatrix.vue'

// Every cell links to the Transactions page: RouterLink needs a router.
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/transactions', component: { template: '<div />' } },
  ],
})

const months = [
  { ym: '2026-06', label: 'Juin', isRunning: false },
  { ym: '2026-07', label: 'Juil', isRunning: false },
  { ym: '2026-08', label: 'Août', isRunning: true },
]

const rows = [
  {
    categoryId: 'cat-food',
    categoryName: 'Alimentation',
    categoryIcon: '🍽️',
    budget: 300,
    amounts: [500, 200, 200],
  },
  {
    categoryId: 'cat-misc',
    categoryName: 'Divers',
    categoryIcon: null,
    budget: 0,
    amounts: [40, 40, 10],
  },
]

function mountMatrix(selectedMonth: string | null = null) {
  return mount(BudgetMonthlyMatrix, {
    props: { months, rows, selectedMonth },
    global: { plugins: [router] },
  })
}

describe('BudgetMonthlyMatrix', () => {
  it('lays every started month out beside its envelope', () => {
    const wrapper = mountMatrix()

    expect(
      wrapper.find('[data-testid="matrix-cell-Alimentation-2026-06"]').text()
    ).toContain('500')
    expect(
      wrapper.find('[data-testid="matrix-cell-Alimentation-2026-07"]').text()
    ).toContain('200')
    expect(
      wrapper.find('[data-testid="matrix-cell-Alimentation-2026-08"]').text()
    ).toContain('200')
  })

  it('flags only the months that went past the envelope', () => {
    const wrapper = mountMatrix()

    // 500 over an envelope of 300.
    expect(
      wrapper
        .find('[data-testid="matrix-cell-Alimentation-2026-06"]')
        .classes()
        .join(' ')
    ).toContain('bg-red-50')
    // 200 under it — the same category, a different month.
    expect(
      wrapper
        .find('[data-testid="matrix-cell-Alimentation-2026-07"]')
        .classes()
        .join(' ')
    ).not.toContain('bg-red-50')
  })

  it('stays neutral where nothing was promised', () => {
    const wrapper = mountMatrix()

    const cell = wrapper.find('[data-testid="matrix-cell-Divers-2026-06"]')
    const classes = cell.classes().join(' ')
    expect(classes).not.toContain('bg-red-50')
    expect(classes).not.toContain('bg-green-50')
    expect(cell.attributes('title')).toContain("pas d'enveloppe")
  })

  it('totals each month against the total envelope', () => {
    const wrapper = mountMatrix()

    // June: 500 + 40 = 540 against 300 of envelopes.
    const june = wrapper.find('[data-testid="matrix-total-2026-06"]')
    expect(june.text()).toContain('540')
    expect(june.classes().join(' ')).toContain('text-red-600')

    // July: 200 + 40 = 240, inside.
    const july = wrapper.find('[data-testid="matrix-total-2026-07"]')
    expect(july.text()).toContain('240')
    expect(july.classes().join(' ')).not.toContain('text-red-600')
  })

  it('marks the column the page is currently reading, without a button', () => {
    const wrapper = mountMatrix('2026-08')

    const header = wrapper.find('[data-testid="matrix-header-2026-08"]')
    expect(header.element.tagName).not.toBe('BUTTON')
    expect(header.attributes('aria-current')).toBe('true')
    expect(header.classes().join(' ')).toContain('bg-primary-600')
    expect(
      wrapper
        .find('[data-testid="matrix-header-2026-06"]')
        .attributes('aria-current')
    ).toBeUndefined()
  })

  it('starts open on a desk and folded on a phone', () => {
    const open = mountMatrix()
    expect(
      open.find('[data-testid="matrix-toggle"]').attributes('aria-expanded')
    ).toBe('true')
    expect(open.find('[data-testid="matrix-body"]').attributes('style')).toBe(
      undefined
    )

    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    try {
      const folded = mountMatrix()
      expect(
        folded.find('[data-testid="matrix-body"]').attributes('style')
      ).toContain('display: none')
      expect(
        folded.find('[data-testid="matrix-toggle"]').attributes('aria-expanded')
      ).toBe('false')
    } finally {
      window.matchMedia = original
    }
  })

  it('opens the rows behind a cell, and behind a month total, gross', () => {
    const wrapper = mountMatrix()

    const cell = wrapper
      .get('[data-testid="matrix-cell-Alimentation-2026-07"]')
      .get('a')
    expect(cell.attributes('href')).toBe(
      '/transactions?type=EXPENSE&category=cat-food&from=2026-07-01&to=2026-07-31&label=Alimentation+%C2%B7+Juil&gross=1'
    )
    expect(cell.attributes('aria-label')).toBe(
      'Voir les transactions de Alimentation · Juil'
    )

    const total = wrapper.get('[data-testid="matrix-total-2026-08"]').get('a')
    expect(total.attributes('href')).toBe(
      '/transactions?type=EXPENSE&from=2026-08-01&to=2026-08-31&label=D%C3%A9penses+%C2%B7+Ao%C3%BBt&gross=1'
    )
  })

  it('leaves the events out of its links when read « Vie courante »', () => {
    const wrapper = mount(BudgetMonthlyMatrix, {
      props: { months, rows, selectedMonth: null, exceptional: 'exclude' },
      global: { plugins: [router] },
    })

    expect(
      wrapper
        .get('[data-testid="matrix-cell-Alimentation-2026-07"]')
        .get('a')
        .attributes('href')
    ).toContain('&exceptional=exclude&')
    expect(
      wrapper
        .get('[data-testid="matrix-total-2026-08"]')
        .get('a')
        .attributes('href')
    ).toContain('&exceptional=exclude&')
  })
})
