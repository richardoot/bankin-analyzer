import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CategoryPieChart from './CategoryPieChart.vue'

// Mock vue3-apexcharts
vi.mock('vue3-apexcharts', () => ({
  default: {
    name: 'VueApexCharts',
    props: ['type', 'height', 'options', 'series'],
    template:
      '<div class="apexcharts-mock" :data-type="type" :data-height="height"></div>',
  },
}))

describe('CategoryPieChart', () => {
  const defaultProps = {
    data: {
      labels: ['Alimentation', 'Transport', 'Loisirs'],
      values: [500, 200, 150],
    },
    title: 'Dépenses',
  }

  it('should render the chart component when data is available', () => {
    const wrapper = mount(CategoryPieChart, {
      props: defaultProps,
    })

    expect(wrapper.find('.apexcharts-mock').exists()).toBe(true)
  })

  it('should pass correct type to ApexCharts', () => {
    const wrapper = mount(CategoryPieChart, {
      props: defaultProps,
    })

    expect(wrapper.find('.apexcharts-mock').attributes('data-type')).toBe(
      'donut'
    )
  })

  it('should pass correct height to ApexCharts', () => {
    const wrapper = mount(CategoryPieChart, {
      props: defaultProps,
    })

    expect(wrapper.find('.apexcharts-mock').attributes('data-height')).toBe(
      '100%'
    )
  })

  it('should display empty message when no data', () => {
    const wrapper = mount(CategoryPieChart, {
      props: {
        data: { labels: [], values: [] },
        title: 'Empty',
      },
    })

    expect(wrapper.find('.apexcharts-mock').exists()).toBe(false)
    expect(wrapper.text()).toContain('Aucune donnée disponible')
  })

  it('should accept different props', () => {
    const wrapper = mount(CategoryPieChart, {
      props: {
        data: {
          labels: ['Salaires', 'Investissements'],
          values: [3000, 500],
        },
        title: 'Revenus',
      },
    })

    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.apexcharts-mock').exists()).toBe(true)
  })

  it('should handle single category', () => {
    const wrapper = mount(CategoryPieChart, {
      props: {
        data: {
          labels: ['Unique'],
          values: [1000],
        },
        title: 'Test',
      },
    })

    expect(wrapper.find('.apexcharts-mock').exists()).toBe(true)
  })

  it('should handle many categories', () => {
    const wrapper = mount(CategoryPieChart, {
      props: {
        data: {
          labels: Array.from({ length: 15 }, (_, i) => `Cat ${i + 1}`),
          values: Array.from({ length: 15 }, (_, i) => (i + 1) * 100),
        },
        title: 'Many Categories',
      },
    })

    expect(wrapper.find('.apexcharts-mock').exists()).toBe(true)
  })
})
