import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import MonthlyExpensesChart from './MonthlyExpensesChart.vue'

// Mock vue3-apexcharts — capture options and series for assertions
vi.mock('vue3-apexcharts', () => ({
  default: {
    name: 'VueApexCharts',
    props: ['type', 'height', 'options', 'series'],
    template:
      '<div class="apexcharts-mock" :data-type="type" :data-height="height"></div>',
  },
}))

// Mock theme store
vi.mock('@/composables/useChartTheme', () => ({
  useChartTheme: () => ({
    isDark: { value: false },
    labelColor: { value: '#6b7280' },
    chartTheme: { value: { grid: { borderColor: '#e5e7eb' } } },
  }),
}))

// Mock formatCurrency
vi.mock('@/lib/formatters', () => ({
  formatCurrency: (v: number) => `${v.toFixed(2)} €`,
}))

// Stub getCurrentYearMonth by controlling Date
const MOCK_NOW = new Date('2026-04-15T12:00:00Z')

describe('MonthlyExpensesChart', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(MOCK_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const defaultProps = {
    monthlyTotals: [2500, 2300, 2700, 1800, 2600, 2400],
    monthLabels: [
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ],
    averageIncome: 4200,
    totalBudget: 2500,
  }

  it('should render the ApexCharts component as a bar chart', () => {
    const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })

    const chart = wrapper.find('.apexcharts-mock')
    expect(chart.exists()).toBe(true)
    expect(chart.attributes('data-type')).toBe('bar')
  })

  it('should not render when less than 2 data points', () => {
    const wrapper = mount(MonthlyExpensesChart, {
      props: {
        ...defaultProps,
        monthlyTotals: [100],
        monthLabels: ['2026-01'],
      },
    })

    expect(wrapper.find('.apexcharts-mock').exists()).toBe(false)
  })

  it('should pass monthly totals as series data', () => {
    const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })

    const chart = wrapper.findComponent({ name: 'VueApexCharts' })
    const series = chart.props('series')
    expect(series).toEqual([
      { name: 'Depenses', data: defaultProps.monthlyTotals },
    ])
  })

  it('should color the current month bar in amber', () => {
    const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })

    const chart = wrapper.findComponent({ name: 'VueApexCharts' })
    const options = chart.props('options')
    const colors = options.colors as string[]

    // 2026-04 is at index 5 — should be amber
    expect(colors[5]).toBe('#f59e0b')
    // Other months should be gray
    expect(colors[0]).toBe('#9ca3af')
    expect(colors[3]).toBe('#9ca3af')
  })

  it('should not have any amber bar when current month is outside range', () => {
    const wrapper = mount(MonthlyExpensesChart, {
      props: {
        ...defaultProps,
        monthLabels: [
          '2025-01',
          '2025-02',
          '2025-03',
          '2025-04',
          '2025-05',
          '2025-06',
        ],
      },
    })

    const chart = wrapper.findComponent({ name: 'VueApexCharts' })
    const colors = chart.props('options').colors as string[]
    expect(colors.every((c: string) => c !== '#f59e0b')).toBe(true)
  })

  it('should format month labels in French abbreviations', () => {
    const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })

    const chart = wrapper.findComponent({ name: 'VueApexCharts' })
    const categories = chart.props('options').xaxis.categories
    expect(categories).toEqual(['Nov', 'Dec', 'Jan', 'Fev', 'Mar', 'Avr'])
  })

  it('should add income annotation line when averageIncome > 0', () => {
    const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })

    const chart = wrapper.findComponent({ name: 'VueApexCharts' })
    const yAnnotations = chart.props('options').annotations?.yaxis ?? []
    const incomeAnno = yAnnotations.find((a: { y: number }) => a.y === 4200)
    expect(incomeAnno).toBeDefined()
    expect(incomeAnno.borderColor).toBe('#34d399')
  })

  it('should add budget annotation line when totalBudget > 0', () => {
    const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })

    const chart = wrapper.findComponent({ name: 'VueApexCharts' })
    const yAnnotations = chart.props('options').annotations?.yaxis ?? []
    const budgetAnno = yAnnotations.find((a: { y: number }) => a.y === 2500)
    expect(budgetAnno).toBeDefined()
    expect(budgetAnno.borderColor).toBe('#818cf8')
  })

  it('should not add annotation lines when values are 0', () => {
    const wrapper = mount(MonthlyExpensesChart, {
      props: {
        ...defaultProps,
        averageIncome: 0,
        totalBudget: 0,
      },
    })

    const chart = wrapper.findComponent({ name: 'VueApexCharts' })
    const yAnnotations = chart.props('options').annotations?.yaxis ?? []
    expect(yAnnotations).toHaveLength(0)
  })

  it('should add x-axis annotation for current month', () => {
    const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })

    const chart = wrapper.findComponent({ name: 'VueApexCharts' })
    const xAnnotations = chart.props('options').annotations?.xaxis ?? []
    expect(xAnnotations).toHaveLength(1)
    expect(xAnnotations[0].x).toBe('Avr')
    expect(xAnnotations[0].label.text).toBe('En cours')
  })

  it('should have a custom tooltip function', () => {
    const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })

    const chart = wrapper.findComponent({ name: 'VueApexCharts' })
    const tooltip = chart.props('options').tooltip
    expect(tooltip.custom).toBeTypeOf('function')
  })

  it('tooltip should include month name, amount, budget diff, and savings', () => {
    const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })

    const chart = wrapper.findComponent({ name: 'VueApexCharts' })
    const customFn = chart.props('options').tooltip.custom
    const html = customFn({ dataPointIndex: 0 }) as string

    // November 2025, val=2500, budget diff=0, savings=4200-2500=1700
    expect(html).toContain('Novembre 2025')
    expect(html).toContain('2500.00')
    expect(html).toContain('Depenses')
    expect(html).toContain('vs Budget')
    expect(html).toContain('Epargne')
  })

  it('tooltip should show "(en cours)" for current month', () => {
    const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })

    const chart = wrapper.findComponent({ name: 'VueApexCharts' })
    const customFn = chart.props('options').tooltip.custom
    // Index 5 = 2026-04 = current month
    const html = customFn({ dataPointIndex: 5 }) as string

    expect(html).toContain('Avril 2026')
    expect(html).toContain('en cours')
  })

  it('should display the legend with all items', () => {
    const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })

    expect(wrapper.text()).toContain('Depenses')
    expect(wrapper.text()).toContain('Mois en cours')
    expect(wrapper.text()).toContain('Revenus')
    expect(wrapper.text()).toContain('Budget')
  })

  it('should hide Revenus legend item when averageIncome is 0', () => {
    const wrapper = mount(MonthlyExpensesChart, {
      props: { ...defaultProps, averageIncome: 0 },
    })

    expect(wrapper.text()).not.toContain('Revenus')
  })

  it('should hide Budget legend item when totalBudget is 0', () => {
    const wrapper = mount(MonthlyExpensesChart, {
      props: { ...defaultProps, totalBudget: 0 },
    })

    expect(wrapper.text()).not.toContain('Budget')
  })
})
