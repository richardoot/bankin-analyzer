import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import BudgetCategoryRow from './BudgetCategoryRow.vue'
import MonthsVsBudgetChart from './MonthsVsBudgetChart.vue'
import MonthlyBarChart from '@/components/charts/MonthlyBarChart.vue'
import type { CategoryAverageDto } from '@/lib/api'
import { DATA_HUE, STATE_BADGE_CLASSES } from '@/lib/stateTints'

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

  it('writes the figure in the ink, « 130 € sur 133 € » on one line, the prorata in grey', () => {
    const wrapper = mountRow({ proratedBudget: 99 })
    const figure = wrapper.get('[data-testid="budget-figure-Alimentation"]')
    expect(figure.classes()).toContain('text-gray-900')
    expect(figure.text().replace(/\s+/g, ' ')).toBe('130,00 € sur 133 €')
    const prorata = wrapper.get('[data-testid="budget-prorata-Alimentation"]')
    expect(prorata.classes()).toContain('text-gray-500')
    expect(prorata.text()).toMatch(/^99\s€ à ce jour$/)
  })

  it('carries the anchor of its category', () => {
    expect(
      mountRow().get('[data-testid="budget-row-Alimentation"]').attributes('id')
    ).toBe('budget-row-cat-food')
  })

  it('says « Dépassé » in the state amber, without a sign', () => {
    const badge = mountRow({ rowStatus: 'over' }).get(
      '[data-testid="budget-status-Alimentation"]'
    )
    expect(badge.text()).toBe('Dépassé')
    expect(badge.attributes('data-tone')).toBe('over')
    expect(badge.classes()).toEqual(
      expect.arrayContaining(STATE_BADGE_CLASSES.over.split(' '))
    )
    expect(badge.classes().some(c => /red|green/.test(c))).toBe(false)
  })

  it('keeps « Couvert » for edit mode', () => {
    expect(
      mountRow({ rowStatus: 'covered' })
        .find('[data-testid="budget-status-Alimentation"]')
        .exists()
    ).toBe(false)
    const badge = mountRow({ rowStatus: 'covered', editing: true }).get(
      '[data-testid="budget-status-Alimentation"]'
    )
    expect(badge.text()).toBe('Couvert')
    expect(badge.text()).not.toContain('✓')
    expect(badge.classes()).toEqual(
      expect.arrayContaining(STATE_BADGE_CLASSES.neutral.split(' '))
    )
  })

  describe('the drill-down', () => {
    const facts = (wrapper: ReturnType<typeof mountRow>) =>
      wrapper.get('[data-testid="budget-row-envelope-Alimentation"]')

    it('says what is left and the months held, in one line of facts in the ink', () => {
      // 4 closed months (October runs): 120 and 90 under 133, 150 and 140 above.
      const wrapper = mountRow({ expanded: true, remainingVsActual: 38 })
      const line = facts(wrapper)
      expect(line.text().replace(/\s+/g, ' ')).toMatch(
        /^Reste 38,00 € sur l’enveloppe ·\s?2 mois sur 4 sous l’enveloppe/
      )
      expect(line.get('strong').classes()).toContain('text-gray-900')
      // The two tiles in green and red are gone.
      expect(
        wrapper.find('[data-testid="budget-row-detail-Alimentation"]').exists()
      ).toBe(false)
      expect(wrapper.html()).not.toMatch(/\btext-(?:red|green)-\d/)
    })

    it('badges the state against the envelope, to date on a running month', () => {
      const badge = (overrides: Partial<Props>) =>
        facts(mountRow({ expanded: true, ...overrides })).get(
          '[data-testid="budget-row-badge-Alimentation"]'
        )
      // 130 on 133: within 5 %.
      expect(badge({}).attributes('data-tone')).toBe('neutral')
      expect(badge({}).text()).toBe('dans l’enveloppe')
      // 130 on 99 to date: above.
      const over = badge({ proratedBudget: 99 })
      expect(over.attributes('data-tone')).toBe('over')
      expect(over.text()).toBe('au-dessus de l’enveloppe')
      expect(over.classes()).toContain('bg-amber-50')
      // 80 on 133: under.
      expect(badge({ actualAverage: 80 }).attributes('data-tone')).toBe('under')
    })

    it('says an overrun as such, not as a negative rest', () => {
      const wrapper = mountRow({
        expanded: true,
        actualAverage: 145,
        remainingVsActual: -12,
      })
      expect(facts(wrapper).text().replace(/\s+/g, ' ')).toMatch(
        /^Dépassement de 12,00 € sur l’enveloppe/
      )
    })

    it('says no envelope fact without an envelope', () => {
      const wrapper = mountRow({ expanded: true, budget: 0, savedBudget: 0 })
      expect(
        wrapper
          .find('[data-testid="budget-row-envelope-Alimentation"]')
          .exists()
      ).toBe(false)
    })

    it('keeps « Marge vs historique » for edit mode', () => {
      const tracking = mountRow({
        expanded: true,
        showHistorical: true,
        historicalAverage: 150,
        marginVsHistorical: -17,
      })
      expect(
        tracking.find('[data-testid="budget-row-margin-Alimentation"]').exists()
      ).toBe(false)
      const editing = mountRow({
        expanded: true,
        editing: true,
        showHistorical: true,
        historicalAverage: 150,
        marginVsHistorical: -17,
      })
      expect(
        editing
          .get('[data-testid="budget-row-margin-Alimentation"]')
          .text()
          .replace(/\s+/g, ' ')
      ).toBe('Marge vs historique : −17,00 € par mois')
    })

    it('draws the months in the data hue against the envelope, the events hatched when given', () => {
      const overlay = { values: [0, 20, 0, 0, 0], label: 'événements' }
      const wrapper = mountRow({
        expanded: true,
        chartData: {
          labels: ['j', 'j', 'a', 's', 'o'],
          values: [150, 120, 90, 120, 60],
        },
        chartOverlay: overlay,
      })
      const chart = wrapper.findComponent(MonthlyBarChart)
      expect(chart.props()).toMatchObject({
        color: DATA_HUE,
        reference: 133,
        overlay,
      })
      expect(chart.props('color')).not.toBe('#ef4444')
    })

    it('draws no reference line without an envelope, no overlay unless given', () => {
      const chart = mountRow({
        expanded: true,
        budget: 0,
        savedBudget: 0,
        chartData: { labels: ['a', 'b'], values: [1, 2] },
      }).findComponent(MonthlyBarChart)
      expect(chart.props('reference')).toBeUndefined()
      expect(chart.props('overlay')).toBeUndefined()
    })
  })
})
