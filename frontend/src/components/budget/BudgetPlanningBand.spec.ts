import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import BudgetPlanningBand from './BudgetPlanningBand.vue'

enableAutoUnmount(afterEach)

/** Spaces as one plain space: the formatters use narrow no-break ones. */
const text = (s: string): string => s.replace(/\s+/g, ' ').trim()

type Props = InstanceType<typeof BudgetPlanningBand>['$props']

/**
 * « Automne 2026 », six months: 2 465 € of reference income, 500 € of
 * savings decided, 1 850 € saved and 1 820 € in the draft, two envelopes
 * changed, against a history of 1 853 € a month.
 */
function mountBand(props: Partial<Props> = {}) {
  return mount(BudgetPlanningBand, {
    props: {
      planName: 'Automne 2026',
      monthCount: 6,
      referenceIncome: 2465,
      savedReferenceIncome: 2465,
      draftTotal: 1820,
      savedTotal: 1850,
      delta: -30,
      dirtyCount: 2,
      // No closed month yet: the savings read the reference income.
      completeMonthsIncome: [],
      savingsTarget: 500,
      comparisonExpenseAvg: 1853,
      comparisonLabel: 'janv. → juin 2026',
      ...props,
    },
  })
}

const tile = (w: ReturnType<typeof mountBand>, name: string) =>
  w.get(`[data-testid="budget-tile-${name}"]`)

