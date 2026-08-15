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
  describe('everyday vs real mode', () => {
    /** formatCurrency uses narrow no-break spaces; normalise before matching. */
    const norm = (text: string) => text.replace(/[\s\u202f\u00a0]+/g, ' ')

    const mixed: CategoryDataDto[] = [
      {
        categoryId: 'cat-travel',
        category: 'Voyages',
        amount: 1000,
        averagePerMonth: 333.33,
        transactionCount: 4,
        monthlyAmounts: [0, 1000, 0],
        exceptionalAmount: 600,
        everydayAmount: 400,
        everydayAveragePerMonth: 133.33,
        everydayMonthlyAmounts: [0, 400, 0],
      },
      {
        categoryId: 'cat-rent',
        category: 'Logement',
        amount: 2400,
        averagePerMonth: 800,
        transactionCount: 3,
        monthlyAmounts: [800, 800, 800],
        exceptionalAmount: 0,
        everydayAmount: 2400,
        everydayAveragePerMonth: 800,
        everydayMonthlyAmounts: [800, 800, 800],
      },
    ]

    it('shows the real average by default', () => {
      const wrapper = mount(CategoryBreakdownList, {
        props: { categories: mixed, monthLabels, total: 3400 },
      })

      const travelRow = wrapper.get('[data-testid="category-row-Voyages"]')
      expect(norm(travelRow.text())).toContain('333,33 € /mois')
      expect(norm(travelRow.text())).toContain('Total : 1 000,00 €')
      expect(norm(travelRow.text())).toContain('dont 600,00 € exceptionnel')
    })

    it('shows the everyday average in everyday mode', () => {
      const wrapper = mount(CategoryBreakdownList, {
        props: {
          categories: mixed,
          monthLabels,
          total: 2800,
          mode: 'everyday',
        },
      })

      const travelRow = wrapper.get('[data-testid="category-row-Voyages"]')
      expect(norm(travelRow.text())).toContain('133,33 € /mois')
      expect(norm(travelRow.text())).toContain('Total : 400,00 €')
      expect(norm(travelRow.text())).toContain('hors 600,00 € exceptionnel')
    })

    it('leaves the amounts of an event-free category unchanged between modes', () => {
      // The regression the user hit: switching mode moved every category.
      // Only the share-of-total may differ, since the total itself changes.
      const amountsOf = (text: string) => norm(text).replace(/\d+\.\d%/, '')

      const real = mount(CategoryBreakdownList, {
        props: { categories: mixed, monthLabels, total: 3400 },
      })
        .get('[data-testid="category-row-Logement"]')
        .text()

      const everyday = mount(CategoryBreakdownList, {
        props: {
          categories: mixed,
          monthLabels,
          total: 2800,
          mode: 'everyday',
        },
      })
        .get('[data-testid="category-row-Logement"]')
        .text()

      expect(amountsOf(everyday)).toBe(amountsOf(real))
      expect(amountsOf(real)).toContain('800,00 € /mois')
      expect(amountsOf(real)).toContain('Total : 2 400,00 €')
    })

    it('labels the exceptional share "dont" in real mode and "hors" in everyday mode', () => {
      const real = mount(CategoryBreakdownList, {
        props: { categories: mixed, monthLabels, total: 3400 },
      })
      expect(real.get('[data-testid="category-row-Voyages"]').text()).toContain(
        'dont'
      )

      const everyday = mount(CategoryBreakdownList, {
        props: {
          categories: mixed,
          monthLabels,
          total: 2800,
          mode: 'everyday',
        },
      })
      expect(
        everyday.get('[data-testid="category-row-Voyages"]').text()
      ).toContain('hors')
    })

    it('hides the exceptional line when the category carries none', () => {
      const wrapper = mount(CategoryBreakdownList, {
        props: { categories: mixed, monthLabels, total: 3400 },
      })

      expect(
        wrapper.get('[data-testid="category-row-Logement"]').text()
      ).not.toContain('exceptionnel')
    })

    it('computes the share against the total of the active mode', () => {
      // 400 everyday out of a 2800 everyday total = 14.3 %, not 1000/3400.
      const wrapper = mount(CategoryBreakdownList, {
        props: {
          categories: mixed,
          monthLabels,
          total: 2800,
          mode: 'everyday',
        },
      })

      expect(
        wrapper.get('[data-testid="category-row-Voyages"]').text()
      ).toContain('14.3%')
    })

    it('falls back to the real figures when the everyday ones are absent', () => {
      const legacy: CategoryDataDto[] = [
        {
          categoryId: 'cat-1',
          category: 'Alimentation',
          amount: 600,
          averagePerMonth: 200,
          monthlyAmounts: [200, 250, 150],
        },
      ]

      const wrapper = mount(CategoryBreakdownList, {
        props: {
          categories: legacy,
          monthLabels,
          total: 600,
          mode: 'everyday',
        },
      })

      expect(
        norm(wrapper.get('[data-testid="category-row-Alimentation"]').text())
      ).toContain('200,00 € /mois')
    })
  })
})
