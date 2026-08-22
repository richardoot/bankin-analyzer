/**
 * Deciding what a category migration does, before anything touches the
 * database.
 *
 * ## Why it is separate
 *
 * The rules here are the whole feature, and none of them need Prisma: which
 * subcategories travel, which merge into an existing one, which stay behind,
 * and which combinations the database would refuse. Keeping them pure is what
 * makes them testable one case at a time — the same split that paid off for
 * the reimbursement ledger.
 *
 * ## The rules
 *
 * Each of the source category's subcategories gets exactly one decision, and so
 * do the transactions that have no subcategory at all. Nothing is defaulted at
 * this level: an omitted or unknown subcategory is an error rather than a
 * silent "leave it", because a migration cannot be undone and a forgotten line
 * is indistinguishable from a deliberate one once it has run.
 *
 *  - **MOVE** takes the subcategory across as it is. For a real subcategory
 *    that means reparenting the row, so its id — and every transaction already
 *    pointing at it — survives untouched.
 *  - **MERGE** files the transactions under a subcategory the destination
 *    already has, and the now-empty source subcategory goes away.
 *  - **KEEP** leaves both where they are. This is what makes a migration
 *    partial, and it is a per-line choice rather than a mode.
 *
 * A MOVE is refused when the destination already has a subcategory of that
 * name: `@@unique([categoryId, name])` forbids the duplicate, so those lines
 * have to merge. That is not an edge case in real data — 147 expense
 * subcategories share only 98 distinct names.
 */

/** The null id stands for "the transactions with no subcategory". */
export const NO_SUBCATEGORY = null

export interface SourceSubcategory {
  id: string
  name: string
  /** Transactions in the source category filed under it. */
  transactionCount: number
}

export interface TargetSubcategory {
  id: string
  name: string
}

/**
 * One decision. Flat rather than a discriminated union because this is exactly
 * what arrives on the wire, and the validation pipe already guarantees that
 * `targetSubcategoryId` is present whenever the action is MERGE — a missing one
 * is caught below anyway, as a subcategory the destination does not have.
 */
export interface MigrationAction {
  sourceSubcategoryId: string | null
  action: 'MOVE' | 'MERGE' | 'KEEP'
  targetSubcategoryId?: string
}

export interface MigrationInput {
  sourceSubcategories: SourceSubcategory[]
  targetSubcategories: TargetSubcategory[]
  /** Transactions in the source category with no subcategory. */
  uncategorizedCount: number
  actions: MigrationAction[]
}

export interface PlannedMerge {
  sourceSubcategoryId: string
  targetSubcategoryId: string
  /** Denormalized onto every moved transaction, which the dashboard groups on. */
  targetSubcategoryName: string
  transactionCount: number
}

export interface MigrationPlan {
  /** Subcategory rows to reparent, id and transactions intact. */
  movedSubcategoryIds: string[]
  merges: PlannedMerge[]
  /** Subcategories staying in the source category. */
  keptSubcategoryIds: string[]
  /** Whether the transactions with no subcategory follow. */
  movesUncategorized: boolean
  /** Where the no-subcategory transactions land, when filed under one. */
  uncategorizedTarget: { id: string; name: string } | null
  movedTransactionCount: number
  keptTransactionCount: number
}

export class MigrationPlanError extends Error {}

/**
 * What the screen proposes before the user touches anything: take everything
 * across, except where a name collision leaves no choice.
 */
export function defaultMigrationActions(
  sourceSubcategories: SourceSubcategory[],
  targetSubcategories: TargetSubcategory[],
  uncategorizedCount: number
): MigrationAction[] {
  const byName = new Map(targetSubcategories.map(s => [s.name, s]))

  const actions: MigrationAction[] = sourceSubcategories.map(source => {
    const collision = byName.get(source.name)
    return collision
      ? {
          sourceSubcategoryId: source.id,
          action: 'MERGE' as const,
          targetSubcategoryId: collision.id,
        }
      : { sourceSubcategoryId: source.id, action: 'MOVE' as const }
  })

  if (uncategorizedCount > 0) {
    actions.push({ sourceSubcategoryId: NO_SUBCATEGORY, action: 'MOVE' })
  }

  return actions
}

