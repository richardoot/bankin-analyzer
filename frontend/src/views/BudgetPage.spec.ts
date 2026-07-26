import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import BudgetPage from './BudgetPage.vue'
import type { BudgetPlanDto, BudgetStatisticsDto } from '@/lib/api'

vi.mock('vue3-apexcharts', () => ({
  default: {
    name: 'VueApexCharts',
    props: ['type', 'height', 'options', 'series'],
    template: '<div class="apexcharts-mock"></div>',
  },
}))

vi.mock('@/lib/api', () => ({
  api: {
    getCurrentBudgetPlan: vi.fn(),
    getBudgetStatistics: vi.fn(),
    getBudgetPlans: vi.fn().mockResolvedValue([]),
    getBudgetPlan: vi.fn(),
    createBudgetPlan: vi.fn(),
    updateBudgetPlan: vi.fn(),
    deleteBudgetPlan: vi.fn(),
  },
}))

vi.mock('@/stores/filters', () => ({
  useFiltersStore: () => ({
    isExpenseCategoryGloballyHidden: () => false,
    isIncomeCategoryGloballyHidden: () => false,
  }),
}))

import { api } from '@/lib/api'

enableAutoUnmount(afterEach)

const samplePlan: BudgetPlanDto = {
  id: 'plan-1',
  name: 'Mai 2026',
  startDate: '2026-05-01',
  endDate: '2026-05-31',
  monthCount: 1,
  totalAmount: 250,
  entries: [
    {
      id: 'e1',
      categoryId: 'cat-food',
      categoryName: 'Alimentation',
      categoryIcon: '🍽️',
      amount: 250,
    },
  ],
  createdAt: '2026-04-25T00:00:00Z',
  updatedAt: '2026-04-25T00:00:00Z',
}

const sampleStatistics: BudgetStatisticsDto = {
  periodMonths: 1,
  totalExpenses: 320,
  totalIncome: 2500,
  averageMonthlyExpenses: 320,
  averageMonthlyIncome: 2500,
  expensesByCategory: [
    {
      categoryId: 'cat-food',
      categoryName: 'Alimentation',
      categoryIcon: '🍽️',
      totalAmount: 320,
      transactionCount: 5,
      averagePerMonth: 320,
      monthlyAmounts: [320],
    },
    {
      categoryId: 'cat-transport',
      categoryName: 'Transport',
      categoryIcon: '🚗',
      totalAmount: 100,
      transactionCount: 2,
      averagePerMonth: 100,
      monthlyAmounts: [100],
    },
  ],
  incomeByCategory: [
    {
      categoryId: 'cat-salary',
      categoryName: 'Salaire',
      totalAmount: 2500,
      transactionCount: 1,
      averagePerMonth: 2500,
    },
  ],
  monthLabels: ['2026-05'],
}

