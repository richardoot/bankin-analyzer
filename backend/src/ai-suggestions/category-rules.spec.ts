import { describe, it, expect } from 'vitest'
import {
  findSimilarExamples,
  proposeCategoryFromHistory,
} from './category-rules'
import type { CategorizedHistoryRow } from './category-rules'

function row(
  overrides: Partial<CategorizedHistoryRow> = {}
): CategorizedHistoryRow {
  return {
    description: 'CB Fitness Park',
    type: 'EXPENSE',
    categoryId: 'cat-sport',
    categoryName: 'Sport',
    subcategoryId: null,
    subcategoryName: null,
    ...overrides,
  }
}

describe('proposeCategoryFromHistory', () => {
  it('proposes the category almost every similar row agrees on', () => {
    const history = [
      row({ description: 'CB Fitness Park' }),
      row({ description: 'CARTE 06/08/26 FITNESS PARK CB*7962' }),
      row({ description: 'CARTE 25/08/26 FITNESS PARK CB*7962' }),
    ]

    const proposal = proposeCategoryFromHistory(
      'CARTE 31/08/26 FITNESS PARK CB*1234',
      'EXPENSE',
      history
    )

    expect(proposal).toMatchObject({
      categoryId: 'cat-sport',
      categoryName: 'Sport',
      confidence: 1,
      matches: 3,
    })
  })

  it('refuses when there are not enough similar rows to trust', () => {
    const history = [row(), row()] // two, below the default floor of three

    expect(
      proposeCategoryFromHistory('CB Fitness Park', 'EXPENSE', history)
    ).toBeNull()
  })

  it('refuses a merchant that has moved between categories', () => {
    const history = [
      row({ categoryId: 'cat-sport', categoryName: 'Sport' }),
      row({ categoryId: 'cat-sport', categoryName: 'Sport' }),
      row({ categoryId: 'cat-shopping', categoryName: 'Shopping' }),
    ]

    // 2/3 agreement is below the default 0.75 confidence floor.
    expect(
      proposeCategoryFromHistory('CB Fitness Park', 'EXPENSE', history)
    ).toBeNull()
  })

  it('never lets an income row answer for an expense of the same label', () => {
    const history = [
      row({
        type: 'INCOME',
        categoryId: 'cat-refund',
        categoryName: 'Remboursement',
      }),
      row({
        type: 'INCOME',
        categoryId: 'cat-refund',
        categoryName: 'Remboursement',
      }),
      row({
        type: 'INCOME',
        categoryId: 'cat-refund',
        categoryName: 'Remboursement',
      }),
    ]

    expect(
      proposeCategoryFromHistory('CB Fitness Park', 'EXPENSE', history)
    ).toBeNull()
  })

  it('ignores an unrelated merchant entirely', () => {
    const history = [
      row({ description: 'CB Carrefour City' }),
      row({ description: 'CB Carrefour City' }),
      row({ description: 'CB Carrefour City' }),
    ]

    expect(
      proposeCategoryFromHistory('CB Fitness Park', 'EXPENSE', history)
    ).toBeNull()
  })

  it('carries the subcategory the agreeing rows share', () => {
    const history = [
      row({ subcategoryId: 'sub-gym', subcategoryName: 'Salle de sport' }),
      row({ subcategoryId: 'sub-gym', subcategoryName: 'Salle de sport' }),
      row({ subcategoryId: 'sub-gym', subcategoryName: 'Salle de sport' }),
    ]

    const proposal = proposeCategoryFromHistory(
      'CB Fitness Park',
      'EXPENSE',
      history
    )

    expect(proposal?.subcategoryId).toBe('sub-gym')
    expect(proposal?.subcategoryName).toBe('Salle de sport')
  })
})

describe('findSimilarExamples', () => {
  it('ranks the closest matches first', () => {
    const history = [
      row({ description: 'CB Carrefour City' }),
      row({ description: 'CB Fitness Park' }),
      row({ description: 'CARTE 06/08/26 FITNESS PARK CB*7962' }),
    ]

    const examples = findSimilarExamples('CB Fitness Park', 'EXPENSE', history)

    expect(examples).toHaveLength(2)
    expect(examples[0]?.description).toBe('CB Fitness Park')
    expect(examples[1]?.description).toContain('FITNESS PARK')
  })

  it('returns nothing for a merchant never seen before', () => {
    const history = [row({ description: 'CB Carrefour City' })]

    expect(findSimilarExamples('CB Fitness Park', 'EXPENSE', history)).toEqual(
      []
    )
  })

  it('respects the sign, even for an identical label', () => {
    const history = [row({ type: 'INCOME' })]

    expect(findSimilarExamples('CB Fitness Park', 'EXPENSE', history)).toEqual(
      []
    )
  })
})
