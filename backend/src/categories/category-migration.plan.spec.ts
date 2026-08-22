import { describe, it, expect } from 'vitest'
import {
  defaultMigrationActions,
  planCategoryMigration,
  MigrationPlanError,
  NO_SUBCATEGORY,
  type MigrationAction,
  type SourceSubcategory,
  type TargetSubcategory,
} from './category-migration.plan'

const sport: SourceSubcategory = {
  id: 'src-sport',
  name: 'Sport',
  transactionCount: 48,
}
const music: SourceSubcategory = {
  id: 'src-music',
  name: 'Musique',
  transactionCount: 12,
}
const flights: SourceSubcategory = {
  id: 'src-flights',
  name: "Billets d'avion",
  transactionCount: 7,
}

const targetSport: TargetSubcategory = { id: 'dst-sport', name: 'Sport' }
const targetCinema: TargetSubcategory = { id: 'dst-cinema', name: 'Cinéma' }

const plan = (
  actions: MigrationAction[],
  overrides: {
    sourceSubcategories?: SourceSubcategory[]
    targetSubcategories?: TargetSubcategory[]
    uncategorizedCount?: number
  } = {}
) =>
  planCategoryMigration({
    sourceSubcategories: overrides.sourceSubcategories ?? [
      sport,
      music,
      flights,
    ],
    targetSubcategories: overrides.targetSubcategories ?? [
      targetSport,
      targetCinema,
    ],
    uncategorizedCount: overrides.uncategorizedCount ?? 0,
    actions,
  })

describe('defaultMigrationActions', () => {
  it('takes everything across when no name collides', () => {
    const actions = defaultMigrationActions([music, flights], [targetCinema], 0)

    expect(actions).toEqual([
      { sourceSubcategoryId: 'src-music', action: 'MOVE' },
      { sourceSubcategoryId: 'src-flights', action: 'MOVE' },
    ])
  })

  it('merges the one line the database would refuse to move', () => {
    // Not a preference: @@unique([categoryId, name]) forbids the duplicate.
    const actions = defaultMigrationActions([sport, music], [targetSport], 0)

    expect(actions[0]).toEqual({
      sourceSubcategoryId: 'src-sport',
      action: 'MERGE',
      targetSubcategoryId: 'dst-sport',
    })
    expect(actions[1]).toEqual({
      sourceSubcategoryId: 'src-music',
      action: 'MOVE',
    })
  })

  it('gives the transactions with no subcategory a decision of their own', () => {
    // Without their own line they would stay behind without anyone choosing it.
    const actions = defaultMigrationActions([music], [], 3)

    expect(actions).toContainEqual({
      sourceSubcategoryId: NO_SUBCATEGORY,
      action: 'MOVE',
    })
  })

  it('leaves that line out when every transaction is filed', () => {
    expect(defaultMigrationActions([music], [], 0)).toHaveLength(1)
  })
})

