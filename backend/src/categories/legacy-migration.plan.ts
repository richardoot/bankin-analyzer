/**
 * Deciding what migrating one legacy category into the catalogue does,
 * before anything touches the database.
 *
 * ## What is decided, line by line
 *
 * A legacy category is a heading from before the catalogue. Its content is
 * a set of lines: each of its subcategories, plus the transactions filed at
 * the category alone. Every line gets exactly one decision:
 *
 *  - **CATALOG** files the rows under a catalogue category, optionally under
 *    one of its catalogue subcategories.
 *  - **CUSTOM** files them under a catalogue category, inside a subcategory
 *    of the user's own — an existing one by name, or one to create. When the
 *    line is a real legacy subcategory bearing that very name and the target
 *    has none, the row is reparented rather than recreated, so its id and
 *    every transaction pointing at it survive.
 *  - **UNFILE** sends the rows back to "à classer": a heading like "Erreurs"
 *    names no purpose, and its rows deserve the categoriser one by one.
 *  - **KEEP** leaves the line where it is, which makes a migration partial.
 *
 * Any line may also carry a tag, attached to every transaction it moves:
 * "Vacances", "Cadeaux" and their like were categories that encoded a
 * context, and the context must not be lost when the filing is fixed.
 *
 * ## The sign
 *
 * A category carries a type, and so do its transactions. An expense line
 * goes to an expense category or a transfer one; an income line to an
 * income category or a transfer one; never across. Rows filed into a
 * transfer change type — that is the whole point of the transfer type.
 *
 * ## Budget lines
 *
 * A legacy category may have envelopes in budget plans. They follow the
 * catalogue category that receives most of the legacy transactions, as long
 * as that is a category one budgets (not a transfer). Two envelopes landing
 * on one category in one plan are summed by the executor.
 *
 * Same split as the two engines before it: pure rules here, one test per
 * rule, and an executor that carries them out.
 */

import { TransactionType } from '../generated/prisma'
import type { CategoryNature, CategoryRhythm } from '../generated/prisma'
import { normalizeName } from './category-catalog.plan'
import { MigrationPlanError, NO_SUBCATEGORY } from './category-migration.plan'

export type LegacyAction = 'CATALOG' | 'CUSTOM' | 'UNFILE' | 'KEEP'

/** One decision, flat because that is what arrives on the wire. */
export interface LegacyDecision {
  /** Null stands for the transactions filed at the legacy category alone. */
  sourceSubcategoryId: string | null
  action: LegacyAction
  /** CATALOG and CUSTOM: the catalogue category, by key. */
  categoryKey?: string | null
  /** CATALOG: the catalogue subcategory, by key, or null for the category alone. */
  subcategoryKey?: string | null
  /** CUSTOM: the user's own subcategory to file under, by name. */
  subcategoryName?: string | null
  /** A tag to attach to every transaction the line moves or unfiles. */
  tagId?: string | null
}

export interface LegacySourceSubcategory {
  id: string
  name: string
  transactionCount: number
}

export interface LegacySource {
  id: string
  name: string
  type: TransactionType
  subcategories: LegacySourceSubcategory[]
  /** Transactions filed at the category alone. */
  uncategorizedCount: number
}

export interface TargetSubcategory {
  id: string
  name: string
  catalogKey: string | null
}

/** A catalogue category as the user has it: their rows, keyed by catalogue key. */
export interface TargetCategory {
  id: string
  key: string
  name: string
  type: TransactionType
  defaultNature: CategoryNature | null
  defaultRhythm: CategoryRhythm | null
  subcategories: TargetSubcategory[]
}

/** Where a moved line's rows are filed. */
export interface PlannedFiling {
  categoryId: string
  categoryKey: string
  categoryName: string
  /** The rows change type when they enter a transfer category. */
  type: TransactionType
  subcategory:
    | { kind: 'existing'; id: string; name: string }
    | { kind: 'create'; name: string }
    | { kind: 'reparent'; id: string; name: string }
    | null
}

export interface PlannedMove {
  sourceSubcategoryId: string | null
  sourceSubcategoryName: string | null
  transactionCount: number
  filing: PlannedFiling
  tagId: string | null
  /** True when the legacy subcategory row goes away once its rows have left. */
  deletesSourceSubcategory: boolean
}

