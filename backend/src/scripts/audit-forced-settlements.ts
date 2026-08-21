/**
 * Read-only audit for settlements written by the pre-fix `forceComplete` path.
 *
 * ## Why
 *
 * Until the per-line `forceComplete` rework, marking a settlement "entierement
 * rembourse" stored the reimbursement's **original amount** on the join row
 * (`settlement_reimbursements.amount_settled`) instead of the credit the
 * settlement actually applied to the debt.
 *
 * `SettlementsService.delete` reverses a settlement by subtracting that stored
 * figure from `amountReceived`. So for a reimbursement that had already been
 * partially paid before being force-completed, deleting the settlement
 * subtracts too much and silently wipes the earlier payment:
 *
 *   debt 80, already received 30, forced to COMPLETED
 *     stored amount_settled = 80   (should be the 50 actually credited)
 *     delete -> amountReceived = 80 - 80 = 0   (should be 30)
 *
 * New settlements store the real credit, so they reverse exactly. This script
 * finds the rows written before the fix that would still lose money.
 *
 * ## Detection
 *
 *   1. A settlement used force-complete when the sum of its join rows exceeds
 *      `amount_used` (the cash actually drawn from the income transaction).
 *   2. Within such a settlement, a line carries the legacy bug when its stored
 *      `amount_settled` equals the reimbursement's original amount.
 *   3. That line loses money on delete only if the reimbursement had already
 *      been credited when the settlement ran — i.e. other settlements created
 *      strictly earlier also credit it. That earlier credit is precisely what
 *      would be destroyed.
 *
 * Former caveat, now closed: `PATCH /reimbursements/:id/receive` used to credit
 * `amountReceived` without leaving a settlement row, which such a payment would
 * have made invisible here. The endpoint has been removed, and the prod audit
 * found no row carrying that kind of credit, so this audit is exact.
 *
 * ## Usage
 *
 *   # Reads only. Loads .env automatically — that points at prod, which is
 *   # where the rows to audit live.
 *   pnpm ts-node src/scripts/audit-forced-settlements.ts
 *   pnpm ts-node src/scripts/audit-forced-settlements.ts --before=2026-08-16T14:20:00Z
 *
 * `--before` limits the audit to settlements created before that instant.
 * Settlements created after the fix was deployed are correct by construction,
 * so pass the deploy timestamp to drop them from the report.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma'

/** Half a cent: amounts are Decimal(12,2), so anything below this is noise. */
const EPSILON = 0.005

export interface AuditReimbursement {
  id: string
  /** The full debt, i.e. what the legacy force-complete path stored. */
  amount: number
  description: string
}

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

export interface Finding {
  settlementId: string
  settlementCreatedAt: Date
  personName: string
  incomeDescription: string
  reimbursementId: string
  reimbursementDescription: string
  originalAmount: number
  /** What the join row stores today. */
  recordedAmountSettled: number
  /** Credit the reimbursement already carried when this settlement ran. */
  earlierCredit: number
  /** What the join row should hold for `delete` to reverse exactly. */
  suggestedAmountSettled: number
}

/** Deterministic chronological order, id as tie-break. */
function byCreationOrder(a: AuditSettlement, b: AuditSettlement): number {
  return (
    a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
  )
}

/** A settlement forgave a shortfall when its lines credit more than the cash used. */
export function usedForceComplete(settlement: AuditSettlement): boolean {
  const credited = settlement.lines.reduce(
    (sum, line) => sum + line.amountSettled,
    0
  )
  return credited - settlement.amountUsed > EPSILON
}

/**
 * Join rows that would under-restore `amountReceived` if their settlement were
 * deleted. Ordered by settlement creation date.
 */
export function findAtRiskLines(
  settlements: AuditSettlement[],
  reimbursements: AuditReimbursement[],
  options: { before?: Date } = {}
): Finding[] {
  const reimbursementById = new Map(reimbursements.map(r => [r.id, r]))
  const ordered = [...settlements].sort(byCreationOrder)
  const findings: Finding[] = []

  for (const [index, settlement] of ordered.entries()) {
    if (options.before && settlement.createdAt >= options.before) continue
    if (!usedForceComplete(settlement)) continue

    for (const line of settlement.lines) {
      const reimbursement = reimbursementById.get(line.reimbursementId)
      if (!reimbursement) continue

      // The legacy signature: the original debt was stored verbatim.
      const storedTheOriginal =
        Math.abs(line.amountSettled - reimbursement.amount) < EPSILON
      if (!storedTheOriginal) continue

      // Everything credited to this debt by settlements that ran earlier.
      const earlierCredit = ordered
        .slice(0, index)
        .flatMap(earlier => earlier.lines)
        .filter(earlierLine => earlierLine.reimbursementId === reimbursement.id)
        .reduce((sum, earlierLine) => sum + earlierLine.amountSettled, 0)

      if (earlierCredit <= EPSILON) continue

      findings.push({
        settlementId: settlement.id,
        settlementCreatedAt: settlement.createdAt,
        personName: settlement.personName,
        incomeDescription: settlement.incomeDescription,
        reimbursementId: reimbursement.id,
        reimbursementDescription: reimbursement.description,
        originalAmount: reimbursement.amount,
        recordedAmountSettled: line.amountSettled,
        earlierCredit,
        suggestedAmountSettled: Math.max(
          0,
          Math.round((reimbursement.amount - earlierCredit) * 100) / 100
        ),
      })
    }
  }

  return findings
}

