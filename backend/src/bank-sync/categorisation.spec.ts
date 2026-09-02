import { describe, it, expect } from 'vitest'
import {
  buildMerchantIndex,
  proposeFiling,
  summarise,
  type FiledExample,
} from './categorisation'

function filed(
  description: string,
  categoryId: string,
  subcategoryId: string | null = null,
  type: FiledExample['type'] = 'EXPENSE'
): FiledExample {
  return {
    description,
    type,
    categoryId,
    subcategoryId,
    subcategoryName: subcategoryId === null ? null : 'Sous-catégorie',
  }
}

describe('buildMerchantIndex', () => {
  it('groups the same merchant seen on different days', () => {
    // Only becomes one merchant once the date and card number are stripped.
    const index = buildMerchantIndex([
      filed('CARTE 06/08/26 FITNESS PARK CB*7962', 'sport'),
      filed('CARTE 19/08/26 FITNESS PARK CB*7962', 'sport'),
    ])
    expect(index.size).toBe(1)
    expect([...index.values()][0]).toHaveLength(2)
  })

  it('keeps distinct merchants apart', () => {
    const index = buildMerchantIndex([
      filed('CB Fitness Park', 'sport'),
      filed('CB Carrefour City', 'courses'),
    ])
    expect(index.size).toBe(2)
  })

  it('drops a label that normalises to nothing', () => {
    // `CB*7962` alone names a card, not a merchant, and would collect every
    // unnameable transaction into one bucket.
    expect(buildMerchantIndex([filed('CB*7962', 'sport')]).size).toBe(0)
  })
})

describe('proposeFiling', () => {
  it('files a recurring merchant the way the user always has', () => {
    const index = buildMerchantIndex([
      filed('CB Fitness Park', 'sport'),
      filed('CB Fitness Park', 'sport'),
      filed('CB Fitness Park', 'sport'),
    ])

    const proposal = proposeFiling(
      'CARTE 26/08/26 FITNESS PARK    CB*7962',
      'EXPENSE',
      index
    )

    expect(proposal).toMatchObject({
      categoryId: 'sport',
      confidence: 1,
      support: 3,
      basis: 'sameMerchant',
    })
  })

  it('carries the subcategory, not just the category', () => {
    const index = buildMerchantIndex([filed('CB Fitness Park', 'sport', 'gym')])
    expect(proposeFiling('FITNESS PARK', 'EXPENSE', index)?.subcategoryId).toBe(
      'gym'
    )
  })

  it('refuses a merchant the user files inconsistently', () => {
    // They disagree with themselves; guessing here only picks a side.
    const index = buildMerchantIndex([
      filed('CB Amazon', 'shopping'),
      filed('CB Amazon', 'loisirs'),
    ])
    expect(proposeFiling('AMAZON', 'EXPENSE', index)).toBeNull()
  })

  it('accepts a clear majority despite one outlier', () => {
    const index = buildMerchantIndex([
      filed('CB Amazon', 'shopping'),
      filed('CB Amazon', 'shopping'),
      filed('CB Amazon', 'shopping'),
      filed('CB Amazon', 'loisirs'),
    ])
    const proposal = proposeFiling('AMAZON', 'EXPENSE', index)
    expect(proposal?.categoryId).toBe('shopping')
    expect(proposal?.confidence).toBe(0.75)
  })

  it('treats the category and subcategory as one filing', () => {
    // Right category, wrong subcategory is still filed wrong.
    const index = buildMerchantIndex([
      filed('CB Uber', 'transport', 'taxi'),
      filed('CB Uber', 'transport', 'repas'),
    ])
    expect(proposeFiling('UBER', 'EXPENSE', index)).toBeNull()
  })

  it('falls back to a close merchant when none is identical', () => {
    const index = buildMerchantIndex([
      filed('CB Carrefour City Bordeaux', 'courses'),
      filed('CB Carrefour City Bordeaux', 'courses'),
      filed('CB Carrefour City Bordeaux', 'courses'),
    ])

    const proposal = proposeFiling(
      'CARREFOUR CITY BORDEAUX CENTRE',
      'EXPENSE',
      index
    )

    expect(proposal?.categoryId).toBe('courses')
    expect(proposal?.basis).toBe('similarMerchant')
  })

  it('discounts a resemblance below a name', () => {
    const exact = buildMerchantIndex([filed('CB Fitness Park', 'sport')])
    const near = buildMerchantIndex([
      filed('CB Fitness Park Merignac', 'sport'),
      filed('CB Fitness Park Merignac', 'sport'),
      filed('CB Fitness Park Merignac', 'sport'),
    ])

    const byName = proposeFiling('FITNESS PARK', 'EXPENSE', exact)
    const byResemblance = proposeFiling('FITNESS PARK', 'EXPENSE', near)

    expect(byResemblance?.confidence).toBeLessThan(byName?.confidence ?? 0)
  })

  it('prefers the identical merchant over a closer-looking neighbour', () => {
    // A recurring charge must not be filed by analogy when the user has
    // already filed it by name.
    const index = buildMerchantIndex([
      filed('CB Total', 'carburant'),
      filed('CB Total Energies Station', 'energie'),
    ])
    expect(proposeFiling('TOTAL', 'EXPENSE', index)?.categoryId).toBe(
      'carburant'
    )
  })

  it('proposes nothing for a merchant never seen', () => {
    const index = buildMerchantIndex([filed('CB Fitness Park', 'sport')])
    expect(proposeFiling('BOULANGERIE DUPONT', 'EXPENSE', index)).toBeNull()
  })

  it('proposes nothing against an empty history', () => {
    expect(proposeFiling('FITNESS PARK', 'EXPENSE', new Map())).toBeNull()
  })

  it('proposes nothing for a label that normalises to nothing', () => {
    const index = buildMerchantIndex([filed('CB Fitness Park', 'sport')])
    expect(proposeFiling('CB*7962', 'EXPENSE', index)).toBeNull()
  })

  it('honours a stricter support requirement', () => {
    const index = buildMerchantIndex([filed('CB Fitness Park', 'sport')])
    expect(
      proposeFiling('FITNESS PARK', 'EXPENSE', index, { minimumSupport: 3 })
    ).toBeNull()
  })
})