describe('BudgetPage', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  describe('empty state', () => {
    it('shows the empty state when no current plan exists', async () => {
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue(null)

      const wrapper = mount(BudgetPage)
      await flushPromises()

      expect(wrapper.find('[data-testid="budget-empty-state"]').exists()).toBe(
        true
      )
      expect(wrapper.text()).toContain('Aucun budget en cours')
      // Statistics are not fetched when no plan
      expect(api.getBudgetStatistics).not.toHaveBeenCalled()
    })

    it('opens the wizard when the empty-state CTA is clicked', async () => {
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue(null)

      const wrapper = mount(BudgetPage, { attachTo: document.body })
      await flushPromises()

      // Modal not yet rendered
      expect(
        document.body.querySelector('[data-testid="new-budget-plan-modal"]')
      ).toBeNull()

      const cta = wrapper.find('[data-testid="empty-create-button"]')
      await cta.trigger('click')
      await flushPromises()

      expect(
        document.body.querySelector('[data-testid="new-budget-plan-modal"]')
      ).not.toBeNull()

      wrapper.unmount()
    })

    it('updates the plan + reloads stats when the modal emits "created"', async () => {
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue(null)
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(sampleStatistics)

      const wrapper = mount(BudgetPage, { attachTo: document.body })
      await flushPromises()

      // Reset the spy so we can assert the post-creation call
      vi.mocked(api.getBudgetStatistics).mockClear()

      // Open the modal then emit "created" directly from it
      await wrapper.find('[data-testid="empty-create-button"]').trigger('click')
      await flushPromises()

      const modal = wrapper.findComponent({ name: 'NewBudgetPlanModal' })
      modal.vm.$emit('created', samplePlan)
      await flushPromises()

      // Plan now displayed + statistics fetched for the new plan range
      // (1 call for stats, 1 call for the year-ago availability probe).
      expect(wrapper.text()).toContain('Mai 2026')
      expect(api.getBudgetStatistics).toHaveBeenCalledTimes(2)

      wrapper.unmount()
    })
  })

  describe('with a current plan', () => {
    beforeEach(() => {
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue(samplePlan)
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(sampleStatistics)
    })

    it('renders the plan header with name and date range', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      expect(wrapper.text()).toContain('Mai 2026')
      // Either French long-form (1 mai) or numeric form depending on locale
      expect(wrapper.text()).toMatch(/2026/)
    })

    it('renders the filters card and the category list', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      expect(wrapper.find('[data-testid="budget-filters-card"]').exists()).toBe(
        true
      )
      expect(
        wrapper.find('[data-testid="budget-row-Alimentation"]').exists()
      ).toBe(true)
      expect(
        wrapper.find('[data-testid="budget-row-Transport"]').exists()
      ).toBe(true)
    })

    it('prefills the budget input from existing entries', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      const input = wrapper.find('[data-testid="budget-input-Alimentation"]')
        .element as HTMLInputElement
      expect(input.value).toBe('250')
    })

    it('debounces input changes and PATCHes the plan once', async () => {
      vi.mocked(api.updateBudgetPlan).mockResolvedValue({
        ...samplePlan,
        entries: [
          {
            id: 'e1',
            categoryId: 'cat-food',
            categoryName: 'Alimentation',
            categoryIcon: '🍽️',
            amount: 300,
          },
        ],
      })

      vi.useFakeTimers()
      const wrapper = mount(BudgetPage)
      await vi.advanceTimersToNextTimerAsync()
      await flushPromises()

      const input = wrapper.find('[data-testid="budget-input-Alimentation"]')
      await input.setValue('290')
      await input.setValue('300')

      // Debounce hasn't fired yet
      expect(api.updateBudgetPlan).not.toHaveBeenCalled()

      // Advance through the debounce window
      await vi.advanceTimersByTimeAsync(700)
      await flushPromises()

      expect(api.updateBudgetPlan).toHaveBeenCalledOnce()
      expect(vi.mocked(api.updateBudgetPlan).mock.calls[0]?.[0]).toBe('plan-1')
      const dto = vi.mocked(api.updateBudgetPlan).mock.calls[0]?.[1]
      expect(dto?.entries).toEqual([{ categoryId: 'cat-food', amount: 300 }])

      vi.useRealTimers()
    })

    it('expands a row to show subcategories and chart on click', async () => {
      const detailedStats = {
        ...sampleStatistics,
        expensesByCategory: [
          {
            ...sampleStatistics.expensesByCategory[0]!,
            subcategories: [
              {
                subcategory: 'Courses',
                totalAmount: 250,
                transactionCount: 4,
                averagePerMonth: 250,
              },
            ],
          },
          sampleStatistics.expensesByCategory[1]!,
        ],
      }
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(detailedStats)

      const wrapper = mount(BudgetPage)
      await flushPromises()

      // Drill-down content is initially hidden
      expect(wrapper.text()).not.toContain('Sous-catégories')

      // Click the chevron/name button on the Alimentation row
      const row = wrapper.find('[data-testid="budget-row-Alimentation"]')
      const expandBtn = row.find('button')
      await expandBtn.trigger('click')

      expect(wrapper.text()).toContain('Sous-catégories')
      expect(wrapper.text()).toContain('Courses')
    })

    it('widens the stats fetch range to envelop comparison + plan when comparison is selected', async () => {
      const wrapper = mount(BudgetPage, { attachTo: document.body })
      await flushPromises()
      vi.mocked(api.getBudgetStatistics).mockClear()

      // Open the comparison selector and pick "3 mois précédents"
      await wrapper.find('[data-testid="comparison-trigger"]').trigger('click')
      await flushPromises()
      await wrapper
        .find('[data-testid="comparison-option-3m"]')
        .trigger('click')
      await flushPromises()

      expect(api.getBudgetStatistics).toHaveBeenCalledOnce()
      const args = vi.mocked(api.getBudgetStatistics).mock.calls[0]?.[0]
      // Plan = 2026-05-01 → 2026-05-31. 3 months before → Feb–April 2026.
      expect(args?.startDate).toBe('2026-02-01')
      expect(args?.endDate).toBe('2026-05-31')
      wrapper.unmount()
    })
  })

  describe('history & plan switching', () => {
    const planSummaries = [
      {
        id: 'plan-1',
        name: 'Mai 2026',
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        monthCount: 1,
        totalAmount: 250,
        entryCount: 1,
        createdAt: '2026-04-25T00:00:00Z',
      },
      {
        id: 'plan-old',
        name: 'Avril 2026',
        startDate: '2026-04-01',
        endDate: '2026-04-30',
        monthCount: 1,
        totalAmount: 300,
        entryCount: 2,
        createdAt: '2026-03-25T00:00:00Z',
      },
    ]

    it('shows the Historique button when prior plans exist', async () => {
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue(samplePlan)
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(sampleStatistics)
      vi.mocked(api.getBudgetPlans).mockResolvedValue(planSummaries)

      const wrapper = mount(BudgetPage, { attachTo: document.body })
      await flushPromises()

      expect(
        wrapper.find('[data-testid="header-history-button"]').exists()
      ).toBe(true)
      wrapper.unmount()
    })

    it('hides the Historique button when no plans exist', async () => {
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue(null)
      vi.mocked(api.getBudgetPlans).mockResolvedValue([])

      const wrapper = mount(BudgetPage, { attachTo: document.body })
      await flushPromises()

      expect(
        wrapper.find('[data-testid="header-history-button"]').exists()
      ).toBe(false)
      wrapper.unmount()
    })

    it('loads the selected plan and refetches stats when "select" is emitted', async () => {
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue(samplePlan)
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(sampleStatistics)
      vi.mocked(api.getBudgetPlans).mockResolvedValue(planSummaries)
      vi.mocked(api.getBudgetPlan).mockResolvedValue({
        ...samplePlan,
        id: 'plan-old',
        name: 'Avril 2026',
        startDate: '2026-04-01',
        endDate: '2026-04-30',
      })

      const wrapper = mount(BudgetPage, { attachTo: document.body })
      await flushPromises()
      vi.mocked(api.getBudgetStatistics).mockClear()

      const historyModal = wrapper.findComponent({
        name: 'BudgetPlansHistoryModal',
      })
      historyModal.vm.$emit('select', 'plan-old')
      await flushPromises()

      expect(api.getBudgetPlan).toHaveBeenCalledWith('plan-old')
      // 1 call for the new plan's stats + 1 call for the year-ago probe
      expect(api.getBudgetStatistics).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain('Avril 2026')

      wrapper.unmount()
    })

    it('falls back to empty state when the displayed plan is deleted and no other current plan exists', async () => {
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue(samplePlan)
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(sampleStatistics)
      vi.mocked(api.getBudgetPlans).mockResolvedValue(planSummaries)

      const wrapper = mount(BudgetPage, { attachTo: document.body })
      await flushPromises()

      // The displayed plan is samplePlan (id: plan-1). Now simulate its deletion.
      // After deletion, fetchPlan will be called again and return null.
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue(null)

      const historyModal = wrapper.findComponent({
        name: 'BudgetPlansHistoryModal',
      })
      historyModal.vm.$emit('deleted', 'plan-1')
      await flushPromises()

      // Empty state visible
      expect(wrapper.find('[data-testid="budget-empty-state"]').exists()).toBe(
        true
      )
      wrapper.unmount()
    })

    it('keeps the displayed plan when a different plan is deleted', async () => {
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue(samplePlan)
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(sampleStatistics)
      vi.mocked(api.getBudgetPlans).mockResolvedValue(planSummaries)

      const wrapper = mount(BudgetPage, { attachTo: document.body })
      await flushPromises()

      const historyModal = wrapper.findComponent({
        name: 'BudgetPlansHistoryModal',
      })
      // Delete a different plan than the one currently displayed
      historyModal.vm.$emit('deleted', 'plan-old')
      await flushPromises()

      // Plan still shown
      expect(wrapper.text()).toContain('Mai 2026')
      // No fallback fetch was issued
      expect(api.getCurrentBudgetPlan).toHaveBeenCalledOnce()
      wrapper.unmount()
    })

    it('renders a status badge reflecting the plan position relative to today', async () => {
      // A clearly-past plan
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue({
        ...samplePlan,
        id: 'plan-past',
        name: 'Plan passé',
        startDate: '2020-01-01',
        endDate: '2020-12-31',
      })
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(sampleStatistics)
      vi.mocked(api.getBudgetPlans).mockResolvedValue([])

      const wrapper = mount(BudgetPage, { attachTo: document.body })
      await flushPromises()

      expect(wrapper.find('[data-testid="plan-status-past"]').exists()).toBe(
        true
      )
      expect(wrapper.text()).toContain('Terminé')
      wrapper.unmount()
    })
  })

  describe("chart income reference (no dilution by the plan's future months)", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('passes income averaged over elapsed plan months, not the full plan span', async () => {
      // Plan June→Dec 2026 (7 months). Only June has fully elapsed and July is
      // in progress; Aug→Dec are empty. Income = 1232.28 in June and July.
      // planIncomeAvg would dilute to 2464.56 / 7 ≈ 352.08 — the bug. The
      // "Revenus" reference must instead reflect ~1232.28 (elapsed months).
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-15T12:00:00Z'))

      const months = [
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
        '2026-10',
        '2026-11',
        '2026-12',
      ]
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue({
        ...samplePlan,
        id: 'plan-jun-dec',
        name: 'Juin–Déc 2026',
        startDate: '2026-06-01',
        endDate: '2026-12-31',
        monthCount: 7,
      })
      vi.mocked(api.getBudgetStatistics).mockResolvedValue({
        ...sampleStatistics,
        periodMonths: 7,
        monthLabels: months,
        expensesByCategory: [
          {
            categoryId: 'cat-food',
            categoryName: 'Alimentation',
            categoryIcon: '🍽️',
            totalAmount: 3418,
            transactionCount: 10,
            averagePerMonth: 488,
            monthlyAmounts: [1709, 1709, 0, 0, 0, 0, 0],
          },
        ],
        incomeByCategory: [
          {
            categoryId: 'cat-salary',
            categoryName: 'Salaire',
            totalAmount: 2464.56,
            transactionCount: 2,
            averagePerMonth: 1232.28,
            monthlyAmounts: [1232.28, 1232.28, 0, 0, 0, 0, 0],
          },
        ],
      })

      const wrapper = mount(BudgetPage, { attachTo: document.body })
      await flushPromises()

      const chart = wrapper.findComponent({ name: 'MonthlyExpensesChart' })
      expect(chart.exists()).toBe(true)
      // Elapsed-month average (June only), not the diluted 352.08.
      expect(chart.props('averageIncome')).toBeCloseTo(1232.28, 2)
      wrapper.unmount()
    })
  })
})
