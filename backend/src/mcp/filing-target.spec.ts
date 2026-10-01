import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  resolveFilingTarget,
  type FilingCategory,
  type FilingSubcategory,
} from './filing-target'

const categories: FilingCategory[] = [
  { id: 'cat-food', name: 'Alimentation', type: 'EXPENSE' },
  { id: 'cat-transfer', name: 'Virements internes', type: 'EXPENSE' },
  { id: 'cat-refund-exp', name: 'Remboursements', type: 'EXPENSE' },
  { id: 'cat-refund-inc', name: 'Remboursements', type: 'INCOME' },
]

const subcategories: FilingSubcategory[] = [
  { id: 'sub-groceries', name: 'Supermarché', categoryId: 'cat-food' },
  { id: 'sub-restaurant', name: 'Restaurant', categoryId: 'cat-food' },
  { id: 'sub-other', name: 'Autres', categoryId: 'cat-transfer' },
]

describe('normalizeName', () => {
  it('ignores case, accents and stray whitespace', () => {
    expect(normalizeName('  Supermarché ')).toBe('supermarche')
    expect(normalizeName('Virements   INTERNES')).toBe('virements internes')
    expect(normalizeName('Éducation\tet  loisirs')).toBe('education et loisirs')
  })
})

describe('resolveFilingTarget', () => {
  it('resolves a category alone by name, with no subcategory', () => {
    const result = resolveFilingTarget(categories, subcategories, {
      categoryName: 'virements internes',
    })

    expect(result).toEqual({
      ok: true,
      category: categories[1],
      subcategory: null,
    })
  })

  it('resolves a category and subcategory by normalized names', () => {
    const result = resolveFilingTarget(categories, subcategories, {
      categoryName: ' ALIMENTATION',
      subcategoryName: 'supermarche',
    })

    expect(result).toMatchObject({
      ok: true,
      category: { id: 'cat-food' },
      subcategory: { id: 'sub-groceries' },
    })
  })

  it('resolves by ids', () => {
    const result = resolveFilingTarget(categories, subcategories, {
      categoryId: 'cat-food',
      subcategoryId: 'sub-restaurant',
    })

    expect(result).toMatchObject({
      ok: true,
      category: { id: 'cat-food' },
      subcategory: { id: 'sub-restaurant' },
    })
  })

  it('treats blank fields as absent', () => {
    const result = resolveFilingTarget(categories, subcategories, {
      categoryId: 'cat-food',
      categoryName: '  ',
      subcategoryName: '',
    })

    expect(result).toMatchObject({ ok: true, subcategory: null })
  })

  it.each([
    [{}, 'CATEGORY_MISSING'],
    [
      { categoryId: 'cat-food', categoryName: 'Alimentation' },
      'CATEGORY_ID_AND_NAME',
    ],
    [
      {
        categoryId: 'cat-food',
        subcategoryId: 'sub-groceries',
        subcategoryName: 'Supermarché',
      },
      'SUBCATEGORY_ID_AND_NAME',
    ],
    [{ categoryName: 'Vacances' }, 'CATEGORY_UNKNOWN'],
    [{ categoryId: 'someone-elses-category' }, 'CATEGORY_UNKNOWN'],
    [{ categoryName: 'remboursements' }, 'CATEGORY_AMBIGUOUS'],
    [
      { categoryId: 'cat-food', subcategoryName: 'Boulangerie' },
      'SUBCATEGORY_UNKNOWN',
    ],
    [
      { categoryId: 'cat-food', subcategoryId: 'someone-elses-subcategory' },
      'SUBCATEGORY_UNKNOWN',
    ],
    [
      { categoryId: 'cat-food', subcategoryId: 'sub-other' },
      'SUBCATEGORY_NOT_IN_CATEGORY',
    ],
    // A subcategory name is only looked for inside the target category.
    [
      { categoryName: 'Alimentation', subcategoryName: 'Autres' },
      'SUBCATEGORY_UNKNOWN',
    ],
  ])('refuses %j with %s', (target, error) => {
    const result = resolveFilingTarget(categories, subcategories, target)

    expect(result).toMatchObject({ ok: false, error })
    if (!result.ok) expect(result.message).not.toBe('')
  })

  it('names the candidates when a category name is ambiguous', () => {
    const result = resolveFilingTarget(categories, subcategories, {
      categoryName: 'Remboursements',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('cat-refund-exp (EXPENSE)')
      expect(result.message).toContain('cat-refund-inc (INCOME)')
    }
  })

  it('refuses two subcategories that only differ by accents', () => {
    const result = resolveFilingTarget(
      categories,
      [
        { id: 'sub-a', name: 'Café', categoryId: 'cat-food' },
        { id: 'sub-b', name: 'Cafe', categoryId: 'cat-food' },
      ],
      { categoryId: 'cat-food', subcategoryName: 'cafe' }
    )

    expect(result).toMatchObject({ ok: false, error: 'SUBCATEGORY_AMBIGUOUS' })
  })
})