describe('summarise', () => {
  it('separates what was known by name from what was inferred', () => {
    const summary = summarise([
      {
        categoryId: 'a',
        subcategoryId: null,
        subcategoryName: null,
        confidence: 1,
        support: 3,
        basis: 'sameMerchant',
      },
      {
        categoryId: 'b',
        subcategoryId: null,
        subcategoryName: null,
        confidence: 0.7,
        support: 1,
        basis: 'similarMerchant',
      },
      null,
    ])

    expect(summary).toEqual({
      total: 3,
      sameMerchant: 1,
      similarMerchant: 1,
      unresolved: 1,
    })
  })
})

describe('proposeFiling on a resemblance', () => {
  it('needs more precedent than an identical name does', () => {
    // One precedent under a name that merely looks similar is a coincidence
    // with a sample size of one.
    const thin = buildMerchantIndex([
      filed('CB Carrefour City Bordeaux', 'courses'),
    ])
    expect(
      proposeFiling('CARREFOUR CITY BORDEAUX CENTRE', 'EXPENSE', thin)
    ).toBeNull()

    const solid = buildMerchantIndex([
      filed('CB Carrefour City Bordeaux', 'courses'),
      filed('CB Carrefour City Bordeaux', 'courses'),
      filed('CB Carrefour City Bordeaux', 'courses'),
    ])
    expect(
      proposeFiling('CARREFOUR CITY BORDEAUX CENTRE', 'EXPENSE', solid)
    ).toMatchObject({ basis: 'similarMerchant' })
  })

  it('still files an identical name backed by a single precedent', () => {
    const index = buildMerchantIndex([filed('CB Fitness Park', 'sport')])
    expect(
      proposeFiling('CARTE 26/08/26 FITNESS PARK CB*7962', 'EXPENSE', index)
    ).toMatchObject({ basis: 'sameMerchant' })
  })
})

describe('proposeFiling and the sign of a transaction', () => {
  it('never files an income under a category used for expenses', () => {
    // A category carries a sign here. Getting it wrong files a refund as a
    // purchase and moves two totals at once.
    const index = buildMerchantIndex([
      filed('CB Fitness Park', 'sport-expense', null, 'EXPENSE'),
    ])
    expect(proposeFiling('FITNESS PARK', 'INCOME', index)).toBeNull()
  })

  it('learns from the precedents of the matching sign only', () => {
    const index = buildMerchantIndex([
      filed('VIR Employeur', 'salaire', null, 'INCOME'),
      filed('VIR Employeur', 'remboursement', null, 'EXPENSE'),
    ])
    expect(proposeFiling('VIR EMPLOYEUR', 'INCOME', index)?.categoryId).toBe(
      'salaire'
    )
  })

  it('ignores a resemblance to a merchant of the other sign', () => {
    const index = buildMerchantIndex([
      filed('CB Carrefour City Bordeaux', 'courses', null, 'EXPENSE'),
      filed('CB Carrefour City Bordeaux', 'courses', null, 'EXPENSE'),
      filed('CB Carrefour City Bordeaux', 'courses', null, 'EXPENSE'),
    ])
    expect(
      proposeFiling('CARREFOUR CITY BORDEAUX CENTRE', 'INCOME', index)
    ).toBeNull()
  })
})
