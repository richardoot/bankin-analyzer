import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
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
})
