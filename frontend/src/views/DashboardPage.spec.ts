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

    expect(wrapper.text()).toContain('Dépenses par mois')
    expect(wrapper.text()).toContain('Revenus par mois')
  })

  it('should render charts when data is available', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    // 2 bar charts (expenses, income) + the income donut: the expenses
    // shares live in the category list
    expect(wrapper.findAll('.apexcharts-mock').length).toBe(3)
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

  it('should display "no expenses" message when only income', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockIncomeOnlySummary)

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Aucune dépense enregistrée')
  })

  it('should display "no income" message when only expenses', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockExpenseOnlySummary)

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Aucun revenu enregistré')
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

    it('has no filters card: the reading in the header, the period above the expenses', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      expect(
        wrapper.find('[data-testid="dashboard-filters-card"]').exists()
      ).toBe(false)
      const menu = wrapper.get('[data-testid="reading-menu"]').element
      const period = wrapper.get('[data-testid="dashboard-period"]').element
      const expenses = wrapper.get(
        '[data-testid="dashboard-expenses-section"]'
      ).element
      const banner = wrapper.findComponent({ name: 'LegacyMigrationBanner' })
      expect(banner.exists()).toBe(true)
      const follows = (a: Node, b: Node) =>
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      // The banner (or the comment standing in for it) comes under the menu.
      expect(follows(menu, banner.vm.$el as Node)).toBe(true)
      expect(follows(period, expenses)).toBe(true)
      expect(period.nextElementSibling).toBe(expenses)
    })
  })

  describe('pie charts', () => {
    it('keeps the income donut only: the list carries the expenses shares', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      expect(wrapper.text()).not.toContain('Dépenses par catégorie')
      expect(wrapper.text()).toContain('Revenus par catégorie')
      const donuts = wrapper.findAllComponents({ name: 'CategoryPieChart' })
      expect(donuts).toHaveLength(1)
      expect(donuts[0]?.props('title')).toBe('Revenus')
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
      const [expensesBars] = wrapper.findAllComponents({
        name: 'MonthlyBarChart',
      })
      expect(expensesBars?.props('title')).toBe('Dépenses')
      // Every expense of each month, never one category's.
      expect(expensesBars?.props('data')).toEqual({
        labels: ['Jan 2024'],
        values: [845.5],
      })
    })
  })

  describe('income category filter', () => {
    it('should display the income category dropdown', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      const incomeSelect = wrapper.find(
        '[data-testid="income-category-filter"]'
      )
      expect(incomeSelect.exists()).toBe(true)
    })

    it('names the income category select for assistive tech', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      const select = wrapper.get('[data-testid="income-category-filter"]')
      const label = wrapper.get(`label[for="${select.attributes('id')}"]`)
      expect(label.text()).toBe('Catégorie des revenus par mois')
    })

    it('should list available income categories in second dropdown', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      const incomeSelect = wrapper.find(
        '[data-testid="income-category-filter"]'
      )
      expect(incomeSelect.text()).toContain('Toutes les catégories')
      expect(incomeSelect.text()).toContain('Salaires')
    })

    it('should update income chart when category is selected', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue({
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 100,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      const incomeSelect = wrapper.find(
        '[data-testid="income-category-filter"]'
      )
      await incomeSelect.setValue('Salaires')

      // The component should still render without errors
      expect(wrapper.findAll('.apexcharts-mock').length).toBeGreaterThan(0)
    })
  })

  describe('links to the Transactions page', () => {
    it('offers the period of each monthly chart, the income one narrowed by its select, gross', async () => {
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

      const income = wrapper.get('[data-testid="income-transactions-link"]')
      expect(income.attributes('href')).toContain('type=INCOME')
      await wrapper
        .find('[data-testid="income-category-filter"]')
        .setValue('cat-Salaires')
      expect(income.attributes('href')).toContain('category=cat-Salaires')
      expect(income.attributes('href')).toContain('Salaires')
    })

    it('hands the income donut the ids behind its labels, « sans catégorie » as a word', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue({
        ...mockSummary,
        incomeByCategory: [
          ...mockSummary.incomeByCategory,
          {
            categoryId: '__uncategorized__',
            category: 'Non classé',
            amount: 1,
          },
        ],
      })
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      const donuts = wrapper.findAllComponents({ name: 'CategoryPieChart' })
      expect(donuts.map(d => d.props('ids'))).toEqual([
        ['cat-Salaires', 'none'],
      ])
    })

    it('opens a month from a bar and a category from a slice', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      const push = vi.spyOn(router, 'push').mockResolvedValue(undefined)
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      const [expensesBars] = wrapper.findAllComponents({
        name: 'MonthlyBarChart',
      })
      expensesBars?.vm.$emit('select-month', '2024-01')
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

      const [incomeDonut] = wrapper.findAllComponents({
        name: 'CategoryPieChart',
      })
      incomeDonut?.vm.$emit('select', 'cat-Salaires')
      expect(push).toHaveBeenLastCalledWith({
        path: '/transactions',
        query: {
          type: 'INCOME',
          category: 'cat-Salaires',
          label: 'Salaires',
          gross: '1',
        },
      })
      incomeDonut?.vm.$emit('select-others', ['cat-a', 'none'])
      expect(push).toHaveBeenLastCalledWith({
        path: '/transactions',
        query: {
          type: 'INCOME',
          categories: 'cat-a,none',
          label: 'Revenus · Autres (2)',
          gross: '1',
        },
      })
      push.mockRestore()
    })

    it('links each event chip to its tag over the period, beside the analysis', async () => {
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

      const link = wrapper.get('[data-testid="event-transactions-link-tag-1"]')
      expect(link.attributes('href')).toBe(
        '/transactions?tag=tag-1&label=Vacances&gross=1'
      )
      expect(link.attributes('aria-label')).toBe(
        'Voir les transactions de Vacances'
      )
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
      return wrapper.find('[data-testid="tag-families-of-year"]')
    }

    it('shows the card when an event touches the period and a family spent this year', async () => {
      const card = await mountWith({
        ...withEvent,
        tagFamiliesOfYear: [family],
        realExpensesOfYear: 6000,
        exceptionalExpensesOfYear: 1000,
      })

      expect(card.exists()).toBe(true)
      expect(card.text()).toContain("Épisodes de l'année 2026")
      expect(card.text()).toContain('5 % du réel')
      // The year's exceptional expenses reach the card: its bar and share.
      expect(card.text()).toContain("30 % de l'exceptionnel de l'année")
      expect(card.find('[data-testid="families-of-year-stack"]').exists()).toBe(
        true
      )
    })

    it('leaves it out without a family', async () => {
      const card = await mountWith({
        ...withEvent,
        tagFamiliesOfYear: [],
        realExpensesOfYear: null,
        exceptionalExpensesOfYear: null,
      })

      expect(card.exists()).toBe(false)
    })

    it('leaves it out when no event touches the period', async () => {
      const card = await mountWith({
        ...mockSummary,
        tagFamiliesOfYear: [family],
        realExpensesOfYear: 6000,
      })

      expect(card.exists()).toBe(false)
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

    it('sits after the month band and before the structure', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue({
        ...mockSummary,
        spendingStructure: structure,
        everydaySpendingStructure: structure,
      })
      const wrapper = mount(DashboardPage, { global: { plugins: [router] } })
      await flushPromises()

      const order = [
        'month-band',
        'spending-trends',
        'spending-structure',
        'dashboard-expenses-section',
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
        'dashboard-expenses-section',
        'dashboard-income-section',
      ]) {
        const other = wrapper.get(`[data-testid="${id}"]`).element
        expect(
          band.element.compareDocumentPosition(other) &
            Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
      }
      for (const id of [
        'kpi-card-expenses',
        'kpi-card-income',
        'kpi-card-savings',
      ]) {
        expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(false)
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
        wrapper.find('[data-testid="dashboard-expenses-section"]').exists()
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
})
