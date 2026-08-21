/**
 * Read-only audit answering one question: can the reimbursement data be moved
 * to the payment-based model without losing anything?
 *
 * ## Why
 *
 * The target model replaces `ReimbursementRequest.amountReceived` / `status`
 * and the `Settlement` + `SettlementReimbursement` pair with a single ledger of
 * payments, each one either cash drawn from an income transaction (`CASH`) or a
 * forgiven remainder (`WRITE_OFF`). Everything else is derived from that ledger.
 *
 * Most of the current data maps over verbatim. This script looks only at the
 * places where it does not, so the migration script can be written against a
 * known list instead of a hope.
 *
 * ## What it checks
 *
 *   1. Force-complete splits. `amount_settled` stores the credit; the cash is
 *      only known per settlement (`amount_used`). With one line the CASH /
 *      WRITE_OFF split is arithmetic. With several lines the cash could have
 *      come from any of them, so those settlements need a human decision.
 *   2. Orphan credits. `PATCH /reimbursements/:id/receive` raises
 *      `amount_received` without leaving a join row, so it can only be
 *      recovered as a residual — and the income transaction behind it was never
 *      recorded. A *negative* residual is the opposite problem: more was
 *      reversed than credited, which the pre-fix `delete` path could do (see
 *      `audit-forced-settlements.ts`).
 *   3. Requests hanging off a non-EXPENSE transaction. Nothing validates this
 *      today; the target model makes the expense transaction the anchor of the
 *      whole deduction, so these rows must be resolved first.
 *   4. Status drift. `status` becomes derived. Rows whose stored status already
 *      contradicts their own amounts will visibly change on screen after the
 *      migration — not a loss, but a surprise worth knowing about beforehand.
 *   5. Subcategory backlog. Attributing a reimbursement to the exact
 *      subcategory needs `subcategory_id`, while the aggregation still groups
 *      on the denormalized `subcategory` string. Counts what a backfill by
 *      (category, name) would resolve, and what it would not.
 *
 * Checks 1 to 3 block the migration. Checks 4 and 5 are informational: they
 * describe work to schedule, not rows that could be lost.
 *
 * ## Usage
 *
 *   # Reads only. Loads .env automatically — that points at prod, which is
 *   # where the rows to audit live.
 *   pnpm ts-node src/scripts/audit-reimbursement-migration.ts
 *   pnpm ts-node src/scripts/audit-reimbursement-migration.ts --samples=50
 *
 * `--samples` caps how many rows each section prints (default 10). Totals and
 * the verdict always cover everything.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma'

/** Half a cent: amounts are Decimal(12,2), so anything below this is noise. */
const EPSILON = 0.005

/** Rows printed per section unless `--samples` says otherwise. */
const DEFAULT_SAMPLES = 10

export interface AuditLine {
  reimbursementId: string
  amountSettled: number
}

export interface AuditSettlement {
  id: string
  createdAt: Date
  /** Cash drawn from the income transaction. */
  amountUsed: number
  personName: string
  incomeDescription: string
  lines: AuditLine[]
}

export interface AuditReimbursement {
  id: string
  personName: string
  /** Description of the expense transaction the request hangs off. */
  description: string
  amount: number
  amountReceived: number
  status: string
  /** Type of that transaction. Anything but EXPENSE breaks the target model. */
  transactionType: string
  /** Credit recorded by settlement join rows, every settlement together. */
  settledTotal: number
  /** Income category the user picked; null once that category was deleted. */
  expectedIncomeCategoryId: string | null
}

/** One (category, subcategory-label) pair still missing its foreign key. */
export interface SubcategoryBacklogRow {
  categoryName: string
  subcategory: string
  transactionCount: number
  /** True when a Subcategory row matches on (category_id, name). */
  resolvable: boolean
}

export interface SubcategoryBacklog {
  resolvableTransactions: number
  unresolvableTransactions: number
  /** Labels a backfill by (category, name) would leave behind, biggest first. */
  unresolvable: SubcategoryBacklogRow[]
}

export interface AmbiguousSettlement {
  settlementId: string
  createdAt: Date
  personName: string
  incomeDescription: string
  lineCount: number
  amountUsed: number
  creditedTotal: number
  /** Credit with no cash behind it, to split across the lines by hand. */
  forgiven: number
}

