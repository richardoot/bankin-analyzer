/**
 * One-shot script to rehash all transactions after switching the hash formula
 * from `account` (string name) to `accountId` (FK).
 *
 * Algorithm:
 *   1. Read every transaction, sorted by group key
 *      (userId, accountId, date, amount, description) plus a stable tiebreaker
 *      (createdAt, id).
 *   2. Within each group, the 1st transaction gets the "base" hash,
 *      the Nth (N >= 2) gets the base hash with a `|:N` suffix. This
 *      preserves uniqueness for real duplicates that were originally imported
 *      via `forceImport` (whose random nonce can't be reconstructed).
 *   3. Validate in memory that all new hashes are unique before touching DB.
 *   4. Apply all UPDATE statements in a single Postgres transaction.
 *   5. Verify the post-state: COUNT(*) === COUNT(DISTINCT hash).
 *
 * Usage:
 *   # Loads .env automatically. For Supabase prod, prefer DIRECT_URL
 *   # (session mode, port 5432) over DATABASE_URL (pooler, port 6543).
 *   pnpm ts-node src/scripts/rehash-transactions.ts
 *
 * The script is idempotent: re-running it on already-rehashed data produces
 * the same hashes, so the UPDATE writes the same values.
 */
import { createHash } from 'crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma'

/** Minimal row shape needed by the rehash planner. */
export interface RehashRow {
  id: string
  userId: string
  accountId: string
  date: Date
  /** Canonical string form (e.g. Prisma `Decimal.toString()`). */
  amount: string
  description: string
  /** Tiebreaker within a duplicate group. */
  createdAt: Date
}

export interface RehashUpdate {
  id: string
  newHash: string
}

/**
 * Compute the v2 hash. Matches the formula that `TransactionsService.computeHash`
 * must use after the migration: `userId|date|amount|accountId|description[|suffix]`.
 */
export function computeHashV2(
  userId: string,
  date: Date,
  amount: string,
  accountId: string,
  description: string,
  suffix?: string
): string {
  const base = `${userId}|${date.toISOString()}|${amount}|${accountId}|${description}`
  const payload = suffix ? `${base}|${suffix}` : base
  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Build the list of hash updates for a batch of transactions.
 *
 * Sorts the input by group key + tiebreaker, then assigns positions within
 * each group. Position 1 → no suffix. Position N >= 2 → `:N` suffix.
 *
 * Returns the updates in the same order as the sorted rows. The caller is
 * responsible for verifying uniqueness (use `assertUniqueHashes`).
 */
export function planRehash(rows: RehashRow[]): RehashUpdate[] {
  const sorted = [...rows].sort(compareRehashRows)

  const updates: RehashUpdate[] = []
  let lastGroupKey: string | null = null
  let position = 0

  for (const row of sorted) {
    const groupKey = groupKeyOf(row)
    position = groupKey === lastGroupKey ? position + 1 : 1
    lastGroupKey = groupKey

    const suffix = position === 1 ? undefined : `:${position}`
    const newHash = computeHashV2(
      row.userId,
      row.date,
      row.amount,
      row.accountId,
      row.description,
      suffix
    )
    updates.push({ id: row.id, newHash })
  }

  return updates
}

/**
 * Throw if any two updates share the same hash. Cheap pre-write safety net.
 */
export function assertUniqueHashes(updates: RehashUpdate[]): void {
  const seen = new Map<string, string>()
  for (const u of updates) {
    const existing = seen.get(u.newHash)
    if (existing !== undefined) {
      throw new Error(
        `Hash collision detected between transactions ${existing} and ${u.id} (hash=${u.newHash}). ABORT.`
      )
    }
    seen.set(u.newHash, u.id)
  }
}

function groupKeyOf(row: RehashRow): string {
  return `${row.userId}|${row.accountId}|${row.date.toISOString()}|${row.amount}|${row.description}`
}

function compareRehashRows(a: RehashRow, b: RehashRow): number {
  if (a.userId !== b.userId) return a.userId < b.userId ? -1 : 1
  if (a.accountId !== b.accountId) return a.accountId < b.accountId ? -1 : 1
  const ta = a.date.getTime()
  const tb = b.date.getTime()
  if (ta !== tb) return ta - tb
  if (a.amount !== b.amount) return a.amount < b.amount ? -1 : 1
  if (a.description !== b.description)
    return a.description < b.description ? -1 : 1
  // Tiebreaker: createdAt, then id
  const ca = a.createdAt.getTime()
  const cb = b.createdAt.getTime()
  if (ca !== cb) return ca - cb
  if (a.id !== b.id) return a.id < b.id ? -1 : 1
  return 0
}

/**
 * Main orchestration. Reads all transactions, plans the rehash, applies it in
 * a single Postgres transaction, and verifies the final state.
 */
export async function main(prisma: PrismaClient): Promise<void> {
  const txs = await prisma.transaction.findMany({
    select: {
      id: true,
      userId: true,
      accountId: true,
      date: true,
      amount: true,
      description: true,
      createdAt: true,
    },
  })

  if (txs.length === 0) {
    console.log('No transactions to rehash.')
    return
  }

  const rows: RehashRow[] = txs.map(t => ({
    id: t.id,
    userId: t.userId,
    accountId: t.accountId,
    date: t.date,
    amount: t.amount.toString(),
    description: t.description,
    createdAt: t.createdAt,
  }))

  const updates = planRehash(rows)
  assertUniqueHashes(updates)

  console.log(`Rehashing ${updates.length} transactions in one transaction...`)
  const batchSize = 200
  await prisma.$transaction(
    async tx => {
      for (let i = 0; i < updates.length; i += batchSize) {
        const slice = updates.slice(i, i + batchSize)
        await Promise.all(
          slice.map(u =>
            tx.transaction.update({
              where: { id: u.id },
              data: { hash: u.newHash },
            })
          )
        )
        console.log(
          `  ${Math.min(i + batchSize, updates.length)} / ${updates.length}`
        )
      }
    },
    { timeout: 10 * 60 * 1000 }
  )

  const total = await prisma.transaction.count()
  const distinctHashesAgg = await prisma.transaction.groupBy({
    by: ['hash'],
    _count: { _all: true },
  })
  const distinct = distinctHashesAgg.length

  if (total !== distinct) {
    throw new Error(
      `Post-rehash invariant violated: total=${total}, distinct hashes=${distinct}.`
    )
  }

  console.log(`Done. ${total} transactions rehashed, all hashes unique.`)
}

/**
 * Build a PrismaClient wired to the same Postgres adapter the app uses
 * (`@prisma/adapter-pg`). Required because Prisma 7+ has no built-in driver:
 * without an explicit adapter, the client tries to use Accelerate and throws
 * `accelerateUrl is required`.
 *
 * Prefers DIRECT_URL when set (Supabase session mode, port 5432) because
 * long-running transactions break under the pooler in transaction mode.
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
  const prisma = new PrismaClient({ adapter })
  return { prisma, pool }
}

// Run only when executed directly (not when imported by tests).
if (require.main === module) {
  // Load .env so DATABASE_URL / DIRECT_URL are available without a wrapper.
  // Side-effect import: must come BEFORE buildPrismaClient() reads process.env.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config')

  const { prisma, pool } = buildPrismaClient()
  main(prisma)
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
      await pool.end()
    })
}
