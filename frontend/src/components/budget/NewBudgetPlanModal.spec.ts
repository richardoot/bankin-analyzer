import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import NewBudgetPlanModal from './NewBudgetPlanModal.vue'
import type { BudgetPlanDto, BudgetStatisticsDto, CategoryDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getBudgetStatistics: vi.fn(),
    getBudgetPlans: vi.fn(),
    getBudgetPlan: vi.fn(),
    createBudgetPlan: vi.fn(),
    getCategories: vi.fn(),
  },
}))

// Mutable sets of globally-hidden category ids — tests reset them in
// beforeEach.
const hiddenExpenseCategoryIds = new Set<string>()
const hiddenIncomeCategoryIds = new Set<string>()
vi.mock('@/stores/filters', () => ({
  useFiltersStore: () => ({
    isExpenseCategoryGloballyHidden: (id: string) =>
      hiddenExpenseCategoryIds.has(id),
    isIncomeCategoryGloballyHidden: (id: string) =>
      hiddenIncomeCategoryIds.has(id),
  }),
}))

import { api } from '@/lib/api'

enableAutoUnmount(afterEach)

const sampleStats: BudgetStatisticsDto = {
  periodMonths: 6,
  totalExpenses: 1800,
  totalIncome: 12000,
  averageMonthlyExpenses: 300,
  averageMonthlyIncome: 2000,
  expensesByCategory: [
    {
      categoryId: 'cat-food',
      categoryName: 'Alimentation',
      categoryIcon: '🍽️',
      totalAmount: 1500,
      transactionCount: 30,
      averagePerMonth: 250,
    },
    {
      categoryId: 'cat-transport',
      categoryName: 'Transport',
      totalAmount: 300,
      transactionCount: 6,
      averagePerMonth: 50,
    },
  ],
  incomeByCategory: [],
}

/**
 * The two categories tracked by `sampleStats` — mirrored as their full
 * `CategoryDto` form so the modal's "show every expense category" merge
 * pass can find them.
 */
const sampleCategories: CategoryDto[] = [
  {
    id: 'cat-food',
    name: 'Alimentation',
    type: 'EXPENSE',
    icon: '🍽️',
    isExcludedFromBudget: false,
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'cat-transport',
    name: 'Transport',
    type: 'EXPENSE',
    isExcludedFromBudget: false,
    createdAt: '2025-01-01T00:00:00Z',
  },
]

const samplePlan: BudgetPlanDto = {
  id: 'plan-new',
  name: 'Budget Mai 2026',
  startDate: '2026-05-01',
  endDate: '2026-05-31',
  monthCount: 1,
  totalAmount: 0,
  entries: [],
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
}

function mountModal() {
  return mount(NewBudgetPlanModal, {
    props: { open: true },
    attachTo: document.body,
  })
}

