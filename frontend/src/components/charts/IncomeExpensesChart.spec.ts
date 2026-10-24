import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ApexOptions } from 'apexcharts'
import IncomeExpensesChart, {
  type IncomeExpensesMonth,
} from './IncomeExpensesChart.vue'

vi.mock('vue3-apexcharts/core', () => ({
  default: {
    name: 'VueApexCharts',
    props: ['type', 'height', 'options', 'series'],
    template: '<div class="apexcharts-mock" :data-type="type"></div>',
  },
}))

const months: IncomeExpensesMonth[] = [
  {
    month: '2026-08',
    label: 'Août 2026',
    netExpenses: 2400,
    exceptionalExpenses: 500,
    everydayNetExpenses: 1900,
    income: 2500,
  },
  {
    month: '2026-09',
    label: 'Sept. 2026',
    netExpenses: 2000,
    exceptionalExpenses: 0,
    everydayNetExpenses: 2000,
    income: 2600,
  },
  {
    month: '2026-10',
    label: 'Oct. 2026',
    netExpenses: 900,
    exceptionalExpenses: 0,
    everydayNetExpenses: 1000,
    income: 0,
  },
]

interface Point {
  x: string
  y: number
  fillColor?: string
}
interface Series {
  name: string
  type: string
  data: Point[]
}

function mountChart(
  overrides: Partial<InstanceType<typeof IncomeExpensesChart>['$props']> = {}
) {
  const wrapper = mount(IncomeExpensesChart, {
    props: {
      months,
      reading: 'real',
      habit: 1950,
      currentMonth: '2026-10',
      ...overrides,
    },
  })
  const apex = wrapper.findComponent({ name: 'VueApexCharts' })
  return {
    wrapper,
    series: () => apex.props('series') as Series[],
    options: () => apex.props('options') as ApexOptions,
  }
}

describe('IncomeExpensesChart', () => {
  it('stacks the events, hatched, on the rest of each month, under the income line', () => {
    const { series, options, wrapper } = mountChart()

    expect(series().map(s => [s.name, s.type])).toEqual([
      ['Dépenses', 'bar'],
      ['événements', 'bar'],
      ['Revenus', 'line'],
    ])
    // net − events, so the stack adds up to the month's real total.
    expect(series()[0]?.data.map(p => p.y)).toEqual([1900, 2000, 900])
    expect(series()[1]?.data.map(p => p.y)).toEqual([500, 0, 0])
    expect(series()[2]?.data.map(p => p.y)).toEqual([2500, 2600, 0])

    expect(options().chart?.stacked).toBe(true)
    expect(options().fill?.type).toEqual(['solid', 'pattern', 'solid'])
    // One data hue for the columns; the line in the text's ink.
    const colors = options().colors as string[]
    expect(colors[0]).toBe('#60a5fa')
    expect(colors[1]).toBe('#60a5fa')
    expect(colors[2]).toBe('#111827')
    expect(wrapper.find('[data-testid="chart-legend-hatched"]').exists()).toBe(
      true
    )
    expect(wrapper.get('[data-testid="chart-legend"]').text()).toContain(
      'événements'
    )
  })

  it('draws one solid series when the period carries no event', () => {
    const quiet = months.map(m => ({ ...m, exceptionalExpenses: 0 }))
    const { series, options, wrapper } = mountChart({ months: quiet })

    expect(series().map(s => [s.name, s.type])).toEqual([
      ['Dépenses', 'bar'],
      ['Revenus', 'line'],
    ])
    expect(series()[0]?.data.map(p => p.y)).toEqual([2400, 2000, 900])
    expect(options().fill?.type).toEqual(['solid', 'solid'])
    expect(wrapper.find('[data-testid="chart-legend-hatched"]').exists()).toBe(
      false
    )
  })

  it('reads « Vie courante » as one solid series: the events are out of it', () => {
    const { series, options, wrapper } = mountChart({ reading: 'everyday' })

    expect(series().map(s => [s.name, s.type])).toEqual([
      ['Vie courante', 'bar'],
      ['Revenus', 'line'],
    ])
    expect(series()[0]?.data.map(p => p.y)).toEqual([1900, 2000, 1000])
    expect(options().fill?.type).toEqual(['solid', 'solid'])
    expect(wrapper.find('[data-testid="chart-legend-hatched"]').exists()).toBe(
      false
    )
    expect(wrapper.get('[data-testid="chart-legend"]').text()).toContain(
      'Vie courante'
    )
  })

  it('dashes the habit across, and draws nothing without one', () => {
    const { options, wrapper } = mountChart()
    const [habit] = options().annotations?.yaxis ?? []
    expect(habit?.y).toBe(1950)
    expect(habit?.strokeDashArray).toBe(4)
    expect(habit?.label?.text).toBe('habitude')
    expect(wrapper.find('[data-testid="chart-legend-habit"]').exists()).toBe(
      true
    )

    const none = mountChart({ habit: null })
    expect(none.options().annotations?.yaxis).toEqual([])
    expect(
      none.wrapper.find('[data-testid="chart-legend-habit"]').exists()
    ).toBe(false)
  })

  it('draws the current month lighter, the closed ones in the full hue', () => {
    const { series, wrapper } = mountChart()
    const [rest, events] = series()
    expect(rest?.data[2]?.fillColor).toMatch(/rgba\(96, 165, 250, 0\.\d+\)/)
    expect(events?.data[2]?.fillColor).toBe(rest?.data[2]?.fillColor)
    expect(rest?.data[0]?.fillColor).toBeUndefined()
    expect(wrapper.find('[data-testid="chart-legend-current"]').exists()).toBe(
      true
    )

    const past = mountChart({ currentMonth: '2026-11' })
    expect(past.series()[0]?.data.every(p => !p.fillColor)).toBe(true)
  })

  it('opens the month a column stands for', () => {
    const { options, wrapper } = mountChart()
    const select = options().chart?.events?.dataPointSelection as (
      e: unknown,
      c: unknown,
      config: { dataPointIndex: number }
    ) => void
    select(null, null, { dataPointIndex: 1 })
    expect(wrapper.emitted('select-month')).toEqual([['2026-09']])
    select(null, null, { dataPointIndex: 7 })
    expect(wrapper.emitted('select-month')).toHaveLength(1)
  })

  it('says each month in its tooltip, the events only when there are some', () => {
    const { options } = mountChart()
    const custom = options().tooltip?.custom as (o: {
      dataPointIndex: number
    }) => string
    const norm = (html: string) =>
      html.replace(/<[^>]+>/g, ' ').replace(/[\s\u202f\u00a0]+/g, ' ')

    const august = norm(custom({ dataPointIndex: 0 }))
    expect(august).toContain('Août 2026')
    expect(august).toContain('Dépenses: 2 400,00 €')
    expect(august).toContain('dont événements: 500,00 €')
    expect(august).toContain('Revenus: 2 500,00 €')

    const september = norm(custom({ dataPointIndex: 1 }))
    expect(september).not.toContain('événements')

    const everyday = mountChart({ reading: 'everyday' })
    const everydayCustom = everyday.options().tooltip?.custom as (o: {
      dataPointIndex: number
    }) => string
    const augustEveryday = norm(everydayCustom({ dataPointIndex: 0 }))
    expect(augustEveryday).toContain('Vie courante: 1 900,00 €')
    expect(augustEveryday).not.toContain('événements')
    expect(norm(custom({ dataPointIndex: 2 }))).toContain(
      'Oct. 2026 · en cours'
    )
  })
})
