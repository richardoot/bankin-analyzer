/**
 * Reading a legacy category, describing it, and carrying a legacy migration
 * plan out — the database half of `legacy-migration.plan.ts`.
 *
 * Plain functions on a Prisma client rather than a Nest service, so the
 * command-line script that replays a mapping file on a restored copy of
 * production runs the very same code the API runs.
 */

import type { Prisma, TransactionType } from '../generated/prisma'
import type { PrismaClient } from '../generated/prisma'
import {
  CATEGORY_CATALOG,
  catalogCategory,
  catalogSubcategory,
} from './catalog'
import { forgetCategoryInPreferences } from './forget-in-preferences'
import { suggestFiling } from './legacy-migration.dictionary'
import type { Suggestion } from './legacy-migration.dictionary'
import { planLegacyMigration } from './legacy-migration.plan'
import type {
  LegacyDecision,
  LegacyMigrationPlan,
  LegacySource,
  TargetCategory,
} from './legacy-migration.plan'

export type LegacyClient = PrismaClient | Prisma.TransactionClient

export class LegacyCategoryNotFound extends Error {}

// ── Reading ─────────────────────────────────────────────────────────────────

export interface LegacySourceWithBudget extends LegacySource {
  icon: string | null
  budgetPlanEntries: {
    id: string
    budgetPlanId: string
    planName: string
    amount: number
  }[]
}

/** A legacy category — one without a catalogue key — with everything filed under it. */
export async function readLegacySource(
  client: LegacyClient,
  userId: string,
  categoryId: string
): Promise<LegacySourceWithBudget> {
  const category = await client.category.findFirst({
    where: { id: categoryId, userId },
    include: {
      subcategories: {
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      },
      budgetPlanEntries: {
        select: {
          id: true,
          budgetPlanId: true,
          amount: true,
          budgetPlan: { select: { name: true } },
        },
      },
    },
  })
  if (!category) {
    throw new LegacyCategoryNotFound(`Category ${categoryId} not found`)
  }
  if (category.catalogKey !== null) {
    throw new LegacyCategoryNotFound(
      `"${category.name}" belongs to the catalogue; there is nothing to migrate`
    )
  }

  const counts = await client.transaction.groupBy({
    by: ['subcategoryId'],
    where: { categoryId, userId },
    _count: { _all: true },
  })
  const countBySubcategory = new Map(
    counts.map(c => [c.subcategoryId, c._count._all])
  )

  return {
    id: category.id,
    name: category.name,
    type: category.type,
    icon: category.icon,
    subcategories: category.subcategories.map(s => ({
      id: s.id,
      name: s.name,
      transactionCount: countBySubcategory.get(s.id) ?? 0,
    })),
    uncategorizedCount: countBySubcategory.get(null) ?? 0,
    budgetPlanEntries: category.budgetPlanEntries.map(e => ({
      id: e.id,
      budgetPlanId: e.budgetPlanId,
      planName: e.budgetPlan.name,
      amount: e.amount.toNumber(),
    })),
  }
}

/** The user's catalogue rows, as targets keyed by catalogue key. */
export async function readTargets(
  client: LegacyClient,
  userId: string
): Promise<TargetCategory[]> {
  const rows = await client.category.findMany({
    where: { userId, catalogKey: { not: null } },
    include: {
      subcategories: {
        select: { id: true, name: true, catalogKey: true },
        orderBy: { name: 'asc' },
      },
    },
  })
  return rows.map(row => ({
    id: row.id,
    key: row.catalogKey as string,
    name: row.name,
    type: row.type,
    defaultNature: row.defaultNature,
    defaultRhythm: row.defaultRhythm,
    subcategories: row.subcategories,
  }))
}

// ── Overview ────────────────────────────────────────────────────────────────

export interface SuggestionView extends Suggestion {
  categoryName: string | null
  subcategoryName: string | null
}

export interface LegacyLineView {
  sourceSubcategoryId: string | null
  name: string | null
  transactionCount: number
  suggestion: SuggestionView | null
}

