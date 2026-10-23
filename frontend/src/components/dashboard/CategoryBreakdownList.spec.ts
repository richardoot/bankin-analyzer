import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import CategoryBreakdownList from './CategoryBreakdownList.vue'
import type { CategoryDataDto } from '@/lib/api'

// The rows link to the Transactions page: RouterLink needs a router.
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/transactions', component: { template: '<div />' } },
  ],
})

vi.mock('vue3-apexcharts/core', () => ({
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
          subcategoryId: 'sub-courses',
          subcategory: 'Courses',
          amount: 400,
          transactionCount: 8,
          averagePerMonth: 133.33,
        },
        {
          subcategoryId: null,
          subcategory: '',
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
      global: { plugins: [router] },
      props: { categories, monthLabels, total: 900 },
    })

    expect(wrapper.text()).toContain('Alimentation')
    expect(wrapper.text()).toContain('Transport')
    expect(wrapper.findAll('[data-testid^="category-row-"]')).toHaveLength(2)
  })

  /** formatCurrency uses narrow no-break spaces; normalise before matching. */
  const norm = (text: string) => text.replace(/[\s\u202f\u00a0]+/g, ' ')

  /** The `width` a bar part carries, as a number of %. */
  const widthOf = (style: string | undefined) =>
    Number(/width:\s*([\d.]+)%/.exec(style ?? '')?.[1])

  it('writes the share of total at the end of the bar, and in its name', () => {
    const wrapper = mount(CategoryBreakdownList, {
      global: { plugins: [router] },
      props: { categories, monthLabels, total: 900 },
    })

    // Alimentation: 600/900 = 66,7 %; Transport: 300/900 = 33,3 %.
    const food = wrapper.get('[data-testid="category-share-Alimentation"]')
    expect(food.attributes('role')).toBe('img')
    expect(norm(food.attributes('aria-label') ?? '')).toBe(
      '66,7 % des dépenses'
    )
    expect(food.attributes('title')).toBe(food.attributes('aria-label'))
    expect(
      norm(
        wrapper
          .get('[data-testid="category-share-Transport"]')
          .attributes('aria-label') ?? ''
      )
    ).toContain('33,3 %')
    // Written at the end of the bar, in the row's text.
    expect(
      norm(
        wrapper.get('[data-testid="category-share-pct-Alimentation"]').text()
      )
    ).toBe('66,7 %')
    expect(
      norm(wrapper.get('[data-testid="category-share-pct-Transport"]').text())
    ).toBe('33,3 %')
  })

  it('measures every bar against the total, the bars adding up to one track', () => {
    const wrapper = mount(CategoryBreakdownList, {
      global: { plugins: [router] },
      props: { categories, monthLabels, total: 900 },
    })

    const fill = (name: string) =>
      widthOf(
        wrapper
          .get(`[data-testid="category-share-fill-${name}"]`)
          .attributes('style')
      )
    // The largest category is its share, not a full track.
    expect(fill('Alimentation')).toBeCloseTo(66.67, 1)
    expect(fill('Transport')).toBeCloseTo(33.33, 1)
    expect(fill('Alimentation') + fill('Transport')).toBeCloseTo(100, 1)
  })

  it('keeps a sliver of bar for a tiny share, none for an empty one', () => {
    const wrapper = mount(CategoryBreakdownList, {
      global: { plugins: [router] },
      props: {
        categories: [
          { categoryId: 'cat-1', category: 'Alimentation', amount: 999 },
          { categoryId: 'cat-2', category: 'Timbres', amount: 1 },
          { categoryId: 'cat-3', category: 'Vide', amount: 0 },
        ],
        monthLabels,
        total: 1000,
      },
    })
    const style = (name: string) =>
      wrapper
        .get(`[data-testid="category-share-fill-${name}"]`)
        .attributes('style')
    expect(widthOf(style('Timbres'))).toBeCloseTo(0.1, 5)
    expect(style('Timbres')).toContain('min-width: 3px')
    expect(style('Vide')).not.toContain('min-width')
  })

  it('draws every bar in the one blue, with no color dot by the name', () => {
    const wrapper = mount(CategoryBreakdownList, {
      global: { plugins: [router] },
      props: { categories, monthLabels, total: 900 },
    })
    for (const name of ['Alimentation', 'Transport']) {
      expect(
        wrapper
          .get(`[data-testid="category-share-fill-${name}"]`)
          .attributes('style')
      ).toContain('background-color: #60a5fa')
    }
    expect(wrapper.find('[data-testid^="category-color-"]').exists()).toBe(
      false
    )
    // The emoji stays: it names the category.
    expect(
      wrapper.get('[data-testid="category-row-Alimentation"]').text()
    ).toContain('🍽️')
  })

  it('heads the columns once, and draws the trend from zero against the average', () => {
    const wrapper = mount(CategoryBreakdownList, {
      global: { plugins: [router] },
      props: { categories, monthLabels, total: 900 },
    })

    const header = norm(
      wrapper.get('[data-testid="category-table-header"]').text()
    )
    expect(header).toContain('Catégorie')
    expect(header).toContain('Part des dépenses · sur 900 €')
    expect(header).toContain('Tendance · 3 mois')
    expect(header).toContain('pointillé : moyenne')
    expect(header).toContain('Moyenne par mois')
    // The chart sits centered in its column, under its short title.
    expect(
      wrapper.get('[data-testid="category-trend-Alimentation"]').classes()
    ).toContain('sm:justify-center')

    const sparkline = wrapper.findAllComponents({ name: 'SparklineChart' })[0]
    expect(sparkline?.props('baseline')).toBe('zero')
    expect(sparkline?.props('reference')).toBe(200)
    expect(sparkline?.props('width')).toBe(130)
    expect(norm(String(sparkline?.props('label')))).toContain(
      'Alimentation sur 3 mois'
    )
    // A neutral line, not the red of an overrun.
    expect(sparkline?.props('color')).toBe('#6b7280')
  })

  it('shows the amount alone, with no trend column, over a single month', () => {
    const wrapper = mount(CategoryBreakdownList, {
      global: { plugins: [router] },
      props: {
        categories: [
          { categoryId: 'cat-1', category: 'Alimentation', amount: 120 },
        ],
        monthLabels: ['2024-01'],
        total: 120,
      },
    })

    const header = wrapper.get('[data-testid="category-table-header"]').text()
    expect(header).not.toContain('Tendance')
    expect(header).toContain('Montant')
    const figure = norm(
      wrapper.get('[data-testid="category-average-Alimentation"]').text()
    )
    expect(figure).toBe('120,00 €')
  })

  it('does not show drill-down content until a row is clicked', () => {
    const wrapper = mount(CategoryBreakdownList, {
      global: { plugins: [router] },
      props: { categories, monthLabels, total: 900 },
    })

    expect(wrapper.text()).not.toContain('Sous-catégories')
    expect(wrapper.text()).not.toContain('Courses')
  })

  it('expands inline showing subcategories and chart on row click', async () => {
    const wrapper = mount(CategoryBreakdownList, {
      global: { plugins: [router] },
      props: { categories, monthLabels, total: 900 },
    })

    await wrapper
      .find('[data-testid="category-row-Alimentation"]')
      .trigger('click')

    expect(wrapper.text()).toContain('Sous-catégories')
    expect(wrapper.text()).toContain('Courses')
    expect(wrapper.text()).toContain('(sans sous-catégorie)')
    expect(wrapper.text()).toContain('Évolution mensuelle')
    expect(wrapper.find('.apexcharts-mock').exists()).toBe(true)
  })

  it('gives each subcategory its share of the category, the shares making one whole', async () => {
    const wrapper = mount(CategoryBreakdownList, {
      global: { plugins: [router] },
      props: { categories, monthLabels, total: 900 },
    })
    await wrapper
      .find('[data-testid="category-row-Alimentation"]')
      .trigger('click')

    expect(norm(wrapper.text())).toContain(
      'Sous-catégories · part de la catégorie'
    )
    const shares = wrapper.findAll(
      '[data-testid^="subcategory-share-Alimentation-"]'
    )
    expect(shares).toHaveLength(2)
    const widths = shares.map(share =>
      widthOf(share.get('span').attributes('style'))
    )
    // Courses: 400 of 600; the unfiled: 200 of 600.
    expect(widths[0]).toBeCloseTo(66.67, 1)
    expect(widths[1]).toBeCloseTo(33.33, 1)
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1)
    expect(shares[0]?.get('span').attributes('style')).toContain(
      'background-color: #60a5fa'
    )
    expect(
      norm(
        wrapper
          .get('[data-testid="subcategory-share-pct-Alimentation-Courses"]')
          .text()
      )
    ).toBe('66,7 %')
    expect(
      norm(
        wrapper
          .get('[data-testid="subcategory-share-pct-Alimentation-none"]')
          .text()
      )
    ).toBe('33,3 %')
    expect(norm(shares[0]?.attributes('aria-label') ?? '')).toBe(
      '66,7 % de Alimentation'
    )
  })

  it('toggles drill-down off when the same row is clicked again', async () => {
    const wrapper = mount(CategoryBreakdownList, {
      global: { plugins: [router] },
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
      global: { plugins: [router] },
      props: { categories: [], monthLabels, total: 0 },
    })

    expect(wrapper.text()).toContain('Aucune catégorie')
  })
  describe('everyday vs real mode', () => {
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
        exceptionalMonthlyAmounts: [0, 600, 0],
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
        exceptionalMonthlyAmounts: [0, 0, 0],
      },
    ]

    const mountIn = (mode: 'real' | 'everyday') =>
      mount(CategoryBreakdownList, {
        global: { plugins: [router] },
        props: {
          categories: mixed,
          monthLabels,
          total: mode === 'real' ? 3400 : 2800,
          mode,
        },
      })

    const figureOf = (
      wrapper: ReturnType<typeof mountIn>,
      name: string
    ): string =>
      norm(wrapper.get(`[data-testid="category-average-${name}"]`).text())

    it('shows the real average by default, and only the average', () => {
      const wrapper = mountIn('real')

      expect(figureOf(wrapper, 'Voyages')).toBe('333,33 € /mois')
      // The total and the events wait for the expanded line.
      expect(norm(wrapper.text())).not.toContain('Total')
      expect(norm(wrapper.text())).not.toContain('Événements')
    })

    it('shows the everyday average in everyday mode', () => {
      expect(figureOf(mountIn('everyday'), 'Voyages')).toBe('133,33 € /mois')
    })

    it('leaves the figure of an event-free category unchanged between modes', () => {
      // The regression the user hit: switching mode moved every category.
      expect(figureOf(mountIn('everyday'), 'Logement')).toBe(
        figureOf(mountIn('real'), 'Logement')
      )
      expect(figureOf(mountIn('real'), 'Logement')).toBe('800,00 € /mois')
    })

    it('states the total, the count and the events once the row is expanded', async () => {
      const real = mountIn('real')
      expect(real.find('[data-testid="category-facts-Voyages"]').exists()).toBe(
        false
      )
      await real.get('[data-testid="category-row-Voyages"]').trigger('click')

      const facts = norm(
        real.get('[data-testid="category-facts-Voyages"]').text()
      )
      expect(facts).toContain('Total sur 3 mois : 1 000,00 €')
      // The share is written on the bar, not repeated here.
      expect(facts).not.toContain('Part')
      expect(facts).toContain('4 transactions')
      expect(facts).toContain('Événements : 600,00 € (inclus)')

      const everyday = mountIn('everyday')
      await everyday
        .get('[data-testid="category-row-Voyages"]')
        .trigger('click')
      const everydayFacts = norm(
        everyday.get('[data-testid="category-facts-Voyages"]').text()
      )
      expect(everydayFacts).toContain('Total sur 3 mois : 400,00 €')
      expect(everydayFacts).toContain(
        'Événements : 600,00 € (exclus de la moyenne)'
      )
    })

    it('leaves the events out of the facts when the category carries none', async () => {
      const wrapper = mountIn('real')
      await wrapper
        .get('[data-testid="category-row-Logement"]')
        .trigger('click')

      expect(
        wrapper.get('[data-testid="category-facts-Logement"]').text()
      ).not.toContain('Événements')
    })

    it('hatches the share the events carry, in the real reading only', () => {
      const real = mountIn('real')
      const events = real.get('[data-testid="category-share-events-Voyages"]')
      // 600 of the 1 000 the bar stands for.
      expect(widthOf(events.attributes('style'))).toBe(60)
      expect(events.attributes('style')).toContain('repeating-linear-gradient')
      expect(
        norm(
          real
            .get('[data-testid="category-share-Voyages"]')
            .attributes('aria-label') ?? ''
        )
      ).toContain('dont 600,00 € d’événements exceptionnels')
      expect(
        real.find('[data-testid="category-share-events-Logement"]').exists()
      ).toBe(false)

      // In « Vie courante » the events are out of the figure, so out of
      // the bar.
      expect(
        mountIn('everyday')
          .find('[data-testid="category-share-events-Voyages"]')
          .exists()
      ).toBe(false)
    })

    describe('the drill-down chart', () => {
      const chartOf = async (
        mode: 'real' | 'everyday',
        name: string,
        list: CategoryDataDto[] = mixed
      ) => {
        const wrapper = mount(CategoryBreakdownList, {
          global: { plugins: [router] },
          props: { categories: list, monthLabels, total: 3400, mode },
        })
        await wrapper
          .get(`[data-testid="category-row-${name}"]`)
          .trigger('click')
        return wrapper.getComponent({ name: 'MonthlyBarChart' })
      }

      it('stacks the events on the rest of each month, against the average, in the real reading', async () => {
        const chart = await chartOf('real', 'Voyages')

        expect(chart.props('reference')).toBe(333.33)
        expect(chart.props('overlay')).toEqual({
          values: [0, 600, 0],
          label: 'événements',
        })
        // The stack sums to the real month: 400 under the 600 of events.
        expect(chart.props('data').values).toEqual([0, 400, 0])
      })

      it('draws the months in the blue of the share bars', async () => {
        const chart = await chartOf('real', 'Logement')

        expect(chart.props('color')).toBe('#60a5fa')
      })

      it('shows the everyday months alone in « Vie courante »', async () => {
        const chart = await chartOf('everyday', 'Voyages')

        expect(chart.props('reference')).toBe(133.33)
        expect(chart.props('overlay')).toBeUndefined()
        expect(chart.props('data').values).toEqual([0, 400, 0])
      })

      it('stacks nothing when no month carries an event', async () => {
        const chart = await chartOf('real', 'Logement')

        expect(chart.props('overlay')).toBeUndefined()
        expect(chart.props('data').values).toEqual([800, 800, 800])
        expect(chart.props('reference')).toBe(800)
      })

      it('keeps the real month under the events when a smoothed purchase shifts the everyday one', async () => {
        const chart = await chartOf('real', 'Voyages', [
          {
            ...(mixed[0] as CategoryDataDto),
            // A smoothed slice lands in March: the everyday months move,
            // the real ones do not.
            everydayMonthlyAmounts: [0, 400, 50],
            amortizedAmount: 50,
            amortizedMonthlyAmounts: [0, 0, 50],
          },
        ])

        expect(chart.props('data').values).toEqual([0, 400, 0])
      })
    })

    it('computes the share against the total of the active mode', () => {
      // 400 everyday out of a 2800 everyday total = 14,3 %, not 1000/3400.
      expect(
        norm(
          mountIn('everyday')
            .get('[data-testid="category-share-Voyages"]')
            .attributes('aria-label') ?? ''
        )
      ).toBe('14,3 % des dépenses')
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
        global: { plugins: [router] },
        props: {
          categories: legacy,
          monthLabels,
          total: 600,
          mode: 'everyday',
        },
      })

      expect(
        norm(
          wrapper.get('[data-testid="category-average-Alimentation"]').text()
        )
      ).toBe('200,00 € /mois')
    })
  })

  describe('links to the Transactions page', () => {
    it('gives each row a link to its category over the window, gross', () => {
      const wrapper = mount(CategoryBreakdownList, {
        global: { plugins: [router] },
        props: {
          categories: [
            ...categories,
            {
              categoryId: '__uncategorized__',
              category: 'Non classé',
              amount: 5,
            },
          ],
          monthLabels,
          total: 905,
          window: { from: '2024-01-01', to: '2024-03-31' },
        },
      })

      const link = wrapper.get('[data-testid="category-link-Alimentation"]')
      expect(link.attributes('href')).toBe(
        '/transactions?type=EXPENSE&category=cat-1&from=2024-01-01&to=2024-03-31&label=Alimentation&gross=1'
      )
      expect(link.attributes('aria-label')).toBe(
        'Voir les transactions de Alimentation'
      )
      // The unfiled rows are a word, not an id.
      expect(
        wrapper
          .get('[data-testid="category-link-Non classé"]')
          .attributes('href')
      ).toContain('category=none')
      // Outside the toggle: following the link does not expand the row.
      expect(wrapper.text()).not.toContain('Sous-catégories')
    })

    it('links each subcategory line to its rows by id, « none » for the unfiled', async () => {
      const wrapper = mount(CategoryBreakdownList, {
        global: { plugins: [router] },
        props: {
          categories,
          monthLabels,
          total: 900,
          mode: 'everyday',
          window: { from: '2024-01-01', to: '2024-03-31' },
        },
      })
      await wrapper
        .find('[data-testid="category-row-Alimentation"]')
        .trigger('click')

      expect(
        wrapper
          .get('[data-testid="subcategory-link-Alimentation-Courses"]')
          .attributes('href')
      ).toBe(
        '/transactions?type=EXPENSE&category=cat-1&subcategory=sub-courses&from=2024-01-01&to=2024-03-31&label=Alimentation+%C2%B7+Courses&gross=1'
      )
      const none = wrapper.get(
        '[data-testid="subcategory-link-Alimentation-none"]'
      )
      expect(none.attributes('href')).toContain('subcategory=none')
      expect(none.attributes('aria-label')).toBe(
        'Voir les transactions de Alimentation · sans sous-catégorie'
      )
      // The line's figure counts the events too: no narrowing on them.
      expect(none.attributes('href')).not.toContain('exceptional')
    })

    it('leaves the events out of a row’s link in « Vie courante », and links them alone', async () => {
      const travel: CategoryDataDto = {
        categoryId: 'cat-travel',
        category: 'Voyages',
        amount: 1000,
        exceptionalAmount: 600,
        everydayAmount: 400,
      }
      const mountIn = (mode: 'real' | 'everyday') =>
        mount(CategoryBreakdownList, {
          global: { plugins: [router] },
          props: {
            categories: [travel],
            monthLabels,
            total: 1000,
            mode,
            window: { from: '2024-01-01', to: '2024-03-31' },
          },
        })

      const everyday = mountIn('everyday')
      expect(
        everyday.get('[data-testid="category-link-Voyages"]').attributes('href')
      ).toContain('&exceptional=exclude&')
      const real = mountIn('real')
      expect(
        real.get('[data-testid="category-link-Voyages"]').attributes('href')
      ).not.toContain('exceptional')

      await real.find('[data-testid="category-row-Voyages"]').trigger('click')
      expect(
        real
          .get('[data-testid="category-exceptional-link-Voyages"]')
          .attributes('href')
      ).toBe(
        '/transactions?type=EXPENSE&category=cat-travel&from=2024-01-01&to=2024-03-31&exceptional=only&label=Voyages+%C2%B7+%C3%A9v%C3%A9nements+exceptionnels&gross=1'
      )
    })

    it('opens the month a bar of the drill-down chart stands for', async () => {
      const push = vi.spyOn(router, 'push').mockResolvedValue(undefined)
      const wrapper = mount(CategoryBreakdownList, {
        global: { plugins: [router] },
        props: { categories, monthLabels, total: 900 },
      })
      await wrapper
        .find('[data-testid="category-row-Alimentation"]')
        .trigger('click')

      const chart = wrapper.findComponent({ name: 'VueApexCharts' })
      const options = chart.props('options') as {
        chart: {
          events: {
            dataPointSelection: (
              e: unknown,
              c: unknown,
              config: { dataPointIndex: number }
            ) => void
          }
        }
      }
      options.chart.events.dataPointSelection(null, null, {
        dataPointIndex: 1,
      })

      expect(push).toHaveBeenCalledWith({
        path: '/transactions',
        query: {
          type: 'EXPENSE',
          category: 'cat-1',
          from: '2024-02-01',
          to: '2024-02-29',
          label: 'Alimentation · févr. 2024',
          gross: '1',
        },
      })
      push.mockRestore()
    })
  })

  describe('smoothed purchases', () => {
    const withPhone: CategoryDataDto[] = [
      {
        categoryId: 'cat-tech',
        category: 'High-tech',
        amount: 80,
        averagePerMonth: 26.67,
        everydayAmount: 242.51,
        everydayAveragePerMonth: 80.84,
        transactionCount: 1,
        monthlyAmounts: [80, 0, 0],
        amortizedAmount: 162.51,
        subcategories: [
          {
            subcategoryId: 'sub-cable',
            subcategory: 'Accessoires',
            amount: 80,
            transactionCount: 1,
            averagePerMonth: 26.67,
          },
          {
            subcategoryId: 'sub-phone',
            subcategory: 'Téléphone',
            amount: 0,
            transactionCount: 0,
            averagePerMonth: 0,
            everydayAmount: 162.51,
            everydayAveragePerMonth: 54.17,
            amortizedAmount: 162.51,
          },
        ],
      },
    ]

    async function expand(mode: 'real' | 'everyday') {
      const wrapper = mount(CategoryBreakdownList, {
        global: { plugins: [router] },
        props: { categories: withPhone, monthLabels, total: 300, mode },
      })
      await wrapper
        .find('[data-testid="category-row-High-tech"]')
        .trigger('click')
      return wrapper
    }

    it('reads a line its slices reach in « Vie courante »', async () => {
      const wrapper = await expand('everyday')

      expect(
        wrapper
          .get('[data-testid="subcategory-line-High-tech-Téléphone"]')
          .text()
      ).toMatch(/162,51/)
    })

    it('leaves that line out of the real reading, as before smoothing', async () => {
      const wrapper = await expand('real')

      expect(
        wrapper
          .find('[data-testid="subcategory-line-High-tech-Téléphone"]')
          .exists()
      ).toBe(false)
      expect(
        wrapper
          .find('[data-testid="subcategory-line-High-tech-Accessoires"]')
          .exists()
      ).toBe(true)
    })
  })
})
