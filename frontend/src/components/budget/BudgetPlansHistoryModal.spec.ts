import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import BudgetPlansHistoryModal from './BudgetPlansHistoryModal.vue'
import type { BudgetPlanSummaryDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getBudgetPlans: vi.fn(),
    deleteBudgetPlan: vi.fn(),
  },
}))

import { api } from '@/lib/api'

enableAutoUnmount(afterEach)

/**
 * Build a fake "today" by inspecting the JS clock and returning summaries that
 * cover the past, present and future relative to it. Avoids vi.useFakeTimers
 * because the modal also reads `new Date()` for status checks.
 */
function makePlans(): BudgetPlanSummaryDto[] {
  const today = new Date()
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  // Past: 6 months before this month, ending the month before this one
  const pastStart = new Date(Date.UTC(year, month - 6, 1))
  const pastEnd = new Date(Date.UTC(year, month, 0))
  // Current: this whole month
  const currStart = new Date(Date.UTC(year, month, 1))
  const currEnd = new Date(Date.UTC(year, month + 1, 0))
  // Future: next 3 months
  const futStart = new Date(Date.UTC(year, month + 1, 1))
  const futEnd = new Date(Date.UTC(year, month + 4, 0))

  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

  return [
    {
      id: 'plan-current',
      name: 'Mois en cours',
      startDate: fmt(currStart),
      endDate: fmt(currEnd),
      monthCount: 1,
      totalAmount: 500,
      entryCount: 3,
      createdAt: '2026-04-01T00:00:00Z',
    },
    {
      id: 'plan-past',
      name: 'Semestre passé',
      startDate: fmt(pastStart),
      endDate: fmt(pastEnd),
      monthCount: 6,
      totalAmount: 3000,
      entryCount: 5,
      createdAt: '2025-10-01T00:00:00Z',
    },
    {
      id: 'plan-future',
      name: 'Trimestre suivant',
      startDate: fmt(futStart),
      endDate: fmt(futEnd),
      monthCount: 3,
      totalAmount: 1500,
      entryCount: 4,
      createdAt: '2026-04-15T00:00:00Z',
    },
  ]
}

