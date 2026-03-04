import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MonthlyBarChart from './MonthlyBarChart.vue'

// Mock vue3-apexcharts
vi.mock('vue3-apexcharts', () => ({
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
})
