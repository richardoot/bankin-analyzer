import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import MonthlyExpensesChart from './MonthlyExpensesChart.vue'
import { DATA_HUE } from '@/lib/stateTints'
import { budgetChartMonths } from '@/lib/budgetChartMonths'

// Mock vue3-apexcharts — capture options and series for assertions
vi.mock('vue3-apexcharts/core', () => ({
  default: {
    name: 'VueApexCharts',
    props: ['type', 'height', 'options', 'series'],
    template:
      '<div class="apexcharts-mock" :data-type="type" :data-height="height"></div>',
  },
}))

vi.mock('@/composables/useChartTheme', () => ({
  useChartTheme: () => ({
    isDark: { value: false },
    labelColor: { value: '#6b7280' },
    chartTheme: { value: { grid: { borderColor: '#e5e7eb' } } },
    chartAnimations: { value: { enabled: false } },
    donutValueColor: { value: '#111827' },
  }),
}))

vi.mock('@/lib/formatters', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/formatters')>()),
  formatCurrency: (v: number) => `${v.toFixed(2)} €`,
}))

const MOCK_NOW = new Date('2026-04-15T12:00:00Z')
const INK = '#111827'
const CURRENT = 'rgba(96, 165, 250, 0.4)'
const COMPARISON = '#d1d5db'

type Wrapper = ReturnType<typeof mount>

function chartOf(wrapper: Wrapper) {
  return wrapper.findComponent({ name: 'VueApexCharts' })
}
function colorsOf(wrapper: Wrapper): string[] {
  return chartOf(wrapper).props('options').colors as string[]
}
function categoriesOf(wrapper: Wrapper): string[] {
  return chartOf(wrapper).props('options').xaxis.categories as string[]
}
interface Line {
  y: number
  borderColor: string
  strokeDashArray: number
  label: { text: string; style: { color: string } }
}
function linesOf(wrapper: Wrapper): Line[] {
  return (chartOf(wrapper).props('options').annotations?.yaxis ?? []) as Line[]
}
function tooltipOf(wrapper: Wrapper, index: number): string {
  const custom = chartOf(wrapper).props('options').tooltip.custom as (arg: {
    dataPointIndex: number
  }) => string
  return custom({ dataPointIndex: index })
}