describe('BudgetPlanningBand', () => {
  it('titles the band with the plan, in four tiles', () => {
    const w = mountBand()
    expect(w.get('[data-testid="budget-planning-band"]').element.tagName).toBe(
      'SECTION'
    )
    expect(w.get('[data-testid="budget-planning-title"]').text()).toBe(
      'Planification · Automne 2026'
    )
    expect(w.text()).toContain(
      'Ce que le plan prévoit par mois, à jour de la saisie'
    )
    for (const name of [
      'reference-income',
      'total',
      'savings-planned',
      'margin',
    ])
      expect(w.find(`[data-testid="budget-tile-${name}"]`).exists()).toBe(true)
  })

  it('carries the reference income in a field, said as entered at creation', async () => {
    const w = mountBand()
    const input = w.get('[data-testid="budget-reference-income-input"]')
    expect((input.element as HTMLInputElement).value).toBe('2465')
    expect(tile(w, 'reference-income').text()).toContain('saisi à la création')

    await input.setValue('2600')
    expect(w.emitted('update:referenceIncome')?.[0]).toEqual([2600])
    await input.setValue('')
    expect(w.emitted('update:referenceIncome')?.[1]).toEqual([null])
  })

  it('says a reference income changed against the saved one', () => {
    const w = mountBand({ referenceIncome: 2600 })
    expect(text(tile(w, 'reference-income').text())).toContain(
      '2 465 € enregistrés'
    )
  })

  it('says the draft total and its change, teal on a drop', () => {
    const w = mountBand()
    expect(
      text(w.get('[data-testid="budget-planning-value-total"]').text())
    ).toBe('1 820 € par mois')
    const badge = w.get('[data-testid="budget-badge-total"]')
    expect(text(badge.text())).toBe('−30 € vs enregistré')
    expect(badge.attributes('data-tone')).toBe('under')
    expect(badge.classes()).toContain('bg-teal-50')
    expect(text(w.get('[data-testid="budget-detail-total"]').text())).toBe(
      '1 850 € enregistrés · 2 enveloppes modifiées'
    )
  })

  it('follows the draft: amber on a rise, grey when unchanged', async () => {
    const w = mountBand({ draftTotal: 1900, delta: 50, dirtyCount: 1 })
    expect(
      text(w.get('[data-testid="budget-planning-value-total"]').text())
    ).toContain('1 900 €')
    expect(
      w.get('[data-testid="budget-badge-total"]').attributes('data-tone')
    ).toBe('over')

    await w.setProps({ draftTotal: 1850, delta: 0, dirtyCount: 0 })
    const badge = w.get('[data-testid="budget-badge-total"]')
    expect(badge.attributes('data-tone')).toBe('neutral')
    expect(badge.text()).toBe('comme enregistré')
    expect(w.get('[data-testid="budget-detail-total"]').text()).toContain(
      'aucune enveloppe modifiée'
    )
  })

  it('plans the savings against those decided, with the project reserve', () => {
    const w = mountBand()
    expect(
      text(w.get('[data-testid="budget-planning-value-savings"]').text())
    ).toBe('645 € par mois')
    const badge = w.get('[data-testid="budget-badge-savings-planned"]')
    expect(text(badge.text())).toBe('+145 € vs 500 € décidés')
    expect(badge.attributes('data-tone')).toBe('under')
    // (2 465 − 500 − 1 820) × 6, the backend's projectReserve.
    expect(
      text(w.get('[data-testid="budget-detail-savings-planned"]').text())
    ).toBe('réserve projets 145 € × 6 mois = 870 €')
    expect(w.get('[data-testid="budget-savings-planned-basis"]').text()).toBe(
      'sur les revenus de référence saisis'
    )
  })

  it('plans the savings on the closed months’ income once there is one', () => {
    // 2 400 and 2 800 received: 2 600 on average, not the 2 465 typed.
    const w = mountBand({ completeMonthsIncome: [2400, 2800] })
    expect(
      text(w.get('[data-testid="budget-planning-value-savings"]').text())
    ).toBe('780 € par mois')
    expect(
      text(w.get('[data-testid="budget-badge-savings-planned"]').text())
    ).toBe('+280 € vs 500 € décidés')
    // The reserve line on the same income: (2 600 − 500 − 1 820) × 6.
    expect(
      text(w.get('[data-testid="budget-detail-savings-planned"]').text())
    ).toBe('réserve projets 280 € × 6 mois = 1 680 €')
    expect(
      text(w.get('[data-testid="budget-savings-planned-basis"]').text())
    ).toBe(
      'sur les revenus moyens de 2 mois clos (2 600 €), pas les revenus de référence'
    )
    // The field keeps the reference income as typed.
    expect(
      (
        w.get('[data-testid="budget-reference-income-input"]')
          .element as HTMLInputElement
      ).value
    ).toBe('2465')
  })

  it('says a plan past its income in amber', () => {
    const w = mountBand({ draftTotal: 2600, delta: 750 })
    const figure = w.get('[data-testid="budget-planning-value-savings"]')
    expect(figure.classes()).toContain('text-amber-700')
    // Negative amounts take the typographic minus, the reserve too.
    expect(text(figure.text())).toBe('−135 € par mois')
    expect(
      text(w.get('[data-testid="budget-detail-savings-planned"]').text())
    ).toBe('réserve projets −635 € × 6 mois = −3 810 €')
    const badge = w.get('[data-testid="budget-badge-savings-planned"]')
    expect(badge.text()).toBe('le plan dépasse les revenus')
    expect(badge.attributes('data-tone')).toBe('over')
  })

  it('says no target and no reserve without a savings target', () => {
    const w = mountBand({ savingsTarget: null })
    expect(w.get('[data-testid="budget-badge-savings-planned"]').text()).toBe(
      'pas d’objectif'
    )
    expect(w.get('[data-testid="budget-detail-savings-planned"]').text()).toBe(
      'Revenus − budget total'
    )
  })

  it('says the reference income is missing, without savings to plan', () => {
    const w = mountBand({ referenceIncome: null, savedReferenceIncome: null })
    expect(tile(w, 'reference-income').text()).toContain('non renseignés')
    expect(
      (
        w.get('[data-testid="budget-reference-income-input"]')
          .element as HTMLInputElement
      ).value
    ).toBe('')
    expect(w.get('[data-testid="budget-planning-value-savings"]').text()).toBe(
      '—'
    )
    expect(
      w.find('[data-testid="budget-savings-planned-no-income"]').exists()
    ).toBe(true)
  })

  it('weighs the draft against the history: tighter in amber', () => {
    const w = mountBand({ draftTotal: 1500, delta: -350 })
    expect(
      text(w.get('[data-testid="budget-planning-value-margin"]').text())
    ).toBe('−353 € par mois')
    const badge = w.get('[data-testid="budget-badge-margin"]')
    expect(badge.attributes('data-tone')).toBe('over')
    expect(badge.text()).toBe('plus serré que l’historique')
    expect(text(w.get('[data-testid="budget-detail-margin"]').text())).toBe(
      'historique 1 853 € par mois · janv. → juin 2026'
    )
  })

  it('reads a margin within ±5 % as level with the history', () => {
    const w = mountBand()
    expect(
      text(w.get('[data-testid="budget-planning-value-margin"]').text())
    ).toBe('−33 € par mois')
    expect(
      w.get('[data-testid="budget-badge-margin"]').attributes('data-tone')
    ).toBe('neutral')
  })

  it('reads a roomier plan in teal', () => {
    const w = mountBand({ draftTotal: 2100, delta: 250 })
    const badge = w.get('[data-testid="budget-badge-margin"]')
    expect(badge.attributes('data-tone')).toBe('under')
    expect(badge.text()).toBe('de la marge sur l’historique')
  })

  it('offers to choose a comparison when none is', async () => {
    const w = mountBand({ comparisonExpenseAvg: null, comparisonLabel: null })
    expect(w.get('[data-testid="budget-planning-value-margin"]').text()).toBe(
      '—'
    )
    await w.get('[data-testid="budget-choose-comparison"]').trigger('click')
    expect(w.emitted('choose-comparison')).toHaveLength(1)
  })
})