/**
 * `unbacked`: credit recorded outside any settlement, i.e. `receivePayment`.
 * `over-reversed`: more was reversed than ever credited — pre-existing damage.
 */
export type OrphanCreditKind = 'unbacked' | 'over-reversed'

export interface OrphanCredit {
  reimbursementId: string
  personName: string
  description: string
  amount: number
  amountReceived: number
  settledTotal: number
  /** `amountReceived - settledTotal`. */
  residual: number
  kind: OrphanCreditKind
}

export interface NonExpenseTarget {
  reimbursementId: string
  personName: string
  description: string
  amount: number
  transactionType: string
}

export interface StatusDrift {
  reimbursementId: string
  personName: string
  description: string
  amount: number
  amountReceived: number
  storedStatus: string
  derivedStatus: string
}

export interface MigrationAudit {
  scanned: {
    reimbursements: number
    settlements: number
    forcedSettlements: number
    /** Requests whose income-category hint was lost to a category deletion. */
    detachedIncomeCategories: number
  }
  ambiguousForceComplete: AmbiguousSettlement[]
  orphanCredits: OrphanCredit[]
  nonExpenseTargets: NonExpenseTarget[]
  statusDrift: StatusDrift[]
  subcategoryBacklog: SubcategoryBacklog
}

function creditedTotalOf(settlement: AuditSettlement): number {
  return settlement.lines.reduce((sum, line) => sum + line.amountSettled, 0)
}

/** Credit the settlement applied beyond the cash it drew. */
export function forgivenAmountOf(settlement: AuditSettlement): number {
  return creditedTotalOf(settlement) - settlement.amountUsed
}

/** A settlement forgave a shortfall when its lines credit more than the cash used. */
export function usedForceComplete(settlement: AuditSettlement): boolean {
  return forgivenAmountOf(settlement) > EPSILON
}

/**
 * Force-completed settlements whose CASH / WRITE_OFF split cannot be derived.
 *
 * A single-line settlement is unambiguous: the line took all the cash, and the
 * rest of its credit was forgiven. From two lines up, the stored data does not
 * say which line the cash went to.
 */
export function findAmbiguousForceComplete(
  settlements: AuditSettlement[]
): AmbiguousSettlement[] {
  return settlements
    .filter(settlement => usedForceComplete(settlement))
    .filter(settlement => settlement.lines.length > 1)
    .map(settlement => ({
      settlementId: settlement.id,
      createdAt: settlement.createdAt,
      personName: settlement.personName,
      incomeDescription: settlement.incomeDescription,
      lineCount: settlement.lines.length,
      amountUsed: settlement.amountUsed,
      creditedTotal: creditedTotalOf(settlement),
      forgiven: forgivenAmountOf(settlement),
    }))
    .sort((a, b) => b.forgiven - a.forgiven)
}

/**
 * Reimbursements whose `amountReceived` does not match the credit their
 * settlement rows record. The residual is what the migration would have to
 * invent (or drop) to keep the displayed balance unchanged.
 */
export function findOrphanCredits(
  reimbursements: AuditReimbursement[]
): OrphanCredit[] {
  const findings: OrphanCredit[] = []

  for (const reimbursement of reimbursements) {
    const residual = reimbursement.amountReceived - reimbursement.settledTotal
    if (Math.abs(residual) <= EPSILON) continue

    findings.push({
      reimbursementId: reimbursement.id,
      personName: reimbursement.personName,
      description: reimbursement.description,
      amount: reimbursement.amount,
      amountReceived: reimbursement.amountReceived,
      settledTotal: reimbursement.settledTotal,
      residual,
      kind: residual > 0 ? 'unbacked' : 'over-reversed',
    })
  }

  return findings.sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual))
}

/** Requests anchored on something other than an expense. */
export function findNonExpenseTargets(
  reimbursements: AuditReimbursement[]
): NonExpenseTarget[] {
  return reimbursements
    .filter(reimbursement => reimbursement.transactionType !== 'EXPENSE')
    .map(reimbursement => ({
      reimbursementId: reimbursement.id,
      personName: reimbursement.personName,
      description: reimbursement.description,
      amount: reimbursement.amount,
      transactionType: reimbursement.transactionType,
    }))
}

/**
 * Status the target model reads off the amounts. Mirrors the service rules,
 * with the sub-cent tolerance the stored figures deserve.
 */
