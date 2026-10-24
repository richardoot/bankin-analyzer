import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import MonthlyExpensesChart from './MonthlyExpensesChart.vue'
import { DATA_HUE, INCOME_LINE_COLOR, STATE_COLORS } from '@/lib/stateTints'
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
interface Point {
  x: string
  y: number
  fillColor: string
}
interface Series {
  name: string
  data: Point[]
}
function seriesOf(wrapper: Wrapper): Series[] {
  return chartOf(wrapper).props('series') as Series[]
}
function pointsOf(wrapper: Wrapper, index = 0): Point[] {
  return seriesOf(wrapper)[index]?.data ?? []
}
/** Each column's colour, carried by its point. */
function colorsOf(wrapper: Wrapper): string[] {
  return pointsOf(wrapper).map(p => p.fillColor)
}
/** The axis labels, as the formatter shows each point's month. */
function categoriesOf(wrapper: Wrapper): string[] {
  const format = chartOf(wrapper).props('options').xaxis.labels.formatter as (
    value: string
  ) => string
  return pointsOf(wrapper).map(p => format(p.x))
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
      expect(seriesOf(wrapper).map(s => s.name)).toEqual(['Dépenses'])
      expect(pointsOf(wrapper).map(p => p.y)).toEqual([1800, 2600, 2400])
      // Each point's x is its month: two Mays of two years stay apart.
      expect(pointsOf(wrapper).map(p => p.x)).toEqual([
        '2026-02',
        '2026-03',
        '2026-04',
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

  describe('with a comparison (tracking or editing)', () => {
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
    it('draws the income solid in green and the envelope dashed in amber, the labels in ink', () => {
      const wrapper = mount(MonthlyExpensesChart, { props: defaultProps })
      const lines = linesOf(wrapper)
      const income = lines.find(l => l.y === 4200)
      const envelope = lines.find(l => l.y === 2500)
      expect(INCOME_LINE_COLOR).toBe('#16a34a')
      expect(income?.borderColor).toBe(INCOME_LINE_COLOR)
      expect(income?.strokeDashArray).toBe(0)
      expect(income?.label.text).toContain('Revenus')
      expect(income?.label.style.color).toBe(INK)
      expect(envelope?.borderColor).toBe(STATE_COLORS.over)
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
      // In the colours of their lines.
      expect(
        both.get('[data-testid="legend-income-swatch"]').attributes('style')
      ).toMatch(/border-color: (#16a34a|rgb\(22, 163, 74\))/)
      const budget = both.get('[data-testid="legend-budget-swatch"]')
      expect(budget.attributes('style')).toMatch(
        /border-color: (#f59e0b|rgb\(245, 158, 11\))/
      )
      expect(budget.classes()).toContain('border-dashed')

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

  describe('the events, hatched in the real reading', () => {
    // March and April carry 600 € and 200 € of events; November, a
    // comparison month, 300 € that stay in its grey block.
    const exceptionalTotals = [300, 0, 0, 0, 600, 200, 0, 0]

    it('stacks each plan month’s events hatched on the rest of the month', () => {
      const wrapper = mount(MonthlyExpensesChart, {
        props: { ...withComparison, exceptionalTotals },
      })
      expect(seriesOf(wrapper).map(s => s.name)).toEqual([
        'Dépenses',
        'événements',
      ])
      // The rest and the events add up to the month.
      expect(pointsOf(wrapper, 0).map(p => p.y)).toEqual([
        2500, 2300, 2700, 1800, 2000, 2200,
      ])
      expect(pointsOf(wrapper, 1).map(p => p.y)).toEqual([0, 0, 0, 0, 600, 200])
      // The events in the same colour as their column.
      expect(pointsOf(wrapper, 1).map(p => p.fillColor)).toEqual(
        colorsOf(wrapper)
      )
      const options = chartOf(wrapper).props('options')
      expect(options.chart.stacked).toBe(true)
      expect(options.fill.type).toEqual(['solid', 'pattern'])
      expect(options.fill.pattern.style).toBe('slantedLines')
    })

    it('says « dont événements » in the tooltip and the legend', () => {
      const wrapper = mount(MonthlyExpensesChart, {
        props: { ...defaultProps, exceptionalTotals },
      })
      // March: 2 600 € of which 600 € of events.
      const march = tooltipOf(wrapper, 1)
      expect(march).toContain('Dépenses')
      expect(march).toContain('2600.00 €')
      expect(march).toContain('dont événements')
      expect(march).toContain('600.00 €')
      expect(tooltipOf(wrapper, 0)).not.toContain('dont événements')
      const legend = wrapper.get('[data-testid="legend-events"]')
      expect(legend.text()).toBe('dont événements')
      expect(
        legend.get('[data-testid="legend-events-swatch"]').attributes('style')
      ).toContain('repeating-linear-gradient')
    })

    it('draws one solid series without events to hatch', () => {
      for (const totals of [undefined, [0, 0, 0, 0, 0, 0, 0, 0]]) {
        const wrapper = mount(MonthlyExpensesChart, {
          props: { ...defaultProps, exceptionalTotals: totals },
        })
        expect(seriesOf(wrapper)).toHaveLength(1)
        expect(chartOf(wrapper).props('options').fill.type).toEqual(['solid'])
        expect(wrapper.find('[data-testid="legend-events"]').exists()).toBe(
          false
        )
      }
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