describe('NewBudgetPlanModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.getBudgetStatistics).mockResolvedValue(sampleStats)
    vi.mocked(api.getBudgetPlans).mockResolvedValue([])
    vi.mocked(api.getCategories).mockResolvedValue(sampleCategories)
    hiddenExpenseCategoryIds.clear()
    hiddenIncomeCategoryIds.clear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('does not render when closed', () => {
    const wrapper = mount(NewBudgetPlanModal, {
      props: { open: false },
      attachTo: document.body,
    })
    expect(
      document.body.querySelector('[data-testid="new-budget-plan-modal"]')
    ).toBeNull()
    wrapper.unmount()
  })

  it('starts on step 1 with a default suggested name and "Mois prochain" preset', async () => {
    const wrapper = mountModal()
    await flushPromises()

    const nameInput = document.body.querySelector(
      '[data-testid="new-plan-name"]'
    ) as HTMLInputElement
    expect(nameInput.value).toMatch(/^Budget /)

    const startMonth = document.body.querySelector(
      '[data-testid="new-plan-start-month"]'
    ) as HTMLInputElement
    const endMonth = document.body.querySelector(
      '[data-testid="new-plan-end-month"]'
    ) as HTMLInputElement
    // Both are set, both equal (one-month preset)
    expect(startMonth.value).toBeTruthy()
    expect(endMonth.value).toBeTruthy()
    expect(startMonth.value).toBe(endMonth.value)

    wrapper.unmount()
  })

  it('blocks moving to step 2 when the date range is invalid', async () => {
    const wrapper = mountModal()
    await flushPromises()

    const startMonth = document.body.querySelector(
      '[data-testid="new-plan-start-month"]'
    ) as HTMLInputElement
    const endMonth = document.body.querySelector(
      '[data-testid="new-plan-end-month"]'
    ) as HTMLInputElement

    // End before start: invalid
    startMonth.value = '2026-06'
    startMonth.dispatchEvent(new Event('input'))
    endMonth.value = '2026-04'
    endMonth.dispatchEvent(new Event('input'))
    await flushPromises()

    const next = document.body.querySelector(
      '[data-testid="next-step-button"]'
    ) as HTMLButtonElement
    next.click()
    await flushPromises()

    // Still on step 1 (the suivant button still exists)
    expect(
      document.body.querySelector('[data-testid="next-step-button"]')
    ).not.toBeNull()
    // Error visible
    expect(
      document.body.querySelector('[data-testid="modal-error"]')?.textContent
    ).toContain('après')

    wrapper.unmount()
  })

  it('loads averages on step 2 by default and creates a plan with those amounts', async () => {
    vi.mocked(api.createBudgetPlan).mockResolvedValue(samplePlan)
    const wrapper = mountModal()
    await flushPromises()

    // Move to step 2
    const next = document.body.querySelector(
      '[data-testid="next-step-button"]'
    ) as HTMLButtonElement
    next.click()
    await flushPromises()

    // Statistics fetched for averages
    expect(api.getBudgetStatistics).toHaveBeenCalledOnce()

    // Both categories appear with their averages prefilled
    expect(
      document.body.querySelector('[data-testid="preview-row-Alimentation"]')
    ).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="preview-row-Transport"]')
    ).not.toBeNull()

    // Click the create button
    const create = document.body.querySelector(
      '[data-testid="create-plan-button"]'
    ) as HTMLButtonElement
    create.click()
    await flushPromises()

    expect(api.createBudgetPlan).toHaveBeenCalledOnce()
    const dto = vi.mocked(api.createBudgetPlan).mock.calls[0]?.[0]
    expect(dto?.startDate).toMatch(/^\d{4}-\d{2}-01$/)
    expect(dto?.endDate).toMatch(/^\d{4}-\d{2}-(28|29|30|31)$/)
    // Averages were rounded and used as initial amounts
    expect(dto?.entries).toEqual(
      expect.arrayContaining([
        { categoryId: 'cat-food', amount: 250 },
        { categoryId: 'cat-transport', amount: 50 },
      ])
    )

    expect(wrapper.emitted('created')?.[0]?.[0]).toEqual(samplePlan)
    wrapper.unmount()
  })

  it('passes the reimbursement toggles to getBudgetStatistics and refetches when they change', async () => {
    const wrapper = mountModal()
    await flushPromises()

    // Move to step 2 → first averages call uses defaults
    ;(
      document.body.querySelector(
        '[data-testid="next-step-button"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    expect(api.getBudgetStatistics).toHaveBeenCalledOnce()
    expect(vi.mocked(api.getBudgetStatistics).mock.calls[0]?.[0]).toMatchObject(
      {
        deductReimbursements: true,
        deductPendingReimbursements: false,
      }
    )

    // Toggle "Déduire les remboursements reçus" off → refetch with false
    ;(
      document.body.querySelector(
        '[data-testid="modal-toggle-deduct-reimbursements"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    expect(api.getBudgetStatistics).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.getBudgetStatistics).mock.calls[1]?.[0]).toMatchObject(
      {
        deductReimbursements: false,
        deductPendingReimbursements: false,
      }
    )

    // Toggle "Déduire les remboursements en attente" on → refetch with both flipped
    ;(
      document.body.querySelector(
        '[data-testid="modal-toggle-deduct-pending"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    expect(api.getBudgetStatistics).toHaveBeenCalledTimes(3)
    expect(vi.mocked(api.getBudgetStatistics).mock.calls[2]?.[0]).toMatchObject(
      {
        deductReimbursements: false,
        deductPendingReimbursements: true,
        // Pending toggle ON in the wizard requests ALL active pendings,
        // bypassing the lookback date filter.
        includeAllPendingReimbursements: true,
      }
    )
    // Conversely, when the pending toggle is OFF, the all-pendings flag
    // is also OFF (no need to broaden the date filter).
    expect(vi.mocked(api.getBudgetStatistics).mock.calls[0]?.[0]).toMatchObject(
      {
        includeAllPendingReimbursements: false,
      }
    )
    wrapper.unmount()
  })

  it('displays the deducted reimbursement amounts inline so the toggle effect is visible', async () => {
    // The backend returns "reimbursement" and "pendingReimbursement" only for
    // categories that actually had something to deduct.
    vi.mocked(api.getBudgetStatistics).mockResolvedValue({
      ...sampleStats,
      expensesByCategory: [
        {
          ...sampleStats.expensesByCategory[0]!,
          reimbursement: 30,
          pendingReimbursement: 12,
        },
        sampleStats.expensesByCategory[1]!, // no reimbursements
      ],
    })

    const wrapper = mountModal()
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="next-step-button"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    // Alimentation row shows both badges
    expect(
      document.body.querySelector(
        '[data-testid="preview-reimbursement-Alimentation"]'
      )?.textContent
    ).toContain('30')
    expect(
      document.body.querySelector(
        '[data-testid="preview-pending-Alimentation"]'
      )?.textContent
    ).toContain('12')

    // Transport row has no reimbursement → no badges
    expect(
      document.body.querySelector(
        '[data-testid="preview-reimbursement-Transport"]'
      )
    ).toBeNull()
    expect(
      document.body.querySelector('[data-testid="preview-pending-Transport"]')
    ).toBeNull()

    wrapper.unmount()
  })

  it('shows the "en attente" badge but no "reçus" badge when only pending reimbursements exist', async () => {
    // Reproduces the user's reported case: only pending requests, no income
    // transactions in linked categories. The backend response only carries
    // pendingReimbursement (no `reimbursement` field).
    vi.mocked(api.getBudgetStatistics).mockResolvedValue({
      ...sampleStats,
      expensesByCategory: [
        {
          ...sampleStats.expensesByCategory[0]!,
          // averagePerMonth is the NET (already pending-deducted) value
          averagePerMonth: 235,
          pendingReimbursement: 15,
          // NO `reimbursement` field — backend doesn't set it when there's
          // nothing to deduct.
        },
      ],
    })

    const wrapper = mountModal()
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="next-step-button"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    // "Reçus" badge must NOT appear when nothing was actually deducted
    expect(
      document.body.querySelector(
        '[data-testid="preview-reimbursement-Alimentation"]'
      )
    ).toBeNull()
    // "En attente" badge IS shown
    expect(
      document.body.querySelector(
        '[data-testid="preview-pending-Alimentation"]'
      )?.textContent
    ).toContain('15')

    wrapper.unmount()
  })

  it('displays the projected monthly savings indicator in step 2', async () => {
    // averageMonthlyIncome = 2000 in sampleStats; averages total = 300 € →
    // projected savings = 2000 − 300 = 1 700 €/mois.
    const wrapper = mountModal()
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="next-step-button"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    const indicator = document.body.querySelector(
      '[data-testid="projected-savings"]'
    )
    expect(indicator).not.toBeNull()
    // The currency formatter uses a non-breaking space — match digits-only
    // to stay resilient.
    const text = (indicator?.textContent ?? '').replace(/\s/g, ' ')
    expect(text).toMatch(/2\s*000,00/) // Revenus moyens reference
    expect(text).toMatch(/1\s*700,00/) // Projected savings
    expect(text).toContain('Épargne prévue')
    wrapper.unmount()
  })

  it('keeps the savings indicator when switching to "Partir de zéro" (income reference fetched separately)', async () => {
    const wrapper = mountModal()
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="next-step-button"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    // Switch to "empty" — preview is cleared but the income reference must
    // still be loaded via the side-fetch.
    vi.mocked(api.getBudgetStatistics).mockClear()
    ;(
      document.body.querySelector(
        '[data-testid="init-source-empty"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    // A side fetch should have been made to get the income reference
    expect(api.getBudgetStatistics).toHaveBeenCalled()

    const indicator = document.body.querySelector(
      '[data-testid="projected-savings"]'
    )
    expect(indicator).not.toBeNull()
    const text = (indicator?.textContent ?? '').replace(/\s/g, ' ')
    // With "empty" → previewTotal = 0 → savings = 2000 − 0 = 2 000 €.
    // The 2 000 € reference also appears in "Revenus moyens" — checking
    // that the savings amount specifically is rendered as +2 000,00.
    expect(text).toMatch(/\+\s*2\s*000,00/)
    wrapper.unmount()
  })

  it('hides the reimbursement toggles when the source is "copy" or "empty"', async () => {
    const wrapper = mountModal()
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="next-step-button"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    // Toggles visible by default ("averages")
    expect(
      document.body.querySelector(
        '[data-testid="modal-toggle-deduct-reimbursements"]'
      )
    ).not.toBeNull()

    // Switch to "Partir de zéro" — toggles disappear
    ;(
      document.body.querySelector(
        '[data-testid="init-source-empty"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    expect(
      document.body.querySelector(
        '[data-testid="modal-toggle-deduct-reimbursements"]'
      )
    ).toBeNull()
    expect(
      document.body.querySelector('[data-testid="modal-toggle-deduct-pending"]')
    ).toBeNull()
    wrapper.unmount()
  })

  it('excludes globally-hidden categories from the averages preview and from the created plan', async () => {
    hiddenExpenseCategoryIds.add('cat-transport')
    vi.mocked(api.createBudgetPlan).mockResolvedValue(samplePlan)
    const wrapper = mountModal()
    await flushPromises()

    // Step 1 → 2 (averages source by default)
    const next = document.body.querySelector(
      '[data-testid="next-step-button"]'
    ) as HTMLButtonElement
    next.click()
    await flushPromises()

    // Hidden category isn't rendered, the other still is
    expect(
      document.body.querySelector('[data-testid="preview-row-Alimentation"]')
    ).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="preview-row-Transport"]')
    ).toBeNull()

    // Submitting the plan only sends the visible categories
    const create = document.body.querySelector(
      '[data-testid="create-plan-button"]'
    ) as HTMLButtonElement
    create.click()
    await flushPromises()

    const dto = vi.mocked(api.createBudgetPlan).mock.calls[0]?.[0]
    expect(dto?.entries).toEqual([{ categoryId: 'cat-food', amount: 250 }])
    wrapper.unmount()
  })

  it('excludes globally-hidden categories when copying an existing plan', async () => {
    hiddenExpenseCategoryIds.add('cat-transport')
    vi.mocked(api.getBudgetPlans).mockResolvedValue([
      {
        id: 'plan-old',
        name: 'Plan source',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        monthCount: 1,
        totalAmount: 350,
        entryCount: 2,
        createdAt: '2025-12-15T00:00:00Z',
      },
    ])
    vi.mocked(api.getBudgetPlan).mockResolvedValue({
      id: 'plan-old',
      name: 'Plan source',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      monthCount: 1,
      totalAmount: 350,
      entries: [
        {
          id: 'e1',
          categoryId: 'cat-food',
          categoryName: 'Alimentation',
          amount: 250,
        },
        {
          id: 'e2',
          categoryId: 'cat-transport',
          categoryName: 'Transport',
          amount: 100,
        },
      ],
      createdAt: '2025-12-15T00:00:00Z',
      updatedAt: '2025-12-15T00:00:00Z',
    })

    const wrapper = mountModal()
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="next-step-button"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="init-source-copy"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    const select = document.body.querySelector(
      '[data-testid="copy-plan-select"]'
    ) as HTMLSelectElement
    select.value = 'plan-old'
    select.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(
      document.body.querySelector('[data-testid="preview-row-Alimentation"]')
    ).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="preview-row-Transport"]')
    ).toBeNull()
    wrapper.unmount()
  })

  it('switches to "Partir de zéro" and creates a plan with no entries', async () => {
    vi.mocked(api.createBudgetPlan).mockResolvedValue(samplePlan)
    const wrapper = mountModal()
    await flushPromises()

    // To step 2
    const next = document.body.querySelector(
      '[data-testid="next-step-button"]'
    ) as HTMLButtonElement
    next.click()
    await flushPromises()

    // Switch to "empty"
    const emptyBtn = document.body.querySelector(
      '[data-testid="init-source-empty"]'
    ) as HTMLButtonElement
    emptyBtn.click()
    await flushPromises()

    // Every visible expense category is still rendered so the user can
    // fill the ones they care about, but inputs are blank.
    const rows = document.body.querySelectorAll('[data-testid^="preview-row-"]')
    expect(rows.length).toBe(sampleCategories.length)
    rows.forEach(row => {
      const input = row.querySelector(
        'input[type="number"]'
      ) as HTMLInputElement
      expect(input.value).toBe('')
    })

    const create = document.body.querySelector(
      '[data-testid="create-plan-button"]'
    ) as HTMLButtonElement
    create.click()
    await flushPromises()

    const dto = vi.mocked(api.createBudgetPlan).mock.calls[0]?.[0]
    expect(dto?.entries).toEqual([])
    wrapper.unmount()
  })

  it('renders every visible expense category in the averages preview, even those without historical data', async () => {
    // Backend only has stats for cat-food (Alimentation). The user owns
    // three categories: Alimentation, Transport, and a brand-new
    // "Loisirs" category that has zero transactions in the lookback
    // window. All three should still show up so the user can budget
    // for Loisirs upfront.
    vi.mocked(api.getBudgetStatistics).mockResolvedValue({
      ...sampleStats,
      expensesByCategory: [sampleStats.expensesByCategory[0]!],
    })
    vi.mocked(api.getCategories).mockResolvedValue([
      ...sampleCategories,
      {
        id: 'cat-loisirs',
        name: 'Loisirs',
        type: 'EXPENSE',
        isExcludedFromBudget: false,
        createdAt: '2026-04-01T00:00:00Z',
      },
    ])

    mountModal()
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="next-step-button"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    // Every category appears, including those without historical data
    expect(
      document.body.querySelector('[data-testid="preview-row-Alimentation"]')
    ).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="preview-row-Transport"]')
    ).not.toBeNull()
    const loisirsRow = document.body.querySelector(
      '[data-testid="preview-row-Loisirs"]'
    )
    expect(loisirsRow).not.toBeNull()

    // Categories without stats show "Pas d'historique" and their input
    // is left empty so the user must opt in explicitly.
    expect(loisirsRow?.textContent).toContain("Pas d'historique")
    const loisirsInput = loisirsRow?.querySelector(
      'input[type="number"]'
    ) as HTMLInputElement
    expect(loisirsInput.value).toBe('')
  })

  it('excludes budget-excluded categories from the averages preview', async () => {
    vi.mocked(api.getCategories).mockResolvedValue([
      ...sampleCategories,
      {
        id: 'cat-vehicle',
        name: 'Véhicule',
        type: 'EXPENSE',
        isExcludedFromBudget: true,
        createdAt: '2026-04-01T00:00:00Z',
      },
    ])

    const wrapper = mountModal()
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="next-step-button"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    // Regular categories still appear…
    expect(
      document.body.querySelector('[data-testid="preview-row-Alimentation"]')
    ).not.toBeNull()
    // …but the budget-excluded one is filtered out.
    expect(
      document.body.querySelector('[data-testid="preview-row-Véhicule"]')
    ).toBeNull()
    wrapper.unmount()
  })

  it('still shows every category when switching to "Partir de zéro", with empty inputs', async () => {
    vi.mocked(api.getCategories).mockResolvedValue([
      ...sampleCategories,
      {
        id: 'cat-loisirs',
        name: 'Loisirs',
        type: 'EXPENSE',
        isExcludedFromBudget: false,
        createdAt: '2026-04-01T00:00:00Z',
      },
    ])

    const wrapper = mountModal()
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="next-step-button"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="init-source-empty"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    expect(
      document.body.querySelector('[data-testid="preview-row-Loisirs"]')
    ).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="preview-row-Alimentation"]')
    ).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="preview-row-Transport"]')
    ).not.toBeNull()
    wrapper.unmount()
  })

  it('clamps the lookback to the last fully-elapsed month, never including the current (partial) month', async () => {
    // Today: 2026-05-13. Default preset = "next-month" → plan starts in
    // June 2026. The naive lookback would end at May 31, 2026, but May is
    // not yet complete — dividing partial-month income by a 6-month divisor
    // would understate the average. We must end at April 30, 2026 instead.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-13T12:00:00Z'))
    try {
      const wrapper = mountModal()
      await flushPromises()
      ;(
        document.body.querySelector(
          '[data-testid="next-step-button"]'
        ) as HTMLButtonElement
      ).click()
      await flushPromises()

      const firstCall = vi.mocked(api.getBudgetStatistics).mock.calls[0]?.[0]
      // 6-month lookback ending at the last complete month (April 2026)
      expect(firstCall?.endDate).toBe('2026-04-30')
      // 6 months back from April 2026 → November 2025
      expect(firstCall?.startDate).toBe('2025-11-01')
      // The current (incomplete) month is NEVER queried
      expect(firstCall?.endDate.startsWith('2026-05')).toBe(false)
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a retrospective plan anchored to its own past — lookback ends before the plan, not at today', async () => {
    // Today: 2026-05-13. User picks a custom plan starting in January 2026
    // (retrospective). Lookback should end at December 31, 2025 (the month
    // before the plan), NOT at April 2026 (the last complete month today).
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-13T12:00:00Z'))
    try {
      const wrapper = mountModal()
      await flushPromises()

      const startMonth = document.body.querySelector(
        '[data-testid="new-plan-start-month"]'
      ) as HTMLInputElement
      startMonth.value = '2026-01'
      startMonth.dispatchEvent(new Event('input'))
      startMonth.dispatchEvent(new Event('change'))
      const endMonth = document.body.querySelector(
        '[data-testid="new-plan-end-month"]'
      ) as HTMLInputElement
      endMonth.value = '2026-01'
      endMonth.dispatchEvent(new Event('input'))
      endMonth.dispatchEvent(new Event('change'))
      await flushPromises()
      ;(
        document.body.querySelector(
          '[data-testid="next-step-button"]'
        ) as HTMLButtonElement
      ).click()
      await flushPromises()

      const call = vi.mocked(api.getBudgetStatistics).mock.calls[0]?.[0]
      expect(call?.endDate).toBe('2025-12-31')
      expect(call?.startDate).toBe('2025-07-01')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('computes the income reference as sum(visible income categories) / periodMonths', async () => {
    // Two income categories: salary (visible) + a "remboursement frais pro"
    // category the user has globally hidden. The reference must only count
    // the salary.
    hiddenIncomeCategoryIds.add('cat-pro')
    vi.mocked(api.getBudgetStatistics).mockResolvedValue({
      ...sampleStats,
      periodMonths: 6,
      totalIncome: 15000,
      averageMonthlyIncome: 2500, // 15000 / 6 — backend doesn't know about the user's hide
      incomeByCategory: [
        {
          categoryId: 'cat-salary',
          categoryName: 'Salaire',
          totalAmount: 12000,
          transactionCount: 6,
          averagePerMonth: 2000,
        },
        {
          categoryId: 'cat-pro',
          categoryName: 'Remboursements frais pro',
          totalAmount: 3000,
          transactionCount: 6,
          averagePerMonth: 500,
        },
      ],
    })

    const wrapper = mountModal()
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="next-step-button"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    const indicator = document.body.querySelector(
      '[data-testid="projected-savings"]'
    )
    const text = (indicator?.textContent ?? '').replace(/\s/g, ' ')
    // Reference = 12000 / 6 = 2 000 € (hidden category excluded)
    expect(text).toMatch(/2\s*000,00/)
    // The naive backend total (2 500 €) must NOT appear
    expect(text).not.toMatch(/2\s*500,00/)
    wrapper.unmount()
  })

  it('does not request the per-month breakdown when fetching the income reference', async () => {
    // The income calculation is sum/periodMonths — we don't need (and
    // shouldn't pay for) the per-month rollup.
    const wrapper = mountModal()
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="next-step-button"]'
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    expect(vi.mocked(api.getBudgetStatistics).mock.calls[0]?.[0]).toMatchObject(
      {
        includeMonthlyBreakdown: false,
      }
    )
    wrapper.unmount()
  })

  it('surfaces a backend error message (e.g. overlap)', async () => {
    vi.mocked(api.createBudgetPlan).mockRejectedValue(
      new Error('Plan range overlaps existing plan "Q1"')
    )
    const wrapper = mountModal()
    await flushPromises()

    // Step 1 → 2
    const next = document.body.querySelector(
      '[data-testid="next-step-button"]'
    ) as HTMLButtonElement
    next.click()
    await flushPromises()

    // Skip the averages call and go straight to "empty"
    const emptyBtn = document.body.querySelector(
      '[data-testid="init-source-empty"]'
    ) as HTMLButtonElement
    emptyBtn.click()
    await flushPromises()

    const create = document.body.querySelector(
      '[data-testid="create-plan-button"]'
    ) as HTMLButtonElement
    create.click()
    await flushPromises()

    const errorBanner = document.body.querySelector(
      '[data-testid="modal-error"]'
    )
    expect(errorBanner?.textContent).toContain('overlaps')
    expect(wrapper.emitted('created')).toBeUndefined()
    wrapper.unmount()
  })

  describe('seeding on everyday life', () => {
    /** Alimentation carries a holiday; Transport is untouched by any event. */
    const statsWithExceptional: BudgetStatisticsDto = {
      ...sampleStats,
      totalExceptionalExpenses: 600,
      expensesByCategory: [
        {
          categoryId: 'cat-food',
          categoryName: 'Alimentation',
          categoryIcon: '🍽️',
          totalAmount: 1500,
          transactionCount: 30,
          averagePerMonth: 250,
          exceptionalAmount: 600,
          everydayAmount: 900,
          everydayAveragePerMonth: 150,
        },
        {
          categoryId: 'cat-transport',
          categoryName: 'Transport',
          totalAmount: 300,
          transactionCount: 6,
          averagePerMonth: 50,
          exceptionalAmount: 0,
          everydayAmount: 300,
          everydayAveragePerMonth: 50,
        },
      ],
    }

    async function openStep2() {
      const wrapper = mountModal()
      await flushPromises()
      const next = document.body.querySelector(
        '[data-testid="next-step-button"]'
      ) as HTMLButtonElement
      next.click()
      await flushPromises()
      return wrapper
    }

    function amountFor(categoryName: string): number {
      const row = document.body.querySelector(
        `[data-testid="preview-row-${categoryName}"]`
      )
      const input = row?.querySelector('input') as HTMLInputElement
      return Number(input.value)
    }

    it('seeds envelopes with the everyday average, not the raw one', async () => {
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(statsWithExceptional)
      const wrapper = await openStep2()

      // 150 (everyday), not 250 — the holiday is not budgeted every month.
      expect(amountFor('Alimentation')).toBe(150)
      // Untouched category is unchanged.
      expect(amountFor('Transport')).toBe(50)

      wrapper.unmount()
    })

    it('shows how much was excluded from the envelope', async () => {
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(statsWithExceptional)
      const wrapper = await openStep2()

      const chip = document.body.querySelector(
        '[data-testid="preview-exceptional-Alimentation"]'
      )
      expect(chip?.textContent).toMatch(/100/)
      // Nothing excluded on Transport → no chip.
      expect(
        document.body.querySelector(
          '[data-testid="preview-exceptional-Transport"]'
        )
      ).toBeNull()

      wrapper.unmount()
    })

    it('re-seeds on the raw average when switching to "Tout"', async () => {
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(statsWithExceptional)
      const wrapper = await openStep2()

      const all = document.body.querySelector(
        '[data-testid="seed-basis-all"]'
      ) as HTMLButtonElement
      all.click()
      await flushPromises()

      expect(amountFor('Alimentation')).toBe(250)
      // Switching the basis reuses the loaded stats, no extra request.
      expect(api.getBudgetStatistics).toHaveBeenCalledOnce()

      wrapper.unmount()
    })

    it('falls back to the raw average when the backend sends no split', async () => {
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(sampleStats)
      const wrapper = await openStep2()

      expect(amountFor('Alimentation')).toBe(250)
      expect(
        document.body.querySelector('[data-testid="seed-basis-hint"]')
      ).toBeNull()

      wrapper.unmount()
    })
  })

  describe('savings equation', () => {
    /**
     * 2000 of income, 300 of envelopes (250 + 50), and 200/month of events
     * observed over the 6-month lookback.
     */
    const statsWithEvents: BudgetStatisticsDto = {
      ...sampleStats,
      totalExceptionalExpenses: 1200,
    }

    async function openStep2() {
      const wrapper = mountModal()
      await flushPromises()
      const next = document.body.querySelector(
        '[data-testid="next-step-button"]'
      ) as HTMLButtonElement
      next.click()
      await flushPromises()
      return wrapper
    }

    async function setSavings(value: string) {
      const input = document.body.querySelector(
        '[data-testid="savings-target-input"]'
      ) as HTMLInputElement
      input.value = value
      input.dispatchEvent(new Event('input'))
      await flushPromises()
    }

    const norm = (text: string | null | undefined) =>
      (text ?? '').replace(/\s+/g, ' ')

    beforeEach(() => {
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(statsWithEvents)
    })

    it('shows no reserve until savings are actually decided', async () => {
      const wrapper = await openStep2()

      expect(
        document.body.querySelector('[data-testid="project-reserve"]')
      ).toBeNull()

      wrapper.unmount()
    })

    it('derives the project reserve from income − savings − envelopes', async () => {
      const wrapper = await openStep2()
      await setSavings('1200')

      // 2000 − 1200 − 300 = 500 / month, over a 1-month plan.
      const reserve = norm(
        document.body.querySelector('[data-testid="project-reserve"]')
          ?.textContent
      )
      expect(reserve).toMatch(/500/)

      wrapper.unmount()
    })

    it('shows a negative reserve instead of clamping it to zero', async () => {
      const wrapper = await openStep2()
      await setSavings('1900')

      // 2000 − 1900 − 300 = −200.
      const reserve = norm(
        document.body.querySelector('[data-testid="project-reserve"]')
          ?.textContent
      )
      expect(reserve).toMatch(/-200|−200/)

      wrapper.unmount()
    })

    it('confronts the reserve with what events actually cost', async () => {
      const wrapper = await openStep2()
      await setSavings('1700')

      // Reserve 0/month vs 200/month of observed events → 200 missing.
      const gap = norm(
        document.body.querySelector('[data-testid="reserve-gap"]')?.textContent
      )
      expect(gap).toContain('Il manque')
      expect(gap).toMatch(/200/)

      wrapper.unmount()
    })

    it('reports a margin when the reserve covers the observed events', async () => {
      const wrapper = await openStep2()
      await setSavings('1200')

      // Reserve 500/month vs 200/month observed → 300 of margin.
      const gap = norm(
        document.body.querySelector('[data-testid="reserve-gap"]')?.textContent
      )
      expect(gap).toContain('marge')
      expect(gap).toMatch(/300/)

      wrapper.unmount()
    })

    it('stays silent about the gap when no event was observed', async () => {
      vi.mocked(api.getBudgetStatistics).mockResolvedValue(sampleStats)
      const wrapper = await openStep2()
      await setSavings('1200')

      expect(
        document.body.querySelector('[data-testid="project-reserve"]')
      ).not.toBeNull()
      expect(
        document.body.querySelector('[data-testid="reserve-gap"]')
      ).toBeNull()

      wrapper.unmount()
    })

    it('persists both halves of the equation on create', async () => {
      vi.mocked(api.createBudgetPlan).mockResolvedValue(samplePlan)
      const wrapper = await openStep2()
      await setSavings('1200')

      const create = document.body.querySelector(
        '[data-testid="create-plan-button"]'
      ) as HTMLButtonElement
      create.click()
      await flushPromises()

      const payload = vi.mocked(api.createBudgetPlan).mock.calls[0]![0]
      expect(payload.savingsTarget).toBe(1200)
      expect(payload.referenceIncome).toBe(2000)

      wrapper.unmount()
    })

    it('omits the equation entirely when no target was set', async () => {
      vi.mocked(api.createBudgetPlan).mockResolvedValue(samplePlan)
      const wrapper = await openStep2()

      const create = document.body.querySelector(
        '[data-testid="create-plan-button"]'
      ) as HTMLButtonElement
      create.click()
      await flushPromises()

      const payload = vi.mocked(api.createBudgetPlan).mock.calls[0]![0]
      expect(payload.savingsTarget).toBeUndefined()
      expect(payload.referenceIncome).toBeUndefined()

      wrapper.unmount()
    })
  })
})
