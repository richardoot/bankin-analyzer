import { describe, it, expect } from 'vitest'
import {
  chunk,
  matchKey,
  resolveAssignments,
  describeCatalog,
  type CategoryChoice,
  type SubcategoryChoice,
  type CategorizableTransaction,
} from './transaction-categorizer'

const categories: CategoryChoice[] = [
  { id: 'cat-food', name: 'Alimentation & Restau.', type: 'EXPENSE' },
  { id: 'cat-health', name: 'Santé', type: 'EXPENSE' },
  { id: 'cat-salary', name: 'Salaires', type: 'INCOME' },
  // Same name on both sides: only the matching sign may receive a row.
  { id: 'cat-errors-expense', name: 'Erreurs', type: 'EXPENSE' },
  { id: 'cat-errors-income', name: 'Erreurs', type: 'INCOME' },
]

const subcategories: SubcategoryChoice[] = [
  { id: 'sub-groceries', name: 'Courses', categoryId: 'cat-food' },
  { id: 'sub-doctor', name: 'Medecin', categoryId: 'cat-health' },
]

const expense: CategorizableTransaction = {
  index: 0,
  description: 'Monoprix',
  amount: -42.5,
  type: 'EXPENSE',
}
const income: CategorizableTransaction = {
  index: 1,
  description: 'Vir Salaire',
  amount: 2400,
  type: 'INCOME',
}

const resolve = (
  raw: Parameters<typeof resolveAssignments>[0],
  transactions: CategorizableTransaction[] = [expense, income]
) => resolveAssignments(raw, transactions, categories, subcategories)

describe('matchKey', () => {
  it('folds case, accents and stray spacing', () => {
    expect(matchKey('  SANTÉ ')).toBe(matchKey('sante'))
    expect(matchKey('Alimentation  &  Restau.')).toBe(
      matchKey('alimentation & restau.')
    )
  })

  it('does not fold two different names together', () => {
    expect(matchKey('Santé')).not.toBe(matchKey('Sante Publique'))
  })
})

describe('chunk', () => {
  it('splits into batches of the requested size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns nothing for an empty list', () => {
    expect(chunk([], 10)).toEqual([])
  })

  it('refuses a size that would never advance', () => {
    expect(() => chunk([1], 0)).toThrow()
  })
})

describe('resolveAssignments', () => {
  it('files a transaction under the category the model named', () => {
    const [assignment] = resolve([
      { index: 0, category: 'Alimentation & Restau.' },
    ])

    expect(assignment).toEqual({
      index: 0,
      categoryId: 'cat-food',
      subcategoryId: null,
      subcategoryName: null,
    })
  })

  it('accepts a name spelled with different case or accents', () => {
    expect(resolve([{ index: 0, category: 'sante' }])[0]?.categoryId).toBe(
      'cat-health'
    )
  })

  it('carries the subcategory and its label when it belongs to the category', () => {
    const [assignment] = resolve([
      { index: 0, category: 'Alimentation & Restau.', subcategory: 'Courses' },
    ])

    // The label is denormalized onto the row, and the dashboard groups on it.
    expect(assignment).toMatchObject({
      subcategoryId: 'sub-groceries',
      subcategoryName: 'Courses',
    })
  })

  describe('what it refuses', () => {
    it('drops a category that does not exist', () => {
      // The model must choose from the list, not invent an entry.
      expect(resolve([{ index: 0, category: 'Cryptomonnaies' }])).toEqual([])
    })

    it('drops a category of the wrong sign', () => {
      // "Erreurs" exists on both sides; an expense may only reach the expense one.
      const [assignment] = resolve([{ index: 0, category: 'Erreurs' }])
      expect(assignment?.categoryId).toBe('cat-errors-expense')

      const [forIncome] = resolve([{ index: 1, category: 'Erreurs' }])
      expect(forIncome?.categoryId).toBe('cat-errors-income')
    })

    it('refuses an expense filed under an income-only category', () => {
      expect(resolve([{ index: 0, category: 'Salaires' }])).toEqual([])
    })

    it('drops an answer about a transaction that was never asked about', () => {
      expect(resolve([{ index: 99, category: 'Santé' }])).toEqual([])
    })

    it('keeps the category when only the subcategory is wrong', () => {
      // Coarse filing is still worth having when the fine one is not.
      const [assignment] = resolve([
        {
          index: 0,
          category: 'Alimentation & Restau.',
          subcategory: 'Medecin',
        },
      ])

      expect(assignment).toMatchObject({
        categoryId: 'cat-food',
        subcategoryId: null,
      })
    })

    it('ignores a repeated index rather than letting the last answer win', () => {
      const [assignment] = resolve([
        { index: 0, category: 'Santé' },
        { index: 0, category: 'Alimentation & Restau.' },
      ])

      expect(assignment?.categoryId).toBe('cat-health')
    })

    it('survives an empty or missing category name', () => {
      expect(resolve([{ index: 0, category: '' }])).toEqual([])
    })
  })

  it('returns the assignments in transaction order', () => {
    const result = resolve([
      { index: 1, category: 'Salaires' },
      { index: 0, category: 'Santé' },
    ])

    expect(result.map(a => a.index)).toEqual([0, 1])
  })

  it('returns nothing when the user has no categories at all', () => {
    expect(
      resolveAssignments([{ index: 0, category: 'Santé' }], [expense], [], [])
    ).toEqual([])
  })
})

describe('describeCatalog', () => {
  it('lists only the categories of the requested sign', () => {
    const catalog = describeCatalog(categories, subcategories, 'INCOME')

    expect(catalog).toContain('Salaires')
    expect(catalog).not.toContain('Santé')
  })

  it('names each category subcategories under it', () => {
    const catalog = describeCatalog(categories, subcategories, 'EXPENSE')

    expect(catalog).toContain(
      'Alimentation & Restau. (sous-categories: Courses)'
    )
    // A category without subcategories stays on one plain line.
    expect(catalog.split('\n')).toContain('- Erreurs')
  })
})
