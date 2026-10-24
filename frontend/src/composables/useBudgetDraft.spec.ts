import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import type { BudgetPlanDto } from '@/lib/api'
import { useBudgetDraft } from './useBudgetDraft'

const plan: BudgetPlanDto = {
  id: 'p1',
  name: 'Automne 2026',
  startDate: '2026-07-01',
  endDate: '2026-12-31',
  monthCount: 6,
  totalAmount: 600,
  referenceIncome: 2465,
  entries: [
    { id: 'e1', categoryId: 'food', categoryName: 'Alimentation', amount: 450 },
    { id: 'e2', categoryId: 'bars', categoryName: 'Bars', amount: 150 },
  ],
  createdAt: '2026-06-25T00:00:00Z',
  updatedAt: '2026-06-25T00:00:00Z',
}

function draftOf() {
  const current = ref<BudgetPlanDto | null>(plan)
  const draft = useBudgetDraft(current)
  draft.adopt(plan)
  return draft
}

describe('useBudgetDraft', () => {
  it('adopts a plan as the saved reference, nothing dirty', () => {
    const d = draftOf()
    expect(d.getBudgetForCategory('food')).toBe(450)
    expect(d.savedPlanTotal.value).toBe(600)
    expect(d.draftPlanTotal.value).toBe(600)
    expect(d.referenceIncomeInput.value).toBe(2465)
    expect(d.hasUnsavedChanges.value).toBe(false)
  })

  it('follows the typing, the totals over every entry', () => {
    const d = draftOf()
    d.updateBudgetInput('food', '420')
    d.updateBudgetInput('rent', '500')
    expect(d.dirtyCategoryIds.value).toEqual(['food', 'rent'])
    expect(d.isCategoryDirty('food')).toBe(true)
    expect(d.getSavedBudget('food')).toBe(450)
    expect(d.draftDelta.value).toBe(470)
    // Unreadable: no envelope.
    d.updateBudgetInput('bars', 'abc')
    expect(d.getBudgetForCategory('bars')).toBe(0)
  })

  it('takes a figure in whole euros, moves the set envelopes by a percent', () => {
    const d = draftOf()
    d.setBudgetValue('food', 412.6)
    expect(d.getBudgetForCategory('food')).toBe(413)
    d.adjustAllByPercent(['food', 'bars', 'none'], -10)
    expect(d.getBudgetForCategory('food')).toBe(372)
    expect(d.getBudgetForCategory('bars')).toBe(135)
    expect(d.getBudgetForCategory('none')).toBe(0)
  })

  it('says a changed income, and restores everything', () => {
    const d = draftOf()
    d.referenceIncomeInput.value = 2600
    d.resetAllBudgets()
    expect(d.referenceIncomeDirty.value).toBe(true)
    expect(d.draftPlanTotal.value).toBe(0)
    d.restore()
    expect(d.hasUnsavedChanges.value).toBe(false)
    expect(d.draftPlanTotal.value).toBe(600)
  })

  it('sends the envelopes above zero only', () => {
    const d = draftOf()
    d.updateBudgetInput('bars', '0')
    expect(d.entriesToSave()).toEqual([{ categoryId: 'food', amount: 450 }])
  })
})
