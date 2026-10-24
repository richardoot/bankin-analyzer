import { computed, ref, type Ref } from 'vue'
import type { BudgetPlanDto } from '@/lib/api'

/**
 * The draft of the Budget page's edit mode: the envelopes and the
 * reference income being typed, against what the server holds. Until
 * « Enregistrer » nothing leaves the browser: `saved*` is what « Annuler »
 * restores and what « modifiée » is measured against.
 *
 * The totals are over every entry of the plan, not over the categories
 * the statistics happen to list: an envelope on a category that spent
 * nothing in the window is absent from them, and dropping it would make
 * the band, the bar and the plan disagree (budget-refonte.md, lot 4).
 */
export function useBudgetDraft(plan: Ref<BudgetPlanDto | null>) {
  const budgetInputs = ref<Map<string, number>>(new Map())
  const savedBudgets = ref<Map<string, number>>(new Map())
  /** The reference income being edited in « Planification ». */
  const referenceIncomeInput = ref<number | null>(null)

  /** The reference income the server holds, the « before » of its field. */
  const savedReferenceIncome = computed(
    () => plan.value?.referenceIncome ?? null
  )

  function getBudgetForCategory(categoryId: string): number {
    return budgetInputs.value.get(categoryId) ?? 0
  }

  /** Envelope the server holds for a category — the « before » of the diff. */
  function getSavedBudget(categoryId: string): number {
    return savedBudgets.value.get(categoryId) ?? 0
  }

  function isCategoryDirty(categoryId: string): boolean {
    return getSavedBudget(categoryId) !== getBudgetForCategory(categoryId)
  }

  /** Categories whose draft envelope differs from what the server holds. */
  const dirtyCategoryIds = computed(() => {
    const ids = new Set([
      ...savedBudgets.value.keys(),
      ...budgetInputs.value.keys(),
    ])
    return [...ids].filter(
      id =>
        (savedBudgets.value.get(id) ?? 0) !== (budgetInputs.value.get(id) ?? 0)
    )
  })

  const referenceIncomeDirty = computed(
    () => referenceIncomeInput.value !== savedReferenceIncome.value
  )

  const hasUnsavedChanges = computed(
    () => dirtyCategoryIds.value.length > 0 || referenceIncomeDirty.value
  )

  function sumOf(budgets: Map<string, number>): number {
    let total = 0
    for (const amount of budgets.values()) total += amount
    return total
  }

  const savedPlanTotal = computed(() => sumOf(savedBudgets.value))
  const draftPlanTotal = computed(() => sumOf(budgetInputs.value))
  const draftDelta = computed(() => draftPlanTotal.value - savedPlanTotal.value)

  /** The draft back to what the server holds. */
  function restore(): void {
    budgetInputs.value = new Map(savedBudgets.value)
    referenceIncomeInput.value = savedReferenceIncome.value
  }

  /** Take the entries of a freshly loaded plan as the new saved reference. */
  function adopt(loaded: BudgetPlanDto | null): void {
    savedBudgets.value = new Map(
      (loaded?.entries ?? []).map(e => [e.categoryId, e.amount])
    )
    budgetInputs.value = new Map(savedBudgets.value)
    referenceIncomeInput.value = loaded?.referenceIncome ?? null
  }

  /** What « Enregistrer » sends: the envelopes above zero. */
  function entriesToSave(): { categoryId: string; amount: number }[] {
    return Array.from(budgetInputs.value.entries())
      .filter(([, amount]) => amount > 0)
      .map(([categoryId, amount]) => ({ categoryId, amount }))
  }

  /** A typed value; anything unreadable is no envelope. */
  function updateBudgetInput(categoryId: string, value: string): void {
    const num = parseFloat(value)
    budgetInputs.value.set(categoryId, Number.isFinite(num) ? num : 0)
  }

  /** A reference figure taken as the envelope, in whole euros. */
  function setBudgetValue(categoryId: string, amount: number): void {
    budgetInputs.value.set(categoryId, Math.round(amount))
  }

  /** Every envelope set moved by a percentage, in whole euros. */
  function adjustAllByPercent(categoryIds: string[], percent: number): void {
    for (const id of categoryIds) {
      const current = budgetInputs.value.get(id) ?? 0
      if (current > 0) {
        budgetInputs.value.set(id, Math.round(current * (1 + percent / 100)))
      }
    }
  }

  // No confirmation needed: emptying the draft is undone by « Annuler »,
  // and nothing has left the browser until « Enregistrer ».
  function resetAllBudgets(): void {
    budgetInputs.value.clear()
  }

  return {
    budgetInputs,
    referenceIncomeInput,
    savedReferenceIncome,
    getBudgetForCategory,
    getSavedBudget,
    isCategoryDirty,
    dirtyCategoryIds,
    referenceIncomeDirty,
    hasUnsavedChanges,
    savedPlanTotal,
    draftPlanTotal,
    draftDelta,
    restore,
    adopt,
    entriesToSave,
    updateBudgetInput,
    setBudgetValue,
    adjustAllByPercent,
    resetAllBudgets,
  }
}