export interface PlannedUnfile {
  sourceSubcategoryId: string | null
  sourceSubcategoryName: string | null
  transactionCount: number
  tagId: string | null
  deletesSourceSubcategory: boolean
}

export interface PlannedKeep {
  sourceSubcategoryId: string | null
  transactionCount: number
}

export interface LegacyMigrationPlan {
  moves: PlannedMove[]
  unfiles: PlannedUnfile[]
  keeps: PlannedKeep[]
  /** Set once nothing is kept: the empty legacy category goes with its rows. */
  deletesSourceCategory: boolean
  /**
   * Where the legacy category's budget envelopes go: the catalogue category
   * receiving most of its transactions, or null (dropped) when nothing that
   * is budgeted receives any.
   */
  budgetTargetCategoryId: string | null
  movedTransactionCount: number
  unfiledTransactionCount: number
  keptTransactionCount: number
  typeChangedTransactionCount: number
}

function labelOf(
  sourceSubcategoryId: string | null,
  source: LegacySource
): string {
  if (sourceSubcategoryId === NO_SUBCATEGORY) {
    return `the transactions filed at "${source.name}" alone`
  }
  const sub = source.subcategories.find(s => s.id === sourceSubcategoryId)
  return sub ? `"${sub.name}"` : `subcategory ${sourceSubcategoryId}`
}

function resolveTarget(
  decision: LegacyDecision,
  source: LegacySource,
  targets: TargetCategory[]
): TargetCategory {
  const key = decision.categoryKey
  if (!key) {
    throw new MigrationPlanError(
      `No catalogue category given for ${labelOf(decision.sourceSubcategoryId, source)}.`
    )
  }
  const target = targets.find(t => t.key === key)
  if (!target) {
    throw new MigrationPlanError(
      `"${key}" is not a catalogue category the user has.`
    )
  }
  if (target.type !== TransactionType.TRANSFER && target.type !== source.type) {
    throw new MigrationPlanError(
      `${labelOf(decision.sourceSubcategoryId, source)} holds ${source.type} rows and cannot go to "${target.name}", an ${target.type} category.`
    )
  }
  return target
}

function catalogFiling(
  decision: LegacyDecision,
  target: TargetCategory
): PlannedFiling {
  const base = {
    categoryId: target.id,
    categoryKey: target.key,
    categoryName: target.name,
    type: target.type,
  }
  if (!decision.subcategoryKey) return { ...base, subcategory: null }

  const sub = target.subcategories.find(
    s => s.catalogKey === decision.subcategoryKey
  )
  if (!sub) {
    throw new MigrationPlanError(
      `"${decision.subcategoryKey}" is not a subcategory of "${target.name}".`
    )
  }
  return {
    ...base,
    subcategory: { kind: 'existing', id: sub.id, name: sub.name },
  }
}

function customFiling(
  decision: LegacyDecision,
  source: LegacySource,
  sourceSub: LegacySourceSubcategory | null,
  target: TargetCategory
): PlannedFiling {
  if (target.type === TransactionType.TRANSFER) {
    throw new MigrationPlanError(
      `"${target.name}" is a transfer category: transfers are filed at the category alone.`
    )
  }
  const name = decision.subcategoryName?.trim()
  if (!name) {
    throw new MigrationPlanError(
      `No subcategory name given for ${labelOf(decision.sourceSubcategoryId, source)}.`
    )
  }
  const base = {
    categoryId: target.id,
    categoryKey: target.key,
    categoryName: target.name,
    type: target.type,
  }
  const wanted = normalizeName(name)
  const existing = target.subcategories.find(
    s => normalizeName(s.name) === wanted
  )
  if (existing) {
    return {
      ...base,
      subcategory: { kind: 'existing', id: existing.id, name: existing.name },
    }
  }
  // The legacy row itself, under its own name: it travels, id intact.
  if (sourceSub && normalizeName(sourceSub.name) === wanted) {
    return {
      ...base,
      subcategory: { kind: 'reparent', id: sourceSub.id, name: sourceSub.name },
    }
  }
  return { ...base, subcategory: { kind: 'create', name } }
}