export function formatReport(
  findings: Finding[],
  scanned: { settlements: number; forced: number }
): string {
  const lines: string[] = []
  lines.push(
    `${scanned.settlements} settlements read, ${scanned.forced} used force-complete.`
  )

  if (findings.length === 0) {
    lines.push('')
    lines.push('No settlement would lose an earlier payment if deleted.')
    return lines.join('\n')
  }

  const atRisk = findings.reduce((sum, f) => sum + f.earlierCredit, 0)
  lines.push('')
  lines.push(
    `${findings.length} join row(s) would under-restore amountReceived on delete, ` +
      `for ${atRisk.toFixed(2)} EUR of earlier payments:`
  )
  lines.push('')

  for (const finding of findings) {
    const date = finding.settlementCreatedAt.toISOString().slice(0, 10)
    lines.push(`  ${finding.personName} — ${finding.reimbursementDescription}`)
    lines.push(
      `    settlement ${finding.settlementId} (${date}, "${finding.incomeDescription}")`
    )
    lines.push(
      `    debt ${finding.originalAmount.toFixed(2)}, ` +
        `already credited ${finding.earlierCredit.toFixed(2)} before this settlement`
    )
    lines.push(
      `    amount_settled stored ${finding.recordedAmountSettled.toFixed(2)} — ` +
        `should be ${finding.suggestedAmountSettled.toFixed(2)}`
    )
    lines.push('')
  }

  lines.push(
    'These rows are only harmful on deletion; the displayed balances are correct.'
  )
  lines.push(
    'Fix by setting each amount_settled to the suggested value, or simply avoid ' +
      'deleting these settlements.'
  )

  return lines.join('\n')
}

export async function main(
  prisma: PrismaClient,
  options: { before?: Date } = {}
): Promise<void> {
  const rows = await prisma.settlement.findMany({
    select: {
      id: true,
      createdAt: true,
      amountUsed: true,
      person: { select: { name: true } },
      incomeTransaction: { select: { description: true } },
      reimbursements: {
        select: {
          amountSettled: true,
          reimbursement: {
            select: {
              id: true,
              amount: true,
              transaction: { select: { description: true } },
            },
          },
        },
      },
    },
  })

  const settlements: AuditSettlement[] = rows.map(row => ({
    id: row.id,
    createdAt: row.createdAt,
    amountUsed: Number(row.amountUsed),
    personName: row.person.name,
    incomeDescription: row.incomeTransaction.description,
    lines: row.reimbursements.map(line => ({
      reimbursementId: line.reimbursement.id,
      amountSettled: Number(line.amountSettled),
    })),
  }))

  const reimbursements: AuditReimbursement[] = rows
    .flatMap(row => row.reimbursements)
    .map(line => ({
      id: line.reimbursement.id,
      amount: Number(line.reimbursement.amount),
      description: line.reimbursement.transaction.description,
    }))

  const findings = findAtRiskLines(settlements, reimbursements, options)

  console.log(
    formatReport(findings, {
      settlements: settlements.length,
      forced: settlements.filter(usedForceComplete).length,
    })
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

function parseBefore(argv: string[]): Date | undefined {
  const arg = argv.find(a => a.startsWith('--before='))
  if (!arg) return undefined
  const value = new Date(arg.slice('--before='.length))
  if (Number.isNaN(value.getTime())) {
    throw new Error(`--before is not a valid date: ${arg}`)
  }
  return value
}

if (require.main === module) {
  // Side-effect import: must come BEFORE buildPrismaClient() reads process.env.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config')

  const { prisma, pool } = buildPrismaClient()
  const before = parseBefore(process.argv)
  main(prisma, before ? { before } : {})
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
      await pool.end()
    })
}
