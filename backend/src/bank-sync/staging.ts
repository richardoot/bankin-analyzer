/**
 * Which of a payload's three dates a transaction is filed under, and
 * whether it should be written to the ledger at all.
 *
 * Both rules were measured on this user's real data, then corrected by it.
 */
import type { BankTransaction } from './enable-banking.client'

/**
 * Banks whose rows are filed under `booking_date` — the debit date —
 * because that is the date the user's own history already uses.
 *
 * Bankin filed Boursorama card purchases under their debit date, so years
 * of imported CSV carry it; filing a synced row under the operation date
 * (`transaction_date`, the one printed inside the raw label as
 * `CARTE 29/08/26 …`) made the same purchase wear two dates depending on
 * which source wrote it. CIC is the opposite, also measured: Bankin and
 * CIC's own app both show the operation date there.
 */
export function prefersBookingDate(aspspName: string): boolean {
  return /bourso/i.test(aspspName)
}

/**
 * The date a transaction is filed under.
 *
 * The fallback chain exists because no field is universal: measured
 * presence of `transaction_date` is 56 % on Boursorama, 22 % on CIC, 0 %
 * on Revolut — and `booking_date` itself is missing on 1 % of Boursorama
 * rows (pending ones, in particular, have not been booked yet).
 */
export function pickTransactionDate(
  raw: BankTransaction,
  aspspName: string
): string | null {
  if (prefersBookingDate(aspspName)) {
    return raw.booking_date ?? raw.transaction_date ?? raw.value_date ?? null
  }
  return raw.transaction_date ?? raw.booking_date ?? raw.value_date ?? null
}

/**
 * Only booked rows enter the ledger.
 *
 * A pending (`PDNG`) row is ephemeral: its date moves when it books, and —
 * measured on Boursorama — its `entry_reference` is a fabricated
 * `avis-…` hash that does not survive booking. Insert it and the booked
 * twin arrives under a different reference the reconciliation cannot tie
 * back: a duplicate, four of which were found in the real ledger. A row
 * with no status at all is kept — absence of the field is not a verdict.
 */
export function isBookable(raw: BankTransaction): boolean {
  return (
    raw.status === undefined || raw.status === null || raw.status === 'BOOK'
  )
}
