import { describe, it, expect } from 'vitest'
import {
  buildMerchantMemory,
  merchantKey,
  proposeFromMerchantMemory,
  resolveCatalogFiling,
  type MerchantFilingRow,
} from './merchant-memory'

function filing(overrides: Partial<MerchantFilingRow> = {}): MerchantFilingRow {
  return {
    description: 'CB Carrefour Market',
    type: 'EXPENSE',
    categoryKey: 'food',
    subcategoryKey: 'food.supermarket',
    count: 6,
    userId: 'u1',
    ...overrides,
  }
}

describe('merchantKey', () => {
  it('keeps the merchant and drops what the bank wrote around it', () => {
    expect(merchantKey('CARTE 06/08/26 CARREFOUR MARKET CB*7962')).toBe(
      'carrefour market'
    )
    expect(merchantKey('Prlv Sepa Free Mobile Ref 1234567890')).toBe(
      'free mobile'
    )
  })

  it('meets the same words in another order', () => {
    expect(merchantKey('Market Carrefour')).toBe(
      merchantKey('Carrefour Market')
    )
  })

  it('is empty for a label made of noise only', () => {
    expect(merchantKey('CB 12/09/26 *1234')).toBe('')
  })
})

describe('proposeFromMerchantMemory', () => {
  it('proposes the filing several users agree on', () => {
    const memory = buildMerchantMemory([
      filing(),
      filing({
        description: 'CARTE 02/02/26 CARREFOUR MARKET CB*1111',
        userId: 'u2',
      }),
    ])

    expect(
      proposeFromMerchantMemory('Carrefour Market Bordeaux', 'EXPENSE', memory)
    ).toEqual({
      categoryKey: 'food',
      subcategoryKey: 'food.supermarket',
      confidence: 1,
      count: 12,
      users: 2,
    })
  })

  it("refuses a single user's habit: their own rules already carry it", () => {
    const memory = buildMerchantMemory([filing({ count: 40 })])

    expect(
      proposeFromMerchantMemory('Carrefour Market', 'EXPENSE', memory)
    ).toBeNull()
  })

  it('refuses a merchant too rarely seen', () => {
    const memory = buildMerchantMemory([
      filing({ count: 2 }),
      filing({ count: 2, userId: 'u2' }),
    ])

    expect(
      proposeFromMerchantMemory('Carrefour Market', 'EXPENSE', memory)
    ).toBeNull()
  })

  it('refuses a merchant users file in different ways', () => {
    const memory = buildMerchantMemory([
      filing({ count: 6 }),
      filing({ count: 1, userId: 'u2' }),
      filing({ subcategoryKey: 'food.other', count: 5, userId: 'u2' }),
    ])

    expect(
      proposeFromMerchantMemory('Carrefour Market', 'EXPENSE', memory)
    ).toBeNull()
  })

  it('never lets a receipt answer for a purchase of the same label', () => {
    const memory = buildMerchantMemory([
      filing({ type: 'INCOME', categoryKey: 'refunds', subcategoryKey: null }),
      filing({
        type: 'INCOME',
        categoryKey: 'refunds',
        subcategoryKey: null,
        userId: 'u2',
      }),
    ])

    expect(
      proposeFromMerchantMemory('Carrefour Market', 'EXPENSE', memory)
    ).toBeNull()
  })

  it('knows nothing of a merchant nobody filed', () => {
    const memory = buildMerchantMemory([filing()])

    expect(
      proposeFromMerchantMemory('Boulangerie Dupont', 'EXPENSE', memory)
    ).toBeNull()
  })
})

describe('resolveCatalogFiling', () => {
  const categories = [
    {
      id: 'cat-food',
      name: 'Alimentation',
      type: 'EXPENSE' as const,
      catalogKey: 'food',
    },
  ]
  const subcategories = [
    {
      id: 'sub-super',
      name: 'Supermarché',
      categoryId: 'cat-food',
      catalogKey: 'food.supermarket',
    },
  ]

  it("finds the user's own rows for the keys", () => {
    expect(
      resolveCatalogFiling(
        { categoryKey: 'food', subcategoryKey: 'food.supermarket' },
        categories,
        subcategories
      )
    ).toEqual({
      categoryId: 'cat-food',
      subcategoryId: 'sub-super',
      subcategoryName: 'Supermarché',
    })
  })

  it('keeps the category when the user lacks the subcategory', () => {
    expect(
      resolveCatalogFiling(
        { categoryKey: 'food', subcategoryKey: 'food.bakery' },
        categories,
        subcategories
      )
    ).toEqual({
      categoryId: 'cat-food',
      subcategoryId: null,
      subcategoryName: null,
    })
  })

  it('answers nothing for a key the user does not carry', () => {
    expect(
      resolveCatalogFiling(
        { categoryKey: 'housing', subcategoryKey: null },
        categories,
        subcategories
      )
    ).toBeNull()
  })
})
