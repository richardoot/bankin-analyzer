import { describe, it, expect, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import type { ApexOptions } from 'apexcharts'
import MonthlyBarChart from './MonthlyBarChart.vue'

// Mock vue3-apexcharts
vi.mock('vue3-apexcharts/core', () => ({
  default: {
    name: 'VueApexCharts',
    props: ['type', 'height', 'options', 'series'],
    template:
      '<div class="apexcharts-mock" :data-type="type" :data-height="height"></div>',
  },
}))

describe('MonthlyBarChart', () => {
  const defaultProps = {
    data: {
      labels: ['Jan 2024', 'Fév 2024', 'Mar 2024'],
      values: [1500, 1200, 1800],
    },
    title: 'Dépenses',
    color: '#ef4444',
  }

  it('should render the chart component', () => {
    const wrapper = mount(MonthlyBarChart, {
      props: defaultProps,
    })

    expect(wrapper.find('.apexcharts-mock').exists()).toBe(true)
  })

  it('should pass correct type to ApexCharts', () => {
    const wrapper = mount(MonthlyBarChart, {
      props: defaultProps,
    })

    expect(wrapper.find('.apexcharts-mock').attributes('data-type')).toBe('bar')
  })

  it('should pass correct height to ApexCharts', () => {
    const wrapper = mount(MonthlyBarChart, {
      props: defaultProps,
    })

    expect(wrapper.find('.apexcharts-mock').attributes('data-height')).toBe(
      '300'
    )
  })

  it('should accept different colors', () => {
    const wrapper = mount(MonthlyBarChart, {
      props: {
        ...defaultProps,
        color: '#22c55e',
      },
    })

    expect(wrapper.exists()).toBe(true)
  })

  it('should handle empty data', () => {
    const wrapper = mount(MonthlyBarChart, {
      props: {
        data: { labels: [], values: [] },
        title: 'Empty',
        color: '#ef4444',
      },
    })

    expect(wrapper.find('.apexcharts-mock').exists()).toBe(true)
  })

  describe('a bar as a way to its month', () => {
    const selection = (wrapper: ReturnType<typeof mount>) =>
      (
        wrapper.findComponent({ name: 'VueApexCharts' }).props('options') as {
          chart: {
            events?: {
              dataPointSelection: (
                e: unknown,
                c: unknown,
                config?: { dataPointIndex: number }
              ) => void
            }
          }
        }
      ).chart.events?.dataPointSelection

    it('emits the YYYY-MM behind the clicked bar when months are given', () => {
      const wrapper = mount(MonthlyBarChart, {
        props: { ...defaultProps, months: ['2024-01', '2024-02', '2024-03'] },
      })

      selection(wrapper)?.(null, null, { dataPointIndex: 2 })
      selection(wrapper)?.(null, null, { dataPointIndex: 7 })
      selection(wrapper)?.(null, null, undefined)

      expect(wrapper.emitted('select-month')).toEqual([['2024-03']])
      expect(wrapper.classes().join(' ')).toContain('cursor-pointer')
    })

    it('stays mute, and keeps the default cursor, without months', () => {
      const wrapper = mount(MonthlyBarChart, { props: defaultProps })

      expect(selection(wrapper)).toBeUndefined()
      expect(wrapper.classes().join(' ')).not.toContain('cursor-pointer')
    })
  })

  describe('the average line and the stacked overlay', () => {
    const apex = (wrapper: VueWrapper) =>
      wrapper.findComponent({ name: 'VueApexCharts' })
    const optionsOf = (wrapper: VueWrapper) =>
      apex(wrapper).props('options') as ApexOptions
    const seriesOf = (wrapper: VueWrapper) =>
      apex(wrapper).props('series') as { name: string; data: number[] }[]

    it('draws the plain chart, unchanged, without either', () => {
      const wrapper = mount(MonthlyBarChart, {
        props: {
          ...defaultProps,
          data: { ...defaultProps.data, values: [1500, -200, 1800] },
        },
      })
      const options = optionsOf(wrapper)

      expect(seriesOf(wrapper)).toEqual([
        { name: 'Dépenses', data: [1500, -200, 1800] },
      ])
      expect(options.chart?.stacked).toBeUndefined()
      expect(options.plotOptions?.bar?.distributed).toBe(true)
      expect(options.legend?.show).toBe(false)
      expect(options.colors).toEqual(['#ef4444', '#22c55e', '#ef4444'])
      expect(options.annotations).toBeUndefined()
      expect(options.fill).toBeUndefined()
      expect(options.tooltip?.shared).toBeUndefined()
    })

    it('draws the reference as a dashed y-axis line at its value', () => {
      const wrapper = mount(MonthlyBarChart, {
        props: { ...defaultProps, reference: 1500 },
      })
      const options = optionsOf(wrapper)
      const line = options.annotations?.yaxis?.[0]

      expect(options.annotations?.yaxis).toHaveLength(1)
      expect(line?.y).toBe(1500)
      expect(line?.strokeDashArray).toBeGreaterThan(0)
      expect(line?.label?.text).toBe('moyenne')
      // The bars themselves stay the plain chart's.
      expect(seriesOf(wrapper)).toHaveLength(1)
      expect(options.legend?.show).toBe(false)
    })

    it('stacks the overlay on the series, hatched, with a legend', () => {
      const wrapper = mount(MonthlyBarChart, {
        props: {
          ...defaultProps,
          months: ['2024-01', '2024-02', '2024-03'],
          overlay: { values: [0, 300, 0], label: 'événements' },
        },
      })
      const options = optionsOf(wrapper)

      expect(seriesOf(wrapper)).toEqual([
        { name: 'Dépenses', data: [1500, 1200, 1800] },
        { name: 'événements', data: [0, 300, 0] },
      ])
      expect(options.chart?.stacked).toBe(true)
      expect(options.plotOptions?.bar?.distributed).toBe(false)
      expect(options.colors).toEqual(['#ef4444', '#ef4444'])
      expect(options.fill?.type).toEqual(['solid', 'pattern'])
      // Apex's legend stays hidden: the component draws its own, with a
      // hatched marker for the overlay.
      expect(options.legend?.show).toBe(false)
      const legend = wrapper.find('[data-testid="chart-legend"]')
      expect(legend.text()).toContain('Dépenses')
      expect(legend.text()).toContain('événements')
      expect(
        wrapper.find('[data-testid="chart-legend-hatched"]').attributes('style')
      ).toContain('repeating-linear-gradient')
      // Still a way to the month, whichever series is clicked.
      const select = options.chart?.events?.dataPointSelection as (
        e: unknown,
        c: unknown,
        config: { seriesIndex: number; dataPointIndex: number }
      ) => void
      select(null, null, { seriesIndex: 1, dataPointIndex: 1 })
      expect(wrapper.emitted('select-month')).toEqual([['2024-02']])
    })

    it('reads the month whole in the tooltip, then the overlay’s part', () => {
      const wrapper = mount(MonthlyBarChart, {
        props: {
          ...defaultProps,
          overlay: { values: [0, 300, 0], label: 'événements' },
        },
      })
      const custom = optionsOf(wrapper).tooltip?.custom as (o: {
        dataPointIndex: number
      }) => string
      const norm = (text: string) => text.replace(/[\s\u202f\u00a0]+/g, ' ')

      const withEvents = norm(custom({ dataPointIndex: 1 }))
      expect(withEvents).toContain('Fév 2024')
      expect(withEvents).toContain('Dépenses: </span>')
      expect(withEvents).toContain('1 500,00 €')
      expect(withEvents).toContain('dont événements: </span>')
      expect(withEvents).toContain('300,00 €')

      // A month without any overlay says nothing about it.
      const without = norm(custom({ dataPointIndex: 0 }))
      expect(without).toContain('1 500,00 €')
      expect(without).not.toContain('dont')
    })

    it('does not draw the legend without an overlay', () => {
      const wrapper = mount(MonthlyBarChart, { props: defaultProps })
      expect(wrapper.find('[data-testid="chart-legend"]').exists()).toBe(false)
    })
  })
})
