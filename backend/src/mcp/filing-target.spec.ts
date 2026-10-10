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

describe('resolveFilingTarget — catalogue keys', () => {
  const keyed: FilingCategory[] = [
    {
      id: 'cat-housing',
      name: 'Logement',
      type: 'EXPENSE',
      catalogKey: 'housing',
    },
    {
      id: 'cat-adjust',
      name: 'Régularisation',
      type: 'TRANSFER',
      catalogKey: 'adjustment',
    },
    { id: 'cat-legacy', name: 'Erreurs', type: 'EXPENSE', catalogKey: null },
  ]
  const keyedSubs: FilingSubcategory[] = [
    {
      id: 'sub-rent',
      name: 'Loyer ou crédit immobilier',
      categoryId: 'cat-housing',
      catalogKey: 'housing.rent',
    },
    {
      id: 'sub-own',
      name: 'Garage',
      categoryId: 'cat-housing',
      catalogKey: null,
    },
  ]

  it('resolves a category and a subcategory by their keys', () => {
    expect(
      resolveFilingTarget(keyed, keyedSubs, {
        categoryKey: 'housing',
        subcategoryKey: 'housing.rent',
      })
    ).toEqual({ ok: true, category: keyed[0], subcategory: keyedSubs[0] })
  })

  it('resolves a transfer category by key, alone', () => {
    expect(
      resolveFilingTarget(keyed, keyedSubs, { categoryKey: 'adjustment' })
    ).toEqual({ ok: true, category: keyed[1], subcategory: null })
  })

  it('lets a key category take a subcategory of the user by name', () => {
    expect(
      resolveFilingTarget(keyed, keyedSubs, {
        categoryKey: 'housing',
        subcategoryName: 'garage',
      })
    ).toMatchObject({ ok: true, subcategory: { id: 'sub-own' } })
  })

  it('refuses a key and a name for the same level', () => {
    expect(
      resolveFilingTarget(keyed, keyedSubs, {
        categoryKey: 'housing',
        categoryName: 'Logement',
      })
    ).toMatchObject({ ok: false, error: 'CATEGORY_ID_AND_NAME' })
    expect(
      resolveFilingTarget(keyed, keyedSubs, {
        categoryKey: 'housing',
        subcategoryKey: 'housing.rent',
        subcategoryName: 'Loyer',
      })
    ).toMatchObject({ ok: false, error: 'SUBCATEGORY_ID_AND_NAME' })
  })

  it('refuses a key the catalogue does not know', () => {
    expect(
      resolveFilingTarget(keyed, keyedSubs, { categoryKey: 'holidays' })
    ).toMatchObject({ ok: false, error: 'CATEGORY_UNKNOWN' })
  })

  it('says the catalogue is not provisioned for a key the user lacks', () => {
    expect(
      resolveFilingTarget(keyed, keyedSubs, { categoryKey: 'food' })
    ).toMatchObject({ ok: false, error: 'CATALOG_NOT_PROVISIONED' })
  })

  it('refuses a subcategory key of another category', () => {
    expect(
      resolveFilingTarget(keyed, keyedSubs, {
        categoryKey: 'housing',
        subcategoryKey: 'food.supermarket',
      })
    ).toMatchObject({ ok: false, error: 'SUBCATEGORY_NOT_IN_CATEGORY' })
  })

  it('unfiles on a null category key or id', () => {
    expect(
      resolveFilingTarget(keyed, keyedSubs, { categoryKey: null })
    ).toEqual({ ok: true, category: null, subcategory: null })
    expect(resolveFilingTarget(keyed, keyedSubs, { categoryId: null })).toEqual(
      { ok: true, category: null, subcategory: null }
    )
  })

  it('refuses a subcategory with an unfiling', () => {
    expect(
      resolveFilingTarget(keyed, keyedSubs, {
        categoryKey: null,
        subcategoryKey: 'housing.rent',
      })
    ).toMatchObject({ ok: false, error: 'UNFILE_WITH_SUBCATEGORY' })
  })
})