describe('MonthlyExpensesChart', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(MOCK_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Nov 2025 → Jun 2026; the plan is Feb → Jun, today is April.
  const monthLabels = [
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
  ]
  const defaultProps = {
    monthlyTotals: [2500, 2300, 2700, 1800, 2600, 2400, 0, 0],
    monthLabels,
    averageIncome: 4200,
    totalBudget: 2500,
    planStartMonth: '2026-02',
    planEndMonth: '2026-06',
  }
  const withComparison = {
    ...defaultProps,
    comparisonStartMonth: '2025-11',
    comparisonEndMonth: '2026-01',
  }

  it('draws a bar chart', () => {
    const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })
    expect(wrapper.find('.apexcharts-mock').attributes('data-type')).toBe('bar')
  })

  describe('without a comparison (following the plan)', () => {
    it('draws the plan’s started months only', () => {
      const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })
      expect(categoriesOf(wrapper)).toEqual(['Févr.', 'Mars', 'Avr.'])
      expect(chartOf(wrapper).props('series')).toEqual([
        { name: 'Dépenses', data: [1800, 2600, 2400] },
      ])
    })

    it('paints them in the data hue, the current month lighter', () => {
      const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })
      expect(colorsOf(wrapper)).toEqual([DATA_HUE, DATA_HUE, CURRENT])
    })

    it('names in the legend only what is drawn', () => {
      const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })
      expect(
        wrapper.find('[data-testid="legend-comparison-swatch"]').exists()
      ).toBe(false)
      expect(wrapper.find('[data-testid="legend-current"]').exists()).toBe(true)
      expect(wrapper.text()).not.toContain('comparaison')
    })

    it('leaves the current month out of the legend on a closed plan', () => {
      const wrapper = mount(MonthlyExpensesChart, {
        props: { ...defaultProps, currentMonth: '2026-08' },
      })
      expect(wrapper.find('[data-testid="legend-current"]').exists()).toBe(
        false
      )
      expect(new Set(colorsOf(wrapper))).toEqual(new Set([DATA_HUE]))
    })

    it('draws nothing under two months', () => {
      const wrapper = mount(MonthlyExpensesChart, {
        props: { ...defaultProps, currentMonth: '2026-02' },
      })
      expect(wrapper.find('.apexcharts-mock').exists()).toBe(false)
    })

    it('opens the month of the bar clicked, not of the raw index', () => {
      const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })
      const events = chartOf(wrapper).props('options').chart.events as {
        dataPointSelection: (
          e: unknown,
          c: unknown,
          config: { dataPointIndex: number }
        ) => void
      }
      events.dataPointSelection(null, null, { dataPointIndex: 1 })
      expect(wrapper.emitted('select-month')).toEqual([['2026-03']])
    })
  })

  describe('with a comparison (editing)', () => {
    it('adds the comparison months in light grey before the plan', () => {
      const wrapper = mount(MonthlyExpensesChart, { props: withComparison })
      expect(categoriesOf(wrapper)).toEqual([
        'Nov.',
        'Déc.',
        'Janv.',
        'Févr.',
        'Mars',
        'Avr.',
      ])
      expect(colorsOf(wrapper)).toEqual([
        COMPARISON,
        COMPARISON,
        COMPARISON,
        DATA_HUE,
        DATA_HUE,
        CURRENT,
      ])
    })

    it('names the comparison in the legend, in the grey of its bars', () => {
      const wrapper = mount(MonthlyExpensesChart, { props: withComparison })
      const swatch = wrapper.get('[data-testid="legend-comparison-swatch"]')
      expect(swatch.attributes('style')).toContain('background-color')
      expect(wrapper.text()).toContain('comparaison')
    })

    it('leaves out the months between the comparison and the plan', () => {
      const wrapper = mount(MonthlyExpensesChart, {
        props: {
          ...defaultProps,
          comparisonStartMonth: '2025-11',
          comparisonEndMonth: '2025-12',
        },
      })
      expect(categoriesOf(wrapper)).not.toContain('Janv.')
    })

    it('says « comparaison » in a comparison month’s tooltip', () => {
      const wrapper = mount(MonthlyExpensesChart, { props: withComparison })
      expect(tooltipOf(wrapper, 0)).toContain('Novembre 2025 · comparaison')
    })
  })

  describe('the two reference lines', () => {
    it('draws the envelope dashed and the income solid, both in ink', () => {
      const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })
      const lines = linesOf(wrapper)
      const income = lines.find(l => l.y === 4200)
      const envelope = lines.find(l => l.y === 2500)
      expect(income?.borderColor).toBe(INK)
      expect(income?.strokeDashArray).toBe(0)
      expect(income?.label.text).toContain('Revenus')
      expect(envelope?.borderColor).toBe(INK)
      expect(envelope?.strokeDashArray).toBe(4)
      expect(envelope?.label.text).toContain('Enveloppe')
      expect(envelope?.label.style.color).toBe(INK)
    })

    it('shows each in the legend only when drawn', () => {
      const both = mount(MonthlyExpensesChart, { props: defaultProps })
      expect(both.find('[data-testid="legend-income-swatch"]').exists()).toBe(
        true
      )
      expect(both.find('[data-testid="legend-budget-swatch"]').exists()).toBe(
        true
      )

      const none = mount(MonthlyExpensesChart, {
        props: { ...defaultProps, averageIncome: 0, totalBudget: 0 },
      })
      expect(linesOf(none)).toHaveLength(0)
      expect(none.find('[data-testid="legend-income-swatch"]').exists()).toBe(
        false
      )
      expect(none.find('[data-testid="legend-budget-swatch"]').exists()).toBe(
        false
      )
    })
  })

  describe('the tooltip', () => {
    it('says the gap to the envelope in words, without a colour', () => {
      const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })
      // March: 2 600 € on a 2 500 € envelope.
      const over = tooltipOf(wrapper, 1)
      expect(over).toContain('Mars 2026')
      expect(over).toContain('2600.00 €')
      expect(over).toContain('100.00 € au-dessus de l’enveloppe')
      expect(over).toContain('Épargne')
      expect(over).not.toMatch(/color:/)
      // February: 1 800 €.
      expect(tooltipOf(wrapper, 0)).toContain('700.00 € sous l’enveloppe')
    })

    it('marks the current month', () => {
      const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })
      expect(tooltipOf(wrapper, 2)).toContain('Avril 2026 · en cours')
    })
  })

  it('keeps every month without a plan range', () => {
    expect(
      budgetChartMonths(['2026-01', '2026-02', '2026-03'], {
        currentMonth: '2026-02',
      }).map(m => m.ym)
    ).toEqual(['2026-01', '2026-02'])
  })
})
