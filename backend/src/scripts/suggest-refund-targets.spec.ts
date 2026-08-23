import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  labelOf,
  suggestRefundTargets,
  type RefundCandidate,
  type ExpenseCategory,
} from './suggest-refund-targets'

const candidate = (
  overrides: Partial<RefundCandidate> = {}
): RefundCandidate => ({
  id: 'tx-1',
  date: new Date('2026-03-04T00:00:00.000Z'),
  description: 'Vir Chloe',
  amount: 50,
  alreadyDrawn: 0,
  categoryName: 'Remboursements',
  subcategoryName: 'R Vacances',
  ...overrides,
})

const categories: ExpenseCategory[] = [
  { id: 'cat-holidays', name: 'Vacances' },
  { id: 'cat-shopping', name: 'Achats & Shopping' },
  { id: 'cat-food', name: 'Alimentation & Restau.' },
  { id: 'cat-health', name: 'Santé' },
]

describe('normalizeName', () => {
  it('drops the R prefix that marks a refund', () => {
    expect(normalizeName('R Vacances')).toBe(normalizeName('Vacances'))
  })

  it('treats "et" and "&" as the same word', () => {
    // The user writes one on the income side and the other on the expense
    // side, and means the same category.
    expect(normalizeName('R Achats et Shopping')).toBe(
      normalizeName('Achats & Shopping')
    )
  })

  it('ignores accents, case and a trailing dot', () => {
    expect(normalizeName('R Santé')).toBe(normalizeName('SANTE'))
    expect(normalizeName('R Alimentation et Restau')).toBe(
      normalizeName('Alimentation & Restau.')
    )
  })

  it('does not fold two genuinely different names together', () => {
    expect(normalizeName('R Restaurant')).not.toBe(normalizeName('Retraite'))
  })

  it('leaves a name that merely starts with R alone', () => {
    // "Restaurant" must not become "estaurant": the prefix is "R " with a
    // space, not the letter.
    expect(normalizeName('Restaurant')).toBe('restaurant')
  })
})

describe('labelOf', () => {
  it('reads the intent from the subcategory when there is one', () => {
    expect(labelOf(candidate())).toBe('R Vacances')
  })

  it('falls back to the category', () => {
    expect(labelOf(candidate({ subcategoryName: null }))).toBe('Remboursements')
  })

  it('says so when there is neither', () => {
    expect(
      labelOf(candidate({ subcategoryName: null, categoryName: null }))
    ).toBe('(sans categorie)')
  })
})

describe('suggestRefundTargets', () => {
  it('points a refund at the expense category its label names', () => {
    const { suggestions } = suggestRefundTargets([candidate()], categories)

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      label: 'R Vacances',
      targetCategoryId: 'cat-holidays',
      count: 1,
      total: 50,
    })
  })

  it('matches across the "et" / "&" spelling', () => {
    const { suggestions } = suggestRefundTargets(
      [candidate({ subcategoryName: 'R Achats et Shopping' })],
      categories
    )

    expect(suggestions[0]?.targetCategoryName).toBe('Achats & Shopping')
  })

  it('groups every refund sharing a label', () => {
    const { suggestions } = suggestRefundTargets(
      [
        candidate({ id: 'a', amount: 30 }),
        candidate({ id: 'b', amount: 20.5 }),
      ],
      categories
    )

    expect(suggestions[0]).toMatchObject({ count: 2, total: 50.5 })
  })

  it('subtracts the cash a settlement already drew', () => {
    // The one arithmetic mistake this exercise can make: crediting the same
    // money twice, once through the ledger and once at category level.
    const { suggestions } = suggestRefundTargets(
      [candidate({ amount: 100, alreadyDrawn: 40 })],
      categories
    )

    expect(suggestions[0]).toMatchObject({
      total: 100,
      alreadyDrawn: 40,
      remaining: 60,
    })
  })

  it('reports a near-miss as unmatched rather than guessing', () => {
    // A wrong target is worse than a missing one.
    const { suggestions, unmatched } = suggestRefundTargets(
      [candidate({ subcategoryName: 'R Vacance' })],
      categories
    )

    expect(suggestions).toHaveLength(0)
    expect(unmatched[0]).toMatchObject({ label: 'R Vacance', count: 1 })
  })

  it('keeps plain income out of the suggestions', () => {
    const { suggestions, unmatched } = suggestRefundTargets(
      [
        candidate({
          categoryName: 'Salaires',
          subcategoryName: null,
          amount: 2400,
        }),
      ],
      categories
    )

    expect(suggestions).toHaveLength(0)
    expect(unmatched[0]?.label).toBe('Salaires')
  })

  it('sorts by amount so the money that matters comes first', () => {
    const { suggestions } = suggestRefundTargets(
      [
        candidate({ id: 'a', subcategoryName: 'R Santé', amount: 10 }),
        candidate({ id: 'b', subcategoryName: 'R Vacances', amount: 900 }),
      ],
      categories
    )

    expect(suggestions.map(s => s.targetCategoryName)).toEqual([
      'Vacances',
      'Santé',
    ])
  })

  it('does not let a duplicate category name retarget a group', () => {
    const { suggestions } = suggestRefundTargets(
      [candidate()],
      [
        { id: 'first', name: 'Vacances' },
        { id: 'second', name: 'Vacances' },
      ]
    )

    expect(suggestions[0]?.targetCategoryId).toBe('first')
  })

  it('returns nothing at all for an empty account', () => {
    expect(suggestRefundTargets([], categories)).toEqual({
      suggestions: [],
      unmatched: [],
    })
  })
})
