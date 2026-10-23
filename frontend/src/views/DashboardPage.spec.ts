import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import DashboardPage from './DashboardPage.vue'
import type { DashboardSummaryDto } from '@/lib/api'

// Mock vue3-apexcharts
vi.mock('vue3-apexcharts/core', () => ({
  default: {
    name: 'VueApexCharts',
    props: ['type', 'height', 'options', 'series'],
    template: '<div class="apexcharts-mock"></div>',
  },
}))

// Mock the API
vi.mock('@/lib/api', () => ({
  UNCATEGORIZED_CATEGORY_ID: '__uncategorized__',
  api: {
    getDashboardSummary: vi.fn(),
    getDashboardMonth: vi.fn().mockResolvedValue({
      month: '2024-01',
      asOfDay: 23,
      daysInMonth: 31,
      spent: 600,
      spentSeries: [800, 820, 790, 600],
      habit: 800,
      habitToDate: 593.55,
      habitMonths: 3,
      incomeReceived: 0,
      incomeExpected: 2500,
      incomeSeries: [2500, 2500, 2500],
      upcoming: [],
      upcomingTotal: 0,
      remainingToLive: 1900,
      remainingShare: 0.76,
    }),
    getSpendingTrends: vi.fn().mockResolvedValue({
      month: '2023-12',
      reading: 'everyday',
      window: 6,
      completeMonths: 12,
      insights: [],
      quietSentence:
        "Rien de notable en décembre : la vie courante est dans l'habitude.",
      availableMonths: ['2023-12'],
      horizons: [],
      digest: null,
    }),
    getTransactions: vi.fn(),
    getAccounts: vi.fn().mockResolvedValue([]),
    getLegacyCategories: vi
      .fn()
      .mockResolvedValue({ categories: [], totalTransactions: 0 }),
  },
}))

// Mock the filters store
const filtersState = vi.hoisted(() => ({
  timePeriod: 'all' as string,
  setTimePeriod: vi.fn(),
}))
vi.mock('@/stores/filters', () => ({
  useFiltersStore: () => ({
    deductPendingReimbursements: false,
    setDeductPendingReimbursements: vi.fn(),
    loadFromBackend: vi.fn(),
    isSyncing: false,
    get timePeriod() {
      return filtersState.timePeriod
    },
    setTimePeriod: filtersState.setTimePeriod,
    trendsWindow: 6,
    setTrendsWindow: vi.fn(),
    getDateRangeFromPeriod: vi.fn(() => ({ startDate: null, endDate: null })),
  }),
}))

// Mock the accounts store
const accountsState = vi.hoisted(() => ({ accounts: [] as { id: string }[] }))
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({
    get accounts() {
      return accountsState.accounts
    },
    isLoading: false,
    error: null,
    load: vi.fn().mockResolvedValue(undefined),
    getDivisor: vi.fn(() => 1),
  }),
}))