export interface LegacyCategoryView {
  id: string
  name: string
  type: TransactionType
  icon: string | null
  transactionCount: number
  isHidden: boolean
  budgetPlanEntryCount: number
  lines: LegacyLineView[]
}

function describeSuggestion(
  suggestion: Suggestion | null
): SuggestionView | null {
  if (!suggestion) return null
  const category = suggestion.categoryKey
    ? catalogCategory(suggestion.categoryKey)
    : undefined
  const subcategory = suggestion.subcategoryKey
    ? catalogSubcategory(suggestion.subcategoryKey)
    : undefined
  return {
    ...suggestion,
    categoryName: category?.label ?? null,
    subcategoryName: subcategory?.subcategory.label ?? null,
  }
}

/** Every legacy category the user still has, each line with its suggestion. */
export async function readLegacyOverview(
  client: LegacyClient,
  userId: string
): Promise<LegacyCategoryView[]> {
  const [legacy, preferences] = await Promise.all([
    client.category.findMany({
      where: { userId, catalogKey: null },
      select: { id: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    }),
    client.filterPreferences.findUnique({ where: { userId } }),
  ])
  const hidden = new Set([
    ...(preferences?.globalHiddenExpenseCategoryIds ?? []),
    ...(preferences?.globalHiddenIncomeCategoryIds ?? []),
  ])

  const views: LegacyCategoryView[] = []
  for (const { id } of legacy) {
    const source = await readLegacySource(client, userId, id)
    const lines: LegacyLineView[] = source.subcategories.map(sub => ({
      sourceSubcategoryId: sub.id,
      name: sub.name,
      transactionCount: sub.transactionCount,
      suggestion: describeSuggestion(
        suggestFiling(source.name, sub.name, source.type)
      ),
    }))
    if (source.uncategorizedCount > 0) {
      lines.push({
        sourceSubcategoryId: null,
        name: null,
        transactionCount: source.uncategorizedCount,
        suggestion: describeSuggestion(
          suggestFiling(source.name, null, source.type)
        ),
      })
    }
    views.push({
      id: source.id,
      name: source.name,
      type: source.type,
      icon: source.icon,
      transactionCount:
        source.uncategorizedCount +
        source.subcategories.reduce((sum, s) => sum + s.transactionCount, 0),
      isHidden: hidden.has(source.id),
      budgetPlanEntryCount: source.budgetPlanEntries.length,
      lines,
    })
  }
  return views
}

// ── Preview ─────────────────────────────────────────────────────────────────

export interface BudgetEntryOutcome {
  planName: string
  amount: number
  targetCategoryName: string | null
  /** True when the target already has an envelope in that plan: the two are summed. */
  mergesIntoExisting: boolean
}

/** What the plan will do to the envelopes and the hidden list, read ahead. */
export async function describeSideEffects(
  client: LegacyClient,
  userId: string,
  source: LegacySourceWithBudget,
  plan: LegacyMigrationPlan,
  targets: TargetCategory[]
): Promise<{
  budgetEntries: BudgetEntryOutcome[]
  dropsHiddenPreference: boolean
}> {
  const target = plan.budgetTargetCategoryId
    ? targets.find(t => t.id === plan.budgetTargetCategoryId)
    : undefined
  const existing =
    target && source.budgetPlanEntries.length > 0
      ? await client.budgetPlanEntry.findMany({
          where: {
            categoryId: target.id,
            budgetPlanId: {
              in: source.budgetPlanEntries.map(e => e.budgetPlanId),
            },
          },
          select: { budgetPlanId: true },
        })
      : []
  const existingPlans = new Set(existing.map(e => e.budgetPlanId))

  const budgetEntries = source.budgetPlanEntries.map(entry => ({
    planName: entry.planName,
    amount: entry.amount,
    targetCategoryName: plan.deletesSourceCategory
      ? (target?.name ?? null)
      : source.name,
    mergesIntoExisting:
      plan.deletesSourceCategory &&
      target !== undefined &&
      existingPlans.has(entry.budgetPlanId),
  }))

  const preferences = await client.filterPreferences.findUnique({
    where: { userId },
  })
  const dropsHiddenPreference =
    plan.deletesSourceCategory &&
    [
      ...(preferences?.hiddenExpenseCategoryIds ?? []),
      ...(preferences?.hiddenIncomeCategoryIds ?? []),
      ...(preferences?.globalHiddenExpenseCategoryIds ?? []),
      ...(preferences?.globalHiddenIncomeCategoryIds ?? []),
    ].includes(source.id)

  return { budgetEntries, dropsHiddenPreference }
}

// ── Applying ────────────────────────────────────────────────────────────────

export interface LegacyMigrationOutcome {
  movedTransactions: number
  unfiledTransactions: number
  keptTransactions: number
  typeChangedTransactions: number
  createdSubcategories: number
  reparentedSubcategories: number
  deletedSubcategories: number
  taggedTransactions: number
  budgetEntriesMoved: number
  budgetEntriesMerged: number
  budgetEntriesDropped: number
  hiddenPreferenceDropped: boolean
  sourceDeleted: boolean
}

async function tagRows(
  tx: Prisma.TransactionClient,
  where: Prisma.TransactionWhereInput,
  tagId: string | null
): Promise<number> {
  if (!tagId) return 0
  const rows = await tx.transaction.findMany({ where, select: { id: true } })
  if (rows.length === 0) return 0
  const { count } = await tx.transactionTag.createMany({
    data: rows.map(row => ({ transactionId: row.id, tagId })),
    skipDuplicates: true,
  })
  return count
}

export async function applyLegacyPlan(
  tx: Prisma.TransactionClient,
  userId: string,
  source: LegacySourceWithBudget,
  plan: LegacyMigrationPlan,
  targets: TargetCategory[]
): Promise<LegacyMigrationOutcome> {
  const outcome: LegacyMigrationOutcome = {
    movedTransactions: 0,
    unfiledTransactions: 0,
    keptTransactions: plan.keptTransactionCount,
    typeChangedTransactions: 0,
    createdSubcategories: 0,
    reparentedSubcategories: 0,
    deletedSubcategories: 0,
    taggedTransactions: 0,
    budgetEntriesMoved: 0,
    budgetEntriesMerged: 0,
    budgetEntriesDropped: 0,
    hiddenPreferenceDropped: false,
    sourceDeleted: false,
  }
  const targetById = new Map(targets.map(t => [t.id, t]))

  for (const move of plan.moves) {
    const target = targetById.get(move.filing.categoryId)
    if (!target) throw new Error(`Target ${move.filing.categoryId} vanished`)
    const rowsWhere: Prisma.TransactionWhereInput = {
      userId,
      categoryId: source.id,
      subcategoryId: move.sourceSubcategoryId,
    }
    // Tags first: the rows are still findable by their old filing.
    outcome.taggedTransactions += await tagRows(tx, rowsWhere, move.tagId)

    let subcategory: { id: string; name: string } | null = null
    const filing = move.filing.subcategory
    if (filing?.kind === 'existing') {
      subcategory = { id: filing.id, name: filing.name }
    } else if (filing?.kind === 'create') {
      const created = await tx.subcategory.create({
        data: {
          userId,
          categoryId: target.id,
          name: filing.name,
          nature: target.defaultNature,
          rhythm: target.defaultRhythm,
        },
      })
      subcategory = { id: created.id, name: created.name }
      outcome.createdSubcategories++
    } else if (filing?.kind === 'reparent') {
      // The row travels, id intact: every transaction pointing at it stays
      // valid, and it takes the attributes a row of its new parent would.
      const legacy = await tx.subcategory.findUniqueOrThrow({
        where: { id: filing.id },
      })
      await tx.subcategory.update({
        where: { id: filing.id },
        data: {
          categoryId: target.id,
          nature: legacy.nature ?? target.defaultNature,
          rhythm: legacy.rhythm ?? target.defaultRhythm,
        },
      })
      subcategory = { id: filing.id, name: filing.name }
      outcome.reparentedSubcategories++
    }

    const { count } = await tx.transaction.updateMany({
      where: rowsWhere,
      data: {
        categoryId: target.id,
        subcategoryId: subcategory?.id ?? null,
        // The denormalized label the dashboard groups on travels with the row.
        subcategory: subcategory?.name ?? null,
        type: move.filing.type,
      },
    })
    outcome.movedTransactions += count
    if (move.filing.type !== source.type)
      outcome.typeChangedTransactions += count

    if (move.deletesSourceSubcategory && move.sourceSubcategoryId) {
      await tx.subcategory.delete({ where: { id: move.sourceSubcategoryId } })
      outcome.deletedSubcategories++
    }
  }

  for (const unfile of plan.unfiles) {
    const rowsWhere: Prisma.TransactionWhereInput = {
      userId,
      categoryId: source.id,
      subcategoryId: unfile.sourceSubcategoryId,
    }
    outcome.taggedTransactions += await tagRows(tx, rowsWhere, unfile.tagId)
    const { count } = await tx.transaction.updateMany({
      where: rowsWhere,
      data: { categoryId: null, subcategoryId: null, subcategory: null },
    })
    outcome.unfiledTransactions += count
    if (unfile.deletesSourceSubcategory && unfile.sourceSubcategoryId) {
      await tx.subcategory.delete({ where: { id: unfile.sourceSubcategoryId } })
      outcome.deletedSubcategories++
    }
  }

  if (!plan.deletesSourceCategory) return outcome

  // The envelopes follow the category that received most of the spending;
  // two envelopes in one plan on one category become one, summed.
  for (const entry of source.budgetPlanEntries) {
    if (!plan.budgetTargetCategoryId) {
      outcome.budgetEntriesDropped++
      continue
    }
    const existing = await tx.budgetPlanEntry.findUnique({
      where: {
        budgetPlanId_categoryId: {
          budgetPlanId: entry.budgetPlanId,
          categoryId: plan.budgetTargetCategoryId,
        },
      },
    })
    if (existing) {
      await tx.budgetPlanEntry.update({
        where: { id: existing.id },
        data: { amount: existing.amount.toNumber() + entry.amount },
      })
      outcome.budgetEntriesMerged++
    } else {
      await tx.budgetPlanEntry.update({
        where: { id: entry.id },
        data: { categoryId: plan.budgetTargetCategoryId },
      })
      outcome.budgetEntriesMoved++
    }
  }

  outcome.hiddenPreferenceDropped = await forgetCategoryInPreferences(
    tx,
    userId,
    source.id,
    source.type
  )
  // Whatever is left cascades: the remaining envelopes (dropped above), and
  // no subcategory, since every line was moved, unfiled or reparented.
  await tx.category.delete({ where: { id: source.id } })
  outcome.sourceDeleted = true

  return outcome
}

// ── One call for the script and the service alike ───────────────────────────

/** Plan against the current state and carry it out, in one transaction. */
export async function migrateLegacyCategory(
  prisma: PrismaClient,
  userId: string,
  categoryId: string,
  decisions: LegacyDecision[]
): Promise<LegacyMigrationOutcome> {
  return prisma.$transaction(async tx => {
    const [source, targets] = await Promise.all([
      readLegacySource(tx, userId, categoryId),
      readTargets(tx, userId),
    ])
    const plan = planLegacyMigration(source, targets, decisions)
    return applyLegacyPlan(tx, userId, source, plan, targets)
  })
}

/** Every catalogue key the mapping vocabulary accepts, for the script's help text. */
export function catalogKeys(): string[] {
  return CATEGORY_CATALOG.flatMap(c => [
    c.key,
    ...c.subcategories.map(s => s.key),
  ])
}