describe('planCategoryMigration', () => {
  it('reparents a subcategory rather than recreating it', () => {
    // Keeping the row means keeping its id, so the transactions pointing at it
    // need no rewrite of their own.
    const result = plan([
      { sourceSubcategoryId: 'src-music', action: 'MOVE' },
      { sourceSubcategoryId: 'src-flights', action: 'MOVE' },
      {
        sourceSubcategoryId: 'src-sport',
        action: 'MERGE',
        targetSubcategoryId: 'dst-sport',
      },
    ])

    expect(result.movedSubcategoryIds).toEqual(['src-music', 'src-flights'])
  })

  it('records the destination name on a merge', () => {
    const result = plan([
      {
        sourceSubcategoryId: 'src-sport',
        action: 'MERGE',
        targetSubcategoryId: 'dst-sport',
      },
      { sourceSubcategoryId: 'src-music', action: 'KEEP' },
      { sourceSubcategoryId: 'src-flights', action: 'KEEP' },
    ])

    // The label is denormalized onto every moved row, and the dashboard groups
    // on it, so the plan has to carry it.
    expect(result.merges).toEqual([
      {
        sourceSubcategoryId: 'src-sport',
        targetSubcategoryId: 'dst-sport',
        targetSubcategoryName: 'Sport',
        transactionCount: 48,
      },
    ])
  })

  it('counts what moves and what stays', () => {
    const result = plan([
      {
        sourceSubcategoryId: 'src-sport',
        action: 'MERGE',
        targetSubcategoryId: 'dst-sport',
      },
      { sourceSubcategoryId: 'src-music', action: 'MOVE' },
      { sourceSubcategoryId: 'src-flights', action: 'KEEP' },
    ])

    expect(result.movedTransactionCount).toBe(60)
    expect(result.keptTransactionCount).toBe(7)
    expect(result.keptSubcategoryIds).toEqual(['src-flights'])
  })

  it('supports a partial migration where nothing moves at all', () => {
    const result = plan([
      { sourceSubcategoryId: 'src-sport', action: 'KEEP' },
      { sourceSubcategoryId: 'src-music', action: 'KEEP' },
      { sourceSubcategoryId: 'src-flights', action: 'KEEP' },
    ])

    expect(result.movedTransactionCount).toBe(0)
    expect(result.keptTransactionCount).toBe(67)
  })

  it('carries the unfiled transactions across on their own', () => {
    const result = plan(
      [
        { sourceSubcategoryId: 'src-music', action: 'KEEP' },
        { sourceSubcategoryId: NO_SUBCATEGORY, action: 'MOVE' },
      ],
      { sourceSubcategories: [music], uncategorizedCount: 3 }
    )

    expect(result.movesUncategorized).toBe(true)
    expect(result.uncategorizedTarget).toBeNull()
    expect(result.movedTransactionCount).toBe(3)
  })

  it('can file the unfiled transactions under a destination subcategory', () => {
    const result = plan(
      [
        { sourceSubcategoryId: 'src-music', action: 'KEEP' },
        {
          sourceSubcategoryId: NO_SUBCATEGORY,
          action: 'MERGE',
          targetSubcategoryId: 'dst-cinema',
        },
      ],
      { sourceSubcategories: [music], uncategorizedCount: 3 }
    )

    expect(result.uncategorizedTarget).toEqual({
      id: 'dst-cinema',
      name: 'Cinéma',
    })
    expect(result.merges).toHaveLength(0)
  })

  it('lets two source subcategories land on the same destination one', () => {
    const result = plan(
      [
        {
          sourceSubcategoryId: 'src-music',
          action: 'MERGE',
          targetSubcategoryId: 'dst-cinema',
        },
        {
          sourceSubcategoryId: 'src-flights',
          action: 'MERGE',
          targetSubcategoryId: 'dst-cinema',
        },
      ],
      { sourceSubcategories: [music, flights] }
    )

    // A legitimate consolidation; forbidding it would complicate for nothing.
    expect(result.merges).toHaveLength(2)
    expect(result.movedTransactionCount).toBe(19)
  })

  describe('refusals', () => {
    it('refuses to move onto a name the destination already uses', () => {
      expect(() =>
        plan([
          { sourceSubcategoryId: 'src-sport', action: 'MOVE' },
          { sourceSubcategoryId: 'src-music', action: 'KEEP' },
          { sourceSubcategoryId: 'src-flights', action: 'KEEP' },
        ])
      ).toThrow(/already exists in the destination/)
    })

    it('refuses a merge into a subcategory of some other category', () => {
      expect(() =>
        plan([
          {
            sourceSubcategoryId: 'src-sport',
            action: 'MERGE',
            targetSubcategoryId: 'elsewhere',
          },
          { sourceSubcategoryId: 'src-music', action: 'KEEP' },
          { sourceSubcategoryId: 'src-flights', action: 'KEEP' },
        ])
      ).toThrow(/not in the destination category/)
    })

    it('refuses a line left undecided', () => {
      // Silence is not "leave it": a forgotten line and a deliberate one would
      // be indistinguishable once the migration has run.
      expect(() =>
        plan([
          { sourceSubcategoryId: 'src-sport', action: 'KEEP' },
          { sourceSubcategoryId: 'src-music', action: 'KEEP' },
        ])
      ).toThrow(/No decision given for "Billets d'avion"/)
    })

    it('refuses when the unfiled transactions are left undecided', () => {
      expect(() =>
        plan([{ sourceSubcategoryId: 'src-music', action: 'KEEP' }], {
          sourceSubcategories: [music],
          uncategorizedCount: 3,
        })
      ).toThrow(/no subcategory/)
    })

    it('refuses two decisions for the same line', () => {
      expect(() =>
        plan([
          { sourceSubcategoryId: 'src-sport', action: 'KEEP' },
          { sourceSubcategoryId: 'src-sport', action: 'MOVE' },
          { sourceSubcategoryId: 'src-music', action: 'KEEP' },
          { sourceSubcategoryId: 'src-flights', action: 'KEEP' },
        ])
      ).toThrow(/Two decisions given/)
    })

    it('refuses a decision about a subcategory from another category', () => {
      expect(() =>
        plan([
          { sourceSubcategoryId: 'src-sport', action: 'KEEP' },
          { sourceSubcategoryId: 'src-music', action: 'KEEP' },
          { sourceSubcategoryId: 'src-flights', action: 'KEEP' },
          { sourceSubcategoryId: 'stranger', action: 'MOVE' },
        ])
      ).toThrow(MigrationPlanError)
    })
  })

  it('accepts its own defaults', () => {
    // The screen sends these back untouched when the user just confirms, so
    // the two halves must agree.
    const sources = [sport, music, flights]
    const targets = [targetSport, targetCinema]
    const actions = defaultMigrationActions(sources, targets, 3)

    const result = planCategoryMigration({
      sourceSubcategories: sources,
      targetSubcategories: targets,
      uncategorizedCount: 3,
      actions,
    })

    expect(result.movedTransactionCount).toBe(70)
    expect(result.keptTransactionCount).toBe(0)
  })
})
