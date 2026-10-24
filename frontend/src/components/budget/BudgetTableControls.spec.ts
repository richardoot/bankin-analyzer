import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import BudgetTableControls from './BudgetTableControls.vue'

enableAutoUnmount(afterEach)

function mountControls(editing: boolean, planIsPast = false) {
  return mount(BudgetTableControls, {
    props: { editing, planIsPast, averagesSource: 'actual' },
    slots: editing
      ? { comparison: '<div data-testid="comparison-selector">Comparer</div>' }
      : {},
  })
}

/** The order of the given test ids in the rendered markup. */
function order(w: ReturnType<typeof mountControls>, ids: string[]): string[] {
  const html = w.html()
  return [...ids].sort(
    (a, b) =>
      html.indexOf(`data-testid="${a}"`) - html.indexOf(`data-testid="${b}"`)
  )
}

describe('BudgetTableControls', () => {
  it('follows the plan with the title, the sort and the way into edit mode', () => {
    const w = mountControls(false)
    expect(w.get('#budget-envelopes-title').text()).toBe('Les enveloppes')
    expect(w.find('[data-testid="budget-edit-button"]').exists()).toBe(true)
    expect(w.find('#budget-sort').exists()).toBe(true)
    expect(w.find('[data-testid="budget-quick-actions"]').exists()).toBe(false)
    expect(w.find('[data-testid="budget-comparison-slot"]').exists()).toBe(
      false
    )
  })

  it('puts the warning above, the comparison on the title’s line, the actions under it', () => {
    const w = mountControls(true, true)
    expect(w.find('[data-testid="budget-edit-button"]').exists()).toBe(false)
    expect(w.find('#budget-sort').exists()).toBe(true)
    const ids = [
      'budget-past-plan-warning',
      'budget-envelopes-subtitle',
      'budget-comparison-slot',
      'budget-quick-actions',
    ]
    expect(order(w, ids)).toEqual(ids)
  })

  it('says no warning on a running plan', () => {
    const w = mountControls(true, false)
    expect(w.find('[data-testid="budget-past-plan-warning"]').exists()).toBe(
      false
    )
  })
})
