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

const routerPush = vi.fn()
/** The guard the page registers, captured so a test can run it. */
let routeLeaveGuard: (() => boolean) | null = null
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
  onBeforeRouteLeave: (guard: () => boolean) => {
    routeLeaveGuard = guard
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
    getTags: vi.fn().mockResolvedValue([]),
    getTagBudgetSummary: vi.fn(),
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
    vi.mocked(api.getTags).mockResolvedValue([])
    vi.mocked(api.getTagBudgetSummary).mockResolvedValue({
      items: [],
      totalBudget: 0,
      totalSpent: 0,
    })
    localStorage.clear()
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

    it('shows the envelope as text until the user asks to edit', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      expect(
        wrapper.find('[data-testid="budget-input-Alimentation"]').exists()
      ).toBe(false)
      expect(
        wrapper.find('[data-testid="budget-value-Alimentation"]').text()
      ).toContain('250')
      expect(
        wrapper.find('[data-testid="budget-quick-actions"]').exists()
      ).toBe(false)
      expect(wrapper.find('[data-testid="budget-edit-bar"]').exists()).toBe(
        false
      )
    })

    it('prefills the budget input from existing entries once editing', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()
      await wrapper.find('[data-testid="budget-edit-button"]').trigger('click')

      const input = wrapper.find('[data-testid="budget-input-Alimentation"]')
        .element as HTMLInputElement
      expect(input.value).toBe('250')
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

  describe('editing budgets', () => {
    beforeEach(() => {
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue(samplePlan)
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(sampleStatistics)
    })

    async function mountEditing() {
      const wrapper = mount(BudgetPage)
      await flushPromises()
      await wrapper.find('[data-testid="budget-edit-button"]').trigger('click')
      return wrapper
    }

    it('writes nothing until "Enregistrer" is pressed', async () => {
      const wrapper = await mountEditing()

      await wrapper
        .find('[data-testid="budget-input-Alimentation"]')
        .setValue('300')
      await wrapper
        .find('[data-testid="budget-input-Transport"]')
        .setValue('80')

      expect(api.updateBudgetPlan).not.toHaveBeenCalled()

      vi.mocked(api.updateBudgetPlan).mockResolvedValue(samplePlan)
      await wrapper.find('[data-testid="budget-save-button"]').trigger('click')
      await flushPromises()

      expect(api.updateBudgetPlan).toHaveBeenCalledOnce()
      expect(vi.mocked(api.updateBudgetPlan).mock.calls[0]?.[0]).toBe('plan-1')
      expect(
        vi.mocked(api.updateBudgetPlan).mock.calls[0]?.[1]?.entries
      ).toEqual([
        { categoryId: 'cat-food', amount: 300 },
        { categoryId: 'cat-transport', amount: 80 },
      ])
    })

    it('restores the saved envelopes on "Annuler" and leaves the server alone', async () => {
      const wrapper = await mountEditing()

      await wrapper
        .find('[data-testid="budget-input-Alimentation"]')
        .setValue('999')
      await wrapper
        .find('[data-testid="budget-cancel-button"]')
        .trigger('click')

      expect(api.updateBudgetPlan).not.toHaveBeenCalled()
      expect(
        wrapper.find('[data-testid="budget-value-Alimentation"]').text()
      ).toContain('250')
    })

    it('counts what changed and shows the total it would move to', async () => {
      const wrapper = await mountEditing()

      expect(wrapper.find('[data-testid="budget-dirty-count"]').exists()).toBe(
        false
      )
      // Nothing to save yet.
      expect(
        (
          wrapper.find('[data-testid="budget-save-button"]')
            .element as HTMLButtonElement
        ).disabled
      ).toBe(true)

      await wrapper
        .find('[data-testid="budget-input-Alimentation"]')
        .setValue('300')

      expect(
        wrapper.find('[data-testid="budget-dirty-count"]').text()
      ).toContain('1 catégorie')
      expect(
        wrapper.find('[data-testid="budget-draft-delta"]').text()
      ).toContain('+')
      expect(
        wrapper.find('[data-testid="budget-was-Alimentation"]').text()
      ).toContain('250')
      expect(
        (
          wrapper.find('[data-testid="budget-save-button"]')
            .element as HTMLButtonElement
        ).disabled
      ).toBe(false)
    })

    it('empties the draft on "Réinitialiser" without touching the server', async () => {
      const wrapper = await mountEditing()

      const reset = wrapper
        .findAll('[data-testid="budget-quick-actions"] button')
        .find(b => b.text() === 'Réinitialiser')
      expect(reset).toBeDefined()
      await reset?.trigger('click')

      expect(api.updateBudgetPlan).not.toHaveBeenCalled()
      const input = wrapper.find('[data-testid="budget-input-Alimentation"]')
        .element as HTMLInputElement
      expect(input.value).toBe('')

      // And it is undoable, which is what removes the need to confirm it.
      await wrapper
        .find('[data-testid="budget-cancel-button"]')
        .trigger('click')
      expect(
        wrapper.find('[data-testid="budget-value-Alimentation"]').text()
      ).toContain('250')
    })

    it('does not let a reference figure rewrite a budget outside edit mode', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      // The "Réel" figure is plain text in read mode, never a button.
      const buttons = wrapper
        .find('[data-testid="budget-row-Alimentation"]')
        .findAll('button')
      expect(
        buttons.some(b => b.attributes('title')?.includes('appliquer'))
      ).toBe(false)

      await wrapper.find('[data-testid="budget-edit-button"]').trigger('click')
      const editButtons = wrapper
        .find('[data-testid="budget-row-Alimentation"]')
        .findAll('button')
      expect(
        editButtons.some(b => b.attributes('title')?.includes('appliquer'))
      ).toBe(true)
    })

    it('blocks plan switching while a draft is open', async () => {
      vi.mocked(api.getBudgetPlans).mockResolvedValue([
        {
          id: 'plan-old',
          name: 'Avril 2026',
          startDate: '2026-04-01',
          endDate: '2026-04-30',
          monthCount: 1,
          totalAmount: 200,
          entryCount: 1,
          createdAt: '2026-03-20T00:00:00Z',
        },
      ])
      const wrapper = await mountEditing()

      expect(
        (
          wrapper.find('[data-testid="header-history-button"]')
            .element as HTMLButtonElement
        ).disabled
      ).toBe(true)
      expect(
        (
          wrapper.find('[data-testid="header-new-plan-button"]')
            .element as HTMLButtonElement
        ).disabled
      ).toBe(true)
    })

    it('asks before routing away from unsaved changes', async () => {
      const wrapper = await mountEditing()
      expect(routeLeaveGuard).not.toBeNull()

      // Nothing pending: leaving is never questioned.
      expect(routeLeaveGuard?.()).toBe(true)

      await wrapper
        .find('[data-testid="budget-input-Alimentation"]')
        .setValue('300')

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      expect(routeLeaveGuard?.()).toBe(false)
      expect(confirmSpy).toHaveBeenCalled()
      confirmSpy.mockRestore()
    })

    it('keeps the draft when the save fails', async () => {
      const wrapper = await mountEditing()
      await wrapper
        .find('[data-testid="budget-input-Alimentation"]')
        .setValue('300')

      vi.mocked(api.updateBudgetPlan).mockRejectedValue(new Error('boom'))
      await wrapper.find('[data-testid="budget-save-button"]').trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('boom')
      const input = wrapper.find('[data-testid="budget-input-Alimentation"]')
        .element as HTMLInputElement
      expect(input.value).toBe('300')
    })

    it('warns before editing the envelopes of a finished plan', async () => {
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue({
        ...samplePlan,
        startDate: '2020-01-01',
        endDate: '2020-01-31',
      })
      const wrapper = await mountEditing()

      expect(
        wrapper.find('[data-testid="budget-past-plan-warning"]').exists()
      ).toBe(true)
    })
  })

  describe('month-by-month tracking', () => {
    /**
     * Plan June→Dec 2026, read on 20 August. June and July are complete,
     * August is running: three months on offer, and the average covers two.
     */
    const months = [
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]

    const planJunDec: BudgetPlanDto = {
      ...samplePlan,
      id: 'plan-jun-dec',
      name: 'Juin–Déc 2026',
      startDate: '2026-06-01',
      endDate: '2026-12-31',
      monthCount: 7,
      totalAmount: 300,
      entries: [
        {
          id: 'e1',
          categoryId: 'cat-food',
          categoryName: 'Alimentation',
          categoryIcon: '🍽️',
          amount: 300,
        },
      ],
    }

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-20T12:00:00Z'))
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue(planJunDec)
      vi.mocked(api.getBudgetStatistics).mockResolvedValue({
        ...sampleStatistics,
        periodMonths: 7,
        monthLabels: months,
        expensesByCategory: [
          {
            categoryId: 'cat-food',
            categoryName: 'Alimentation',
            categoryIcon: '🍽️',
            totalAmount: 900,
            transactionCount: 12,
            averagePerMonth: 128,
            //          juin juil août
            monthlyAmounts: [500, 200, 200, 0, 0, 0, 0],
          },
        ],
        incomeByCategory: [
          {
            categoryId: 'cat-salary',
            categoryName: 'Salaire',
            totalAmount: 3000,
            transactionCount: 3,
            averagePerMonth: 1000,
            monthlyAmounts: [1000, 1000, 1000, 0, 0, 0, 0],
          },
        ],
      })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const foodRow = (w: ReturnType<typeof mount>) =>
      w.find('[data-testid="budget-row-Alimentation"]')

    it('offers every started plan month, and only those', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      expect(
        wrapper.find('[data-testid="budget-month-2026-06"]').exists()
      ).toBe(true)
      expect(
        wrapper.find('[data-testid="budget-month-2026-08"]').exists()
      ).toBe(true)
      // September has not started: nothing to look at.
      expect(
        wrapper.find('[data-testid="budget-month-2026-09"]').exists()
      ).toBe(false)
      wrapper.unmount()
    })

    it('averages the complete months until a month is picked', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      // (500 + 200) / 2 = 350 — August is still running and stays out.
      expect(foodRow(wrapper).text()).toMatch(/350/)
      expect(
        wrapper.find('[data-testid="budget-actual-period"]').text()
      ).toContain('2 mois')
      wrapper.unmount()
    })

    it('reads a single month untouched once one is picked', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      await wrapper
        .find('[data-testid="budget-month-2026-06"]')
        .trigger('click')
      expect(foodRow(wrapper).text()).toMatch(/500/)
      expect(foodRow(wrapper).text()).not.toMatch(/350/)

      await wrapper
        .find('[data-testid="budget-month-2026-07"]')
        .trigger('click')
      expect(foodRow(wrapper).text()).toMatch(/200/)
      wrapper.unmount()
    })

    it('shows the running month, which the average can never reach', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      await wrapper
        .find('[data-testid="budget-month-2026-08"]')
        .trigger('click')

      expect(foodRow(wrapper).text()).toMatch(/200/)
      const period = wrapper.find('[data-testid="budget-actual-period"]').text()
      expect(period).toContain('Août 2026')
      expect(period).toContain('20/31')
      wrapper.unmount()
    })

    it('prorates the envelope on the running month only', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      // A complete month is judged against the whole envelope.
      await wrapper
        .find('[data-testid="budget-month-2026-06"]')
        .trigger('click')
      expect(
        wrapper.find('[data-testid="budget-prorata-Alimentation"]').exists()
      ).toBe(false)

      // The running one gets its share to date: 300 × 20/31 ≈ 194.
      await wrapper
        .find('[data-testid="budget-month-2026-08"]')
        .trigger('click')
      expect(
        wrapper.find('[data-testid="budget-prorata-Alimentation"]').text()
      ).toMatch(/19[34]/)
      wrapper.unmount()
    })

    it('returns to the average when the month is deselected', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      await wrapper
        .find('[data-testid="budget-month-2026-06"]')
        .trigger('click')
      expect(foodRow(wrapper).text()).toMatch(/500/)

      await wrapper
        .find('[data-testid="budget-month-average"]')
        .trigger('click')
      expect(foodRow(wrapper).text()).toMatch(/350/)
      wrapper.unmount()
    })

    it('selects a month when its bar is clicked, and releases it on a second click', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      const chart = wrapper.findComponent({ name: 'MonthlyExpensesChart' })
      chart.vm.$emit('select-month', '2026-06')
      await flushPromises()
      expect(foodRow(wrapper).text()).toMatch(/500/)

      chart.vm.$emit('select-month', '2026-06')
      await flushPromises()
      expect(foodRow(wrapper).text()).toMatch(/350/)
      wrapper.unmount()
    })

    it('ignores a bar that is not a started plan month', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      const chart = wrapper.findComponent({ name: 'MonthlyExpensesChart' })
      chart.vm.$emit('select-month', '2026-11')
      await flushPromises()

      // Still the average — November carries nothing to read.
      expect(foodRow(wrapper).text()).toMatch(/350/)
      wrapper.unmount()
    })

    it('lays the plan out month by month, envelope beside spending', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      const matrix = wrapper.find('[data-testid="budget-monthly-matrix"]')
      expect(matrix.exists()).toBe(true)
      expect(
        wrapper.find('[data-testid="matrix-cell-Alimentation-2026-06"]').text()
      ).toMatch(/500/)
      expect(
        wrapper.find('[data-testid="matrix-cell-Alimentation-2026-08"]').text()
      ).toMatch(/200/)
      // September has not started — it is not a column.
      expect(
        wrapper
          .find('[data-testid="matrix-cell-Alimentation-2026-09"]')
          .exists()
      ).toBe(false)
      wrapper.unmount()
    })

    it('selects a month from the grid header', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      await wrapper
        .find('[data-testid="matrix-header-2026-06"]')
        .trigger('click')

      expect(foodRow(wrapper).text()).toMatch(/500/)
      wrapper.unmount()
    })

    it('hides the grid on a plan with a single started month', async () => {
      vi.setSystemTime(new Date('2026-06-10T12:00:00Z'))
      const wrapper = mount(BudgetPage)
      await flushPromises()

      expect(
        wrapper.find('[data-testid="budget-monthly-matrix"]').exists()
      ).toBe(false)
      wrapper.unmount()
    })

    it('reads the grid through the active breakdown mode', async () => {
      localStorage.setItem('budget-breakdown-mode', 'everyday')
      vi.mocked(api.getBudgetStatistics).mockResolvedValue({
        ...sampleStatistics,
        periodMonths: 7,
        monthLabels: months,
        expensesByCategory: [
          {
            categoryId: 'cat-food',
            categoryName: 'Alimentation',
            categoryIcon: '🍽️',
            totalAmount: 900,
            transactionCount: 12,
            averagePerMonth: 128,
            monthlyAmounts: [500, 200, 200, 0, 0, 0, 0],
            // June's 500 was mostly a one-off event.
            everydayMonthlyAmounts: [180, 200, 200, 0, 0, 0, 0],
          },
        ],
        incomeByCategory: [],
      })

      const wrapper = mount(BudgetPage)
      await flushPromises()

      const june = wrapper.find(
        '[data-testid="matrix-cell-Alimentation-2026-06"]'
      )
      expect(june.text()).toMatch(/180/)
      expect(june.text()).not.toMatch(/500/)
      wrapper.unmount()
    })

    it('names the isolated month in the tracking summary', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      await wrapper
        .find('[data-testid="budget-month-2026-06"]')
        .trigger('click')

      const summary = wrapper.findComponent({ name: 'BudgetSavingsSummary' })
      expect(summary.props('actualPeriodLabel')).toBe('Juin 2026')
      // And the figures follow the same month rather than the average.
      expect(summary.props('planActualExpenseAvg')).toBeCloseTo(500, 2)
      wrapper.unmount()
    })
  })

  describe('everyday vs real tracking', () => {
    /**
     * May 2026 is fully elapsed, so "Réel à date" is shown. Alimentation is
     * budgeted 250 and spent 320, of which 120 belongs to a holiday: the
     * everyday reading (200) is under budget, the raw one (320) is over.
     */
    const statisticsWithEvent: BudgetStatisticsDto = {
      ...sampleStatistics,
      totalExceptionalExpenses: 120,
      expensesByCategory: [
        {
          ...sampleStatistics.expensesByCategory[0]!,
          monthlyAmounts: [320],
          everydayMonthlyAmounts: [200],
        },
        {
          ...sampleStatistics.expensesByCategory[1]!,
          monthlyAmounts: [100],
          everydayMonthlyAmounts: [100],
        },
      ],
    }

    beforeEach(() => {
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue(samplePlan)
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(statisticsWithEvent)
    })

    function foodRow(wrapper: ReturnType<typeof mount>) {
      return wrapper.get('[data-testid="budget-row-Alimentation"]')
    }

    it('does not flag an overrun caused by a one-off event', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      // Everyday is the default: 200 spent against a 250 envelope.
      expect(foodRow(wrapper).text()).not.toContain('Dépassé')

      wrapper.unmount()
    })

    it('flags the same row as over once the mode includes events', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      await wrapper.get('[data-testid="budget-mode-real"]').trigger('click')
      await flushPromises()

      // 320 spent against a 250 envelope.
      expect(foodRow(wrapper).text()).toContain('Dépassé')

      wrapper.unmount()
    })

    it('keeps a category untouched by any event identical in both modes', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      const before = wrapper
        .get('[data-testid="budget-row-Transport"]')
        .text()
        .replace(/\s+/g, ' ')

      await wrapper.get('[data-testid="budget-mode-real"]').trigger('click')
      await flushPromises()

      const after = wrapper
        .get('[data-testid="budget-row-Transport"]')
        .text()
        .replace(/\s+/g, ' ')

      expect(after).toBe(before)

      wrapper.unmount()
    })

    it('keeps the exceptional share visible in both modes', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      const chip = wrapper.get(
        '[data-testid="budget-exceptional-Alimentation"]'
      )
      expect(chip.text()).toContain('hors')
      expect(chip.text()).toMatch(/120/)

      await wrapper.get('[data-testid="budget-mode-real"]').trigger('click')
      await flushPromises()

      expect(
        wrapper.get('[data-testid="budget-exceptional-Alimentation"]').text()
      ).toContain('dont')

      // Never on a category no event touched.
      expect(
        wrapper.find('[data-testid="budget-exceptional-Transport"]').exists()
      ).toBe(false)

      wrapper.unmount()
    })

    it('hides the mode selector when no event touches the plan', async () => {
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(sampleStatistics)

      const wrapper = mount(BudgetPage)
      await flushPromises()

      expect(
        wrapper.find('[data-testid="budget-breakdown-mode"]').exists()
      ).toBe(false)

      wrapper.unmount()
    })

    it('lists the events overlapping the window and links to their analysis', async () => {
      vi.mocked(api.getTags).mockResolvedValue([
        {
          id: 'tag-trip',
          name: 'Vacances Italie',
          color: '#06b6d4',
          icon: null,
          transactionCount: 5,
          isExceptional: true,
          eventStartDate: '2026-05-10',
          eventEndDate: '2026-05-14',
          budgetAmount: null,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          // Outside the plan window → not listed.
          id: 'tag-ski',
          name: 'Week-end Ski',
          color: null,
          icon: null,
          transactionCount: 3,
          isExceptional: true,
          eventStartDate: '2025-01-10',
          eventEndDate: '2025-01-12',
          budgetAmount: null,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ])

      const wrapper = mount(BudgetPage)
      await flushPromises()

      const chip = wrapper.get('[data-testid="budget-event-Vacances Italie"]')
      expect(
        wrapper.find('[data-testid="budget-event-Week-end Ski"]').exists()
      ).toBe(false)

      await chip.trigger('click')
      expect(routerPush).toHaveBeenCalledWith('/tags/tag-trip')

      wrapper.unmount()
    })

    it('surfaces the plan equation and flags a plan that does not add up', async () => {
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue({
        ...samplePlan,
        savingsTarget: 1900,
        referenceIncome: 2000,
        projectReserve: -200,
      })

      const wrapper = mount(BudgetPage)
      await flushPromises()

      const band = wrapper.get('[data-testid="plan-project-reserve"]')
      expect(band.text()).toContain('ne tient pas')
      expect(band.text().replace(/\s+/g, ' ')).toMatch(/1\s?900|1900/)

      wrapper.unmount()
    })

    it('hides the equation on a plan created without one', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      expect(
        wrapper.find('[data-testid="plan-project-reserve"]').exists()
      ).toBe(false)

      wrapper.unmount()
    })

    it('charges the projects against the plan reserve', async () => {
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue({
        ...samplePlan,
        savingsTarget: 400,
        referenceIncome: 2000,
        projectReserve: 1300,
      })
      vi.mocked(api.getTagBudgetSummary).mockResolvedValue({
        items: [
          {
            id: 'tag-trip',
            name: 'Vacances Italie',
            color: '#06b6d4',
            icon: null,
            eventStartDate: '2026-05-10',
            eventEndDate: '2026-05-14',
            budgetAmount: 1500,
            spent: 1259,
          },
        ],
        totalBudget: 1500,
        totalSpent: 1259,
      })

      const wrapper = mount(BudgetPage)
      await flushPromises()

      // The window matches the plan, not the wider stats range.
      expect(api.getTagBudgetSummary).toHaveBeenCalledWith({
        startDate: samplePlan.startDate,
        endDate: samplePlan.endDate,
      })

      // 1 500 committed against 1 300 of reserve → 200 over.
      const remaining = wrapper
        .get('[data-testid="reserve-remaining"]')
        .text()
        .replace(/\s+/g, ' ')
      expect(remaining).toContain('dépassement')
      expect(remaining).toMatch(/200/)

      wrapper.unmount()
    })

    it('links a project chip to its analysis', async () => {
      vi.mocked(api.getTagBudgetSummary).mockResolvedValue({
        items: [
          {
            id: 'tag-trip',
            name: 'Vacances Italie',
            color: null,
            icon: null,
            eventStartDate: '2026-05-10',
            eventEndDate: '2026-05-14',
            budgetAmount: null,
            spent: 450,
          },
        ],
        totalBudget: 0,
        totalSpent: 450,
      })

      const wrapper = mount(BudgetPage)
      await flushPromises()

      const chip = wrapper.get('[data-testid="project-Vacances Italie"]')
      // A project with no envelope is shown as such, not as a zero.
      expect(chip.text()).toContain('sans enveloppe')

      await chip.trigger('click')
      expect(routerPush).toHaveBeenCalledWith('/tags/tag-trip')

      wrapper.unmount()
    })

    it('hides the projects band when nothing overlaps the plan', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      expect(wrapper.find('[data-testid="budget-projects"]').exists()).toBe(
        false
      )

      wrapper.unmount()
    })

    it('omits the reserve line on a plan without an equation', async () => {
      vi.mocked(api.getTagBudgetSummary).mockResolvedValue({
        items: [
          {
            id: 'tag-trip',
            name: 'Vacances Italie',
            color: null,
            icon: null,
            eventStartDate: '2026-05-10',
            eventEndDate: '2026-05-14',
            budgetAmount: 1500,
            spent: 1259,
          },
        ],
        totalBudget: 1500,
        totalSpent: 1259,
      })

      const wrapper = mount(BudgetPage)
      await flushPromises()

      // The band still lists the project…
      expect(wrapper.find('[data-testid="budget-projects"]').exists()).toBe(
        true
      )
      // …but there is no reserve to charge it against.
      expect(wrapper.find('[data-testid="reserve-remaining"]').exists()).toBe(
        false
      )

      wrapper.unmount()
    })

    it('degrades to the raw series when the backend sent no split', async () => {
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(sampleStatistics)
      localStorage.setItem('budget-breakdown-mode', 'everyday')

      const wrapper = mount(BudgetPage)
      await flushPromises()

      // 320 shown, not 0 — the everyday mode must not read missing data.
      expect(foodRow(wrapper).text()).toMatch(/320/)

      wrapper.unmount()
    })
  })
})
