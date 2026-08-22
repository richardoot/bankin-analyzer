import { describe, it, expect } from 'vitest'
import { findOrphans, describeOrphan } from './repair-orphan-subcategories'

const row = (
  categoryId: string | null,
  subcategoryParent: string | null
): {
  categoryId: string | null
  subcategoryRef: { categoryId: string } | null
} => ({
  categoryId,
  subcategoryRef:
    subcategoryParent === null ? null : { categoryId: subcategoryParent },
})

describe('findOrphans', () => {
  it('keeps a row whose subcategory belongs to another category', () => {
    expect(findOrphans([row('cat-a', 'cat-b')])).toHaveLength(1)
  })

  it('leaves a consistent row alone', () => {
    expect(findOrphans([row('cat-a', 'cat-a')])).toHaveLength(0)
  })

  it('leaves a row with no subcategory alone', () => {
    expect(findOrphans([row('cat-a', null)])).toHaveLength(0)
  })

  it('catches a subcategory hanging off an uncategorized row', () => {
    // A subcategory always has a parent, so it cannot legitimately sit on a
    // transaction that has no category at all.
    expect(findOrphans([row(null, 'cat-b')])).toHaveLength(1)
  })

  it('leaves an uncategorized row without subcategory alone', () => {
    expect(findOrphans([row(null, null)])).toHaveLength(0)
  })

  it('picks only the mismatched rows out of a mixed batch', () => {
    const rows = [
      row('cat-a', 'cat-a'),
      row('cat-a', 'cat-b'),
      row('cat-b', null),
      row(null, 'cat-c'),
    ]

    expect(findOrphans(rows)).toEqual([rows[1], rows[3]])
  })

  it('is idempotent: repaired rows no longer match', () => {
    const repaired = [row('cat-a', null), row(null, null)]
    expect(findOrphans(repaired)).toHaveLength(0)
  })
})

describe('describeOrphan', () => {
  const base = {
    id: 'tx-1',
    date: new Date('2026-07-26T22:00:00.000Z'),
    description: 'Vir Sepa M Richard Armand Bo',
    amount: '431.50',
    categoryId: 'cat-depot',
    categoryName: "Dépôt d'argent",
    subcategoryId: 'sub-remb',
    subcategoryName: 'Remboursements',
    subcategoryOwnerName: 'Remboursements',
  }

  it('names both categories so the mismatch is legible', () => {
    const line = describeOrphan(base)

    expect(line).toContain('2026-07-26')
    expect(line).toContain("Dépôt d'argent › Remboursements")
    expect(line).toContain('appartient à Remboursements')
  })

  it('says so when the transaction has no category', () => {
    expect(describeOrphan({ ...base, categoryName: null })).toContain(
      '(sans catégorie)'
    )
  })

  it('truncates a long description instead of breaking the columns', () => {
    const line = describeOrphan({
      ...base,
      description: 'Prelevement Sepa Assurance Habitation Mensuel Janvier',
    })

    expect(line).toContain('Prelevement Sepa Assurance Ha…')
    expect(line).not.toContain('Habitation')
  })
})
