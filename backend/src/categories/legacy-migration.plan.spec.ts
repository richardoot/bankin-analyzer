import { describe, it, expect } from 'vitest'
import { MigrationPlanError } from './category-migration.plan'
import { planLegacyMigration } from './legacy-migration.plan'
import type {
  LegacyDecision,
  LegacySource,
  TargetCategory,
} from './legacy-migration.plan'

const source: LegacySource = {
  id: 'legacy-abos',
  name: 'Abonnements',
  type: 'EXPENSE',
  isCatalog: false,
  subcategories: [
    { id: 'sub-phone', name: 'Téléphonie mobile', transactionCount: 90 },
    { id: 'sub-sport', name: 'Sport', transactionCount: 46 },
    { id: 'sub-ai', name: 'AI', transactionCount: 33 },
  ],
  uncategorizedCount: 4,
}

const telecom: TargetCategory = {
  id: 'cat-telecom',
  key: 'telecom',
  name: 'Télécom et numérique',
  type: 'EXPENSE',
  defaultNature: 'ESSENTIAL',
  defaultRhythm: 'COMMITTED',
  subcategories: [
    { id: 'sub-tel-phone', name: 'Téléphone', catalogKey: 'telecom.phone' },
    {
      id: 'sub-tel-soft',
      name: 'Logiciels, applications et IA',
      catalogKey: 'telecom.software',
    },
    { id: 'sub-tel-other', name: 'Autre', catalogKey: 'telecom.other' },
  ],
}

const leisure: TargetCategory = {
  id: 'cat-leisure',
  key: 'leisure',
  name: 'Loisirs et culture',
  type: 'EXPENSE',
  defaultNature: 'PLEASURE',
  defaultRhythm: 'VARIABLE',
  subcategories: [
    {
      id: 'sub-gym',
      name: 'Salle de sport et licences',
      catalogKey: 'leisure.gym',
    },
    { id: 'sub-escalade', name: 'Escalade', catalogKey: null },
  ],
}

const refunds: TargetCategory = {
  id: 'cat-refunds',
  key: 'refunds',
  name: 'Remboursements',
  type: 'INCOME',
  defaultNature: null,
  defaultRhythm: null,
  subcategories: [],
}

const savings: TargetCategory = {
  id: 'cat-savings',
  key: 'emergency-savings',
  name: 'Épargne de précaution',
  type: 'TRANSFER',
  defaultNature: null,
  defaultRhythm: null,
  subcategories: [],
}

const targets = [telecom, leisure, refunds, savings]

/** Every line decided the obvious way, to vary one at a time. */
function decided(overrides: Partial<Record<string, LegacyDecision>> = {}) {
  const base: Record<string, LegacyDecision> = {
    phone: {
      sourceSubcategoryId: 'sub-phone',
      action: 'CATALOG',
      categoryKey: 'telecom',
      subcategoryKey: 'telecom.phone',
    },
    sport: {
      sourceSubcategoryId: 'sub-sport',
      action: 'CATALOG',
      categoryKey: 'leisure',
      subcategoryKey: 'leisure.gym',
    },
    ai: {
      sourceSubcategoryId: 'sub-ai',
      action: 'CATALOG',
      categoryKey: 'telecom',
      subcategoryKey: 'telecom.software',
    },
    none: { sourceSubcategoryId: null, action: 'UNFILE' },
  }
  return Object.values({ ...base, ...overrides }).filter(Boolean)
}