import { api } from '@/lib/api'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
    { path: '/dashboard', name: 'dashboard', component: DashboardPage },
    {
      path: '/import',
      name: 'import',
      component: { template: '<div>Import</div>' },
    },
  ],
})

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    filtersState.timePeriod = 'all'
    accountsState.accounts = []
  })

  const mockSummary: DashboardSummaryDto = {
    monthlyData: [
      {
        month: '2024-01',
        label: 'Jan 2024',
        expenses: 845.5,
        netExpenses: 845.5,
        income: 2500,
        exceptionalExpenses: 0,
        everydayNetExpenses: 845.5,
      },
    ],
    expensesByCategory: [
      { categoryId: 'cat-Logement', category: 'Logement', amount: 800 },
      {
        categoryId: 'cat-Alimentation',
        category: 'Alimentation',
        amount: 45.5,
      },
    ],
    incomeByCategory: [
      { categoryId: 'cat-Salaires', category: 'Salaires', amount: 2500 },
    ],
    totalExpenses: 845.5,
    totalIncome: 2500,
    allExpenseCategories: [
      { id: 'cat-Alimentation', name: 'Alimentation' },
      { id: 'cat-Logement', name: 'Logement' },
    ],
    allIncomeCategories: [{ id: 'cat-Salaires', name: 'Salaires' }],
    availableAccounts: ['Compte Courant'],
    totalExceptionalExpenses: 0,
    exceptionalEvents: [],
  }

  const mockEmptySummary: DashboardSummaryDto = {
    monthlyData: [],
    expensesByCategory: [],
    incomeByCategory: [],
    totalExpenses: 0,
    totalIncome: 0,
    allExpenseCategories: [],
    allIncomeCategories: [],
    availableAccounts: [],
    totalExceptionalExpenses: 0,
    exceptionalEvents: [],
  }

  const mockIncomeOnlySummary: DashboardSummaryDto = {
    monthlyData: [
      {
        month: '2024-01',
        label: 'Jan 2024',
        expenses: 0,
        netExpenses: 0,
        income: 2500,
        exceptionalExpenses: 0,
        everydayNetExpenses: 0,
      },
    ],
    expensesByCategory: [],
    incomeByCategory: [
      { categoryId: 'cat-Salaires', category: 'Salaires', amount: 2500 },
    ],
    totalExpenses: 0,
    totalIncome: 2500,
    allExpenseCategories: [],
    allIncomeCategories: [{ id: 'cat-Salaires', name: 'Salaires' }],
    availableAccounts: ['Compte Courant'],
    totalExceptionalExpenses: 0,
    exceptionalEvents: [],
  }

  const mockExpenseOnlySummary: DashboardSummaryDto = {
    monthlyData: [
      {
        month: '2024-01',
        label: 'Jan 2024',
        expenses: 45.5,
        netExpenses: 45.5,
        income: 0,
        exceptionalExpenses: 0,
        everydayNetExpenses: 45.5,
      },
    ],
    expensesByCategory: [
      {
        categoryId: 'cat-Alimentation',
        category: 'Alimentation',
        amount: 45.5,
      },
    ],
    incomeByCategory: [],
    totalExpenses: 45.5,
    totalIncome: 0,
    allExpenseCategories: [{ id: 'cat-Alimentation', name: 'Alimentation' }],
    allIncomeCategories: [],
    availableAccounts: ['Compte Courant'],
    totalExceptionalExpenses: 0,
    exceptionalEvents: [],
  }

  it('should display page title', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Dashboard')
    expect(wrapper.text()).toContain("Vue d'ensemble de vos finances")
  })

  it('should fetch dashboard summary on mount', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

    mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    expect(api.getDashboardSummary).toHaveBeenCalled()
  })

  it('should display error message on API failure', async () => {
    vi.mocked(api.getDashboardSummary).mockRejectedValue(
      new Error('Network error')
    )

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Network error')
  })

  it('offers a retry on failure and keeps the filters mounted', async () => {
    vi.mocked(api.getDashboardSummary).mockRejectedValueOnce(
      new Error('Network error')
    )

    const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
    await flushPromises()

    // The period and the reading stay at hand: a new choice retries too.
    expect(wrapper.find('[data-testid="dashboard-period"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reading-menu"]').exists()).toBe(true)
    // A failure is not an empty account: no onboarding.
    expect(wrapper.find('[data-testid="dashboard-onboarding"]').exists()).toBe(
      false
    )

    vi.mocked(api.getDashboardSummary).mockResolvedValueOnce(mockSummary)
    await wrapper.find('[data-testid="dashboard-retry"]').trigger('click')
    await flushPromises()

    expect(api.getDashboardSummary).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="dashboard-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="month-band"]').exists()).toBe(true)
  })

  it('tells an empty period apart from an empty account', async () => {
    filtersState.timePeriod = '3m'
    accountsState.accounts = [{ id: 'acc-1' }]
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockEmptySummary)

    const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('Aucune transaction sur cette période')
    expect(wrapper.find('[data-testid="dashboard-onboarding"]').exists()).toBe(
      false
    )
    // The period stays at hand, to pick another.
    expect(wrapper.find('[data-testid="dashboard-period"]').exists()).toBe(true)

    await wrapper.find('[data-testid="dashboard-show-all"]').trigger('click')
    expect(filtersState.setTimePeriod).toHaveBeenCalledWith('all')
  })

  it('welcomes a newcomer on the twelve months it opens on', async () => {
    filtersState.timePeriod = '1y'
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockEmptySummary)

    const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="dashboard-onboarding"]').exists()).toBe(
      true
    )
    expect(
      wrapper.find('[data-testid="dashboard-empty-period"]').exists()
    ).toBe(false)
  })

  it('should display chart sections', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    // One monthly chart: the expenses and the income together.
    expect(wrapper.text()).toContain('Revenus et dépenses par mois')
    expect(wrapper.text()).not.toContain('Dépenses par mois')
    expect(wrapper.text()).not.toContain('Revenus par mois')
  })

  it('should render charts when data is available', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    // One chart: the income line over the expenses columns. The shares
    // live in the category list, no donut.
    expect(wrapper.findAll('.apexcharts-mock').length).toBe(1)
  })

  it('should display empty state when no transactions', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockEmptySummary)

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Aucune transaction')
    expect(wrapper.text()).toContain('Importez vos transactions')
  })

  it('should have link to import page in empty state', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockEmptySummary)

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    // RouterLink renders as <a> tag with router
    const links = wrapper.findAll('a')
    const importLink = links.find(link =>
      link.text().includes('Importer un CSV')
    )
    expect(importLink).toBeDefined()
  })

  it('draws the income alone when the period has no expense', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockIncomeOnlySummary)

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    const chart = wrapper.findComponent({ name: 'IncomeExpensesChart' })
    expect(chart.exists()).toBe(true)
    expect(chart.props('months')).toEqual(mockIncomeOnlySummary.monthlyData)
    // No category to list.
    expect(wrapper.find('[data-testid="dashboard-categories"]').exists()).toBe(
      false
    )
  })

  it('reads no income as no income, the expenses still drawn', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockExpenseOnlySummary)

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    expect(
      wrapper.findComponent({ name: 'IncomeExpensesChart' }).exists()
    ).toBe(true)
    expect(
      wrapper
        .get('[data-testid="summary-line-income"]')
        .text()
        .replace(/[\s\u202f\u00a0]+/g, ' ')
    ).toContain('Revenus · 0 € par mois')
  })

  describe('one reading for the page', () => {
    const summaryWithEvents: DashboardSummaryDto = {
      ...mockSummary,
      expensesByCategory: [
        {
          categoryId: 'cat-Logement',
          category: 'Logement',
          amount: 800,
          everydayAmount: 800,
          exceptionalAmount: 0,
          averagePerMonth: 800,
          everydayAveragePerMonth: 800,
        },
        {
          categoryId: 'cat-Voyages',
          category: 'Voyages',
          amount: 300,
          everydayAmount: 0,
          exceptionalAmount: 300,
          averagePerMonth: 300,
          everydayAveragePerMonth: 0,
        },
      ],
      totalExpenses: 1100,
      totalExceptionalExpenses: 300,
      exceptionalEvents: [
        { id: 'tag-1', name: 'Vacances', color: null, icon: null, amount: 300 },
      ],
    }

    it('offers the mode once, in the reading menu, and every figure follows it', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(summaryWithEvents)
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      // Behind the menu's button, which says the state.
      expect(wrapper.get('[data-testid="reading-menu-button"]').text()).toBe(
        'Lecture : vie courante · remboursements reçus déduits'
      )
      expect(wrapper.find('[data-testid="breakdown-mode-real"]').exists()).toBe(
        false
      )
      await wrapper.get('[data-testid="reading-menu-button"]').trigger('click')

      // One control, inside the menu; none in the cards below.
      const controls = wrapper.findAll('[data-testid="breakdown-mode-real"]')
      expect(controls).toHaveLength(1)
      expect(
        wrapper
          .get('[data-testid="reading-menu"]')
          .find('[data-testid="breakdown-mode-real"]')
          .exists()
      ).toBe(true)
      expect(wrapper.find('[data-testid="reading-actual"]').exists()).toBe(
        false
      )

      // Everyday by default: the month band names it, and asks again on
      // « Tout ».
      const spentTitle = () =>
        wrapper.get('[data-testid="month-tile-spent"] h3').text()
      expect(spentTitle()).toBe('Vie courante')

      await wrapper.find('[data-testid="breakdown-mode-real"]').trigger('click')
      await flushPromises()
      expect(spentTitle()).toBe('Dépenses')
      expect(api.getDashboardMonth).toHaveBeenLastCalledWith(
        expect.objectContaining({ reading: 'real' })
      )
    })

    it('draws the list in one blue, with no donut dot by the name', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(summaryWithEvents)
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      expect(
        wrapper.find('[data-testid="category-color-Logement"]').exists()
      ).toBe(false)
      expect(
        wrapper
          .get('[data-testid="category-share-fill-Logement"]')
          .attributes('style')
      ).toContain('background-color: #60a5fa')
    })

    it('has no filters card: the reading in the header, the period in its section', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      expect(
        wrapper.find('[data-testid="dashboard-filters-card"]').exists()
      ).toBe(false)
      const menu = wrapper.get('[data-testid="reading-menu"]').element
      const period = wrapper.get('[data-testid="dashboard-period"]').element
      const where = wrapper.get('[data-testid="dashboard-where-section"]')
      const card = where.get('[data-testid="dashboard-where-card"]').element
      const banner = wrapper.findComponent({ name: 'LegacyMigrationBanner' })
      expect(banner.exists()).toBe(true)
      const follows = (a: Node, b: Node) =>
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      // The banner (or the comment standing in for it) comes under the menu.
      expect(follows(menu, banner.vm.$el as Node)).toBe(true)
      // In the section's header, beside its title, above its card.
      expect(where.element.contains(period)).toBe(true)
      expect(period.parentElement?.tagName).toBe('HEADER')
      expect(follows(period, card)).toBe(true)
    })
  })

  describe('pie charts', () => {
    it('draws no donut: the list carries the expenses shares, a line the income sources', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      expect(wrapper.text()).not.toContain('Dépenses par catégorie')
      expect(wrapper.text()).not.toContain('Revenus par catégorie')
      expect(
        wrapper.findAllComponents({ name: 'CategoryPieChart' })
      ).toHaveLength(0)
      expect(wrapper.get('[data-testid="income-sources"]').text()).toContain(
        'Salaires'
      )
    })
  })

  describe('expenses by month', () => {
    it('has no category select: each row of the list draws its months', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      expect(
        wrapper.find('[data-testid="expense-category-filter"]').exists()
      ).toBe(false)
      expect(
        wrapper.findAllComponents({ name: 'MonthlyBarChart' })
      ).toHaveLength(0)
      const chart = wrapper.findComponent({ name: 'IncomeExpensesChart' })
      // Every expense of each month, never one category's, in the reading.
      expect(chart.props('months')).toEqual(mockSummary.monthlyData)
      expect(chart.props('reading')).toBe('everyday')
      // The habit of « Ce mois-ci », dashed across.
      expect(chart.props('habit')).toBe(800)
    })
  })

  describe('income category filter', () => {
    it('is gone with the income section: the income is a line of the chart', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      expect(
        wrapper.find('[data-testid="income-category-filter"]').exists()
      ).toBe(false)
      expect(
        wrapper.find('[data-testid="dashboard-income-section"]').exists()
      ).toBe(false)
    })
  })

  describe('links to the Transactions page', () => {
    it('offers the period of the expenses under the chart, and of the income on its line, gross', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      const expenses = wrapper.get('[data-testid="expenses-transactions-link"]')
      expect(expenses.attributes('href')).toBe(
        '/transactions?type=EXPENSE&label=D%C3%A9penses+de+la+p%C3%A9riode&gross=1'
      )
      expect(expenses.attributes('aria-label')).toBe(
        'Voir les transactions de la période'
      )

      const income = wrapper
        .get('[data-testid="summary-line-income"]')
        .get('[data-testid="income-transactions-link"]')
      expect(income.attributes('href')).toBe(
        '/transactions?type=INCOME&label=Revenus+de+la+p%C3%A9riode&gross=1'
      )
    })

    it('opens a month from a column of the chart', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      const push = vi.spyOn(router, 'push').mockResolvedValue(undefined)
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      wrapper
        .findComponent({ name: 'IncomeExpensesChart' })
        .vm.$emit('select-month', '2024-01')
      expect(push).toHaveBeenLastCalledWith({
        path: '/transactions',
        query: {
          type: 'EXPENSE',
          from: '2024-01-01',
          to: '2024-01-31',
          label: 'Dépenses · janv. 2024',
          gross: '1',
        },
      })
      push.mockRestore()
    })

    it('names the events of the period on their line, each opening its analysis', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue({
        ...mockSummary,
        totalExceptionalExpenses: 300,
        exceptionalEvents: [
          {
            id: 'tag-1',
            name: 'Vacances',
            color: null,
            icon: null,
            amount: 300,
          },
        ],
      })
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      const line = wrapper.get('[data-testid="summary-line-events"]')
      expect(line.text().replace(/[\s\u202f\u00a0]+/g, ' ')).toContain(
        '1 événement sur la période · 300 € · Vacances'
      )
      expect(
        line.get('[data-testid="summary-event-tag-1"]').attributes('href')
      ).toBe('/tags/tag-1')
      // The amber banner is gone: the hatching and this line say it.
      expect(wrapper.text()).not.toContain('Événements de la période')
    })
  })

  describe('the families of the year', () => {
    const family = {
      id: 'fam-travel',
      name: 'Voyages',
      color: null,
      icon: null,
      year: 2026,
      spent: 300,
      spentByYear: [{ year: 2026, spent: 300 }],
      annualBudget: null,
      remaining: null,
      transactionCount: 2,
      tagCount: 1,
    }
    const withEvent: DashboardSummaryDto = {
      ...mockSummary,
      totalExceptionalExpenses: 300,
      exceptionalEvents: [
        { id: 'tag-1', name: 'Rome', color: null, icon: null, amount: 300 },
      ],
    }

    async function mountWith(summary: DashboardSummaryDto) {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(summary)
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()
      // The card lives on the Tags page now: the dashboard keeps one line.
      expect(
        wrapper.find('[data-testid="tag-families-of-year"]').exists()
      ).toBe(false)
      return wrapper.find('[data-testid="summary-line-episodes"]')
    }

    it('reads the episodes in one line when an event touches the period and a family spent this year', async () => {
      const line = await mountWith({
        ...withEvent,
        tagFamiliesOfYear: [family],
        realExpensesOfYear: 6000,
        exceptionalExpensesOfYear: 1000,
      })

      expect(line.text().replace(/[\s\u202f\u00a0]+/g, ' ')).toContain(
        'Épisodes 2026 · 300 € · Voyages 300 €'
      )
      expect(line.get('[data-testid="episodes-link"]').attributes('href')).toBe(
        '/tags'
      )
    })

    it('leaves it out without a family', async () => {
      const line = await mountWith({
        ...withEvent,
        tagFamiliesOfYear: [],
        realExpensesOfYear: null,
        exceptionalExpensesOfYear: null,
      })

      expect(line.exists()).toBe(false)
    })

    it('leaves it out when no event touches the period', async () => {
      const line = await mountWith({
        ...mockSummary,
        tagFamiliesOfYear: [family],
        realExpensesOfYear: 6000,
      })

      expect(line.exists()).toBe(false)
    })
  })

  describe('Ce qui change', () => {
    const structure = {
      essential: 800,
      pleasure: 45.5,
      unknownNature: 0,
      committed: 800,
      variable: 45.5,
      unknownRhythm: 0,
      recurring: 0,
      total: 845.5,
    }

    it("sits after the month band, « À faire » and before « Où part l'argent »", async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue({
        ...mockSummary,
        spendingStructure: structure,
        everydaySpendingStructure: structure,
        pendingReceivables: 120,
      })
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      const order = [
        'month-band',
        'spending-trends',
        'todo-card',
        'dashboard-where-section',
        'structure-lines',
      ].map(id => wrapper.find(`[data-testid="${id}"]`).element)
      for (let i = 1; i < order.length; i++) {
        const before = order[i - 1] as Node
        expect(
          before.compareDocumentPosition(order[i] as Node) &
            Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
      }
      expect(wrapper.find('[data-testid="trends-quiet"]').text()).toContain(
        'Rien de notable en décembre'
      )
    })

    it('asks once the summary is there, with the reading and the switches, never the period', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      expect(api.getSpendingTrends).toHaveBeenCalledTimes(1)
      expect(api.getSpendingTrends).toHaveBeenCalledWith({
        month: undefined,
        window: 6,
        reading: 'everyday',
        deductReimbursements: true,
        deductPendingReimbursements: false,
      })
    })

    it('leaves the dashboard standing when the trends fail', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getSpendingTrends).mockRejectedValueOnce(
        new Error('Impossible de charger les tendances')
      )
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      expect(wrapper.find('[data-testid="trends-error"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="dashboard-error"]').exists()).toBe(
        false
      )
      expect(wrapper.find('[data-testid="month-band"]').exists()).toBe(true)
    })
  })

  describe('À faire', () => {
    const position = (a: Element, b: Element) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING

    it('sits between « Ce qui change » and the expenses when something is to do', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue({
        ...mockSummary,
        pendingReceivables: 8516,
      })
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      const card = wrapper.get('[data-testid="todo-card"]')
      expect(
        position(
          wrapper.get('[data-testid="spending-trends"]').element,
          card.element
        )
      ).toBeTruthy()
      expect(
        position(
          card.element,
          wrapper.get('[data-testid="dashboard-period"]').element
        )
      ).toBeTruthy()
      expect(
        position(
          card.element,
          wrapper.get('[data-testid="dashboard-where-section"]').element
        )
      ).toBeTruthy()
      const line = wrapper.get('[data-testid="todo-item-receivables"]')
      expect(line.text()).toContain('avancés, en attente de remboursement')
      expect(line.attributes('href')).toBe('/reimbursements')
    })

    it('reads the lines to file from the trends the card loaded', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getSpendingTrends).mockResolvedValueOnce({
        month: '2023-12',
        reading: 'everyday',
        window: 6,
        completeMonths: 12,
        insights: [
          {
            kind: 'uncategorized',
            unit: {
              type: 'uncategorized',
              id: 'uncategorized',
              categoryId: null,
              name: 'À classer',
              icon: null,
            },
            direction: 'up',
            tone: 'neutral',
            current: 3,
            reference: 0,
            delta: 3,
            deltaPct: null,
            sentence: '3 dépenses de décembre sont à classer.',
            windows: {
              current: { start: '2023-12-01', end: '2023-12-31' },
              reference: { start: '2023-06-01', end: '2023-11-30' },
            },
            series: [],
            score: 0,
          },
        ],
        quietSentence: null,
        headline: null,
        availableMonths: ['2023-12'],
        horizons: [],
        digest: null,
      })
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      expect(wrapper.get('[data-testid="todo-item-to-file"]').text()).toContain(
        '3 lignes à classer'
      )
      // The compact card leaves them to « À faire ».
      expect(wrapper.find('[data-testid="trends-to-file"]').exists()).toBe(
        false
      )
    })

    it('is absent when nothing is to do', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue({
        ...mockSummary,
        pendingReceivables: 0,
      })
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      expect(wrapper.find('[data-testid="spending-trends"]').exists()).toBe(
        true
      )
      expect(wrapper.find('[data-testid="todo-card"]').exists()).toBe(false)
    })
  })

  describe('Ce mois-ci', () => {
    it('opens the page, right under the header, in place of the three averages', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      const band = wrapper.get('[data-testid="month-band"]')
      expect(band.text()).toContain('Ce mois-ci · janvier, au 23')
      // Nothing of the page's content before it.
      for (const id of [
        'spending-trends',
        'dashboard-period',
        'dashboard-where-section',
      ]) {
        const other = wrapper.get(`[data-testid="${id}"]`).element
        expect(
          band.element.compareDocumentPosition(other) &
            Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
      }
      expect(wrapper.text()).not.toContain('moyennes / mois')
    })

    it('asks for the month beside the summary, with the reading and the switches, never the period', async () => {
      let resolveSummary: (value: DashboardSummaryDto) => void = () => {}
      vi.mocked(api.getDashboardSummary).mockImplementationOnce(
        () =>
          new Promise<DashboardSummaryDto>(resolve => {
            resolveSummary = resolve
          })
      )
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })

      // Sent before the summary has answered.
      expect(api.getDashboardMonth).toHaveBeenCalledTimes(1)
      expect(api.getDashboardMonth).toHaveBeenCalledWith({
        reading: 'everyday',
        deductReimbursements: true,
        deductPendingReimbursements: false,
      })

      resolveSummary(mockSummary)
      await flushPromises()
      expect(wrapper.find('[data-testid="month-tile-spent"]').exists()).toBe(
        true
      )
    })

    it('keeps its failure inside the band, with a retry, the page standing', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getDashboardMonth).mockRejectedValueOnce(
        new Error("La lecture du mois n'a pas pu être chargée")
      )
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      expect(wrapper.find('[data-testid="month-error"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="dashboard-error"]').exists()).toBe(
        false
      )
      expect(
        wrapper.find('[data-testid="dashboard-where-section"]').exists()
      ).toBe(true)

      await wrapper.get('[data-testid="month-retry"]').trigger('click')
      await flushPromises()
      expect(api.getDashboardMonth).toHaveBeenCalledTimes(2)
      expect(wrapper.find('[data-testid="month-error"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="month-tile-spent"]').exists()).toBe(
        true
      )
    })
  })

  describe('Ce qui change, compact', () => {
    const insight = (id: string, score: number) => ({
      kind: 'amount',
      unit: {
        type: 'category',
        id,
        categoryId: id,
        name: id,
        icon: null,
      },
      direction: 'up',
      tone: 'neutral',
      current: 300,
      reference: 200,
      delta: 100,
      deltaPct: 50,
      sentence: `${id} : en hausse.`,
      windows: {
        current: { start: '2023-12-01', end: '2023-12-31' },
        reference: { start: '2023-06-01', end: '2023-11-30' },
      },
      series: [200, 200, 200, 200, 200, 200, 300],
      score,
    })

    it('reads the lead and three tiles under the top of the page, the rest on /trends', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getSpendingTrends).mockResolvedValueOnce({
        month: '2023-12',
        reading: 'everyday',
        window: 6,
        completeMonths: 12,
        insights: [
          insight('cat-a', 400),
          insight('cat-b', 300),
          insight('cat-c', 200),
          insight('cat-d', 100),
        ],
        quietSentence: null,
        headline: 'Décembre : plus de tout.',
        availableMonths: ['2023-12', '2023-11'],
        horizons: [],
        digest: null,
      } as never)
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      const card = wrapper.get('[data-testid="spending-trends"]')
      expect(
        card.get('#spending-trends-title').text().replace(/\s+/g, ' ')
      ).toBe('Ce qui change · décembre, contre les 6 mois précédents')
      expect(card.get('[data-testid="trends-headline"]').text()).toBe(
        'Décembre : plus de tout.'
      )
      expect(card.findAll('[data-testid="trends-list"] article')).toHaveLength(
        3
      )
      const link = card.get('[data-testid="trends-all-link"]')
      expect(link.text().replace(/\s+/g, ' ')).toBe('Les 4 tendances →')
      expect(link.attributes('href')).toBe('/trends')
      for (const id of ['trends-month', 'trends-tabs', 'trends-scope']) {
        expect(card.find(`[data-testid="${id}"]`).exists(), id).toBe(false)
      }

      // After the top of the page, before the detail of the period.
      const order = [
        'reading-menu',
        'spending-trends',
        'dashboard-where-section',
      ].map(id => wrapper.get(`[data-testid="${id}"]`).element)
      for (let i = 1; i < order.length; i++) {
        expect(
          (order[i - 1] as Node).compareDocumentPosition(order[i] as Node) &
            Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
      }
    })
  })
  describe("Où part l'argent", () => {
    const structure = {
      essential: 800,
      pleasure: 45.5,
      unknownNature: 0,
      committed: 800,
      variable: 45.5,
      unknownRhythm: 0,
      recurring: 0,
      total: 845.5,
    }
    const share = (name: string, amount: number) => ({
      categoryId: `cat-${name}`,
      category: name,
      amount,
      averagePerMonth: amount / 2,
      everydayAmount: amount,
      everydayAveragePerMonth: amount / 2,
      monthlyAmounts: [amount / 2, amount / 2],
      everydayMonthlyAmounts: [amount / 2, amount / 2],
    })
    const summary: DashboardSummaryDto = {
      ...mockSummary,
      monthLabels: ['2025-11', '2026-10'],
      periodMonths: 1,
      // On 1 000 €: Transport 7,7 %, Cadeaux 2,8 %.
      expensesByCategory: [
        share('Logement', 895),
        share('Transport', 77),
        share('Cadeaux', 28),
      ],
      totalExpenses: 1000,
      spendingStructure: structure,
      everydaySpendingStructure: structure,
    }

    async function mountWhere(over: Partial<DashboardSummaryDto> = {}) {
      vi.mocked(api.getDashboardSummary).mockResolvedValue({
        ...summary,
        ...over,
      })
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()
      return wrapper
    }

    it('names the period in its title, the selector beside it', async () => {
      const wrapper = await mountWhere()
      const section = wrapper.get('[data-testid="dashboard-where-section"]')

      expect(section.get('[data-testid="dashboard-where-title"]').text()).toBe(
        "Où part l'argent · novembre 2025 à octobre 2026"
      )
      expect(
        section
          .get('[data-testid="dashboard-period"]')
          .findComponent({ name: 'TimePeriodSelector' })
          .exists()
      ).toBe(true)
    })

    it('holds one card: the structure, the chart, the list, the summary lines, in that order', async () => {
      const wrapper = await mountWhere()
      const cards = wrapper
        .get('[data-testid="dashboard-where-section"]')
        .findAll('[data-testid="dashboard-where-card"]')
      expect(cards).toHaveLength(1)
      const card = wrapper.get('[data-testid="dashboard-where-card"]')

      const order = [
        'structure-lines',
        'income-expenses-chart',
        'category-breakdown-list',
        'period-summary-lines',
      ].map(id => card.get(`[data-testid="${id}"]`).element)
      for (let i = 1; i < order.length; i++) {
        expect(
          (order[i - 1] as Node).compareDocumentPosition(order[i] as Node) &
            Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
      }
    })

    it('heads the list with the total and the count, without the old subtitle', async () => {
      const wrapper = await mountWhere()
      const block = wrapper.get('[data-testid="dashboard-categories"]')
      const text = block.text().replace(/[\s\u202f\u00a0]+/g, ' ')

      expect(text).toContain('Par catégorie · moyenne par mois, sur 1 000 €')
      expect(text).toContain('Les 3 catégories, les plus lourdes en tête')
      expect(wrapper.text()).not.toContain('Détail par catégorie')
      expect(wrapper.text()).not.toContain('Cliquez sur une catégorie')
    })

    it('keeps the sparklines for the categories at 5 % and above', async () => {
      const wrapper = await mountWhere()
      const list = wrapper.findComponent({ name: 'CategoryBreakdownList' })
      expect(list.props('trendMinShare')).toBe(0.05)

      const sparkline = (name: string) =>
        wrapper
          .get(`[data-testid="category-trend-${name}"]`)
          .findComponent({ name: 'SparklineChart' })
          .exists()
      expect(sparkline('Transport')).toBe(true)
      expect(sparkline('Cadeaux')).toBe(false)
    })

    it('leaves out what moved or went: the structure card, the income section, the families card', async () => {
      const wrapper = await mountWhere({
        totalExceptionalExpenses: 300,
        exceptionalEvents: [
          { id: 'tag-1', name: 'Rome', color: null, icon: null, amount: 300 },
        ],
        tagFamiliesOfYear: [
          {
            id: 'fam-travel',
            name: 'Voyages',
            color: null,
            icon: null,
            year: 2026,
            spent: 300,
            spentByYear: [{ year: 2026, spent: 300 }],
            annualBudget: null,
            remaining: null,
            transactionCount: 2,
            tagCount: 1,
          },
        ],
      })

      for (const id of [
        'dashboard-income-section',
        'dashboard-expenses-section',
        'tag-families-of-year',
        'income-category-filter',
      ]) {
        expect(wrapper.find(`[data-testid="${id}"]`).exists(), id).toBe(false)
      }
      expect(
        wrapper.findAllComponents({ name: 'CategoryPieChart' })
      ).toHaveLength(0)
      // What they said has its line now.
      for (const id of [
        'summary-line-income',
        'summary-line-events',
        'summary-line-episodes',
      ]) {
        expect(wrapper.find(`[data-testid="${id}"]`).exists(), id).toBe(true)
      }
    })

    it('keeps the period at hand on an empty one, in the same header', async () => {
      filtersState.timePeriod = '3m'
      accountsState.accounts = [{ id: 'acc-1' }]
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockEmptySummary)
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      const section = wrapper.get('[data-testid="dashboard-where-section"]')
      expect(section.find('[data-testid="dashboard-period"]').exists()).toBe(
        true
      )
      expect(
        section.find('[data-testid="dashboard-empty-period"]').exists()
      ).toBe(true)
      expect(wrapper.findAll('[data-testid="dashboard-period"]')).toHaveLength(
        1
      )
    })
  })
})