export function derivedStatusOf(
  amount: number,
  amountReceived: number
): string {
  if (amountReceived >= amount - EPSILON) return 'COMPLETED'
  if (amountReceived > EPSILON) return 'PARTIAL'
  return 'PENDING'
}

/** Rows whose stored status already disagrees with their own amounts. */
export function findStatusDrift(
  reimbursements: AuditReimbursement[]
): StatusDrift[] {
  const findings: StatusDrift[] = []

  for (const reimbursement of reimbursements) {
    const derived = derivedStatusOf(
      reimbursement.amount,
      reimbursement.amountReceived
    )
    if (derived === reimbursement.status) continue

    findings.push({
      reimbursementId: reimbursement.id,
      personName: reimbursement.personName,
      description: reimbursement.description,
      amount: reimbursement.amount,
      amountReceived: reimbursement.amountReceived,
      storedStatus: reimbursement.status,
      derivedStatus: derived,
    })
  }

  return findings
}

export function buildSubcategoryBacklog(
  rows: SubcategoryBacklogRow[]
): SubcategoryBacklog {
  const sum = (subset: SubcategoryBacklogRow[]): number =>
    subset.reduce((total, row) => total + row.transactionCount, 0)

  const unresolvable = rows
    .filter(row => !row.resolvable)
    .sort((a, b) => b.transactionCount - a.transactionCount)

  return {
    resolvableTransactions: sum(rows.filter(row => row.resolvable)),
    unresolvableTransactions: sum(unresolvable),
    unresolvable,
  }
}

export function buildAudit(
  settlements: AuditSettlement[],
  reimbursements: AuditReimbursement[],
  subcategoryRows: SubcategoryBacklogRow[]
): MigrationAudit {
  return {
    scanned: {
      reimbursements: reimbursements.length,
      settlements: settlements.length,
      forcedSettlements: settlements.filter(usedForceComplete).length,
      detachedIncomeCategories: reimbursements.filter(
        reimbursement => reimbursement.expectedIncomeCategoryId === null
      ).length,
    },
    ambiguousForceComplete: findAmbiguousForceComplete(settlements),
    orphanCredits: findOrphanCredits(reimbursements),
    nonExpenseTargets: findNonExpenseTargets(reimbursements),
    statusDrift: findStatusDrift(reimbursements),
    subcategoryBacklog: buildSubcategoryBacklog(subcategoryRows),
  }
}

/** Findings that must be arbitrated before a migration script can run. */
export function blockingCount(audit: MigrationAudit): number {
  return (
    audit.ambiguousForceComplete.length +
    audit.orphanCredits.length +
    audit.nonExpenseTargets.length
  )
}

