/**
 * Undo one bank sync run.
 *
 * A CSV import knows what created a row (`importHistoryId`); a synced row
 * used to know nothing — `BankSyncRun` existed and nothing referenced it
 * back, so a bad fetch (the wrong account enabled, a mapping fixed a moment
 * too late) had no way out but hand-editing the ledger. `Transaction.syncRunId`
 * closes that: every row a run touched now says so, and this undoes exactly
 * those rows and nothing else.
 *
 * ## What undoing means
 *
 * `source` already tells the two things a run can have done to a row apart:
 *
 * - `BANK_API` — the run inserted it. Undoing deletes it, the same way it
 *   arrived.
 * - anything else (`BANKIN_CSV`) — the run only *claimed* it: an existing row
 *   gained `externalId` and `bookingStatus`, nothing more. Undoing clears
 *   exactly those two fields plus `syncRunId`, restoring the row to how the
 *   CSV left it — category, note, tags, reimbursements, all untouched because
 *   they were never touched.
 *
 * A row the run only *re-recognised* (`alreadyLinked`, already claimed or
 * inserted by an earlier run) was never written to by this run, so its
 * `syncRunId` still names that earlier run and this leaves it alone.
 *
 * ## The one refusal
 *
 * An inserted row the user has since reimbursed, tagged, settled, or paid
 * against carries work of its own now, and deleting it would take that work
 * with it silently — the exact failure `bank-sync-ingestion.e2e-spec.ts`
 * exists to prevent for the sync itself. This script holds the same line: a
 * blocked row is reported and left exactly as it is, never deleted.
 *
 * ## Usage
 *
 *   # Report what undoing this run would do. Writes nothing.
 *   pnpm ts-node src/scripts/undo-bank-sync-run.ts <runId>
 *
 *   # Then, and only then:
 *   … --apply
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient, TransactionSource } from '../generated/prisma'

function buildPrismaClient(): { prisma: PrismaClient; pool: Pool } {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString)
    throw new Error('DATABASE_URL or DIRECT_URL must be set.')
  const pool = new Pool({ connectionString })
  return { prisma: new PrismaClient({ adapter: new PrismaPg(pool) }), pool }
}

export async function main(
  prisma: PrismaClient,
  options: { runId: string; apply: boolean }
): Promise<void> {
  const run = await prisma.bankSyncRun.findUnique({
    where: { id: options.runId },
    select: { id: true, aspspName: true, fetchedAt: true },
  })
  if (!run) throw new Error(`No such bank sync run: ${options.runId}`)

  const touched = await prisma.transaction.findMany({
    where: { syncRunId: run.id },
    select: {
      id: true,
      source: true,
      description: true,
      date: true,
      amount: true,
      _count: {
        select: {
          reimbursementRequests: true,
          settlementsAsIncome: true,
          tags: true,
          reimbursementPayments: true,
        },
      },
    },
  })

  const inserted = touched.filter(t => t.source === TransactionSource.BANK_API)
  const claimed = touched.filter(t => t.source !== TransactionSource.BANK_API)

  const carriesWork = (t: (typeof inserted)[number]): boolean =>
    t._count.reimbursementRequests > 0 ||
    t._count.settlementsAsIncome > 0 ||
    t._count.tags > 0 ||
    t._count.reimbursementPayments > 0

  const blocked = inserted.filter(carriesWork)
  const deletable = inserted.filter(t => !carriesWork(t))

  console.log(
    `\n=== Run ${run.id} (${run.aspspName}, fetched ` +
      `${run.fetchedAt.toISOString().slice(0, 16).replace('T', ' ')}) ===`
  )
  console.log(`  inserted, to delete : ${deletable.length}`)
  console.log(`  claimed, to unlink  : ${claimed.length}`)
  if (blocked.length > 0) {
    console.log(
      `  inserted, BLOCKED   : ${blocked.length}  (carry work since — left alone)`
    )
    for (const t of blocked) {
      console.log(
        `    ${t.date.toISOString().slice(0, 10)}  ${String(t.amount).padStart(10)}  ${t.description}`
      )
    }
  }

  if (deletable.length === 0 && claimed.length === 0) {
    console.log('\nNothing to undo — this run touched no transaction.\n')
    return
  }

  if (!options.apply) {
    console.log(
      '\nDry run — nothing was written. Add --apply to commit this.\n'
    )
    return
  }

  await prisma.$transaction(async tx => {
    if (deletable.length > 0) {
      await tx.transaction.deleteMany({
        where: { id: { in: deletable.map(t => t.id) } },
      })
    }
    if (claimed.length > 0) {
      await tx.transaction.updateMany({
        where: { id: { in: claimed.map(t => t.id) } },
        data: { externalId: null, bookingStatus: null, syncRunId: null },
      })
    }
  })

  console.log(
    `\nUndone: ${deletable.length} deleted, ${claimed.length} unlinked.` +
      (blocked.length > 0
        ? ` ${blocked.length} left alone — they carry work since the sync.`
        : '') +
      '\n'
  )
}

// Run only when executed directly (not when imported by tests).
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config')

  const args = process.argv.slice(2)
  const runId = args[0]
  if (!runId || runId.startsWith('--')) {
    console.error(
      'Usage: pnpm ts-node src/scripts/undo-bank-sync-run.ts <runId> [--apply]'
    )
    process.exit(1)
  }

  const { prisma, pool } = buildPrismaClient()
  main(prisma, { runId, apply: args.includes('--apply') })
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
      await pool.end()
    })
}
