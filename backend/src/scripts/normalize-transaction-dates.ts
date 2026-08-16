/**
 * One-shot script to re-anchor `app.transactions.date` on UTC midnight.
 *
 * ## Why
 *
 * The CSV importer used to turn `DD/MM/YYYY` into `new Date(y, m, d)` — a
 * *local* midnight — and then serialised it with `.toISOString()`. From Paris
 * that produces the **previous** day: `01/06/2026` was stored as
 * `2026-05-31 22:00:00` (23:00 outside DST).
 *
 * Every UTC-based read is then wrong by a day:
 *   - a budget plan starting on the 1st drops the whole 1st
 *     (`t.date >= '2026-06-01 00:00'` misses `2026-05-31 22:00`), and
 *   - `TO_CHAR(t.date, 'YYYY-MM')` files that day under the previous month.
 *
 * The importer is fixed (`frontend/src/views/ImportPage.vue`); this script
 * repairs the rows written before the fix.
 *
 * ## Algorithm
 *
 *   1. Read every transaction.
 *   2. Re-anchor each date on UTC midnight of the calendar day it *means* —
 *      the day it reads as in the import timezone (`IMPORT_TIMEZONE`, default
 *      `Europe/Paris`). A row already at UTC midnight resolves to the same
 *      day, so the script is idempotent.
 *   3. Recompute the hash for every row: the hash formula embeds
 *      `date.toISOString()`, so a moved date must be rehashed or the next
 *      import of the same CSV re-inserts it as a "new" transaction.
 *      Duplicate groups keep the `:N` suffix scheme of `planRehash`.
 *   4. Validate hash uniqueness in memory before touching the DB.
 *   5. Apply date + hash in a single Postgres transaction, then verify
 *      COUNT(*) === COUNT(DISTINCT hash).
 *
 * ## Usage
 *
 *   # Loads .env automatically. For Supabase prod, prefer DIRECT_URL
 *   # (session mode, port 5432) over DATABASE_URL (pooler, port 6543).
 *   pnpm ts-node src/scripts/normalize-transaction-dates.ts --dry-run
 *   pnpm ts-node src/scripts/normalize-transaction-dates.ts
 *
 * `--dry-run` reports what would change and writes nothing.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma'
import {
  assertUniqueHashes,
  planRehash,
  type RehashRow,
  type RehashUpdate,
} from './rehash-transactions'

/** Timezone the CSV dates were authored in. Bankin exports are French. */
const DEFAULT_IMPORT_TIMEZONE = 'Europe/Paris'

export interface DateUpdate extends RehashUpdate {
  newDate: Date
}

/**
 * The calendar day `date` denotes when read in `timeZone`, re-anchored on UTC
 * midnight.
 *
 * `2026-05-31T22:00:00Z` reads as `2026-06-01` in Paris → `2026-06-01T00:00Z`.
 * `2026-06-01T00:00:00Z` reads as `2026-06-01` too (01:00 local) → unchanged,
 * which is what makes the script safe to re-run.
 */
export function normalizeToUtcMidnight(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const get = (type: 'year' | 'month' | 'day'): number => {
    const part = parts.find(p => p.type === type)
    if (!part) throw new Error(`Intl did not yield a "${type}" part`)
    return Number(part.value)
  }

  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')))
}

/**
 * Build the full list of (date, hash) updates.
 *
 * Dates are normalized first, then hashes are planned over the *normalized*
 * rows so the duplicate-group numbering matches the values actually written.
 */
export function planNormalization(
  rows: RehashRow[],
  timeZone: string
): DateUpdate[] {
  const normalized = rows.map(r => ({
    ...r,
    date: normalizeToUtcMidnight(r.date, timeZone),
  }))
  const dateById = new Map(normalized.map(r => [r.id, r.date]))

  return planRehash(normalized).map(u => {
    const newDate = dateById.get(u.id)
    if (!newDate) throw new Error(`No normalized date for transaction ${u.id}`)
    return { ...u, newDate }
  })
}

/** Updates whose date actually moves — the only ones worth reporting. */
export function movedDates(
  rows: RehashRow[],
  updates: DateUpdate[]
): DateUpdate[] {
  const originalById = new Map(rows.map(r => [r.id, r.date.getTime()]))
  return updates.filter(u => originalById.get(u.id) !== u.newDate.getTime())
}

export async function main(
  prisma: PrismaClient,
  options: { dryRun: boolean; timeZone: string }
): Promise<void> {
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
    console.log('No transactions to normalize.')
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

  const updates = planNormalization(rows, options.timeZone)
  assertUniqueHashes(updates)

  const moved = movedDates(rows, updates)
  console.log(
    `${txs.length} transactions read (timezone: ${options.timeZone}). ` +
      `${moved.length} dates need re-anchoring.`
  )
  for (const u of moved.slice(0, 10)) {
    const before = rows.find(r => r.id === u.id)!.date
    console.log(`  ${before.toISOString()} → ${u.newDate.toISOString()}`)
  }
  if (moved.length > 10) console.log(`  … and ${moved.length - 10} more`)

  if (options.dryRun) {
    console.log('Dry run: nothing written.')
    return
  }
  if (moved.length === 0) {
    console.log('Nothing to do.')
    return
  }

  console.log(`Writing ${updates.length} rows in one transaction...`)
  const batchSize = 200
  await prisma.$transaction(
    async tx => {
      for (let i = 0; i < updates.length; i += batchSize) {
        const slice = updates.slice(i, i + batchSize)
        await Promise.all(
          slice.map(u =>
            tx.transaction.update({
              where: { id: u.id },
              data: { date: u.newDate, hash: u.newHash },
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
  const distinct = (
    await prisma.transaction.groupBy({ by: ['hash'], _count: { _all: true } })
  ).length

  if (total !== distinct) {
    throw new Error(
      `Post-normalization invariant violated: total=${total}, distinct hashes=${distinct}.`
    )
  }

  console.log(`Done. ${total} transactions normalized, all hashes unique.`)
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
  main(prisma, {
    dryRun: process.argv.includes('--dry-run'),
    timeZone: process.env.IMPORT_TIMEZONE ?? DEFAULT_IMPORT_TIMEZONE,
  })
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
      await pool.end()
    })
}
