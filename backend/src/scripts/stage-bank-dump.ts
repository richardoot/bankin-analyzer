/**
 * Phase 2: put a fetched bank dump into staging, and report what it would do
 * to the ledger — without doing any of it.
 *
 * ## Why it reads a file rather than the bank
 *
 * Most ASPSPs allow four background fetches a day. Re-fetching to try a
 * different matching rule is therefore not available, and a matcher that
 * cannot be re-run is a matcher that cannot be tuned. So the fetch
 * (`spike-enable-banking-fetch.ts`) and the decision (this) are separate: the
 * dump is staged once, and the rules are argued with as often as needed.
 *
 * ## What it will not do
 *
 * Write to `app.transactions`. It writes to the staging tables and reads the
 * ledger, nothing else. The report is the deliverable: the counts below are
 * what decides whether phase 4 may ingest a bank at all.
 *
 *   already linked  the sync has seen it; leave it alone
 *   matched         a CSV row is the same movement; phase 4 would link them
 *   ambiguous       several rows fit; a human has to choose
 *   new             nothing in the ledger looks like it
 *
 * ## Usage
 *
 *   # Local Docker database (what backend/.env points at):
 *   pnpm ts-node src/scripts/stage-bank-dump.ts <dump.json> --email you@example.com
 *
 *   # Against a copy of production:
 *   DOTENV_CONFIG_PATH=.env.production.local \
 *     pnpm ts-node src/scripts/stage-bank-dump.ts <dump.json> --email …
 *
 * `--dry-run` reports without writing the staging rows either.
 * `--samples N` caps how many examples each section prints (default 8).
 */
import { readFileSync } from 'fs'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma'
import {
  findDuplicateGroups,
  reconcileAll,
  summarize,
  type AssignedVerdict,
  type LedgerTransaction,
  type StagedTransaction,
} from '../bank-sync/reconciliation'
import {
  signedAmount,
  transactionDate,
  transactionLabel,
  type BankTransaction,
} from './spike-enable-banking-fetch'

/** The file `spike-enable-banking-fetch.ts` writes. */
interface Dump {
  session?: string
  reports: { accountUid: string; accountName: string }[]
  dump: Record<string, BankTransaction[]>
}

const DEFAULT_SAMPLES = 8

/**
 * Turn the raw payload into what the matcher needs, dropping what it cannot
 * use. A transaction with no date or no signed amount cannot be matched on
 * anything, and guessing either is how a wrong link gets written.
 */
export function toStaged(
  transactionsByAccount: Record<string, BankTransaction[]>,
  accountNames: Record<string, string>
): { staged: StagedTransaction; accountName: string; raw: BankTransaction }[] {
  const rows: {
    staged: StagedTransaction
    accountName: string
    raw: BankTransaction
  }[] = []

  for (const [uid, transactions] of Object.entries(transactionsByAccount)) {
    for (const raw of transactions) {
      const date = transactionDate(raw)
      const amount = signedAmount(raw)
      if (date === null || amount === null) continue

      rows.push({
        staged: {
          externalAccountId: uid,
          externalId: raw.entry_reference ?? null,
          date,
          amount,
          label: transactionLabel(raw),
        },
        accountName: accountNames[uid] ?? uid,
        raw,
      })
    }
  }
  return rows
}

function buildPrismaClient(): { prisma: PrismaClient; pool: Pool } {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL or DIRECT_URL must be set (load .env or export it).'
    )
  }
  const pool = new Pool({ connectionString })
  return { prisma: new PrismaClient({ adapter: new PrismaPg(pool) }), pool }
}

