import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import BudgetEditBar from './BudgetEditBar.vue'

enableAutoUnmount(afterEach)

const text = (s: string): string => s.replace(/\s+/g, ' ').trim()

type Props = InstanceType<typeof BudgetEditBar>['$props']

function mountBar(props: Partial<Props> = {}) {
  return mount(BudgetEditBar, {
    props: {
      dirtyCount: 2,
      savedTotal: 1850,
      draftTotal: 1820,
      delta: -30,
      saving: false,
      ...props,
    },
  })
}

describe('BudgetEditBar', () => {
  it('says the changes and the total they move to', () => {
    const w = mountBar()
    expect(w.get('[data-testid="budget-dirty-count"]').text()).toBe(
      '2 enveloppes modifiées'
    )
    expect(text(w.get('[data-testid="budget-edit-total"]').text())).toBe(
      'Total 1 850 € → 1 820 €'
    )
    expect(text(w.get('[data-testid="budget-draft-delta"]').text())).toBe(
      '−30 € par mois'
    )
  })

  it('tones the change in the state tints, never red', async () => {
    const w = mountBar()
    const delta = () => w.get('[data-testid="budget-draft-delta"]')
    expect(delta().attributes('data-tone')).toBe('under')
    expect(delta().classes()).toContain('bg-teal-50')

    await w.setProps({ draftTotal: 1900, delta: 50 })
    expect(delta().attributes('data-tone')).toBe('over')
    expect(delta().classes()).toContain('bg-amber-50')
    expect(text(delta().text())).toBe('+50 € par mois')

    await w.setProps({ draftTotal: 1850, delta: 0 })
    expect(delta().attributes('data-tone')).toBe('neutral')
    expect(w.html()).not.toMatch(/(?:text|bg|border)-(?:red|green)-\d/)
  })

  it('has nothing to save until something changes', () => {
    const w = mountBar({ dirtyCount: 0, draftTotal: 1850, delta: 0 })
    expect(w.text()).toContain('Aucune modification')
    expect(w.find('[data-testid="budget-draft-delta"]').exists()).toBe(false)
    expect(
      (w.get('[data-testid="budget-save-button"]').element as HTMLButtonElement)
        .disabled
    ).toBe(true)
  })

  it('counts a changed reference income as a change to save', () => {
    const w = mountBar({
      dirtyCount: 0,
      draftTotal: 1850,
      delta: 0,
      incomeChanged: true,
    })
    expect(w.get('[data-testid="budget-dirty-count"]').text()).toBe(
      'Revenus de référence modifiés'
    )
    expect(
      (w.get('[data-testid="budget-save-button"]').element as HTMLButtonElement)
        .disabled
    ).toBe(false)
  })

  it('says both an envelope and the income changed', () => {
    const w = mountBar({ dirtyCount: 1, incomeChanged: true })
    expect(w.get('[data-testid="budget-dirty-count"]').text()).toBe(
      '1 enveloppe modifiée et revenus de référence'
    )
  })

  it('emits save and cancel', async () => {
    const w = mountBar()
    await w.get('[data-testid="budget-save-button"]').trigger('click')
    await w.get('[data-testid="budget-cancel-button"]').trigger('click')
    expect(w.emitted('save')).toHaveLength(1)
    expect(w.emitted('cancel')).toHaveLength(1)
  })

  it('says a save went through in teal, and a failure in the error alert', async () => {
    const w = mountBar({ status: 'saved' })
    const feedback = () => w.get('[data-testid="budget-save-feedback"]')
    expect(feedback().text()).toContain('Budget enregistré')
    expect(feedback().classes()).toContain('text-teal-700')
    expect(w.find('[data-testid="budget-save-button"]').exists()).toBe(false)

    await w.setProps({ status: 'error', errorMessage: 'boom' })
    expect(feedback().text()).toContain('boom')
    expect(feedback().find('[role="alert"]').exists()).toBe(true)
  })
})
