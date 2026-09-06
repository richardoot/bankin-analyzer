/**
 * Phase 4: write a fetch into the ledger — the first step of this project that
 * changes `app.transactions`.
 *
 * ## Two passes, and why
 *
 * The first pass has no account mapping, so every ledger row is a candidate.
 * That is deliberately too permissive, and it is not used to decide anything:
 * it exists to *learn* where each bank account's transactions land. The second
 * pass runs with the mapping it produced, restricted to the accounts the user
 * has enabled, and only that pass is allowed to write.
 *
 * ## What writing means here
 *
 * A `matched` transaction is not inserted. The ledger row already exists —
 * possibly carrying a reimbursement, a tag, a category the user fixed by hand —
 * so it is *claimed*: it gains the bank's reference and booking status and
 * keeps everything else, including `source`, because a row that came from a
 * CSV came from a CSV. Nothing is ever deleted and recreated.
 *
 * A `new` transaction is inserted unfiled. The bank sends no category and no
 * merchant code — phase 2 measured MCC at zero on all three banks — and
 * inventing one would be worse than leaving it blank: an unfiled transaction
 * is visible and one click from correct, a wrongly filed one is invisible and
 * distorts every total it touches. Phase 6 owes the categorisation.
 *
 * `duplicate` and `ambiguous` are written nowhere. The first is a purchase
 * another fetched row already describes; the second is a question for a person.
 *
 * ## Usage
 *
 *   # Learn the mapping and report. Writes nothing.
 *   pnpm ts-node src/scripts/ingest-bank-run.ts <dump.json> --email you@example.com
 *
 *   # Turn on the accounts worth reading, by their bank id from the report.
 *   … --enable <externalAccountId>,<externalAccountId>
 *
 *   # Then, and only then:
 *   … --apply
 */
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient, TransactionSource } from '../generated/prisma'
import {
  mappingFromProposals,
  proposeMapping,
  type MappingProposal,
} from '../bank-sync/account-mapping'
import {
  reconcileAll,
  summarize,
  type AssignedVerdict,
  type LedgerTransaction,
} from '../bank-sync/reconciliation'
import { toStaged } from './stage-bank-dump'
import type { BankTransaction } from './spike-enable-banking-fetch'

interface Dump {
  session?: string
  aspsp?: string | null
  aspspCountry?: string | null
  consentValidUntil?: string | null
  /** What `/accounts/{uid}/details` said about each account, when it was asked. */
  accounts?: {
    uid?: string
    name?: string
    product?: string
    cash_account_type?: string
    account_id?: { iban?: string }
    identification_hash?: string
  }[]
  reports: { accountUid: string; accountName: string }[]
  dump: Record<string, BankTransaction[]>
}

/**
 * The same formula `TransactionsService.computeHash` uses.
 *
 * Duplicated rather than imported: that method is private to a Nest service
 * and this runs outside the container. The duplication is deliberate and worth
 * it — sharing the hash means a CSV import of a month already synced collides
 * on it and is skipped, so the two sources cannot double each other even if
 * every other guard fails.
 */
function computeHash(
  userId: string,
  date: Date,
  amount: number,
  accountId: string,
  description: string
): string {
  return createHash('sha256')
    .update(
      `${userId}|${date.toISOString()}|${amount}|${accountId}|${description}`
    )
    .digest('hex')
}

function buildPrismaClient(): { prisma: PrismaClient; pool: Pool } {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString)
    throw new Error('DATABASE_URL or DIRECT_URL must be set.')
  const pool = new Pool({ connectionString })
  return { prisma: new PrismaClient({ adapter: new PrismaPg(pool) }), pool }
}

function printProposals(
  proposals: MappingProposal[],
  accountNameById: Map<string, string>,
  enabled: Set<string>,
  typeByUid: Map<string, string | undefined>
): void {
  console.log('\n=== Bank accounts ===')
  for (const proposal of proposals) {
    const target =
      proposal.proposedAccountId === null
        ? 'UNRESOLVED'
        : (accountNameById.get(proposal.proposedAccountId) ?? '?')
    const flag = enabled.has(proposal.externalAccountId) ? 'INGESTED' : 'off'
    const type = typeByUid.get(proposal.externalAccountId) ?? '????'
    console.log(
      `  ${type}  ${proposal.accountName.slice(0, 32).padEnd(34)} ${String(proposal.total).padStart(5)} tx` +
        `  →  ${target.padEnd(22)} ${Math.round(proposal.confidence * 100)}% of ${proposal.matched}   [${flag}]`
    )
    console.log(`      id: ${proposal.externalAccountId}`)
    if (type === 'CARD') {
      console.log(
        '      a card account: its purchases are reported by the account it'
      )
      console.log(
        '      settles onto, so ingesting both counts each of them twice'
      )
    }
  }
}

