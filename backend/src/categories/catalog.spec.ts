import { describe, it, expect } from 'vitest'
import {
  CATEGORY_CATALOG,
  CatalogError,
  catalogCategory,
  catalogSubcategory,
  otherOf,
  parseCatalog,
} from './catalog'

/** A minimal valid catalogue to mutate one rule at a time. */
function valid(): Record<string, unknown> {
  return {
    categories: [
      {
        key: 'housing',
        type: 'EXPENSE',
        label: 'Logement',
        icon: '🏠',
        description: 'Se loger.',
        subcategories: [
          {
            key: 'housing.rent',
            label: 'Loyer',
            nature: 'ESSENTIAL',
            rhythm: 'COMMITTED',
          },
          {
            key: 'housing.other',
            label: 'Autre',
            nature: 'ESSENTIAL',
            rhythm: 'VARIABLE',
          },
        ],
      },
      {
        key: 'refunds',
        type: 'INCOME',
        label: 'Remboursements',
        icon: '🔄',
        description: "De l'argent qui revient.",
        subcategories: [
          { key: 'refunds.health', label: 'Sécu' },
          { key: 'refunds.other', label: 'Autre' },
        ],
      },
      {
        key: 'internal-transfer',
        type: 'TRANSFER',
        label: 'Virement interne',
        icon: '🔁',
        description: 'Entre deux comptes.',
        subcategories: [],
      },
    ],
  }
}

function category(raw: Record<string, unknown>, index: number) {
  return (raw['categories'] as Record<string, unknown>[])[index]!
}

describe('the shipped catalogue', () => {
  it('parses, which is the boot-time guarantee', () => {
    expect(CATEGORY_CATALOG.length).toBeGreaterThan(0)
  })

  it('holds the twelve expense categories the framework decided on', () => {
    const expenses = CATEGORY_CATALOG.filter(c => c.type === 'EXPENSE')
    expect(expenses.map(c => c.key)).toEqual([
      'housing',
      'food',
      'transport',
      'health',
      'telecom',
      'family',
      'donations',
      'taxes',
      'banking',
      'dining',
      'leisure',
      'shopping',
    ])
  })

  it('names no context: the headings the framework rejected are absent', () => {
    const labels = CATEGORY_CATALOG.map(c => c.label.toLowerCase())
    for (const rejected of [
      'vacances',
      'abonnements',
      'hébergement',
      'exceptionnel',
      'erreurs',
      'cadeaux',
    ]) {
      expect(labels).not.toContain(rejected)
    }
  })

  it('is indexed by key, subcategories included', () => {
    expect(catalogCategory('housing')?.label).toBe('Logement')
    expect(catalogSubcategory('housing.lodging')?.subcategory.label).toBe(
      'Hébergement temporaire'
    )
    expect(catalogSubcategory('housing.lodging')?.category.key).toBe('housing')
    expect(catalogCategory('vacations')).toBeUndefined()
  })

  it('gives every expense and income category an "Autre", and no transfer one', () => {
    for (const c of CATEGORY_CATALOG) {
      if (c.type === 'TRANSFER') expect(otherOf(c)).toBeUndefined()
      else expect(otherOf(c)?.label).toBe('Autre')
    }
  })
})

describe('parseCatalog', () => {
  it('accepts the minimal valid catalogue', () => {
    const parsed = parseCatalog(valid())
    expect(parsed).toHaveLength(3)
    expect(parsed[0]?.subcategories[0]).toEqual({
      key: 'housing.rent',
      label: 'Loyer',
      nature: 'ESSENTIAL',
      rhythm: 'COMMITTED',
      description: null,
    })
    expect(parsed[1]?.subcategories[0]).toEqual({
      key: 'refunds.health',
      label: 'Sécu',
      nature: null,
      rhythm: null,
      description: null,
    })
  })

  it('refuses a duplicate key, across categories and subcategories alike', () => {
    const raw = valid()
    category(raw, 1)['key'] = 'housing'
    expect(() => parseCatalog(raw)).toThrow(CatalogError)

    const again = valid()
    ;(category(again, 0)['subcategories'] as Record<string, unknown>[]).unshift(
      {
        key: 'housing.rent',
        label: 'Loyer bis',
        nature: 'ESSENTIAL',
        rhythm: 'COMMITTED',
      }
    )
    expect(() => parseCatalog(again)).toThrow(/duplicate key/)
  })

  it('refuses a subcategory key that does not carry its category', () => {
    const raw = valid()
    ;(category(raw, 0)['subcategories'] as Record<string, unknown>[])[0]![
      'key'
    ] = 'food.rent'
    expect(() => parseCatalog(raw)).toThrow(/prefixed by its category/)
  })

  it('demands a nature and a rhythm on every expense subcategory', () => {
    const raw = valid()
    delete (category(raw, 0)['subcategories'] as Record<string, unknown>[])[0]![
      'nature'
    ]
    expect(() => parseCatalog(raw)).toThrow(/needs a nature/)

    const again = valid()
    ;(category(again, 0)['subcategories'] as Record<string, unknown>[])[0]![
      'rhythm'
    ] = 'SOMETIMES'
    expect(() => parseCatalog(again)).toThrow(/needs a rhythm/)
  })

  it('forbids a nature or a rhythm outside expenses', () => {
    const raw = valid()
    ;(category(raw, 1)['subcategories'] as Record<string, unknown>[])[0]![
      'nature'
    ] = 'ESSENTIAL'
    expect(() => parseCatalog(raw)).toThrow(/only expense subcategories/)
  })

  it('wants exactly one "Autre", last, on expense and income categories', () => {
    const missing = valid()
    ;(category(missing, 1)['subcategories'] as unknown[]).pop()
    expect(() => parseCatalog(missing)).toThrow(/exactly one/)

    const misplaced = valid()
    ;(category(misplaced, 0)['subcategories'] as unknown[]).reverse()
    expect(() => parseCatalog(misplaced)).toThrow(/must come last/)
  })

  it('keeps transfer categories flat', () => {
    const raw = valid()
    category(raw, 2)['subcategories'] = [
      { key: 'internal-transfer.other', label: 'Autre' },
    ]
    expect(() => parseCatalog(raw)).toThrow(/have no "Autre"/)
  })

  it('refuses two categories of one type with the same label', () => {
    const raw = valid()
    ;(raw['categories'] as unknown[]).push({
      key: 'housing-bis',
      type: 'EXPENSE',
      label: 'logement',
      icon: '🏠',
      description: 'Encore.',
      subcategories: [
        {
          key: 'housing-bis.other',
          label: 'Autre',
          nature: 'ESSENTIAL',
          rhythm: 'VARIABLE',
        },
      ],
    })
    expect(() => parseCatalog(raw)).toThrow(/duplicate EXPENSE category label/)
  })

  it('refuses an unknown type or a malformed key', () => {
    const type = valid()
    category(type, 0)['type'] = 'SAVINGS'
    expect(() => parseCatalog(type)).toThrow(/unknown type/)

    const key = valid()
    category(key, 0)['key'] = 'Housing Costs'
    expect(() => parseCatalog(key)).toThrow(/malformed/)
  })
})