export async function main(
  prisma: PrismaClient,
  options: {
    dumpPath: string
    email: string
    dryRun: boolean
    samples: number
  }
): Promise<void> {
  const parsed = JSON.parse(readFileSync(options.dumpPath, 'utf8')) as Dump
  const accountNames: Record<string, string> = {}
  for (const report of parsed.reports) {
    accountNames[report.accountUid] = report.accountName
  }

  const user = await prisma.user.findUnique({ where: { email: options.email } })
  if (!user) throw new Error(`No user with email ${options.email}`)

  const rows = toStaged(parsed.dump, accountNames)
  console.log(
    `\n${rows.length} transactions in the dump, across ${Object.keys(parsed.dump).length} accounts`
  )

  // 1. The check that only makes sense before anything is matched: one
  //    purchase reported by two accounts of the same bank. Neither the ledger
  //    nor `entry_reference` can see it.
  const duplicates = findDuplicateGroups(rows.map(r => r.staged))
  console.log(`\n=== Reported by more than one account ===`)
  if (duplicates.length === 0) {
    console.log('  none')
  } else {
    console.log(
      `  ${duplicates.length} purchases. Ingesting every account of this bank\n` +
        '  would count each of them twice.'
    )
    for (const group of duplicates.slice(0, options.samples)) {
      const names = group.externalAccountIds
        .map(uid => accountNames[uid] ?? uid)
        .join('  ⇄  ')
      console.log(
        `    ${group.date}  ${group.amount.toFixed(2).padStart(9)}  ${group.label.slice(0, 32).padEnd(32)}  ${names}`
      )
    }
  }

  // 2. Stage, unless asked not to. One run per invocation, so re-staging the
  //    same dump never mixes with an earlier attempt.
  let runId: string | null = null
  if (!options.dryRun) {
    const run = await prisma.bankSyncRun.create({
      data: {
        userId: user.id,
        aspspName: parsed.reports[0]?.accountName ?? 'unknown',
        sessionId: parsed.session ?? null,
        fetchedAt: new Date(),
      },
      select: { id: true },
    })
    runId = run.id

    await prisma.bankStagedTransaction.createMany({
      data: rows.map(({ staged, accountName, raw }) => ({
        runId: run.id,
        userId: user.id,
        externalAccountId: staged.externalAccountId,
        accountName,
        externalId: staged.externalId,
        bookingStatus: raw.status ?? null,
        date: new Date(staged.date),
        amount: staged.amount,
        label: staged.label,
        raw: raw as unknown as object,
      })),
      skipDuplicates: true,
    })
    console.log(`\nStaged under run ${run.id}`)
  }

  // 3. Reconcile against the ledger, account by account.
  //
  // The ledger is read whole and grouped in memory rather than queried per
  // transaction: a few thousand rows is nothing, and thousands of round trips
  // would be.
  const ledgerRows = await prisma.transaction.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      accountId: true,
      date: true,
      amount: true,
      description: true,
      externalId: true,
    },
  })
  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    select: { id: true, name: true },
  })
  const accountNameById = new Map(accounts.map(a => [a.id, a.name]))

  const ledger: LedgerTransaction[] = ledgerRows.map(row => ({
    id: row.id,
    accountId: row.accountId,
    date: row.date.toISOString().slice(0, 10),
    amount: Number(row.amount),
    description: row.description,
    externalId: row.externalId,
  }))

  console.log(`\nLedger: ${ledger.length} transactions`)

  // Which database account each bank account corresponds to is exactly what
  // phase 4 has to establish and nothing records yet. Until then the whole
  // ledger is offered as candidates, which makes this report optimistic about
  // matches and pessimistic about nothing — good enough to size the work, not
  // good enough to ingest on.
  console.log(
    '\n  NOTE: no mapping exists yet between bank accounts and database\n' +
      '  accounts, so every ledger row is a candidate. Real ingestion must\n' +
      '  restrict candidates to the matching account.\n'
  )

  // Reconciled as a whole rather than one at a time: asked separately, two
  // fetched transactions will claim the same ledger row, and against the real
  // ledger 759 rows were claimed more than once — one of them six times.
  const verdicts: AssignedVerdict[] = reconcileAll(
    rows.map(r => r.staged),
    ledger
  )
  const summary = summarize(verdicts)

  console.log('=== Reconciliation ===')
  const pct = (n: number): string =>
    summary.total === 0 ? '—' : `${Math.round((n / summary.total) * 100)}%`
  console.log(
    `  already linked : ${summary.alreadyLinked} (${pct(summary.alreadyLinked)})`
  )
  console.log(`  matched        : ${summary.matched} (${pct(summary.matched)})`)
  console.log(
    `  duplicate      : ${summary.duplicate} (${pct(summary.duplicate)})`
  )
  console.log(
    `  ambiguous      : ${summary.ambiguous} (${pct(summary.ambiguous)})`
  )
  console.log(`  new            : ${summary.new} (${pct(summary.new)})`)

  // The invariant the assignment exists to hold, stated rather than assumed:
  // a silent regression here is a duplicated ledger.
  const claimed = verdicts.flatMap(verdict =>
    verdict.kind === 'matched' || verdict.kind === 'alreadyLinked'
      ? [verdict.transactionId]
      : []
  )
  const distinct = new Set(claimed).size
  console.log(
    `\n  ledger rows claimed: ${distinct} by ${claimed.length} transactions` +
      (distinct === claimed.length ? '  ✓ one each' : '  ⚠ CONTESTED')
  )

  const byId = new Map(ledger.map(row => [row.id, row]))
  const shown = verdicts
    .map((verdict, index) => ({ verdict, row: rows[index] }))
    .filter(entry => entry.verdict.kind === 'matched')
    .slice(0, options.samples)

  if (shown.length > 0) {
    console.log('\n— matched (bank → ledger) —')
    for (const { verdict, row } of shown) {
      if (verdict.kind !== 'matched' || !row) continue
      const target = byId.get(verdict.transactionId)
      console.log(
        `  [${verdict.similarity.toFixed(2)}] "${row.staged.label.slice(0, 46)}"`
      )
      console.log(
        `         → "${target?.description.slice(0, 46)}"  [${accountNameById.get(target?.accountId ?? '') ?? '?'}]`
      )
    }
  }

  const ambiguous = verdicts.filter(v => v.kind === 'ambiguous')
  if (ambiguous.length > 0) {
    console.log(
      `\n  ${ambiguous.length} need a human. That is the arbitration screen phase 3 owes.`
    )
  }

  if (runId) {
    console.log(
      `\nStaging rows kept under run ${runId}. Nothing was written to\n` +
        'app.transactions — that is phase 4.\n'
    )
  }
}

// Run only when executed directly (not when imported by tests).
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config')

  const args = process.argv.slice(2)
  const flag = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`)
    return index === -1 ? undefined : args[index + 1]
  }

  const dumpPath = args[0]
  const email = flag('email')
  if (!dumpPath || dumpPath.startsWith('--') || !email) {
    console.error(
      'Usage: pnpm ts-node src/scripts/stage-bank-dump.ts <dump.json> --email <address>\n' +
        '       [--dry-run] [--samples N]'
    )
    process.exit(1)
  }

  const { prisma, pool } = buildPrismaClient()
  main(prisma, {
    dumpPath,
    email,
    dryRun: args.includes('--dry-run'),
    samples: Number(flag('samples') ?? DEFAULT_SAMPLES),
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