export async function main(
  prisma: PrismaClient,
  options: {
    dumpPath: string
    email: string
    enable: string[]
    /**
     * Explicit `externalAccountId=account` pairs, by id or by name.
     *
     * The evidence-based proposal needs matches to reason from, and an account
     * the CSV never covered has none — Revolut overlapped the ledger on four
     * transactions out of 91. Without a way to say the mapping out loud, such
     * an account could never be ingested at all.
     */
    map: string[]
    /**
     * Ingest a `CARD` account anyway.
     *
     * Right for a deferred-debit card, which posts one monthly total to the
     * current account rather than each purchase — there, ignoring the card
     * loses every line of detail. Wrong for an immediate-debit card, which is
     * what Boursorama returned.
     */
    allowCardAccounts: boolean
    apply: boolean
  }
): Promise<void> {
  const parsed = JSON.parse(readFileSync(options.dumpPath, 'utf8')) as Dump
  const bankAccountNames = new Map<string, string>()
  for (const report of parsed.reports) {
    bankAccountNames.set(report.accountUid, report.accountName)
  }

  const user = await prisma.user.findUnique({ where: { email: options.email } })
  if (!user) throw new Error(`No user with email ${options.email}`)

  const rows = toStaged(parsed.dump, Object.fromEntries(bankAccountNames))
  const staged = rows.map(row => row.staged)

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
  const ledger: LedgerTransaction[] = ledgerRows.map(row => ({
    id: row.id,
    accountId: row.accountId,
    date: row.date.toISOString().slice(0, 10),
    amount: Number(row.amount),
    description: row.description,
    externalId: row.externalId,
  }))
  const accountIdOf = new Map(ledgerRows.map(row => [row.id, row.accountId]))
  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    select: { id: true, name: true },
  })
  const accountNameById = new Map(accounts.map(a => [a.id, a.name]))

  // Pass 1 — learn where each bank account's money lands. Too permissive to
  // act on, which is why nothing here is written.
  const exploratory = reconcileAll(staged, ledger)
  const proposals = proposeMapping(
    staged,
    exploratory,
    id => accountIdOf.get(id),
    bankAccountNames
  )

  // Record what we know about the bank, so the mapping survives this run.
  const connection = await prisma.bankConnection.upsert({
    where: { id: (await findConnectionId(prisma, user.id, parsed)) ?? '' },
    create: {
      userId: user.id,
      aspspName: aspspNameOf(parsed),
      aspspCountry: parsed.aspspCountry ?? 'FR',
      sessionId: parsed.session ?? null,
      consentValidUntil: parsed.consentValidUntil
        ? new Date(parsed.consentValidUntil)
        : null,
    },
    update: {
      sessionId: parsed.session ?? null,
      ...(parsed.consentValidUntil
        ? { consentValidUntil: new Date(parsed.consentValidUntil) }
        : {}),
    },
    select: { id: true },
  })

  // A mapping stated by a person outranks one inferred from the data.
  const stated = new Map<string, string>()
  for (const pair of options.map) {
    const [externalAccountId, target] = pair.split('=')
    if (!externalAccountId || !target) continue
    const resolved =
      accounts.find(a => a.id === target) ??
      accounts.find(a => a.name === target)
    if (!resolved) throw new Error(`No account named or numbered "${target}"`)
    stated.set(externalAccountId, resolved.id)
  }

  const detailsByUid = new Map(
    (parsed.accounts ?? [])
      .filter(account => account.uid)
      .map(account => [account.uid as string, account])
  )

  const enabled = new Set(options.enable)
  for (const proposal of proposals) {
    const details = detailsByUid.get(proposal.externalAccountId)
    await prisma.bankAccountLink.upsert({
      where: {
        connectionId_externalAccountId: {
          connectionId: connection.id,
          externalAccountId: proposal.externalAccountId,
        },
      },
      create: {
        connectionId: connection.id,
        userId: user.id,
        externalAccountId: proposal.externalAccountId,
        accountName: proposal.accountName,
        accountId:
          stated.get(proposal.externalAccountId) ?? proposal.proposedAccountId,
        isIngested: enabled.has(proposal.externalAccountId),
        cashAccountType: details?.cash_account_type ?? null,
        product: details?.product ?? null,
        iban: details?.account_id?.iban ?? null,
        identificationHash: details?.identification_hash ?? null,
      },
      // The proposal never overwrites a mapping already made: a person who
      // corrected it outranks the evidence that got it wrong.
      // Only what was actually asked for is updated. A spread of a possibly
      // undefined value would, under exactOptionalPropertyTypes, offer Prisma
      // an `accountId: undefined` — which reads as "set it to nothing" and
      // would erase a mapping rather than leave it be.
      update: {
        ...buildLinkUpdate(
          enabled.size > 0
            ? enabled.has(proposal.externalAccountId)
            : undefined,
          stated.get(proposal.externalAccountId)
        ),
        // Refreshed on every run: a bank may name an account differently, and
        // the type is what the ingestion default rests on.
        ...(details?.cash_account_type
          ? { cashAccountType: details.cash_account_type }
          : {}),
        ...(details?.product ? { product: details.product } : {}),
        ...(details?.account_id?.iban ? { iban: details.account_id.iban } : {}),
      },
    })
  }

  const links = await prisma.bankAccountLink.findMany({
    where: { connectionId: connection.id },
    select: { externalAccountId: true, accountId: true, isIngested: true },
  })
  const typeByUid = new Map(
    proposals.map(proposal => [
      proposal.externalAccountId,
      detailsByUid.get(proposal.externalAccountId)?.cash_account_type,
    ])
  )
  printProposals(
    proposals,
    accountNameById,
    new Set(links.filter(l => l.isIngested).map(l => l.externalAccountId)),
    typeByUid
  )

  // A card account turned on beside the account it settles onto is the one
  // mistake this whole phase exists to prevent — 597 purchases counted twice
  // in a single Boursorama session. The type says so outright, where no amount
  // of transaction matching could: the two genuinely share their transactions.
  //
  // Refused rather than warned about. A warning in a wall of output is a
  // warning nobody reads, and the cost of being wrong here is a ledger that
  // has to be rebuilt.
  const cardsEnabled = [...enabled].filter(
    uid => detailsByUid.get(uid)?.cash_account_type === 'CARD'
  )
  if (cardsEnabled.length > 0 && !options.allowCardAccounts) {
    const names = cardsEnabled
      .map(uid => detailsByUid.get(uid)?.name ?? uid)
      .join(', ')
    throw new Error(
      `Refusing to ingest a card account: ${names}.\n\n` +
        'Its purchases are already reported by the current account it settles\n' +
        'onto, so both together count each of them twice. Ingest the current\n' +
        'account instead — or pass --allow-card-accounts if this card settles\n' +
        'monthly rather than per purchase, in which case nothing is repeated.'
    )
  }

  const ingestable = new Set(
    links.filter(l => l.isIngested && l.accountId).map(l => l.externalAccountId)
  )
  if (ingestable.size === 0) {
    console.log(
      '\nNo account is enabled, so nothing would be written.\n' +
        'Enable one with --enable <id> using the ids above — and prefer the\n' +
        'current accounts: a card account repeats what they already report.\n'
    )
    return
  }

  // Pass 2 — the one that counts, scoped to the mapping and to the accounts
  // the user turned on.
  const mapping = mappingFromProposals(proposals)
  const scopedMapping: Record<string, string> = {}
  for (const link of links) {
    if (link.isIngested && link.accountId) {
      scopedMapping[link.externalAccountId] = link.accountId
    }
  }
  const considered = rows
    .map((row, index) => ({ row, index }))
    .filter(entry => ingestable.has(entry.row.staged.externalAccountId))

  const verdicts: AssignedVerdict[] = reconcileAll(
    considered.map(e => e.row.staged),
    ledger,
    { accountIdByExternalAccountId: { ...mapping, ...scopedMapping } }
  )
  const summary = summarize(verdicts)

  console.log('\n=== What would be written ===')
  console.log(`  considered     : ${summary.total}`)
  console.log(`  already linked : ${summary.alreadyLinked}  (left alone)`)
  console.log(
    `  claim existing : ${summary.matched}  (gain the bank reference)`
  )
  console.log(`  insert new     : ${summary.new}`)
  console.log(`  duplicate      : ${summary.duplicate}  (skipped)`)
  console.log(
    `  ambiguous      : ${summary.ambiguous}  (skipped, needs a person)`
  )

  if (!options.apply) {
    console.log(
      '\nDry run — nothing was written. Add --apply to commit this.\n'
    )
    return
  }

  const run = await prisma.bankSyncRun.create({
    data: {
      userId: user.id,
      aspspName: aspspNameOf(parsed),
      sessionId: parsed.session ?? null,
      fetchedAt: new Date(),
    },
    select: { id: true },
  })

  // See `BankSyncService.ingest`: an account with its own history is never
  // backfilled earlier than the earliest it already has, so a re-run of a
  // deep fetch cannot revise a month already considered settled. An account
  // with nothing yet has no such floor — that is exactly where the deep
  // history is worth having.
  const earliestByAccount = new Map<string, string>()
  for (const row of ledger) {
    const current = earliestByAccount.get(row.accountId)
    if (!current || row.date < current) {
      earliestByAccount.set(row.accountId, row.date)
    }
  }

  let claimed = 0
  let inserted = 0
  let skippedTooOld = 0

  await prisma.$transaction(async tx => {
    for (const [position, verdict] of verdicts.entries()) {
      const entry = considered[position]
      if (!entry) continue
      const { staged: s } = entry.row

      if (verdict.kind === 'matched') {
        // Claimed, never recreated: the row may already carry a reimbursement,
        // a tag, or a category corrected by hand. `source` is left as it is —
        // a row that came from a CSV came from a CSV.
        await tx.transaction.update({
          where: { id: verdict.transactionId },
          data: {
            externalId: s.externalId,
            bookingStatus: entry.row.raw.status ?? null,
            syncRunId: run.id,
          },
        })
        claimed++
        continue
      }

      if (verdict.kind !== 'new') continue

      const accountId = scopedMapping[s.externalAccountId]
      if (!accountId) continue

      const floor = earliestByAccount.get(accountId)
      if (floor && s.date < floor) {
        skippedTooOld++
        continue
      }

      const date = new Date(s.date)
      await tx.transaction.create({
        data: {
          userId: user.id,
          accountId,
          hash: computeHash(user.id, date, s.amount, accountId, s.label),
          date,
          description: s.label,
          amount: s.amount,
          type: s.amount < 0 ? 'EXPENSE' : 'INCOME',
          source: TransactionSource.BANK_API,
          externalId: s.externalId,
          bookingStatus: entry.row.raw.status ?? null,
          syncRunId: run.id,
        },
      })
      inserted++
    }

    await tx.bankConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date() },
    })
  })

  console.log(
    `\nApplied under run ${run.id}: ${claimed} claimed, ${inserted} inserted` +
      (skippedTooOld > 0
        ? `, ${skippedTooOld} skipped (older than the account's own history)`
        : '') +
      '.\nInserted rows are unfiled — the bank sends no category. Phase 6 owes\n' +
      'that, and until then they are visible and one click from correct.\n'
  )
}