describe('planLegacyMigration', () => {
  it('files each line where it was decided and counts the rows', () => {
    const plan = planLegacyMigration(source, targets, decided())

    expect(plan.moves).toHaveLength(3)
    expect(plan.moves[0]).toMatchObject({
      sourceSubcategoryId: 'sub-phone',
      transactionCount: 90,
      filing: {
        categoryId: 'cat-telecom',
        type: 'EXPENSE',
        subcategory: { kind: 'existing', id: 'sub-tel-phone' },
      },
      deletesSourceSubcategory: true,
    })
    expect(plan.unfiles).toEqual([
      {
        sourceSubcategoryId: null,
        sourceSubcategoryName: null,
        transactionCount: 4,
        tagId: null,
        deletesSourceSubcategory: false,
      },
    ])
    expect(plan.movedTransactionCount).toBe(169)
    expect(plan.unfiledTransactionCount).toBe(4)
    expect(plan.keptTransactionCount).toBe(0)
    expect(plan.deletesSourceCategory).toBe(true)
  })

  it('sends the budget envelopes to the category receiving most rows', () => {
    const plan = planLegacyMigration(source, targets, decided())

    // Telecom receives 123, leisure 46.
    expect(plan.budgetTargetCategoryId).toBe('cat-telecom')
  })

  it('files at the category alone when no subcategory key is given', () => {
    const plan = planLegacyMigration(
      source,
      targets,
      decided({
        ai: {
          sourceSubcategoryId: 'sub-ai',
          action: 'CATALOG',
          categoryKey: 'telecom',
        },
      })
    )

    expect(plan.moves[2]?.filing.subcategory).toBeNull()
  })

  it('reparents a legacy subcategory kept under its own name', () => {
    const plan = planLegacyMigration(
      source,
      targets,
      decided({
        ai: {
          sourceSubcategoryId: 'sub-ai',
          action: 'CUSTOM',
          categoryKey: 'telecom',
          subcategoryName: 'ai',
        },
      })
    )

    expect(plan.moves[2]).toMatchObject({
      filing: { subcategory: { kind: 'reparent', id: 'sub-ai', name: 'AI' } },
      deletesSourceSubcategory: false,
    })
  })

  it('folds a line into an existing custom subcategory by name', () => {
    const plan = planLegacyMigration(
      source,
      targets,
      decided({
        sport: {
          sourceSubcategoryId: 'sub-sport',
          action: 'CUSTOM',
          categoryKey: 'leisure',
          subcategoryName: 'ESCALADE',
        },
      })
    )

    expect(plan.moves[1]?.filing.subcategory).toEqual({
      kind: 'existing',
      id: 'sub-escalade',
      name: 'Escalade',
    })
  })

  it('creates a custom subcategory, once, even when two lines name it', () => {
    const plan = planLegacyMigration(
      source,
      targets,
      decided({
        sport: {
          sourceSubcategoryId: 'sub-sport',
          action: 'CUSTOM',
          categoryKey: 'leisure',
          subcategoryName: 'Coaching',
        },
      })
    )
    expect(plan.moves[1]?.filing.subcategory).toEqual({
      kind: 'create',
      name: 'Coaching',
    })

    expect(() =>
      planLegacyMigration(
        source,
        targets,
        decided({
          sport: {
            sourceSubcategoryId: 'sub-sport',
            action: 'CUSTOM',
            categoryKey: 'leisure',
            subcategoryName: 'Coaching',
          },
          ai: {
            sourceSubcategoryId: 'sub-ai',
            action: 'CUSTOM',
            categoryKey: 'leisure',
            subcategoryName: 'coaching',
          },
        })
      )
    ).toThrow(/Two lines create/)
  })

  it('changes the type of rows entering a transfer category', () => {
    const plan = planLegacyMigration(
      source,
      targets,
      decided({
        ai: {
          sourceSubcategoryId: 'sub-ai',
          action: 'CATALOG',
          categoryKey: 'emergency-savings',
        },
      })
    )

    expect(plan.moves[2]?.filing.type).toBe('TRANSFER')
    expect(plan.typeChangedTransactionCount).toBe(33)
    // A transfer is not budgeted, so it never receives the envelopes.
    expect(plan.budgetTargetCategoryId).toBe('cat-telecom')
  })

  it('never crosses the sign', () => {
    expect(() =>
      planLegacyMigration(
        source,
        targets,
        decided({
          ai: {
            sourceSubcategoryId: 'sub-ai',
            action: 'CATALOG',
            categoryKey: 'refunds',
          },
        })
      )
    ).toThrow(/cannot go to "Remboursements"/)
  })

  it('refuses a custom subcategory under a transfer category', () => {
    expect(() =>
      planLegacyMigration(
        source,
        targets,
        decided({
          ai: {
            sourceSubcategoryId: 'sub-ai',
            action: 'CUSTOM',
            categoryKey: 'emergency-savings',
            subcategoryName: 'Livret A',
          },
        })
      )
    ).toThrow(/transfer category/)
  })

  it('keeps the legacy category when a line is kept', () => {
    const plan = planLegacyMigration(
      source,
      targets,
      decided({ ai: { sourceSubcategoryId: 'sub-ai', action: 'KEEP' } })
    )

    expect(plan.keeps).toEqual([
      { sourceSubcategoryId: 'sub-ai', transactionCount: 33 },
    ])
    expect(plan.keptTransactionCount).toBe(33)
    expect(plan.deletesSourceCategory).toBe(false)
  })

  it('carries the tag on the line', () => {
    const plan = planLegacyMigration(
      source,
      targets,
      decided({
        ai: {
          sourceSubcategoryId: 'sub-ai',
          action: 'CATALOG',
          categoryKey: 'telecom',
          subcategoryKey: 'telecom.software',
          tagId: 'tag-pro',
        },
        none: { sourceSubcategoryId: null, action: 'UNFILE', tagId: 'tag-pro' },
      })
    )

    expect(plan.moves[2]?.tagId).toBe('tag-pro')
    expect(plan.unfiles[0]?.tagId).toBe('tag-pro')
  })

  it('drops the envelopes when nothing budgeted receives any row', () => {
    const plan = planLegacyMigration(
      source,
      targets,
      decided({
        phone: { sourceSubcategoryId: 'sub-phone', action: 'UNFILE' },
        sport: { sourceSubcategoryId: 'sub-sport', action: 'UNFILE' },
        ai: {
          sourceSubcategoryId: 'sub-ai',
          action: 'CATALOG',
          categoryKey: 'emergency-savings',
        },
      })
    )

    expect(plan.budgetTargetCategoryId).toBeNull()
  })

  describe('a catalogue category tidying its stray subcategories', () => {
    // "Logement" adopted by name; "Loyer" left beside "Loyer ou crédit
    // immobilier" because the names differ. The target is the source.
    const housing: TargetCategory = {
      id: 'cat-housing',
      key: 'housing',
      name: 'Logement',
      type: 'EXPENSE',
      defaultNature: 'ESSENTIAL',
      defaultRhythm: 'VARIABLE',
      subcategories: [
        {
          id: 'sub-rent',
          name: 'Loyer ou crédit immobilier',
          catalogKey: 'housing.rent',
        },
        { id: 'sub-loyer', name: 'Loyer', catalogKey: null },
      ],
    }
    const tidy: LegacySource = {
      id: 'cat-housing',
      name: 'Logement',
      type: 'EXPENSE',
      isCatalog: true,
      subcategories: [{ id: 'sub-loyer', name: 'Loyer', transactionCount: 22 }],
      uncategorizedCount: 0,
    }

    it('files the stray rows under the catalogue subcategory and keeps the category', () => {
      const plan = planLegacyMigration(
        tidy,
        [housing],
        [
          {
            sourceSubcategoryId: 'sub-loyer',
            action: 'CATALOG',
            categoryKey: 'housing',
            subcategoryKey: 'housing.rent',
          },
        ]
      )

      expect(plan.moves[0]).toMatchObject({
        sourceSubcategoryId: 'sub-loyer',
        transactionCount: 22,
        filing: {
          categoryId: 'cat-housing',
          subcategory: { kind: 'existing', id: 'sub-rent' },
        },
        deletesSourceSubcategory: true,
      })
      expect(plan.deletesSourceCategory).toBe(false)
    })

    it('refuses to file a subcategory onto itself', () => {
      expect(() =>
        planLegacyMigration(
          tidy,
          [housing],
          [
            {
              sourceSubcategoryId: 'sub-loyer',
              action: 'CUSTOM',
              categoryKey: 'housing',
              subcategoryName: 'Loyer',
            },
          ]
        )
      ).toThrow(MigrationPlanError)
    })
  })

  describe('rejects an incomplete or impossible arrangement', () => {
    it('a missing line', () => {
      expect(() =>
        planLegacyMigration(source, targets, decided({ none: undefined }))
      ).toThrow(MigrationPlanError)
    })

    it('a line decided twice', () => {
      expect(() =>
        planLegacyMigration(source, targets, [
          ...decided(),
          { sourceSubcategoryId: 'sub-ai', action: 'UNFILE' },
        ])
      ).toThrow(/Two decisions/)
    })

    it('a line that is not in the category', () => {
      expect(() =>
        planLegacyMigration(source, targets, [
          ...decided(),
          { sourceSubcategoryId: 'sub-elsewhere', action: 'UNFILE' },
        ])
      ).toThrow(/is not in "Abonnements"/)
    })

    it('an unknown catalogue key or subcategory key', () => {
      expect(() =>
        planLegacyMigration(
          source,
          targets,
          decided({
            ai: {
              sourceSubcategoryId: 'sub-ai',
              action: 'CATALOG',
              categoryKey: 'vacations',
            },
          })
        )
      ).toThrow(/not a catalogue category/)
      expect(() =>
        planLegacyMigration(
          source,
          targets,
          decided({
            ai: {
              sourceSubcategoryId: 'sub-ai',
              action: 'CATALOG',
              categoryKey: 'telecom',
              subcategoryKey: 'leisure.gym',
            },
          })
        )
      ).toThrow(/not a subcategory of/)
    })

    it('a custom line without a name', () => {
      expect(() =>
        planLegacyMigration(
          source,
          targets,
          decided({
            ai: {
              sourceSubcategoryId: 'sub-ai',
              action: 'CUSTOM',
              categoryKey: 'telecom',
              subcategoryName: '  ',
            },
          })
        )
      ).toThrow(/No subcategory name/)
    })
  })
})
