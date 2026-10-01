import { describe, it, expect } from 'vitest'
import type { CatalogCategory } from './catalog'
import {
  isEmptyPlan,
  normalizeName,
  planCatalogProvisioning,
} from './category-catalog.plan'
import type {
  ExistingCategory,
  ExistingSubcategory,
} from './category-catalog.plan'

const housing: CatalogCategory = {
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
      description: null,
    },
    {
      key: 'housing.other',
      label: 'Autre',
      nature: 'ESSENTIAL',
      rhythm: 'VARIABLE',
      description: null,
    },
  ],
}

const refunds: CatalogCategory = {
  key: 'refunds',
  type: 'INCOME',
  label: 'Remboursements',
  icon: '🔄',
  description: "De l'argent qui revient.",
  subcategories: [
    {
      key: 'refunds.other',
      label: 'Autre',
      nature: null,
      rhythm: null,
      description: null,
    },
  ],
}

const transfer: CatalogCategory = {
  key: 'internal-transfer',
  type: 'TRANSFER',
  label: 'Virement interne',
  icon: '🔁',
  description: 'Entre deux comptes.',
  subcategories: [],
}

const catalog = [housing, refunds, transfer]

function legacy(
  id: string,
  name: string,
  type: ExistingCategory['type'] = 'EXPENSE',
  catalogKey: string | null = null,
  transactionCount = 0
): ExistingCategory {
  return { id, name, type, catalogKey, transactionCount }
}

function sub(
  id: string,
  categoryId: string,
  name: string,
  catalogKey: string | null = null,
  transactionCount = 0
): ExistingSubcategory {
  return { id, categoryId, name, catalogKey, transactionCount }
}

describe('normalizeName', () => {
  it('ignores case, accents and spacing', () => {
    expect(normalizeName('  Santé ')).toBe('sante')
    expect(normalizeName('Restaurants   et bars')).toBe('restaurants et bars')
  })
})

