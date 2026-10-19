import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import BudgetAmortizedSection from './BudgetAmortizedSection.vue'
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

function mountSection(purchases: AmortizedPurchaseDto[]) {
  return mount(BudgetAmortizedSection, {
    props: { purchases, currentMonth: '2026-06' },
    global: { plugins: [router] },
  })
}

describe('BudgetAmortizedSection', () => {
  it('lists each purchase with its slice, what is left, and its link', () => {
    const wrapper = mountSection([purchase()])

    const line = wrapper.get('[data-testid="budget-amortized-tx-phone"]')
    expect(line.text()).toContain('Apple Store iPhone')
    expect(line.text()).toMatch(/54,17\s€\s*\/ mois/)
    expect(line.text()).toContain('21 mois restants')
    expect(line.text()).toContain("jusqu'en févr. 2028")
    expect(
      wrapper
        .get('[data-testid="budget-amortized-link-tx-phone"]')
        .attributes('href')
    ).toBe('/transactions?ids=tx-phone&label=Apple+Store+iPhone')
  })

  it('totals the slices still running, and says when one is over', () => {
    const wrapper = mountSection([
      purchase(),
      purchase({
        transactionId: 'tx-repair',
        description: 'Garage',
        months: 3,
        monthlyAmount: 100,
        firstMonth: '2026-02',
        lastMonth: '2026-04',
      }),
    ])

    expect(
      wrapper.get('[data-testid="budget-amortized-total"]').text()
    ).toMatch(/54,17/)
    expect(
      wrapper.get('[data-testid="budget-amortized-tx-repair"]').text()
    ).toContain('terminé en avr. 2026')
  })

  it('renders nothing without a smoothed purchase', () => {
    expect(
      mountSection([]).find('[data-testid="budget-amortized"]').exists()
    ).toBe(false)
  })
})
