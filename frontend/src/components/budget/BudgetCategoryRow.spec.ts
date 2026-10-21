import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import BudgetCategoryRow from './BudgetCategoryRow.vue'
import MonthsVsBudgetChart from './MonthsVsBudgetChart.vue'
import type { CategoryAverageDto } from '@/lib/api'

// The row links to the Transactions page: RouterLink needs a router.
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/transactions', component: { template: '<div />' } },
  ],
})

vi.mock('vue3-apexcharts/core', () => ({
  default: {
    name: 'VueApexCharts',
    props: ['type', 'height', 'options', 'series'],
    template: '<div class="apexcharts-mock"></div>',
  },
}))

const category: CategoryAverageDto = {
  categoryId: 'cat-food',
  categoryName: 'Alimentation',
  categoryIcon: '🍽️',
  totalAmount: 1000,
  transactionCount: 20,
  averagePerMonth: 200,
  monthlyAmounts: [150, 140, 90, 120, 60],
}

type Props = InstanceType<typeof BudgetCategoryRow>['$props']

function mountRow(overrides: Partial<Props> = {}) {
  return mount(BudgetCategoryRow, {
    props: {
      category,
      expanded: false,
      editing: false,
      showHistorical: false,
      showActual: true,
      historicalAverage: 0,
      actualAverage: 130,
      exceptionalAverage: 0,
      budget: 133,
      savedBudget: 133,
      dirty: false,
      proratedBudget: null,
      rowStatus: 'none',
      marginVsHistorical: 0,
      remainingVsActual: 3,
      chartData: { labels: [], values: [] },
      breakdownMode: 'everyday',
      actualWindow: { from: '2026-06-01', to: '2026-10-22', label: 'plan' },
      planMonths: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
      planMonthValues: [150, 140, 90, 120, 60],
      runningMonth: '2026-10',
      selectedMonth: null,
      ...overrides,
    },
    global: { plugins: [router] },
  })
}

describe('BudgetCategoryRow', () => {
  it('hands the plan months, their values and the envelope to the chart', () => {
    const chart = mountRow().findComponent(MonthsVsBudgetChart)
    expect(chart.props()).toMatchObject({
      months: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
      values: [150, 140, 90, 120, 60],
      budget: 133,
      runningMonth: '2026-10',
      selectedMonth: undefined,
    })
  })

  it('says the chart in words: months, those above, the running one', () => {
    const chart = mountRow().findComponent(MonthsVsBudgetChart)
    expect(chart.props('label')).toMatch(
      /^5 mois, 2 au-dessus de l'enveloppe de 133\s€, octobre en cours$/
    )
  })

  it('names the isolated month, and says when nothing is above', () => {
    const chart = mountRow({
      budget: 500,
      selectedMonth: '2026-07',
    }).findComponent(MonthsVsBudgetChart)
    expect(chart.props('selectedMonth')).toBe('2026-07')
    expect(chart.props('label')).toMatch(
      /^5 mois, aucun au-dessus de l'enveloppe de 500\s€, octobre en cours, juillet isolé$/
    )
  })

  it('draws the columns alone without an envelope', () => {
    const wrapper = mountRow({ budget: 0, savedBudget: 0 })
    const chart = wrapper.findComponent(MonthsVsBudgetChart)
    expect(chart.props('budget')).toBe(0)
    expect(chart.props('label')).toBe(
      '5 mois, sans enveloppe, octobre en cours'
    )
    expect(
      wrapper.get('[data-testid="budget-value-Alimentation"]').text()
    ).toBe('sans enveloppe')
  })

  it('follows the draft while editing: the line is the field’s value', () => {
    const wrapper = mountRow({ editing: true, budget: 90, dirty: true })
    expect(wrapper.findComponent(MonthsVsBudgetChart).props('budget')).toBe(90)
    // The field replaces the « sur » reference, the old envelope struck.
    expect(
      wrapper.find('[data-testid="budget-value-Alimentation"]').exists()
    ).toBe(false)
    expect(
      wrapper.get('[data-testid="budget-was-Alimentation"]').text()
    ).toMatch(/133/)
  })

  it('renders no chart on a plan with no month started', () => {
    const wrapper = mountRow({
      showActual: false,
      planMonths: [],
      planMonthValues: [],
    })
    expect(wrapper.findComponent(MonthsVsBudgetChart).exists()).toBe(false)
    // The figure is the envelope itself.
    expect(
      wrapper.get('[data-testid="budget-value-Alimentation"]').text()
    ).toMatch(/^133,00\s€$/)
  })

  it('reads the actual over its envelope, with one link to its rows', () => {
    const wrapper = mountRow()
    const row = wrapper.get('[data-testid="budget-row-Alimentation"]')
    expect(row.text()).toMatch(/130,00\s€/)
    expect(
      wrapper.get('[data-testid="budget-value-Alimentation"]').text()
    ).toMatch(/^sur 133\s€$/)
    // No consumed share, no gap in figures on the row.
    expect(row.text()).not.toContain('%')
    expect(row.findAll('a')).toHaveLength(1)
    expect(
      wrapper.find('[data-testid="budget-actual-link-Alimentation"]').exists()
    ).toBe(true)
  })
})