/** The fields of a link an operator asked to change, and only those. */
function buildLinkUpdate(
  isIngested: boolean | undefined,
  accountId: string | undefined
): { isIngested?: boolean; accountId?: string } {
  const update: { isIngested?: boolean; accountId?: string } = {}
  if (isIngested !== undefined) update.isIngested = isIngested
  if (accountId !== undefined) update.accountId = accountId
  return update
}

/**
 * The bank a dump came from.
 *
 * Falls back to the first account's label only for dumps written before the
 * name travelled with them; that fallback names a connection after an account,
 * which is wrong in a way worth noticing rather than hiding.
 */
function aspspNameOf(parsed: Dump): string {
  return parsed.aspsp ?? parsed.reports[0]?.accountName ?? 'unknown'
}

/** The connection for this bank, if one was already recorded. */
async function findConnectionId(
  prisma: PrismaClient,
  userId: string,
  parsed: Dump
): Promise<string | null> {
  const existing = await prisma.bankConnection.findFirst({
    where: { userId, aspspName: aspspNameOf(parsed) },
    select: { id: true },
  })
  return existing?.id ?? null
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
      'Usage: pnpm ts-node src/scripts/ingest-bank-run.ts <dump.json> --email <address>\n' +
        '       [--enable <id,id>] [--map <bankId>=<account>]\n' +
        '       [--allow-card-accounts] [--apply]'
    )
    process.exit(1)
  }

  const { prisma, pool } = buildPrismaClient()
  main(prisma, {
    dumpPath,
    email,
    enable: (flag('enable') ?? '').split(',').filter(Boolean),
    map: args.flatMap((arg, i) => (arg === '--map' ? [args[i + 1] ?? ''] : [])),
    allowCardAccounts: args.includes('--allow-card-accounts'),
    apply: args.includes('--apply'),
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
