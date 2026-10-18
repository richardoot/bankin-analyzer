import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import BudgetPage from './BudgetPage.vue'
import {
  isTabBarSuppressed,
  resetMobileNavigation,
} from '@/composables/useMobileNavigation'
import type { BudgetPlanDto, BudgetStatisticsDto } from '@/lib/api'

vi.mock('vue3-apexcharts/core', () => ({
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
  useRouter: () => ({
    push: routerPush,
    resolve: (to: { path: string }) => ({ href: to.path }),
  }),
  onBeforeRouteLeave: (guard: () => boolean) => {
    routeLeaveGuard = guard
  },
  // The rows link to the Transactions page; the route is kept on the
  // element so a test can read it.
  RouterLink: {
    props: ['to'],
    template: '<a :data-to="JSON.stringify(to)" :href="to.path"><slot /></a>',
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
    deductPendingReimbursements: false,
    setDeductPendingReimbursements: vi.fn(),
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
      // Said once, with one way to create: the header does not repeat it
      expect(wrapper.text().match(/Aucun budget en cours/g)).toHaveLength(1)
      expect(
        wrapper.find('[data-testid="header-new-plan-button"]').exists()
      ).toBe(false)
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
      expect(api.getTagBudgetSummary).toHaveBeenLastCalledWith({
        startDate: samplePlan.startDate,
        endDate: samplePlan.endDate,
      })

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
                subcategoryId: 'sub-courses',
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

    it('says so, with a retry, when a refetch of the figures fails', async () => {
      const wrapper = mount(BudgetPage, { attachTo: document.body })
      await flushPromises()
      vi.mocked(api.getBudgetStatistics).mockRejectedValueOnce(
        new Error('Le serveur est injoignable.')
      )

      await wrapper.find('[data-testid="comparison-trigger"]').trigger('click')
      await flushPromises()
      await wrapper
        .find('[data-testid="comparison-option-3m"]')
        .trigger('click')
      await flushPromises()

      expect(
        wrapper.find('[data-testid="budget-statistics-error"]').text()
      ).toContain('Le serveur est injoignable.')

      await wrapper
        .find('[data-testid="budget-statistics-retry"]')
        .trigger('click')
      await flushPromises()

      expect(
        wrapper.find('[data-testid="budget-statistics-error"]').exists()
      ).toBe(false)
      wrapper.unmount()
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
      // The projects follow the plan shown, not the one before it.
      expect(api.getTagBudgetSummary).toHaveBeenLastCalledWith({
        startDate: '2026-04-01',
        endDate: '2026-04-30',
      })

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

    it('takes the tab bar’s place while the edit bar shows', async () => {
      resetMobileNavigation()
      const wrapper = await mountEditing()
      expect(isTabBarSuppressed()).toBe(true)

      await wrapper.get('[data-testid="budget-cancel-button"]').trigger('click')
      expect(wrapper.find('[data-testid="budget-edit-bar"]').exists()).toBe(
        false
      )
      expect(isTabBarSuppressed()).toBe(false)
    })

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

    it('empties the draft on « Vider toutes les enveloppes » without touching the server', async () => {
      const wrapper = await mountEditing()

      const reset = wrapper.find('[data-testid="budget-clear-envelopes"]')
      expect(reset.text()).toBe('Vider toutes les enveloppes')
      // The scope is written next to it.
      expect(
        wrapper.find('[data-testid="budget-quick-actions"]').text()
      ).toContain('toutes les enveloppes du plan')
      await reset.trigger('click')

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

      // The "Réel" figure is plain text in read mode; the « Reprendre »
      // button under it only exists in edit mode.
      expect(
        wrapper.find('[data-testid="budget-take-actual-Alimentation"]').exists()
      ).toBe(false)

      await wrapper.find('[data-testid="budget-edit-button"]').trigger('click')
      const take = wrapper.find(
        '[data-testid="budget-take-actual-Alimentation"]'
      )
      expect(take.exists()).toBe(true)
      expect(take.text()).toBe('Reprendre')
      expect(take.attributes('aria-label')).toContain('comme budget')
      // The button says which reference the bulk action copies.
      expect(wrapper.find('[data-testid="budget-apply-averages"]').text()).toBe(
        'Reprendre le réel à date'
      )
    })

    it('says how the save went in the edit bar, next to the button', async () => {
      const wrapper = await mountEditing()
      await wrapper
        .find('[data-testid="budget-input-Alimentation"]')
        .setValue('300')

      // The live region exists before anything lands in it.
      const feedback = () =>
        wrapper.find('[data-testid="budget-save-feedback"]')
      expect(feedback().attributes('aria-live')).toBe('polite')
      expect(feedback().text()).toBe('')

      vi.mocked(api.updateBudgetPlan).mockResolvedValue(samplePlan)
      await wrapper.find('[data-testid="budget-save-button"]').trigger('click')
      await flushPromises()

      // Edit mode has ended, but the bar stays to say it went through.
      expect(wrapper.find('[data-testid="budget-edit-bar"]').exists()).toBe(
        true
      )
      expect(feedback().text()).toContain('Budget enregistré')
      expect(wrapper.find('[data-testid="budget-save-button"]').exists()).toBe(
        false
      )
      // The header no longer carries a competing « Sauvegardé ».
      expect(wrapper.text()).not.toContain('Sauvegardé')
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

      // happy-dom ships no window.confirm; the stub is mirrored onto window.
      const confirmSpy = vi.fn(() => false)
      vi.stubGlobal('confirm', confirmSpy)
      expect(routeLeaveGuard?.()).toBe(false)
      expect(confirmSpy).toHaveBeenCalled()
    })

    it('keeps the draft when the save fails', async () => {
      const wrapper = await mountEditing()
      await wrapper
        .find('[data-testid="budget-input-Alimentation"]')
        .setValue('300')

      vi.mocked(api.updateBudgetPlan).mockRejectedValue(new Error('boom'))
      await wrapper.find('[data-testid="budget-save-button"]').trigger('click')
      await flushPromises()

      // Said in the bar, where the button is — and the draft is still there.
      const feedback = wrapper.find('[data-testid="budget-save-feedback"]')
      expect(feedback.text()).toContain('boom')
      expect(feedback.text()).toContain('conservées')
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

    it('isolates a month from the period band only — the chart just follows', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      // A click on a bar no longer rewrites the page's reading.
      const chart = wrapper.findComponent({ name: 'MonthlyExpensesChart' })
      chart.vm.$emit('select-month', '2026-06')
      await flushPromises()
      expect(foodRow(wrapper).text()).toMatch(/350/)

      await wrapper
        .find('[data-testid="budget-month-2026-06"]')
        .trigger('click')
      expect(foodRow(wrapper).text()).toMatch(/500/)
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

    it('shows the isolated month in the grid header without owning the choice', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      const header = wrapper.find('[data-testid="matrix-header-2026-06"]')
      expect(header.element.tagName).not.toBe('BUTTON')
      await header.trigger('click')
      expect(foodRow(wrapper).text()).toMatch(/350/)

      await wrapper
        .find('[data-testid="budget-month-2026-06"]')
        .trigger('click')
      expect(
        wrapper
          .find('[data-testid="matrix-header-2026-06"]')
          .attributes('aria-current')
      ).toBe('true')
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

  describe('links to the Transactions page', () => {
    const planJunDec: BudgetPlanDto = {
      ...samplePlan,
      id: 'plan-jun-dec',
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
        monthLabels: [
          '2026-06',
          '2026-07',
          '2026-08',
          '2026-09',
          '2026-10',
          '2026-11',
          '2026-12',
        ],
        expensesByCategory: [
          {
            categoryId: 'cat-food',
            categoryName: 'Alimentation',
            categoryIcon: '🍽️',
            totalAmount: 900,
            transactionCount: 12,
            averagePerMonth: 128,
            monthlyAmounts: [500, 200, 200, 0, 0, 0, 0],
          },
        ],
      })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('links the « Réel » figure to the plan so far, gross', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      const link = wrapper.get(
        '[data-testid="budget-actual-link-Alimentation"]'
      )
      expect(JSON.parse(link.attributes('data-to') ?? '{}')).toEqual({
        path: '/transactions',
        query: {
          type: 'EXPENSE',
          category: 'cat-food',
          from: '2026-06-01',
          to: '2026-08-20',
          exceptional: 'exclude',
          label: 'Alimentation · plan',
          gross: '1',
        },
      })
      expect(link.attributes('aria-label')).toBe(
        'Voir les transactions de Alimentation · plan'
      )
    })

    it('links each subcategory line to its rows over the statistics window, « none » included', async () => {
      vi.mocked(api.getBudgetStatistics).mockResolvedValue({
        ...sampleStatistics,
        periodMonths: 7,
        monthLabels: ['2026-06', '2026-07', '2026-08'],
        expensesByCategory: [
          {
            categoryId: 'cat-food',
            categoryName: 'Alimentation',
            totalAmount: 900,
            transactionCount: 12,
            averagePerMonth: 128,
            subcategories: [
              {
                subcategoryId: 'sub-courses',
                subcategory: 'Courses',
                totalAmount: 800,
                transactionCount: 10,
                averagePerMonth: 114,
              },
              {
                subcategoryId: null,
                subcategory: '',
                totalAmount: 100,
                transactionCount: 2,
                averagePerMonth: 14,
              },
            ],
          },
        ],
      })
      const wrapper = mount(BudgetPage)
      await flushPromises()
      await wrapper
        .get('[data-testid="budget-row-Alimentation"]')
        .find('button')
        .trigger('click')

      const named = wrapper.get(
        '[data-testid="budget-subcategory-link-Alimentation-Courses"]'
      )
      expect(JSON.parse(named.attributes('data-to') ?? '{}')).toEqual({
        path: '/transactions',
        query: {
          type: 'EXPENSE',
          category: 'cat-food',
          subcategory: 'sub-courses',
          from: '2026-06-01',
          to: '2026-12-31',
          label: 'Alimentation · Courses',
          gross: '1',
        },
      })
      const none = wrapper.get(
        '[data-testid="budget-subcategory-link-Alimentation-none"]'
      )
      expect(
        JSON.parse(none.attributes('data-to') ?? '{}').query
      ).toMatchObject({
        subcategory: 'none',
        label: 'Alimentation · sans sous-catégorie',
      })
    })

    it('in the real reading, counts everything; the events’ share opens them alone', async () => {
      vi.mocked(api.getBudgetStatistics).mockResolvedValue({
        ...sampleStatistics,
        periodMonths: 7,
        monthLabels: ['2026-06', '2026-07', '2026-08'],
        expensesByCategory: [
          {
            categoryId: 'cat-food',
            categoryName: 'Alimentation',
            totalAmount: 900,
            transactionCount: 12,
            averagePerMonth: 128,
            monthlyAmounts: [500, 200, 200],
            everydayMonthlyAmounts: [180, 200, 200],
          },
        ],
      })
      const wrapper = mount(BudgetPage)
      await flushPromises()
      wrapper
        .findComponent({ name: 'BudgetTableControls' })
        .vm.$emit('set-mode', 'real')
      await flushPromises()

      const actual = JSON.parse(
        wrapper
          .get('[data-testid="budget-actual-link-Alimentation"]')
          .attributes('data-to') ?? '{}'
      )
      expect(actual.query.exceptional).toBeUndefined()
      const events = JSON.parse(
        wrapper
          .get('[data-testid="budget-exceptional-link-Alimentation"]')
          .attributes('data-to') ?? '{}'
      )
      expect(events.query).toEqual({
        type: 'EXPENSE',
        category: 'cat-food',
        from: '2026-06-01',
        to: '2026-08-20',
        exceptional: 'only',
        label: 'Alimentation · événements · plan',
        gross: '1',
      })
    })

    it('opens a month from a bar of the expenses chart', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      wrapper
        .findComponent({ name: 'MonthlyExpensesChart' })
        .vm.$emit('select-month', '2026-07')

      expect(routerPush).toHaveBeenCalledWith({
        path: '/transactions',
        query: {
          type: 'EXPENSE',
          from: '2026-07-01',
          to: '2026-07-31',
          exceptional: 'exclude',
          label: 'Dépenses · juil. 2026',
          gross: '1',
        },
      })
    })

    it('opens a month from a bar of a category’s drill-down chart', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()
      await wrapper
        .get('[data-testid="budget-row-Alimentation"] button')
        .trigger('click')

      wrapper
        .findComponent({ name: 'BudgetCategoryRow' })
        .vm.$emit('select-month', '2026-06')

      expect(routerPush).toHaveBeenCalledWith({
        path: '/transactions',
        query: {
          type: 'EXPENSE',
          category: 'cat-food',
          from: '2026-06-01',
          to: '2026-06-30',
          exceptional: 'exclude',
          label: 'Alimentation · juin 2026',
          gross: '1',
        },
      })
    })
  })

  describe('smoothed purchases', () => {
    /**
     * Plan April→June 2026, read on 15 June. A phone bought in March is
     * smoothed over 24 months: only its slices reach the plan, through a
     * category with nothing real in it. A fridge bought in May is smoothed
     * over 36: the real reading counts it whole in May, the everyday one a
     * slice. No event anywhere.
     */
    const planAprJun: BudgetPlanDto = {
      ...samplePlan,
      id: 'plan-apr-jun',
      name: 'Avr–Juin 2026',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      monthCount: 3,
      entries: [
        {
          id: 'e1',
          categoryId: 'cat-home',
          categoryName: 'Maison',
          categoryIcon: '🏠',
          amount: 250,
        },
      ],
    }

    const statistics: BudgetStatisticsDto = {
      ...sampleStatistics,
      periodMonths: 3,
      monthLabels: ['2026-04', '2026-05', '2026-06'],
      expensesByCategory: [
        {
          categoryId: 'cat-home',
          categoryName: 'Maison',
          categoryIcon: '🏠',
          totalAmount: 1400,
          transactionCount: 3,
          averagePerMonth: 466.67,
          exceptionalAmount: 0,
          everydayAmount: 266.66,
          monthlyAmounts: [200, 1200, 0],
          everydayMonthlyAmounts: [200, 33.33, 33.33],
          amortizedAmount: 66.66,
          amortizedMonthlyAmounts: [0, 33.33, 33.33],
        },
        {
          categoryId: 'cat-tech',
          categoryName: 'High-tech',
          categoryIcon: '📱',
          totalAmount: 0,
          transactionCount: 0,
          averagePerMonth: 0,
          exceptionalAmount: 0,
          everydayAmount: 162.51,
          monthlyAmounts: [0, 0, 0],
          everydayMonthlyAmounts: [54.17, 54.17, 54.17],
          amortizedAmount: 162.51,
          amortizedMonthlyAmounts: [54.17, 54.17, 54.17],
          subcategories: [
            {
              subcategoryId: 'sub-phone',
              subcategory: 'Téléphone',
              totalAmount: 0,
              transactionCount: 0,
              averagePerMonth: 0,
              everydayAmount: 162.51,
              everydayAveragePerMonth: 54.17,
              amortizedAmount: 162.51,
            },
          ],
        },
      ],
      amortizedPurchases: [
        {
          transactionId: 'tx-phone',
          description: 'Apple Store iPhone',
          date: '2026-03-10',
          months: 24,
          netAmount: 1300,
          monthlyAmount: 54.17,
          firstMonth: '2026-03',
          lastMonth: '2028-02',
          categoryId: 'cat-tech',
          subcategoryId: 'sub-phone',
          amountInPeriod: 162.51,
          sliceMonthsInPeriod: ['2026-04', '2026-05', '2026-06'],
          dateInPeriod: false,
        },
        {
          transactionId: 'tx-fridge',
          description: 'Darty frigo',
          date: '2026-05-05',
          months: 36,
          netAmount: 1200,
          monthlyAmount: 33.33,
          firstMonth: '2026-05',
          lastMonth: '2029-04',
          categoryId: 'cat-home',
          subcategoryId: null,
          amountInPeriod: 66.66,
          sliceMonthsInPeriod: ['2026-05', '2026-06'],
          dateInPeriod: true,
        },
      ],
    }

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(api.getCurrentBudgetPlan).mockResolvedValue(planAprJun)
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(statistics)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const linkOf = (el: { attributes: (name: string) => string | undefined }) =>
      JSON.parse(el.attributes('data-to') ?? '{}') as {
        query: Record<string, string>
      }

    it('lists the purchases being smoothed, with their slice and what is left', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      const section = wrapper.get('[data-testid="budget-amortized"]')
      expect(section.text()).toContain('Achats lissés en cours')
      const phone = wrapper.get('[data-testid="budget-amortized-tx-phone"]')
      expect(phone.text()).toMatch(/54,17/)
      expect(phone.text()).toContain('21 mois restants')
      expect(
        linkOf(wrapper.get('[data-testid="budget-amortized-link-tx-phone"]'))
          .query
      ).toMatchObject({ ids: 'tx-phone' })
      wrapper.unmount()
    })

    it('says the slices of a cell and links to their purchase, dated elsewhere', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      const cell = wrapper.get('[data-testid="matrix-cell-High-tech-2026-04"]')
      expect(
        wrapper.get('[data-testid="matrix-amortized-High-tech-2026-04"]').text()
      ).toMatch(/dont 54,17\s€ lissés/)
      expect(linkOf(cell.get('a')).query).toMatchObject({
        category: 'cat-tech',
        from: '2026-04-01',
        to: '2026-04-30',
        exceptional: 'exclude',
        also: 'tx-phone',
      })
      wrapper.unmount()
    })

    it('reads a smoothed purchase as a slice, not as an event', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      // The fridge's May is not « hors X € d'événements ».
      expect(
        wrapper.find('[data-testid="budget-exceptional-Maison"]').exists()
      ).toBe(false)
      expect(
        wrapper.get('[data-testid="budget-amortized-Maison"]').text()
        // May's slice over the two complete months.
      ).toMatch(/dont 16,67\s€ lissés/)
      // The mode is offered, and says the totals are no longer the cash.
      expect(
        wrapper.get('[data-testid="budget-everyday-amortized-note"]').text()
      ).toContain("ne correspond plus à l'argent sorti du compte")
      wrapper.unmount()
    })

    it('shows the real reading as it was: no carrier, no slice, no list', async () => {
      const wrapper = mount(BudgetPage)
      await flushPromises()

      await wrapper.get('[data-testid="budget-mode-real"]').trigger('click')
      await flushPromises()

      expect(
        wrapper.find('[data-testid="budget-row-High-tech"]').exists()
      ).toBe(false)
      expect(
        wrapper.find('[data-testid="matrix-row-High-tech"]').exists()
      ).toBe(false)
      expect(wrapper.find('[data-testid="budget-amortized"]').exists()).toBe(
        false
      )
      expect(wrapper.text()).not.toMatch(/dont [^€]*€ lissés/)
      expect(
        wrapper.get('[data-testid="matrix-cell-Maison-2026-05"]').text()
      ).toMatch(/1\s?200/)
      expect(
        linkOf(
          wrapper.get('[data-testid="matrix-cell-Maison-2026-05"]').get('a')
        ).query.also
      ).toBeUndefined()
      wrapper.unmount()
    })
  })
})
