/**
 * Read-only check of the payment ledger's own invariants.
 *
 * ## Why
 *
 * Until phase 6 this script reconciled `reimbursement_payments` against the
 * `amount_received` and `status` columns it was replacing, and a clean run on
 * production is what gated dropping them. Those columns are gone, so the two
 * comparisons that motivated the script have nothing left to compare.
 *
 * The two invariants it also checked are not transitional, and nothing else
 * enforces them:
 *
 *   1. **Settlement cash.** Per settlement, the CASH payments must add back up
 *      to `amount_used` — the write-offs being exactly what does not.
 *   2. **Income not overdrawn.** Per income transaction, the CASH drawn from it
 *      must not exceed its amount.
 *
 * The second is the one worth watching: creating a settlement checks it, but
 * nothing re-checks it when an income transaction is later edited, re-imported
 * or has its amount corrected.
 *
 * ## Usage
 *
 *   # Local Docker database (what backend/.env points at):
 *   pnpm ts-node src/scripts/reconcile-reimbursement-ledger.ts
 *
 *   # Production:
 *   DOTENV_CONFIG_PATH=.env.production.local \
 *     pnpm ts-node src/scripts/reconcile-reimbursement-ledger.ts
 *
 * `--samples` caps how many rows each section prints (default 10).
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma'

/** Half a cent: amounts are Decimal(12,2), so anything below this is noise. */
const EPSILON = 0.005

/** Rows printed per section unless `--samples` says otherwise. */
const DEFAULT_SAMPLES = 10

export type LedgerPaymentKind = 'CASH' | 'WRITE_OFF'

export interface LedgerPayment {
  amount: number
  kind: LedgerPaymentKind
}

export interface LedgerReimbursement {
  id: string
  personName: string
  /** Description of the expense transaction the request hangs off. */
  description: string
  amount: number
  payments: LedgerPayment[]
}

export interface LedgerSettlement {
  id: string
  createdAt: Date
  personName: string
  /** Cash the settlement drew from its income transaction. */
  amountUsed: number
  payments: LedgerPayment[]
}

export interface LedgerIncomeTransaction {
  id: string
  description: string
  date: Date
  amount: number
  /** CASH recorded against this transaction, all settlements together. */
  cashDrawn: number
}

export interface SettlementCashMismatch {
  settlementId: string
  createdAt: Date
  personName: string
  amountUsed: number
  cashRecorded: number
}

export interface OverdrawnIncome {
  transactionId: string
  description: string
  date: Date
  amount: number
  cashDrawn: number
}

export interface Reconciliation {
  scanned: {
    reimbursements: number
    settlements: number
    payments: number
    writeOffs: number
    incomeTransactions: number
  }
  settlementCashMismatches: SettlementCashMismatch[]
  overdrawnIncome: OverdrawnIncome[]
}

function sumOf(payments: LedgerPayment[], kind?: LedgerPaymentKind): number {
  return payments
    .filter(payment => (kind ? payment.kind === kind : true))
    .reduce((total, payment) => total + payment.amount, 0)
}

/**
 * Status the target model reads off the amounts. Mirrors the service rules,
 * with the sub-cent tolerance the stored figures deserve.
 */
export function findSettlementCashMismatches(
  settlements: LedgerSettlement[]
): SettlementCashMismatch[] {
  const findings: SettlementCashMismatch[] = []

  for (const settlement of settlements) {
    const cashRecorded = sumOf(settlement.payments, 'CASH')
    if (Math.abs(cashRecorded - settlement.amountUsed) <= EPSILON) continue

    findings.push({
      settlementId: settlement.id,
      createdAt: settlement.createdAt,
      personName: settlement.personName,
      amountUsed: settlement.amountUsed,
      cashRecorded,
    })
  }

  return findings
}

/** Income transactions that gave out more cash than they carry. */
export function findOverdrawnIncome(
  transactions: LedgerIncomeTransaction[]
): OverdrawnIncome[] {
  return transactions
    .filter(transaction => transaction.cashDrawn - transaction.amount > EPSILON)
    .map(transaction => ({
      transactionId: transaction.id,
      description: transaction.description,
      date: transaction.date,
      amount: transaction.amount,
      cashDrawn: transaction.cashDrawn,
    }))
    .sort((a, b) => b.cashDrawn - b.amount - (a.cashDrawn - a.amount))
}

export function buildReconciliation(
  reimbursements: LedgerReimbursement[],
  settlements: LedgerSettlement[],
  incomeTransactions: LedgerIncomeTransaction[]
): Reconciliation {
  const payments = reimbursements.flatMap(r => r.payments)

  return {
    scanned: {
      reimbursements: reimbursements.length,
      settlements: settlements.length,
      payments: payments.length,
      writeOffs: payments.filter(p => p.kind === 'WRITE_OFF').length,
      incomeTransactions: incomeTransactions.length,
    },
    settlementCashMismatches: findSettlementCashMismatches(settlements),
    overdrawnIncome: findOverdrawnIncome(incomeTransactions),
  }
}

/** Everything that must be empty for the ledger to hold together. */
export function mismatchCount(reconciliation: Reconciliation): number {
  return (
    reconciliation.settlementCashMismatches.length +
    reconciliation.overdrawnIncome.length
  )
}