function money(value: number): string {
  return value.toFixed(2)
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function formatReport(
  audit: MigrationAudit,
  options: { samples?: number } = {}
): string {
  const limit = options.samples ?? DEFAULT_SAMPLES
  const out: string[] = []

  function push(line = ''): void {
    out.push(line)
  }

  /** Print at most `limit` rows, then say how many were held back. */
  function sample<T>(rows: T[], render: (row: T) => void): void {
    for (const row of rows.slice(0, limit)) render(row)
    if (rows.length > limit) {
      push(
        `  ... and ${rows.length - limit} more (raise --samples to see them)`
      )
      push()
    }
  }

  const { scanned } = audit
  push('MIGRATION READINESS — reimbursements to the payment ledger')
  push()
  push(
    `${scanned.reimbursements} reimbursement request(s), ` +
      `${scanned.settlements} settlement(s), ` +
      `${scanned.forcedSettlements} of which used force-complete.`
  )
  push()

  push('[1] Force-complete splits (blocking)')
  const derivable =
    scanned.forcedSettlements - audit.ambiguousForceComplete.length
  if (derivable === 0 && audit.ambiguousForceComplete.length === 0) {
    push('  OK — no settlement ever forgave a shortfall.')
  } else if (audit.ambiguousForceComplete.length === 0) {
    push(
      `  OK — ${derivable} force-completed settlement(s), all single-line, ` +
        'so every CASH / WRITE_OFF split is arithmetic.'
    )
  } else {
    push(
      `  ${audit.ambiguousForceComplete.length} settlement(s) forgave a ` +
        'shortfall across several lines. The cash cannot be attributed per ' +
        `line; ${derivable} other forced settlement(s) are derivable.`
    )
    push()
    sample(audit.ambiguousForceComplete, finding => {
      push(
        `  ${finding.personName} — "${finding.incomeDescription}" ` +
          `(${day(finding.createdAt)})`
      )
      push(`    settlement ${finding.settlementId}, ${finding.lineCount} lines`)
      push(
        `    cash ${money(finding.amountUsed)}, ` +
          `credited ${money(finding.creditedTotal)}, ` +
          `so ${money(finding.forgiven)} forgiven with no per-line breakdown`
      )
      push()
    })
  }
  push()

  push('[2] Credits with no settlement behind them (blocking)')
  if (audit.orphanCredits.length === 0) {
    push('  OK — every amount_received is backed exactly by settlement rows.')
  } else {
    const unbacked = audit.orphanCredits.filter(f => f.kind === 'unbacked')
    const overReversed = audit.orphanCredits.filter(
      f => f.kind === 'over-reversed'
    )
    const unbackedTotal = unbacked.reduce((sum, f) => sum + f.residual, 0)
    const overReversedTotal = overReversed.reduce(
      (sum, f) => sum + Math.abs(f.residual),
      0
    )
    push(
      `  ${unbacked.length} row(s) credited outside any settlement ` +
        `(${money(unbackedTotal)} EUR, recoverable only as a CASH payment ` +
        'with no income transaction), ' +
        `${overReversed.length} row(s) reversed beyond what was credited ` +
        `(${money(overReversedTotal)} EUR, pre-existing damage).`
    )
    push()
    sample(audit.orphanCredits, finding => {
      push(`  ${finding.personName} — ${finding.description}`)
      push(`    reimbursement ${finding.reimbursementId} (${finding.kind})`)
      push(
        `    debt ${money(finding.amount)}, ` +
          `received ${money(finding.amountReceived)}, ` +
          `settled ${money(finding.settledTotal)} ` +
          `-> residual ${money(finding.residual)}`
      )
      push()
    })
  }
  push()

  push('[3] Requests on a non-EXPENSE transaction (blocking)')
  if (audit.nonExpenseTargets.length === 0) {
    push('  OK — every request hangs off an expense.')
  } else {
    push(
      `  ${audit.nonExpenseTargets.length} row(s) anchored on something the ` +
        'target model cannot deduct from.'
    )
    push()
    sample(audit.nonExpenseTargets, finding => {
      push(
        `  ${finding.personName} — ${finding.description} ` +
          `[${finding.transactionType}] ${money(finding.amount)}`
      )
      push(`    reimbursement ${finding.reimbursementId}`)
      push()
    })
  }
  push()

  push('[4] Status drift (informational)')
  if (audit.statusDrift.length === 0) {
    push('  OK — every stored status matches the amounts it claims.')
  } else {
    push(
      `  ${audit.statusDrift.length} row(s) whose status will change on ` +
        'screen once it is derived rather than stored.'
    )
    push()
    sample(audit.statusDrift, finding => {
      push(`  ${finding.personName} — ${finding.description}`)
      push(
        `    ${money(finding.amountReceived)} of ${money(finding.amount)} ` +
          `received: stored ${finding.storedStatus}, ` +
          `derived ${finding.derivedStatus}`
      )
      push()
    })
  }
  push()

  push('[5] Subcategory backlog (informational)')
  const backlog = audit.subcategoryBacklog
  if (
    backlog.resolvableTransactions === 0 &&
    backlog.unresolvableTransactions === 0
  ) {
    push('  OK — every labelled transaction already carries subcategory_id.')
  } else {
    push(
      `  ${backlog.resolvableTransactions} transaction(s) backfillable by ` +
        `(category, name), ${backlog.unresolvableTransactions} not.`
    )
    if (backlog.unresolvable.length > 0) {
      push()
      sample(backlog.unresolvable, row => {
        push(
          `  ${row.categoryName} / ${row.subcategory} — ` +
            `${row.transactionCount} transaction(s), no matching subcategory`
        )
      })
      push()
    }
  }
  push()

  if (scanned.detachedIncomeCategories > 0) {
    push(
      `Note: ${scanned.detachedIncomeCategories} request(s) lost their ` +
        'income-category hint to a category deletion. Already gone today — ' +
        'the migration does not make it worse.'
    )
    push()
  }

  const blocking = blockingCount(audit)
  push('VERDICT')
  if (blocking === 0) {
    push(
      '  Nothing blocks the migration: every credit reconstructs exactly from ' +
        'the stored data.'
    )
  } else {
    push(
      `  ${blocking} row(s) need a decision before the migration script can ` +
        'run. Everything else reconstructs exactly.'
    )
  }
  push(
    '  Migrate additively either way: keep amount_received, status and the ' +
      'settlement tables until the new ledger reconciles against them.'
  )

  return out.join('\n')
}

export async function main(
  prisma: PrismaClient,
  options: { samples?: number } = {}
): Promise<void> {
  const [settlementRows, reimbursementRows, subcategoryRows] =
    await Promise.all([
      prisma.settlement.findMany({
        select: {
          id: true,
          createdAt: true,
          amountUsed: true,
          person: { select: { name: true } },
          incomeTransaction: { select: { description: true } },
          reimbursements: {
            select: { reimbursementId: true, amountSettled: true },
          },
        },
      }),
      prisma.reimbursementRequest.findMany({
        select: {
          id: true,
          amount: true,
          amountReceived: true,
          status: true,
          categoryId: true,
          person: { select: { name: true } },
          transaction: { select: { description: true, type: true } },
          settlements: { select: { amountSettled: true } },
        },
      }),
      // Denormalized labels still missing their FK. Subcategory is unique on
      // (category_id, name), so the join matches at most one row — and never
      // matches when the transaction itself has no category.
      prisma.$queryRaw<
        Array<{
          category_name: string
          subcategory: string
          transaction_count: number
          resolvable: boolean
        }>
      >`
        SELECT
          COALESCE(c.name, '(sans categorie)') AS category_name,
          t.subcategory                        AS subcategory,
          COUNT(*)::int                        AS transaction_count,
          (sc.id IS NOT NULL)                  AS resolvable
        FROM app.transactions t
        LEFT JOIN app.categories c ON c.id = t.category_id
        LEFT JOIN app.subcategories sc
               ON sc.category_id = t.category_id AND sc.name = t.subcategory
        WHERE t.subcategory IS NOT NULL
          AND t.subcategory_id IS NULL
        GROUP BY c.name, t.subcategory, (sc.id IS NOT NULL)
        ORDER BY COUNT(*) DESC
      `,
    ])

  const settlements: AuditSettlement[] = settlementRows.map(row => ({
    id: row.id,
    createdAt: row.createdAt,
    amountUsed: Number(row.amountUsed),
    personName: row.person.name,
    incomeDescription: row.incomeTransaction.description,
    lines: row.reimbursements.map(line => ({
      reimbursementId: line.reimbursementId,
      amountSettled: Number(line.amountSettled),
    })),
  }))

  const reimbursements: AuditReimbursement[] = reimbursementRows.map(row => ({
    id: row.id,
    personName: row.person.name,
    description: row.transaction.description,
    amount: Number(row.amount),
    amountReceived: Number(row.amountReceived),
    status: row.status,
    transactionType: row.transaction.type,
    settledTotal: row.settlements.reduce(
      (sum, line) => sum + Number(line.amountSettled),
      0
    ),
    expectedIncomeCategoryId: row.categoryId,
  }))

  const subcategoryBacklogRows: SubcategoryBacklogRow[] = subcategoryRows.map(
    row => ({
      categoryName: row.category_name,
      subcategory: row.subcategory,
      transactionCount: row.transaction_count,
      resolvable: row.resolvable,
    })
  )

  console.log(
    formatReport(
      buildAudit(settlements, reimbursements, subcategoryBacklogRows),
      options
    )
  )
}

/**
 * Same Postgres adapter the app uses. Prefers DIRECT_URL (Supabase session
 * mode) over the transaction-mode pooler.
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

function parseSamples(argv: string[]): number | undefined {
  const arg = argv.find(a => a.startsWith('--samples='))
  if (!arg) return undefined
  const value = Number(arg.slice('--samples='.length))
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--samples must be a positive integer: ${arg}`)
  }
  return value
}

if (require.main === module) {
  // Side-effect import: must come BEFORE buildPrismaClient() reads process.env.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config')

  const { prisma, pool } = buildPrismaClient()
  const samples = parseSamples(process.argv)
  main(prisma, samples ? { samples } : {})
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
      await pool.end()
    })
}
