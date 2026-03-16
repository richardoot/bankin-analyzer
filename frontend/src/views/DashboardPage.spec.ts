import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import DashboardPage from './DashboardPage.vue'
import type { DashboardSummaryDto } from '@/lib/api'

// Mock vue3-apexcharts
vi.mock('vue3-apexcharts', () => ({
  default: {
    name: 'VueApexCharts',
    props: ['type', 'height', 'options', 'series'],
    template: '<div class="apexcharts-mock"></div>',
  },
}))

// Mock the API
vi.mock('@/lib/api', () => ({
  api: {
    getDashboardSummary: vi.fn(),
    getTransactions: vi.fn(),
  },
}))

// Mock the filters store
vi.mock('@/stores/filters', () => ({
  useFiltersStore: () => ({
    jointAccounts: [],
    hiddenExpenseCategories: [],
    hiddenIncomeCategories: [],
    isJointAccount: vi.fn(() => false),
    isExpenseCategoryHidden: vi.fn(() => false),
    isIncomeCategoryHidden: vi.fn(() => false),
    loadFromBackend: vi.fn(),
    isPanelExpanded: true,
    togglePanelExpanded: vi.fn(),
    activeFiltersCount: 0,
    toggleJointAccount: vi.fn(),
    toggleHiddenExpenseCategory: vi.fn(),
    toggleHiddenIncomeCategory: vi.fn(),
    saveToBackend: vi.fn(),
    isSyncing: false,
    hasUnsavedChanges: false,
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
  })

  const mockSummary: DashboardSummaryDto = {
    monthlyData: [
      { month: '2024-01', label: 'Jan 2024', expenses: 845.5, income: 2500 },
    ],
    expensesByCategory: [
      { category: 'Logement', amount: 800 },
      { category: 'Alimentation', amount: 45.5 },
    ],
    incomeByCategory: [{ category: 'Salaires', amount: 2500 }],
    totalExpenses: 845.5,
    totalIncome: 2500,
    allExpenseCategories: ['Alimentation', 'Logement'],
    allIncomeCategories: ['Salaires'],
    availableAccounts: ['Compte Courant'],
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
  }

  const mockIncomeOnlySummary: DashboardSummaryDto = {
    monthlyData: [
      { month: '2024-01', label: 'Jan 2024', expenses: 0, income: 2500 },
    ],
    expensesByCategory: [],
    incomeByCategory: [{ category: 'Salaires', amount: 2500 }],
    totalExpenses: 0,
    totalIncome: 2500,
    allExpenseCategories: [],
    allIncomeCategories: ['Salaires'],
    availableAccounts: ['Compte Courant'],
  }

  const mockExpenseOnlySummary: DashboardSummaryDto = {
    monthlyData: [
      { month: '2024-01', label: 'Jan 2024', expenses: 45.5, income: 0 },
    ],
    expensesByCategory: [{ category: 'Alimentation', amount: 45.5 }],
    incomeByCategory: [],
    totalExpenses: 45.5,
    totalIncome: 0,
    allExpenseCategories: ['Alimentation'],
    allIncomeCategories: [],
    availableAccounts: ['Compte Courant'],
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

  it('should display total expenses and income', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Total des dépenses')
    expect(wrapper.text()).toContain('Total des revenus')
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

    // 2 bar charts (expenses, income) + 2 pie charts (expenses by category, income by category)
    expect(wrapper.findAll('.apexcharts-mock').length).toBe(4)
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
      link.text().includes('Importer des transactions')
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

  describe('pie charts', () => {
    it('should display pie chart section titles', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      expect(wrapper.text()).toContain('Dépenses par catégorie')
      expect(wrapper.text()).toContain('Revenus par catégorie')
    })
  })

  describe('category filter', () => {
    it('should display category filter dropdown', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      const select = wrapper.find('[data-testid="expense-category-filter"]')
      expect(select.exists()).toBe(true)
    })

    it('should have "Toutes les catégories" as default option', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      const select = wrapper.find('[data-testid="expense-category-filter"]')
      expect(select.text()).toContain('Toutes les catégories')
    })

    it('should list available expense categories in dropdown', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      const select = wrapper.find('[data-testid="expense-category-filter"]')
      expect(select.text()).toContain('Alimentation')
      expect(select.text()).toContain('Logement')
    })

    it('should update chart when category is selected', async () => {
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

      const select = wrapper.find('[data-testid="expense-category-filter"]')
      await select.setValue('Alimentation')

      // The component should still render without errors
      expect(wrapper.findAll('.apexcharts-mock').length).toBeGreaterThan(0)
    })
  })

  describe('income category filter', () => {
    it('should display two category filter dropdowns', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      const expenseSelect = wrapper.find(
        '[data-testid="expense-category-filter"]'
      )
      const incomeSelect = wrapper.find(
        '[data-testid="income-category-filter"]'
      )
      expect(expenseSelect.exists()).toBe(true)
      expect(incomeSelect.exists()).toBe(true)
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
})