function money(value: number): string {
  return value.toFixed(2)
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function formatReport(
  reconciliation: Reconciliation,
  options: { samples?: number } = {}
): string {
  const limit = options.samples ?? DEFAULT_SAMPLES
  const out: string[] = []

  function push(line = ''): void {
    out.push(line)
  }

  function sample<T>(rows: T[], render: (row: T) => void): void {
    for (const row of rows.slice(0, limit)) render(row)
    if (rows.length > limit) {
      push(
        `  ... and ${rows.length - limit} more (raise --samples to see them)`
      )
      push()
    }
  }

  const { scanned } = reconciliation
  push('LEDGER INVARIANTS')
  push()
  push(
    `${scanned.payments} payment(s) (${scanned.writeOffs} write-off) across ` +
      `${scanned.reimbursements} reimbursement(s), ` +
      `${scanned.settlements} settlement(s), ` +
      `${scanned.incomeTransactions} income transaction(s).`
  )
  push()

  push('[1] Settlement cash: CASH payments vs amount_used')
  if (reconciliation.settlementCashMismatches.length === 0) {
    push('  OK — every settlement gave out exactly the cash it drew.')
  } else {
    push(
      `  ${reconciliation.settlementCashMismatches.length} settlement(s) ` +
        'whose cash does not add back up.'
    )
    push()
    sample(reconciliation.settlementCashMismatches, finding => {
      push(`  ${finding.personName} — ${day(finding.createdAt)}`)
      push(
        `    settlement ${finding.settlementId}: drew ` +
          `${money(finding.amountUsed)}, ledger records ` +
          `${money(finding.cashRecorded)}`
      )
      push()
    })
  }
  push()

  push('[2] Income not overdrawn: CASH drawn vs the transaction amount')
  if (reconciliation.overdrawnIncome.length === 0) {
    push('  OK — no income transaction gave out more than it carries.')
  } else {
    push(
      `  ${reconciliation.overdrawnIncome.length} income transaction(s) ` +
        'overdrawn. The target model forbids this outright.'
    )
    push()
    sample(reconciliation.overdrawnIncome, finding => {
      push(`  ${finding.description} — ${day(finding.date)}`)
      push(
        `    carries ${money(finding.amount)}, ` +
          `${money(finding.cashDrawn)} drawn from it`
      )
      push()
    })
  }
  push()

  const mismatches = mismatchCount(reconciliation)
  push('VERDICT')
  if (mismatches === 0) {
    push('  The ledger holds together.')
  } else {
    push(
      `  ${mismatches} mismatch(es). Resolve them before phase 3 makes the ` +
        'ledger authoritative — deriving from it would change these figures.'
    )
  }

  return out.join('\n')
}

export async function main(
  prisma: PrismaClient,
  options: { samples?: number } = {}
): Promise<void> {
  const [reimbursementRows, settlementRows, cashRows] = await Promise.all([
    prisma.reimbursementRequest.findMany({
      select: {
        id: true,
        amount: true,
        person: { select: { name: true } },
        transaction: { select: { description: true } },
        payments: { select: { amount: true, kind: true } },
      },
    }),
    prisma.settlement.findMany({
      select: {
        id: true,
        createdAt: true,
        amountUsed: true,
        person: { select: { name: true } },
        payments: { select: { amount: true, kind: true } },
      },
    }),
    prisma.reimbursementPayment.findMany({
      where: { kind: 'CASH', incomeTransactionId: { not: null } },
      select: {
        amount: true,
        incomeTransaction: {
          select: { id: true, description: true, date: true, amount: true },
        },
      },
    }),
  ])

  const reimbursements: LedgerReimbursement[] = reimbursementRows.map(row => ({
    id: row.id,
    personName: row.person.name,
    description: row.transaction.description,
    amount: Number(row.amount),
    payments: row.payments.map(payment => ({
      amount: Number(payment.amount),
      kind: payment.kind as LedgerPaymentKind,
    })),
  }))

  const settlements: LedgerSettlement[] = settlementRows.map(row => ({
    id: row.id,
    createdAt: row.createdAt,
    personName: row.person.name,
    amountUsed: Number(row.amountUsed),
    payments: row.payments.map(payment => ({
      amount: Number(payment.amount),
      kind: payment.kind as LedgerPaymentKind,
    })),
  }))

  // Cash drawn per income transaction, accumulated from the payment rows.
  const byTransaction = new Map<string, LedgerIncomeTransaction>()
  for (const row of cashRows) {
    if (!row.incomeTransaction) continue
    const existing = byTransaction.get(row.incomeTransaction.id)
    if (existing) {
      existing.cashDrawn += Number(row.amount)
      continue
    }
    byTransaction.set(row.incomeTransaction.id, {
      id: row.incomeTransaction.id,
      description: row.incomeTransaction.description,
      date: row.incomeTransaction.date,
      amount: Number(row.incomeTransaction.amount),
      cashDrawn: Number(row.amount),
    })
  }

  console.log(
    formatReport(
      buildReconciliation(
        reimbursements,
        settlements,
        Array.from(byTransaction.values())
      ),
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