describe('BudgetPlansHistoryModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('does not render when closed', () => {
    const wrapper = mount(BudgetPlansHistoryModal, {
      props: { open: false },
      attachTo: document.body,
    })
    expect(
      document.body.querySelector('[data-testid="budget-history-modal"]')
    ).toBeNull()
    wrapper.unmount()
  })

  it('fetches and renders all plans on open with status pills', async () => {
    const plans = makePlans()
    vi.mocked(api.getBudgetPlans).mockResolvedValue(plans)

    const wrapper = mount(BudgetPlansHistoryModal, {
      props: { open: true },
      attachTo: document.body,
    })
    await flushPromises()

    expect(api.getBudgetPlans).toHaveBeenCalledOnce()

    // All three plans rendered as rows
    expect(
      document.body.querySelector('[data-testid="history-row-plan-current"]')
    ).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="history-row-plan-past"]')
    ).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="history-row-plan-future"]')
    ).not.toBeNull()

    // Status pill labels are present in the modal text
    const txt = document.body.textContent ?? ''
    expect(txt).toContain('En cours')
    expect(txt).toContain('À venir')
    expect(txt).toContain('Terminé')

    wrapper.unmount()
  })

  it('orders plans: current → future (chronological) → past (most recent first)', async () => {
    const plans = makePlans()
    vi.mocked(api.getBudgetPlans).mockResolvedValue(plans)

    const wrapper = mount(BudgetPlansHistoryModal, {
      props: { open: true },
      attachTo: document.body,
    })
    await flushPromises()

    const rows = Array.from(
      document.body.querySelectorAll('tbody tr[data-testid^="history-row-"]')
    )
    const ids = rows.map(r =>
      (r.getAttribute('data-testid') ?? '').replace('history-row-', '')
    )
    expect(ids).toEqual(['plan-current', 'plan-future', 'plan-past'])

    wrapper.unmount()
  })

  it('emits "select" with the plan id when a row is clicked', async () => {
    const plans = makePlans()
    vi.mocked(api.getBudgetPlans).mockResolvedValue(plans)

    const wrapper = mount(BudgetPlansHistoryModal, {
      props: { open: true },
      attachTo: document.body,
    })
    await flushPromises()

    const row = document.body.querySelector(
      '[data-testid="history-row-plan-past"]'
    ) as HTMLTableRowElement
    row.click()
    await flushPromises()

    expect(wrapper.emitted('select')?.[0]).toEqual(['plan-past'])
    wrapper.unmount()
  })

  it('highlights the active plan', async () => {
    vi.mocked(api.getBudgetPlans).mockResolvedValue(makePlans())

    const wrapper = mount(BudgetPlansHistoryModal, {
      props: { open: true, activePlanId: 'plan-current' },
      attachTo: document.body,
    })
    await flushPromises()

    const activeRow = document.body.querySelector(
      '[data-testid="history-row-plan-current"]'
    ) as HTMLTableRowElement
    expect(activeRow.className).toContain('bg-indigo-50')
    expect(activeRow.textContent).toContain('(affiché)')

    wrapper.unmount()
  })

  it('shows an empty state when no plans exist', async () => {
    vi.mocked(api.getBudgetPlans).mockResolvedValue([])

    const wrapper = mount(BudgetPlansHistoryModal, {
      props: { open: true },
      attachTo: document.body,
    })
    await flushPromises()

    expect(document.body.textContent).toContain('Aucun budget enregistré')
    wrapper.unmount()
  })

  describe('deletion', () => {
    const spyOnConfirm = () => vi.spyOn(window, 'confirm')
    let confirmSpy: ReturnType<typeof spyOnConfirm>

    beforeEach(() => {
      vi.mocked(api.getBudgetPlans).mockResolvedValue(makePlans())
      vi.mocked(api.deleteBudgetPlan).mockResolvedValue(undefined)
      confirmSpy = spyOnConfirm()
    })

    afterEach(() => {
      confirmSpy.mockRestore()
    })

    it('calls deleteBudgetPlan and emits "deleted" when the user confirms', async () => {
      confirmSpy.mockReturnValue(true)

      const wrapper = mount(BudgetPlansHistoryModal, {
        props: { open: true },
        attachTo: document.body,
      })
      await flushPromises()

      const deleteBtn = document.body.querySelector(
        '[data-testid="delete-row-plan-past"]'
      ) as HTMLButtonElement
      deleteBtn.click()
      await flushPromises()

      expect(api.deleteBudgetPlan).toHaveBeenCalledWith('plan-past')
      expect(wrapper.emitted('deleted')?.[0]).toEqual(['plan-past'])
      // Row removed from the table
      expect(
        document.body.querySelector('[data-testid="history-row-plan-past"]')
      ).toBeNull()

      wrapper.unmount()
    })

    it('does nothing when the user cancels the confirm dialog', async () => {
      confirmSpy.mockReturnValue(false)

      const wrapper = mount(BudgetPlansHistoryModal, {
        props: { open: true },
        attachTo: document.body,
      })
      await flushPromises()

      const deleteBtn = document.body.querySelector(
        '[data-testid="delete-row-plan-past"]'
      ) as HTMLButtonElement
      deleteBtn.click()
      await flushPromises()

      expect(api.deleteBudgetPlan).not.toHaveBeenCalled()
      expect(wrapper.emitted('deleted')).toBeUndefined()
      expect(
        document.body.querySelector('[data-testid="history-row-plan-past"]')
      ).not.toBeNull()

      wrapper.unmount()
    })

    it('clicking the delete button does not trigger row selection', async () => {
      confirmSpy.mockReturnValue(true)

      const wrapper = mount(BudgetPlansHistoryModal, {
        props: { open: true },
        attachTo: document.body,
      })
      await flushPromises()

      const deleteBtn = document.body.querySelector(
        '[data-testid="delete-row-plan-past"]'
      ) as HTMLButtonElement
      deleteBtn.click()
      await flushPromises()

      // Only "deleted" was emitted; "select" must not fire (the row click is
      // stopped by @click.stop on the trash button).
      expect(wrapper.emitted('select')).toBeUndefined()
      wrapper.unmount()
    })
  })
})
