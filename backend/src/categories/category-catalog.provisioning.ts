/**
 * Carrying a provisioning plan out — the database half of
 * `category-catalog.plan.ts`.
 *
 * Kept out of the Nest service so the command-line script that provisions
 * the accounts predating the catalogue runs the exact same code the login
 * path runs, on a bare Prisma client.
 */

import { Prisma } from '../generated/prisma'
import type { PrismaClient } from '../generated/prisma'
import { CATEGORY_CATALOG } from './catalog'
import type { CatalogCategory } from './catalog'
import { isEmptyPlan, planCatalogProvisioning } from './category-catalog.plan'
import type { ProvisioningPlan } from './category-catalog.plan'

/** Either the client or the transaction handle: both run the same queries. */
export type ProvisioningClient = PrismaClient | Prisma.TransactionClient

export interface ProvisioningSummary {
  createdCategories: number
  adoptedCategories: number
  createdSubcategories: number
  adoptedSubcategories: number
  /** Rows of a former catalogue version, empty, removed. */
  retiredDeleted: number
  /** Rows of a former catalogue version, still used, handed to the user. */
  retiredReleased: number
}

export function emptySummary(): ProvisioningSummary {
  return {
    createdCategories: 0,
    adoptedCategories: 0,
    createdSubcategories: 0,
    adoptedSubcategories: 0,
    retiredDeleted: 0,
    retiredReleased: 0,
  }
}

export function isEmptySummary(summary: ProvisioningSummary): boolean {
  return Object.values(summary).every(count => count === 0)
}

/** Read what the user has, decide, and return the plan without applying it. */
export async function planForUser(
  client: ProvisioningClient,
  userId: string,
  catalog: readonly CatalogCategory[] = CATEGORY_CATALOG
): Promise<ProvisioningPlan> {
  const [categories, subcategories] = await Promise.all([
    client.category.findMany({
      where: { userId },
      // Oldest first, so that of two legacy rows bearing one label the one
      // the user has lived with longest is the one adopted.
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        type: true,
        catalogKey: true,
        _count: { select: { transactions: true } },
      },
    }),
    client.subcategory.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        categoryId: true,
        name: true,
        catalogKey: true,
        _count: { select: { transactions: true } },
      },
    }),
  ])
  return planCatalogProvisioning(
    catalog,
    categories.map(({ _count, ...c }) => ({
      ...c,
      transactionCount: _count.transactions,
    })),
    subcategories.map(({ _count, ...s }) => ({
      ...s,
      transactionCount: _count.transactions,
    }))
  )
}

export async function applyPlan(
  client: ProvisioningClient,
  userId: string,
  plan: ProvisioningPlan
): Promise<ProvisioningSummary> {
  const summary = emptySummary()

  // Retirements first: a released row frees its catalogue key, which a new
  // entry adopted below may be about to take.
  for (const retirement of plan.retireSubcategories) {
    if (retirement.action === 'delete') {
      await client.subcategory.delete({ where: { id: retirement.id } })
      summary.retiredDeleted++
    } else {
      await client.subcategory.update({
        where: { id: retirement.id },
        data: { catalogKey: null },
      })
      summary.retiredReleased++
    }
  }
  for (const retirement of plan.retireCategories) {
    if (retirement.action === 'delete') {
      // Its subcategories cascade; the planner skipped them on purpose.
      await client.category.delete({ where: { id: retirement.id } })
      summary.retiredDeleted++
    } else {
      await client.category.update({
        where: { id: retirement.id },
        data: { catalogKey: null },
      })
      summary.retiredReleased++
    }
  }

  for (const adoption of plan.adoptCategories) {
    await client.category.update({
      where: { id: adoption.id },
      data: {
        catalogKey: adoption.catalogKey,
        icon: adoption.icon,
        defaultNature: adoption.defaultNature,
        defaultRhythm: adoption.defaultRhythm,
      },
    })
    summary.adoptedCategories++
  }

  for (const adoption of plan.adoptSubcategories) {
    await client.subcategory.update({
      where: { id: adoption.id },
      data: {
        catalogKey: adoption.catalogKey,
        nature: adoption.nature,
        rhythm: adoption.rhythm,
      },
    })
    summary.adoptedSubcategories++
  }

  // Batched: a fresh user gets the whole catalogue — a couple of dozen
  // categories and close to a hundred subcategories — on the request that
  // creates the row, so this is three statements rather than one per row.
  if (plan.createCategories.length > 0) {
    await client.category.createMany({
      data: plan.createCategories.map(entry => {
        const other = entry.subcategories.find(
          sub => sub.key === `${entry.key}.other`
        )
        return {
          userId,
          name: entry.label,
          type: entry.type,
          icon: entry.icon,
          catalogKey: entry.key,
          defaultNature: other?.nature ?? null,
          defaultRhythm: other?.rhythm ?? null,
        }
      }),
    })
    summary.createdCategories += plan.createCategories.length
  }

  const created = plan.createCategories.length
    ? await client.category.findMany({
        where: {
          userId,
          catalogKey: { in: plan.createCategories.map(entry => entry.key) },
        },
        select: { id: true, catalogKey: true },
      })
    : []
  const idByKey = new Map(created.map(row => [row.catalogKey, row.id]))

  const subcategories = [
    ...plan.createCategories.flatMap(entry => {
      const categoryId = idByKey.get(entry.key)
      if (!categoryId) {
        throw new Error(`Category ${entry.key} was not created`)
      }
      return entry.subcategories.map(subcategory => ({
        categoryId,
        subcategory,
      }))
    }),
    ...plan.createSubcategories,
  ]
  if (subcategories.length > 0) {
    await client.subcategory.createMany({
      data: subcategories.map(({ categoryId, subcategory }) => ({
        userId,
        categoryId,
        name: subcategory.label,
        catalogKey: subcategory.key,
        nature: subcategory.nature,
        rhythm: subcategory.rhythm,
      })),
    })
    summary.createdSubcategories += subcategories.length
  }

  return summary
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  )
}

/**
 * Make sure one user has the whole catalogue. Idempotent: a second run finds
 * nothing to do. Two runs at once — a login racing the provisioning script —
 * collide on the unique catalogue key; the loser re-plans against what the
 * winner wrote and finishes the remainder.
 */
export async function provisionCatalogForUser(
  prisma: PrismaClient,
  userId: string,
  catalog: readonly CatalogCategory[] = CATEGORY_CATALOG
): Promise<ProvisioningSummary> {
  const attempt = () =>
    prisma.$transaction(async tx => {
      const plan = await planForUser(tx, userId, catalog)
      if (isEmptyPlan(plan)) return emptySummary()
      return applyPlan(tx, userId, plan)
    })

  try {
    return await attempt()
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    return attempt()
  }
}