export function planLegacyMigration(
  source: LegacySource,
  targets: TargetCategory[],
  decisions: LegacyDecision[]
): LegacyMigrationPlan {
  const expected = new Set<string | null>(source.subcategories.map(s => s.id))
  if (source.uncategorizedCount > 0) expected.add(NO_SUBCATEGORY)

  const seen = new Set<string | null>()
  for (const decision of decisions) {
    if (seen.has(decision.sourceSubcategoryId)) {
      throw new MigrationPlanError(
        `Two decisions given for ${labelOf(decision.sourceSubcategoryId, source)}.`
      )
    }
    if (!expected.has(decision.sourceSubcategoryId)) {
      throw new MigrationPlanError(
        `${labelOf(decision.sourceSubcategoryId, source)} is not in "${source.name}".`
      )
    }
    seen.add(decision.sourceSubcategoryId)
  }
  for (const id of expected) {
    if (!seen.has(id)) {
      throw new MigrationPlanError(
        `No decision given for ${labelOf(id, source)}.`
      )
    }
  }

  const plan: LegacyMigrationPlan = {
    moves: [],
    unfiles: [],
    keeps: [],
    deletesSourceCategory: false,
    budgetTargetCategoryId: null,
    movedTransactionCount: 0,
    unfiledTransactionCount: 0,
    keptTransactionCount: 0,
    typeChangedTransactionCount: 0,
  }
  // Transactions per receiving category, to place the budget envelopes.
  const receivedByCategory = new Map<string, number>()
  // Names created in this migration, so two lines cannot create the same one.
  const created = new Set<string>()

  for (const decision of decisions) {
    const sourceSub =
      decision.sourceSubcategoryId === NO_SUBCATEGORY
        ? null
        : (source.subcategories.find(
            s => s.id === decision.sourceSubcategoryId
          ) ?? null)
    const count = sourceSub
      ? sourceSub.transactionCount
      : source.uncategorizedCount
    const tagId = decision.tagId ?? null

    if (decision.action === 'KEEP') {
      plan.keeps.push({
        sourceSubcategoryId: decision.sourceSubcategoryId,
        transactionCount: count,
      })
      plan.keptTransactionCount += count
      continue
    }

    if (decision.action === 'UNFILE') {
      plan.unfiles.push({
        sourceSubcategoryId: decision.sourceSubcategoryId,
        sourceSubcategoryName: sourceSub?.name ?? null,
        transactionCount: count,
        tagId,
        deletesSourceSubcategory: sourceSub !== null,
      })
      plan.unfiledTransactionCount += count
      continue
    }

    const target = resolveTarget(decision, source, targets)
    const filing =
      decision.action === 'CATALOG'
        ? catalogFiling(decision, target)
        : customFiling(decision, source, sourceSub, target)

    if (filing.subcategory?.kind === 'create') {
      const key = `${target.id}|${normalizeName(filing.subcategory.name)}`
      if (created.has(key)) {
        throw new MigrationPlanError(
          `Two lines create "${filing.subcategory.name}" in "${target.name}"; file the second under the first.`
        )
      }
      created.add(key)
    }

    plan.moves.push({
      sourceSubcategoryId: decision.sourceSubcategoryId,
      sourceSubcategoryName: sourceSub?.name ?? null,
      transactionCount: count,
      filing,
      tagId,
      deletesSourceSubcategory:
        sourceSub !== null && filing.subcategory?.kind !== 'reparent',
    })
    plan.movedTransactionCount += count
    if (target.type !== source.type) plan.typeChangedTransactionCount += count
    if (target.type !== TransactionType.TRANSFER) {
      receivedByCategory.set(
        target.id,
        (receivedByCategory.get(target.id) ?? 0) + count
      )
    }
  }

  plan.deletesSourceCategory = plan.keeps.length === 0

  let best: { id: string; count: number } | null = null
  for (const [id, count] of receivedByCategory) {
    if (!best || count > best.count) best = { id, count }
  }
  plan.budgetTargetCategoryId = best?.id ?? null

  return plan
}