describe('planCatalogProvisioning', () => {
  it('creates everything for a user with no categories', () => {
    const plan = planCatalogProvisioning(catalog, [], [])

    expect(plan.createCategories).toEqual(catalog)
    expect(plan.adoptCategories).toEqual([])
    expect(plan.createSubcategories).toEqual([])
    expect(plan.adoptSubcategories).toEqual([])
    expect(plan.retireCategories).toEqual([])
    expect(plan.retireSubcategories).toEqual([])
  })

  it('does nothing when the catalogue is already there', () => {
    const plan = planCatalogProvisioning(
      catalog,
      [
        legacy('c1', 'Logement', 'EXPENSE', 'housing'),
        legacy('c2', 'Remboursements', 'INCOME', 'refunds'),
        legacy('c3', 'Virement interne', 'TRANSFER', 'internal-transfer'),
      ],
      [
        sub('s1', 'c1', 'Loyer', 'housing.rent'),
        sub('s2', 'c1', 'Autre', 'housing.other'),
        sub('s3', 'c2', 'Autre', 'refunds.other'),
      ]
    )

    expect(isEmptyPlan(plan)).toBe(true)
  })

  it('adopts a legacy category bearing the catalogue label, with the "Autre" defaults', () => {
    const plan = planCatalogProvisioning(
      catalog,
      [legacy('c1', 'logement ')],
      []
    )

    expect(plan.createCategories.map(c => c.key)).toEqual([
      'refunds',
      'internal-transfer',
    ])
    expect(plan.adoptCategories).toEqual([
      {
        id: 'c1',
        catalogKey: 'housing',
        icon: '🏠',
        defaultNature: 'ESSENTIAL',
        defaultRhythm: 'VARIABLE',
      },
    ])
    // Its subcategories are created under the adopted row, not a new one.
    expect(plan.createSubcategories).toEqual([
      { categoryId: 'c1', subcategory: housing.subcategories[0] },
      { categoryId: 'c1', subcategory: housing.subcategories[1] },
    ])
  })

  it('adopts a legacy subcategory bearing the catalogue label, with its attributes', () => {
    const plan = planCatalogProvisioning(
      catalog,
      [legacy('c1', 'Logement')],
      [sub('s1', 'c1', 'loyer'), sub('s2', 'c1', 'Logement - Autres')]
    )

    expect(plan.adoptSubcategories).toEqual([
      {
        id: 's1',
        catalogKey: 'housing.rent',
        nature: 'ESSENTIAL',
        rhythm: 'COMMITTED',
      },
    ])
    // "Logement - Autres" is not "Autre": it stays a legacy subcategory for
    // the assistant, and the catalogue's "Autre" is created beside it.
    expect(plan.createSubcategories).toEqual([
      { categoryId: 'c1', subcategory: housing.subcategories[1] },
    ])
  })

  it('never adopts across types: an income "Logement" is not the expense one', () => {
    const plan = planCatalogProvisioning(
      catalog,
      [legacy('c1', 'Logement', 'INCOME')],
      []
    )

    expect(plan.adoptCategories).toEqual([])
    expect(plan.createCategories.map(c => c.key)).toContain('housing')
  })

  it('leaves a legacy category alone when the catalogue key is already taken', () => {
    // Two rows: one already provisioned, one legacy with the same label
    // (possible: the unique constraint is on the exact name).
    const plan = planCatalogProvisioning(
      catalog,
      [
        legacy('c1', 'Logement', 'EXPENSE', 'housing'),
        legacy('c2', 'logement'),
      ],
      [sub('s1', 'c1', 'Loyer', 'housing.rent')]
    )

    expect(plan.adoptCategories).toEqual([])
    expect(plan.createSubcategories).toEqual([
      { categoryId: 'c1', subcategory: housing.subcategories[1] },
    ])
  })

  it('fills in a subcategory the catalogue gained since the last run', () => {
    const plan = planCatalogProvisioning(
      catalog,
      [legacy('c1', 'Logement', 'EXPENSE', 'housing')],
      [sub('s2', 'c1', 'Autre', 'housing.other')]
    )

    expect(plan.adoptCategories).toEqual([])
    expect(plan.createSubcategories).toEqual([
      { categoryId: 'c1', subcategory: housing.subcategories[0] },
    ])
  })

  it('creates a flat transfer category with no subcategory at all', () => {
    const plan = planCatalogProvisioning([transfer], [], [])

    expect(plan.createCategories).toEqual([transfer])
    expect(plan.createSubcategories).toEqual([])
  })

  describe('a newer catalogue', () => {
    it('deletes an empty row whose key it no longer carries', () => {
      const plan = planCatalogProvisioning(
        catalog,
        [legacy('c1', 'Logement', 'EXPENSE', 'housing')],
        [
          sub('s1', 'c1', 'Loyer', 'housing.rent'),
          sub('s2', 'c1', 'Autre', 'housing.other'),
          sub('s3', 'c1', 'Péage et stationnement', 'housing.tolls-parking'),
        ]
      )

      expect(plan.retireSubcategories).toEqual([
        {
          id: 's3',
          name: 'Péage et stationnement',
          catalogKey: 'housing.tolls-parking',
          action: 'delete',
        },
      ])
      expect(plan.createSubcategories).toEqual([])
    })

    it('releases a used row to the user rather than losing its transactions', () => {
      const plan = planCatalogProvisioning(
        catalog,
        [
          legacy('c1', 'Logement', 'EXPENSE', 'housing'),
          legacy('c9', 'Vacances', 'EXPENSE', 'vacations', 12),
        ],
        [
          sub('s1', 'c1', 'Loyer', 'housing.rent'),
          sub('s2', 'c1', 'Autre', 'housing.other'),
          sub('s3', 'c1', 'Train et avion', 'housing.train-plane', 40),
        ]
      )

      expect(plan.retireSubcategories).toEqual([
        {
          id: 's3',
          name: 'Train et avion',
          catalogKey: 'housing.train-plane',
          action: 'release',
        },
      ])
      expect(plan.retireCategories).toEqual([
        {
          id: 'c9',
          name: 'Vacances',
          catalogKey: 'vacations',
          action: 'release',
        },
      ])
    })

    it('adopts a retired row in place when the new entry bears its label', () => {
      // "Péage et stationnement" was split; the user had renamed nothing, but
      // suppose a row already reads "Loyer" under a retired key: it becomes
      // housing.rent again, transactions intact, instead of being released
      // beside a fresh copy.
      const plan = planCatalogProvisioning(
        catalog,
        [legacy('c1', 'Logement', 'EXPENSE', 'housing')],
        [
          sub('s1', 'c1', 'Loyer', 'housing.rent-old', 30),
          sub('s2', 'c1', 'Autre', 'housing.other'),
        ]
      )

      expect(plan.retireSubcategories).toEqual([])
      expect(plan.adoptSubcategories).toEqual([
        {
          id: 's1',
          catalogKey: 'housing.rent',
          nature: 'ESSENTIAL',
          rhythm: 'COMMITTED',
        },
      ])
    })

    it('lets a deleted category take its subcategories with it', () => {
      const plan = planCatalogProvisioning(
        catalog,
        [legacy('c9', 'Ancienne', 'EXPENSE', 'former')],
        [sub('s9', 'c9', 'Autre', 'former.other')]
      )

      expect(plan.retireCategories).toEqual([
        { id: 'c9', name: 'Ancienne', catalogKey: 'former', action: 'delete' },
      ])
      expect(plan.retireSubcategories).toEqual([])
    })
  })

  it('claims each legacy row once, even when two entries normalise alike', () => {
    const twin: CatalogCategory = {
      ...housing,
      key: 'housing-bis',
      label: 'LOGEMENT',
      subcategories: [],
    }
    const plan = planCatalogProvisioning(
      [housing, twin],
      [legacy('c1', 'Logement')],
      []
    )

    expect(plan.adoptCategories.map(a => a.catalogKey)).toEqual(['housing'])
    expect(plan.createCategories.map(c => c.key)).toEqual(['housing-bis'])
  })
})
