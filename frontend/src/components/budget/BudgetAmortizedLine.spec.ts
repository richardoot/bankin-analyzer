import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import BudgetAmortizedLine from './BudgetAmortizedLine.vue'
import type { AmortizedPurchaseDto } from '@/lib/api'

// The link to each purchase needs a router behind RouterLink.
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/transactions', component: { template: '<div />' } },
  ],
})

const purchase = (
  overrides: Partial<AmortizedPurchaseDto> = {}
): AmortizedPurchaseDto => ({
  transactionId: 'tx-phone',
  description: 'Apple Store iPhone',
  date: '2026-03-10',
  months: 24,
  netAmount: 1300,
  monthlyAmount: 54.17,
  firstMonth: '2026-03',
  lastMonth: '2028-02',
  categoryId: 'cat-tech',
  subcategoryId: null,
  amountInPeriod: 162.51,
  sliceMonthsInPeriod: ['2026-04', '2026-05', '2026-06'],
  dateInPeriod: false,
  ...overrides,
})

const repair = purchase({
  transactionId: 'tx-repair',
  description: 'Garage',
  months: 3,
  monthlyAmount: 100,
  firstMonth: '2026-02',
  lastMonth: '2026-04',
})

function mountLine(purchases: AmortizedPurchaseDto[]) {
  return mount(BudgetAmortizedLine, {
    props: { purchases, currentMonth: '2026-06' },
    global: { plugins: [router] },
  })
}

async function unfold(wrapper: ReturnType<typeof mountLine>) {
  await wrapper.get('[data-testid="budget-amortized-toggle"]').trigger('click')
}

describe('BudgetAmortizedLine', () => {
  it('stays folded on load: the slices still running, how many purchases', () => {
    const wrapper = mountLine([purchase(), repair])
    const toggle = wrapper.get('[data-testid="budget-amortized-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.text()).toContain('Déplier')
    expect(
      wrapper.find('[data-testid="budget-amortized-panel"]').exists()
    ).toBe(false)
    const line = wrapper.get('[data-testid="budget-amortized-line"]')
    expect(line.text()).toContain('Achats lissés en cours')
    // Only the purchase still running counts in the month.
    expect(
      wrapper.get('[data-testid="budget-amortized-total"]').text()
    ).toMatch(/^54,17\s€ par mois en vie courante$/)
    expect(wrapper.get('[data-testid="budget-amortized-count"]').text()).toBe(
      '2 achats'
    )
  })

  it('says one purchase in the singular', () => {
    expect(
      mountLine([purchase()])
        .get('[data-testid="budget-amortized-count"]')
        .text()
    ).toBe('1 achat')
  })

  it('unfolds on the button: each purchase, its slice, what is left, its link', async () => {
    const wrapper = mountLine([purchase()])
    await unfold(wrapper)
    const toggle = wrapper.get('[data-testid="budget-amortized-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.attributes('aria-controls')).toBe(
      wrapper.get('[data-testid="budget-amortized-panel"]').attributes('id')
    )

    const line = wrapper.get('[data-testid="budget-amortized-tx-phone"]')
    expect(line.text()).toContain('Apple Store iPhone')
    expect(line.text()).toMatch(/54,17\s€\s*\/ mois/)
    expect(line.text()).toContain('21 mois restants')
    expect(line.text()).toContain('jusqu’en févr. 2028')
    expect(
      wrapper
        .get('[data-testid="budget-amortized-link-tx-phone"]')
        .attributes('href')
    ).toBe('/transactions?ids=tx-phone&label=Apple+Store+iPhone')
  })

  it('says when a purchase is over', async () => {
    const wrapper = mountLine([purchase(), repair])
    await unfold(wrapper)
    expect(
      wrapper.get('[data-testid="budget-amortized-tx-repair"]').text()
    ).toContain('terminé en avr. 2026')
  })

  it('keeps the slices in the ink, on no teal ground', async () => {
    const wrapper = mountLine([purchase()])
    await unfold(wrapper)
    expect(wrapper.html()).not.toMatch(/\b(?:bg|border|text)-teal-/)
  })

  it('renders nothing without a smoothed purchase', () => {
    expect(
      mountLine([]).find('[data-testid="budget-amortized-line"]').exists()
    ).toBe(false)
  })
})
