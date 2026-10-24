import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import BudgetMonthlyMatrix from './BudgetMonthlyMatrix.vue'
import { STATE_BADGE_CLASSES } from '@/lib/stateTints'

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

  const cellClasses = (wrapper: ReturnType<typeof mountMatrix>, id: string) =>
    wrapper.get(`[data-testid="${id}"]`).classes().join(' ')

  it('flags only the months that went past the envelope, in the over tint', () => {
    const wrapper = mountMatrix()

    // 500 over an envelope of 300.
    const over = cellClasses(wrapper, 'matrix-cell-Alimentation-2026-06')
    for (const cls of STATE_BADGE_CLASSES.over.split(' ')) {
      expect(over).toContain(cls)
    }
    // 200 under it — the same category, a different month: ink, no tint.
    const under = cellClasses(wrapper, 'matrix-cell-Alimentation-2026-07')
    expect(under).not.toContain('bg-amber-50')
    expect(under).toContain('text-gray-900')
  })

  it('never paints a cell red or green', () => {
    const wrapper = mountMatrix()
    expect(wrapper.html()).not.toMatch(/\b(?:text|bg)-(?:red|green)-\d/)
  })

  it('stays neutral where nothing was promised', () => {
    const wrapper = mountMatrix()

    const cell = wrapper.find('[data-testid="matrix-cell-Divers-2026-06"]')
    expect(cell.classes().join(' ')).not.toContain('bg-amber-50')
    expect(cell.attributes('title')).toContain("pas d'enveloppe")
  })

  it('writes the envelopes and their total in ink', () => {
    const wrapper = mountMatrix()

    for (const id of ['matrix-budget-Alimentation', 'matrix-budget-total']) {
      const classes = cellClasses(wrapper, id)
      expect(classes).toContain('text-gray-900')
      expect(classes).not.toContain('text-primary')
    }
    expect(wrapper.get('[data-testid="matrix-budget-total"]').text()).toContain(
      '300'
    )
  })

  it('totals each month against the total envelope', () => {
    const wrapper = mountMatrix()

    // June: 500 + 40 = 540 against 300 of envelopes.
    const june = wrapper.find('[data-testid="matrix-total-2026-06"]')
    expect(june.text()).toContain('540')
    expect(june.classes().join(' ')).toContain('bg-amber-50')

    // July: 200 + 40 = 240, inside.
    const july = wrapper.find('[data-testid="matrix-total-2026-07"]')
    expect(july.text()).toContain('240')
    expect(july.classes().join(' ')).not.toContain('bg-amber-50')
    expect(july.classes().join(' ')).toContain('text-gray-900')
  })

  it('marks the column the page is currently reading, without a button', () => {
    const wrapper = mountMatrix('2026-08')

    const header = wrapper.find('[data-testid="matrix-header-2026-08"]')
    expect(header.element.tagName).not.toBe('BUTTON')
    expect(header.attributes('aria-current')).toBe('true')
    // The month read is grey, as on the charts: no primary, no amber.
    expect(header.classes().join(' ')).toContain('bg-gray-200')
    expect(header.html()).not.toMatch(/primary|amber/)
    expect(
      wrapper
        .find('[data-testid="matrix-header-2026-06"]')
        .attributes('aria-current')
    ).toBeUndefined()
  })

  it('leaves the folding to the page: no toggle of its own', () => {
    const wrapper = mountMatrix()
    expect(wrapper.find('[data-testid="matrix-toggle"]').exists()).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
    expect(
      wrapper.find('[data-testid="matrix-body"]').attributes('style')
    ).toBeUndefined()
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

  it('says the slices of a smoothed purchase in a cell, and links to it', () => {
    const wrapper = mount(BudgetMonthlyMatrix, {
      props: {
        months: months.map(m =>
          m.ym === '2026-07' ? { ...m, smoothedIds: ['tx-phone'] } : m
        ),
        rows: [
          {
            ...rows[0]!,
            amortized: [0, 54.17, 0],
            smoothedIds: [undefined, ['tx-phone'], undefined],
          },
        ],
        selectedMonth: null,
        exceptional: 'exclude',
      },
      global: { plugins: [router] },
    })

    const cell = wrapper.get('[data-testid="matrix-cell-Alimentation-2026-07"]')
    expect(
      wrapper
        .get('[data-testid="matrix-amortized-Alimentation-2026-07"]')
        .text()
    ).toMatch(/dont 54,17\s€ lissés/)
    expect(cell.attributes('title')).toContain('lissés')
    expect(cell.get('a').attributes('href')).toContain('&also=tx-phone&')
    // A month without a slice says nothing.
    expect(
      wrapper
        .find('[data-testid="matrix-amortized-Alimentation-2026-06"]')
        .exists()
    ).toBe(false)
    expect(
      wrapper
        .get('[data-testid="matrix-total-2026-07"]')
        .get('a')
        .attributes('href')
    ).toContain('&also=tx-phone&')
  })
})