/** Names a decision in an error message the way the user sees it. */
function labelOf(
  sourceSubcategoryId: string | null,
  sourceSubcategories: SourceSubcategory[]
): string {
  if (sourceSubcategoryId === NO_SUBCATEGORY)
    return 'the transactions with no subcategory'
  const source = sourceSubcategories.find(s => s.id === sourceSubcategoryId)
  return source ? `"${source.name}"` : `subcategory ${sourceSubcategoryId}`
}

export function planCategoryMigration(input: MigrationInput): MigrationPlan {
  const { sourceSubcategories, targetSubcategories, uncategorizedCount } = input

  const expected = new Set<string | null>(sourceSubcategories.map(s => s.id))
  if (uncategorizedCount > 0) expected.add(NO_SUBCATEGORY)

  const seen = new Set<string | null>()
  for (const action of input.actions) {
    if (seen.has(action.sourceSubcategoryId)) {
      throw new MigrationPlanError(
        `Two decisions given for ${labelOf(action.sourceSubcategoryId, sourceSubcategories)}.`
      )
    }
    if (!expected.has(action.sourceSubcategoryId)) {
      throw new MigrationPlanError(
        `${labelOf(action.sourceSubcategoryId, sourceSubcategories)} is not in the category being moved.`
      )
    }
    seen.add(action.sourceSubcategoryId)
  }

  for (const id of expected) {
    if (!seen.has(id)) {
      throw new MigrationPlanError(
        `No decision given for ${labelOf(id, sourceSubcategories)}.`
      )
    }
  }

  const targetById = new Map(targetSubcategories.map(s => [s.id, s]))
  const targetByName = new Map(targetSubcategories.map(s => [s.name, s]))
  const sourceById = new Map(sourceSubcategories.map(s => [s.id, s]))

  const plan: MigrationPlan = {
    movedSubcategoryIds: [],
    merges: [],
    keptSubcategoryIds: [],
    movesUncategorized: false,
    uncategorizedTarget: null,
    movedTransactionCount: 0,
    keptTransactionCount: 0,
  }

  for (const action of input.actions) {
    const isUncategorized = action.sourceSubcategoryId === NO_SUBCATEGORY
    const source = isUncategorized
      ? null
      : sourceById.get(action.sourceSubcategoryId as string)
    const count = isUncategorized
      ? uncategorizedCount
      : (source?.transactionCount ?? 0)

    if (action.action === 'KEEP') {
      plan.keptTransactionCount += count
      if (source) plan.keptSubcategoryIds.push(source.id)
      continue
    }

    if (action.action === 'MERGE') {
      const target = action.targetSubcategoryId
        ? targetById.get(action.targetSubcategoryId)
        : undefined
      if (!target) {
        throw new MigrationPlanError(
          `Cannot merge ${labelOf(action.sourceSubcategoryId, sourceSubcategories)}: the chosen subcategory is not in the destination category.`
        )
      }
      plan.movedTransactionCount += count
      if (source) {
        plan.merges.push({
          sourceSubcategoryId: source.id,
          targetSubcategoryId: target.id,
          targetSubcategoryName: target.name,
          transactionCount: count,
        })
      } else {
        plan.movesUncategorized = true
        plan.uncategorizedTarget = { id: target.id, name: target.name }
      }
      continue
    }

    // MOVE
    plan.movedTransactionCount += count
    if (!source) {
      plan.movesUncategorized = true
      continue
    }
    if (targetByName.has(source.name)) {
      throw new MigrationPlanError(
        `"${source.name}" already exists in the destination category, so it has to be merged rather than moved.`
      )
    }
    plan.movedSubcategoryIds.push(source.id)
  }

  return plan
}
