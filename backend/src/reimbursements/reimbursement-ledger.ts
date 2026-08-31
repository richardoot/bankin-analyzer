/**
 * The arithmetic of the payment ledger, kept apart from the services that
 * write it so both sides of a settlement — creating one and deleting one —
 * derive their figures from the same rules rather than from two mirrored
 * pieces of code that drifted once already.
 *
 * Phase 3 of the reimbursement rework makes the ledger authoritative:
 * `ReimbursementRequest.amountReceived` and `status` are still written, but
 * only ever as the sum and the reading of the payments recorded alongside
 * them, inside the same database transaction. Phase 6 drops the columns; until
 * then they are a cache the reconciliation script can check.
 */
import { ReimbursementStatus } from '../generated/prisma'
import type { Prisma } from '../generated/prisma'

/** Decimal columns arrive as Prisma decimals; plain numbers in tests. */
type Decimal = Prisma.Decimal

/** Half a cent: amounts are Decimal(12,2), so anything below this is noise. */
export const LEDGER_EPSILON = 0.005

/** Euro amounts carry two decimals; keep intermediate math off the float cliff. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export interface LedgerEntry {
  amount: number
  kind: 'CASH' | 'WRITE_OFF'
}

/** Everything credited to a debt, cash and forgiven remainder alike. */
export function creditedTotal(payments: LedgerEntry[]): number {
  return round2(payments.reduce((total, entry) => total + entry.amount, 0))
}

/** Only the part backed by an income transaction. */
export function cashTotal(payments: LedgerEntry[]): number {
  return round2(
    payments
      .filter(entry => entry.kind === 'CASH')
      .reduce((total, entry) => total + entry.amount, 0)
  )
}

/**
 * The status a debt is in, read off what has been credited to it. Never
 * stored as an independent fact: a status that can disagree with its own
 * amounts is a status that eventually will.
 */
export function derivedStatusOf(
  debtAmount: number,
  credited: number
): ReimbursementStatus {
  if (credited >= debtAmount - LEDGER_EPSILON) {
    return ReimbursementStatus.COMPLETED
  }
  if (credited > LEDGER_EPSILON) return ReimbursementStatus.PARTIAL
  return ReimbursementStatus.PENDING
}

/**
 * Prisma rows to the plain shape the arithmetic above works on.
 *
 * Lives here rather than in one service: since phase 6 both the settlement
 * path and the reimbursement response derive their figures from payments, and
 * two private copies of this conversion is how the columns it replaces drifted
 * apart in the first place.
 */
export function toLedgerEntries(
  payments: Array<{ amount: Decimal | number; kind: string }>
): LedgerEntry[] {
  return payments.map(payment => ({
    amount: Number(payment.amount),
    kind: payment.kind as LedgerEntry['kind'],
  }))
}

export interface CreditSplit {
  /** Cash drawn from the income transaction. */
  cash: number
  /**
   * Remainder the user gave up on. Non-zero only when the line is
   * force-completed and the cash does not cover what is left owing.
   */
  writeOff: number
}

/**
 * Split what a settlement line applies to a debt into the part that is money
 * and the part that is forgiveness.
 *
 * The distinction is the whole point of the ledger. The previous model stored
 * a single `amountSettled` mixing the two, which made a deletion unable to
 * tell what it had to give back — the bug `audit-forced-settlements.ts` exists
 * to find.
 */
export function splitCredit(input: {
  /** What the debt was for. */
  debtAmount: number
  /** What the ledger already credits to it. */
  alreadyCredited: number
  /** Cash this settlement line draws from the income transaction. */
  cash: number
  /** Whether the line closes the debt regardless of the shortfall. */
  forceComplete: boolean
}): CreditSplit {
  const cash = round2(input.cash)
  if (!input.forceComplete) return { cash, writeOff: 0 }

  const shortfall = input.debtAmount - (input.alreadyCredited + cash)
  return { cash, writeOff: shortfall > LEDGER_EPSILON ? round2(shortfall) : 0 }
}

/** Payment rows a credit split turns into. Empty amounts are not recorded. */
export function paymentsOf(split: CreditSplit): LedgerEntry[] {
  const entries: LedgerEntry[] = []
  if (split.cash > LEDGER_EPSILON) {
    entries.push({ amount: split.cash, kind: 'CASH' })
  }
  if (split.writeOff > LEDGER_EPSILON) {
    entries.push({ amount: split.writeOff, kind: 'WRITE_OFF' })
  }
  return entries
}
