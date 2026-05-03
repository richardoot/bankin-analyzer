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

  describe('Top N + Autres grouping', () => {
    function getApexProps(wrapper: ReturnType<typeof mount>) {
      const cmp = wrapper.findComponent({ name: 'VueApexCharts' })
      return {
        labels: cmp.props('options').labels as string[],
        series: cmp.props('series') as number[],
        colors: cmp.props('options').colors as string[],
      }
    }

    it('keeps all categories when count <= topN (default 7)', () => {
      const wrapper = mount(CategoryPieChart, {
        props: {
          data: {
            labels: ['A', 'B', 'C'],
            values: [300, 200, 100],
          },
          title: 'Few',
        },
      })
      const { labels, series } = getApexProps(wrapper)
      expect(labels).toEqual(['A', 'B', 'C'])
      expect(series).toEqual([300, 200, 100])
    })

    it('groups categories beyond topN into a single Autres slice', () => {
      const wrapper = mount(CategoryPieChart, {
        props: {
          data: {
            labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
            values: [100, 90, 80, 70, 60, 50, 40, 30, 20, 10],
          },
          title: 'Many',
        },
      })
      const { labels, series } = getApexProps(wrapper)
      // 7 individual + 1 "Autres (3)" containing H+I+J = 60
      expect(labels).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'Autres (3)'])
      expect(series).toEqual([100, 90, 80, 70, 60, 50, 40, 60])
    })

    it('sorts by value before picking the top N', () => {
      const wrapper = mount(CategoryPieChart, {
        props: {
          // unsorted on purpose
          data: {
            labels: ['Tiny', 'Big', 'Mid'],
            values: [10, 500, 50],
          },
          title: 'Sorted',
          topN: 2,
        },
      })
      const { labels, series } = getApexProps(wrapper)
      expect(labels).toEqual(['Big', 'Mid', 'Autres (1)'])
      expect(series).toEqual([500, 50, 10])
    })

    it('respects a custom topN', () => {
      const wrapper = mount(CategoryPieChart, {
        props: {
          data: {
            labels: ['A', 'B', 'C', 'D', 'E'],
            values: [50, 40, 30, 20, 10],
          },
          title: 'Custom',
          topN: 3,
        },
      })
      const { labels, series } = getApexProps(wrapper)
      expect(labels).toEqual(['A', 'B', 'C', 'Autres (2)'])
      expect(series).toEqual([50, 40, 30, 30])
    })

    it('disables grouping when topN is 0', () => {
      const wrapper = mount(CategoryPieChart, {
        props: {
          data: {
            labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
            values: [9, 8, 7, 6, 5, 4, 3, 2, 1],
          },
          title: 'Disabled',
          topN: 0,
        },
      })
      const { labels } = getApexProps(wrapper)
      expect(labels).toHaveLength(9)
      expect(labels).not.toContain('Autres (1)')
    })

    it('uses a neutral color for the Autres slice', () => {
      const wrapper = mount(CategoryPieChart, {
        props: {
          data: {
            labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
            values: [80, 70, 60, 50, 40, 30, 20, 10],
          },
          title: 'Color',
        },
      })
      const { colors } = getApexProps(wrapper)
      // Last color is the gray for Autres
      expect(colors[colors.length - 1]).toBe('#9ca3af')
    })
  })
})
