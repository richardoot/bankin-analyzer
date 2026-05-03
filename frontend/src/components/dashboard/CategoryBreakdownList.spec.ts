import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CategoryBreakdownList from './CategoryBreakdownList.vue'
import type { CategoryDataDto } from '@/lib/api'

vi.mock('vue3-apexcharts', () => ({
  default: {
    name: 'VueApexCharts',
    props: ['type', 'height', 'options', 'series'],
    template: '<div class="apexcharts-mock"></div>',
  },
}))

describe('CategoryBreakdownList', () => {
  const monthLabels = ['2024-01', '2024-02', '2024-03']

  const categories: CategoryDataDto[] = [
    {
      categoryId: 'cat-1',
      category: 'Alimentation',
      icon: '🍽️',
      amount: 600,
      averagePerMonth: 200,
      transactionCount: 12,
      monthlyAmounts: [200, 250, 150],
      subcategories: [
        {
          subcategory: 'Courses',
          amount: 400,
          transactionCount: 8,
          averagePerMonth: 133.33,
        },
        {
          subcategory: 'Restaurant',
          amount: 200,
          transactionCount: 4,
          averagePerMonth: 66.66,
        },
      ],
    },
    {
      categoryId: 'cat-2',
      category: 'Transport',
      amount: 300,
      averagePerMonth: 100,
      transactionCount: 5,
      monthlyAmounts: [100, 100, 100],
    },
  ]

  it('renders one row per category with name and average', () => {
    const wrapper = mount(CategoryBreakdownList, {
      props: { categories, monthLabels, total: 900 },
    })

    expect(wrapper.text()).toContain('Alimentation')
    expect(wrapper.text()).toContain('Transport')
    expect(wrapper.findAll('[data-testid^="category-row-"]')).toHaveLength(2)
  })

  it('shows the share of total as a percentage', () => {
    const wrapper = mount(CategoryBreakdownList, {
      props: { categories, monthLabels, total: 900 },
    })

    // Alimentation: 600/900 = 66.7%
    expect(wrapper.text()).toContain('66.7%')
    // Transport: 300/900 = 33.3%
    expect(wrapper.text()).toContain('33.3%')
  })

  it('does not show drill-down content until a row is clicked', () => {
    const wrapper = mount(CategoryBreakdownList, {
      props: { categories, monthLabels, total: 900 },
    })

    expect(wrapper.text()).not.toContain('Sous-catégories')
    expect(wrapper.text()).not.toContain('Courses')
  })

  it('expands inline showing subcategories and chart on row click', async () => {
    const wrapper = mount(CategoryBreakdownList, {
      props: { categories, monthLabels, total: 900 },
    })

    await wrapper
      .find('[data-testid="category-row-Alimentation"]')
      .trigger('click')

    expect(wrapper.text()).toContain('Sous-catégories')
    expect(wrapper.text()).toContain('Courses')
    expect(wrapper.text()).toContain('Restaurant')
    expect(wrapper.text()).toContain('Évolution mensuelle')
    expect(wrapper.find('.apexcharts-mock').exists()).toBe(true)
  })

  it('toggles drill-down off when the same row is clicked again', async () => {
    const wrapper = mount(CategoryBreakdownList, {
      props: { categories, monthLabels, total: 900 },
    })

    const row = wrapper.find('[data-testid="category-row-Alimentation"]')
    await row.trigger('click')
    expect(wrapper.text()).toContain('Sous-catégories')

    await row.trigger('click')
    expect(wrapper.text()).not.toContain('Sous-catégories')
  })

  it('renders an empty state when no categories', () => {
    const wrapper = mount(CategoryBreakdownList, {
      props: { categories: [], monthLabels, total: 0 },
    })

    expect(wrapper.text()).toContain('Aucune catégorie')
  })
})
