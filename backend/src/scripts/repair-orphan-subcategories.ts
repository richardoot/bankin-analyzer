/**
 * Detach subcategories that belong to a category other than their
 * transaction's.
 *
 * ## Why
 *
 * A transaction carries both `category_id` and `subcategory_id`, and a
 * subcategory belongs to exactly one category — but nothing in the database
 * ties the two together. `bulkUpdate` used to write `category_id` alone, so a
 * transaction moved between categories kept whatever subcategory it had.
 *
 * The result is not a cosmetic inconsistency. The dashboard groups spending on
 * the denormalized `subcategory` label, so an affected row appears under a
 * heading that does not exist in the category it now claims: a phantom line
 * nobody can reach by filtering. The totals stay right; the breakdown lies.
 *
 * Production held five such rows when this was written, all income transactions
 * moved into "Dépôt d'argent" on 2026-08-14, still carrying subcategories from
 * "Remboursements", "Autres rentrées" and "R Articles de sport".
 *
 * ## What it does
 *
 * Clears `subcategory_id` and the `subcategory` label, keeping `category_id`
 * untouched. That is the only repair that does not guess: the category is the
 * deliberate choice the user made when moving the row, the subcategory is the
 * leftover. Re-filing those transactions is a click each in the UI, and no
 * information the app can reconstruct is lost.
 *
 * Re-running it is safe: once detached, a row no longer matches.
 *
 * ## Usage
 *
 *   # Local Docker database (what backend/.env points at):
 *   pnpm ts-node src/scripts/repair-orphan-subcategories.ts --dry-run
 *
 *   # Production:
 *   DOTENV_CONFIG_PATH=.env.production.local \
 *     pnpm ts-node src/scripts/repair-orphan-subcategories.ts --dry-run
 *
 * `--dry-run` reports what would change and writes nothing.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma'

/** A transaction whose subcategory is owned by a different category. */
export interface OrphanRow {
  id: string
  date: Date
  description: string
  amount: string
  categoryId: string | null
  categoryName: string | null
  subcategoryId: string
  subcategoryName: string
  subcategoryOwnerName: string
}

/**
 * Rows where the subcategory's parent is not the transaction's category.
 *
 * A transaction with no category at all counts: a subcategory always has a
 * parent, so it cannot legitimately hang off an uncategorized row either.
 */
export function findOrphans<
  T extends {
    categoryId: string | null
    subcategoryRef: { categoryId: string } | null
  },
>(transactions: T[]): T[] {
  return transactions.filter(
    t =>
      t.subcategoryRef !== null && t.subcategoryRef.categoryId !== t.categoryId
  )
}

/** One line per row, naming both categories so the damage is legible. */
export function describeOrphan(row: OrphanRow): string {
  const date = row.date.toISOString().slice(0, 10)
  const category = row.categoryName ?? '(sans catégorie)'
  const description =
    row.description.length > 32
      ? `${row.description.slice(0, 29)}…`
      : row.description
  return (
    `  ${date}  ${description.padEnd(32)} ${row.amount.padStart(10)}  ` +
    `${category} › ${row.subcategoryName} (appartient à ${row.subcategoryOwnerName})`
  )
}

export async function main(
  prisma: PrismaClient,
  options: { dryRun: boolean }
): Promise<void> {
  const transactions = await prisma.transaction.findMany({
    where: { subcategoryId: { not: null } },
    select: {
      id: true,
      date: true,
      description: true,
      amount: true,
      categoryId: true,
      category: { select: { name: true } },
      subcategoryId: true,
      subcategoryRef: {
        select: {
          id: true,
          name: true,
          categoryId: true,
          category: { select: { name: true } },
        },
      },
    },
    orderBy: { date: 'desc' },
  })

  const orphans = findOrphans(transactions)

  console.log(
    `${transactions.length} transactions carry a subcategory. ` +
      `${orphans.length} of them point at a subcategory from another category.`
  )

  if (orphans.length === 0) {
    console.log('Nothing to repair.')
    return
  }

  for (const t of orphans) {
    // Narrowed by findOrphans, which only keeps rows with a subcategory.
    const sub = t.subcategoryRef!
    console.log(
      describeOrphan({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: t.amount.toString(),
        categoryId: t.categoryId,
        categoryName: t.category?.name ?? null,
        subcategoryId: sub.id,
        subcategoryName: sub.name,
        subcategoryOwnerName: sub.category.name,
      })
    )
  }

  if (options.dryRun) {
    console.log('\nDry run: nothing written.')
    return
  }

  const ids = orphans.map(t => t.id)
  const result = await prisma.transaction.updateMany({
    where: { id: { in: ids } },
    data: { subcategoryId: null, subcategory: null },
  })

  // Re-read rather than trust the write: the point of the script is that this
  // invariant was never enforced anywhere.
  const remaining = findOrphans(
    await prisma.transaction.findMany({
      where: { subcategoryId: { not: null } },
      select: {
        categoryId: true,
        subcategoryRef: { select: { categoryId: true } },
      },
    })
  )
  if (remaining.length > 0) {
    throw new Error(
      `Repair incomplete: ${remaining.length} rows still mismatched after writing.`
    )
  }

  console.log(
    `\nDone. ${result.count} transactions detached from their orphan subcategory.`
  )
}

/**
 * Build a PrismaClient wired to the same Postgres adapter the app uses.
 * Prefers DIRECT_URL (Supabase session mode) because long-running
 * transactions break under the pooler in transaction mode.
 */
function buildPrismaClient(): { prisma: PrismaClient; pool: Pool } {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL or DIRECT_URL must be set (load .env or export it).'
    )
  }
  const pool = new Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  return { prisma: new PrismaClient({ adapter }), pool }
}

if (require.main === module) {
  // Side-effect import: must come BEFORE buildPrismaClient() reads process.env.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config')

  const { prisma, pool } = buildPrismaClient()
  main(prisma, { dryRun: process.argv.includes('--dry-run') })
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
      await pool.end()
    })
}
