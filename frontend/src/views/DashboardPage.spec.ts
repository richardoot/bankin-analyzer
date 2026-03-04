import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import DashboardPage from './DashboardPage.vue'

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
    getTransactions: vi.fn(),
  },
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

  const mockTransactions = [
    {
      id: '1',
      date: '2024-01-15T00:00:00.000Z',
      description: 'Restaurant',
      amount: -45.5,
      type: 'EXPENSE' as const,
      account: 'Compte Courant',
      categoryName: 'Alimentation',
      isPointed: false,
      createdAt: '2024-01-15T00:00:00.000Z',
    },
    {
      id: '2',
      date: '2024-01-25T00:00:00.000Z',
      description: 'Salaire',
      amount: 2500.0,
      type: 'INCOME' as const,
      account: 'Compte Courant',
      categoryName: 'Salaires',
      isPointed: true,
      createdAt: '2024-01-25T00:00:00.000Z',
    },
    {
      id: '3',
      date: '2024-01-20T00:00:00.000Z',
      description: 'Loyer',
      amount: -800.0,
      type: 'EXPENSE' as const,
      account: 'Compte Courant',
      categoryName: 'Logement',
      isPointed: false,
      createdAt: '2024-01-20T00:00:00.000Z',
    },
  ]

  it('should display page title', async () => {
    vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Dashboard')
    expect(wrapper.text()).toContain("Vue d'ensemble de vos finances")
  })

  it('should fetch transactions on mount', async () => {
    vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

    mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    expect(api.getTransactions).toHaveBeenCalled()
  })

  it('should display error message on API failure', async () => {
    vi.mocked(api.getTransactions).mockRejectedValue(new Error('Network error'))

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Network error')
  })

  it('should display total expenses and income', async () => {
    vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

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
    vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

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
    vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

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
    vi.mocked(api.getTransactions).mockResolvedValue([])

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
    vi.mocked(api.getTransactions).mockResolvedValue([])

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
    const incomeOnly = [
      {
        id: '1',
        date: '2024-01-25T00:00:00.000Z',
        description: 'Salaire',
        amount: 2500.0,
        type: 'INCOME' as const,
        account: 'Compte Courant',
        isPointed: true,
        createdAt: '2024-01-25T00:00:00.000Z',
      },
    ]

    vi.mocked(api.getTransactions).mockResolvedValue(incomeOnly)

    const wrapper = mount(DashboardPage, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Aucune dépense enregistrée')
  })

  it('should display "no income" message when only expenses', async () => {
    const expensesOnly = [
      {
        id: '1',
        date: '2024-01-15T00:00:00.000Z',
        description: 'Restaurant',
        amount: -45.5,
        type: 'EXPENSE' as const,
        account: 'Compte Courant',
        categoryName: 'Alimentation',
        isPointed: false,
        createdAt: '2024-01-15T00:00:00.000Z',
      },
    ]

    vi.mocked(api.getTransactions).mockResolvedValue(expensesOnly)

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
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

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
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      const select = wrapper.find('select')
      expect(select.exists()).toBe(true)
    })

    it('should have "Toutes les catégories" as default option', async () => {
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      const select = wrapper.find('select')
      expect(select.text()).toContain('Toutes les catégories')
    })

    it('should list available expense categories in dropdown', async () => {
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      const select = wrapper.find('select')
      expect(select.text()).toContain('Alimentation')
      expect(select.text()).toContain('Logement')
    })

    it('should update chart when category is selected', async () => {
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      const selects = wrapper.findAll('select')
      await selects[0].setValue('Alimentation')

      // The component should still render without errors
      expect(wrapper.findAll('.apexcharts-mock').length).toBeGreaterThan(0)
    })
  })

  describe('income category filter', () => {
    it('should display two category filter dropdowns', async () => {
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      const selects = wrapper.findAll('select')
      expect(selects.length).toBe(2)
    })

    it('should list available income categories in second dropdown', async () => {
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      const selects = wrapper.findAll('select')
      const incomeSelect = selects[1]
      expect(incomeSelect.text()).toContain('Toutes les catégories')
      expect(incomeSelect.text()).toContain('Salaires')
    })

    it('should update income chart when category is selected', async () => {
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = mount(DashboardPage, {
        global: {
          plugins: [router],
        },
      })

      await flushPromises()

      const selects = wrapper.findAll('select')
      await selects[1].setValue('Salaires')

      // The component should still render without errors
      expect(wrapper.findAll('.apexcharts-mock').length).toBeGreaterThan(0)
    })
  })
})
