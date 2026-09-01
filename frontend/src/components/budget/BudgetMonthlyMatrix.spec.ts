import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BudgetMonthlyMatrix from './BudgetMonthlyMatrix.vue'

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
    expect(classes).not.toContain('bg-emerald-50')
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

  it('asks for a month when its column header is clicked', async () => {
    const wrapper = mountMatrix()

    await wrapper.find('[data-testid="matrix-header-2026-07"]').trigger('click')

    expect(wrapper.emitted('select-month')?.[0]).toEqual(['2026-07'])
  })

  it('marks the column the page is currently reading', () => {
    const wrapper = mountMatrix('2026-08')

    expect(
      wrapper.find('[data-testid="matrix-header-2026-08"]').classes().join(' ')
    ).toContain('bg-gray-900')
    expect(
      wrapper.find('[data-testid="matrix-header-2026-06"]').classes().join(' ')
    ).not.toContain('bg-gray-900')
  })
})
