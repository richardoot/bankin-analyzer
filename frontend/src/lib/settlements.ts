import type { ReimbursementDto, TransactionDto } from './api'

/** Euro amounts are stored with 2 decimals; keep intermediate math off the float cliff. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Cash still available on an income transaction, derived from the settlements
 * already drawn on it. The transactions list endpoint returns those inline, so
 * this avoids a per-transaction round-trip to `/available-amount`.
 */
export function availableAmountOf(transaction: TransactionDto): number {
  const used = (transaction.settlements ?? []).reduce(
    (sum, settlement) => sum + settlement.amountUsed,
    0
  )
  return round2(transaction.amount - used)
}

/** A pending debt line, flattened out of a ReimbursementDto for allocation. */
export interface AllocationLine {
  reimbursementId: string
  /**
   * Category of the expense being repaid — how the debts are grouped, and the
   * same axis the reimbursements page displays them on.
   */
  categoryId: string | null
  categoryName: string
  /** Expense transaction date, drives the cascade order (oldest settled first). */
  date: string
  description: string
  amountDue: number
}

export const NO_CATEGORY_LABEL = 'Sans categorie'

export function toAllocationLine(
  reimbursement: ReimbursementDto
): AllocationLine {
  return {
    reimbursementId: reimbursement.id,
    // The expense, not `categoryId`: the latter is the retired income hint,
    // null on most debts, which filed every line under "Sans categorie".
    categoryId: reimbursement.expenseCategoryId,
    categoryName: reimbursement.expenseCategoryName || NO_CATEGORY_LABEL,
    date: reimbursement.transaction?.date ?? reimbursement.createdAt,
    description: reimbursement.transaction?.description ?? 'Transaction',
    amountDue: reimbursement.amountRemaining,
  }
}

/** Oldest debt first — the order both the cascade and the UI rely on. */
export function byOldestFirst(a: AllocationLine, b: AllocationLine): number {
  return new Date(a.date).getTime() - new Date(b.date).getTime()
}

/**
 * Waterfall allocation: settle each line in full, oldest first, until the pot
 * runs dry. Preferred over prorata because it leaves clean COMPLETED lines
 * instead of turning every line into a PARTIAL one.
 */
export function cascadeAllocate(
  lines: AllocationLine[],
  pot: number
): Map<string, number> {
  const allocations = new Map<string, number>()
  let remaining = round2(Math.max(0, pot))

  for (const line of [...lines].sort(byOldestFirst)) {
    const taken = Math.min(line.amountDue, remaining)
    allocations.set(line.reimbursementId, round2(Math.max(0, taken)))
    remaining = round2(remaining - taken)
  }

  return allocations
}

/**
 * Spread the pot across every line in proportion to what it owes. Offered as an
 * explicit alternative to the cascade when the payer really did chip in on
 * everything at once.
 */
export function prorataAllocate(
  lines: AllocationLine[],
  pot: number
): Map<string, number> {
  const allocations = new Map<string, number>()
  const totalDue = round2(lines.reduce((sum, line) => sum + line.amountDue, 0))

  if (totalDue <= 0 || pot <= 0) {
    for (const line of lines) allocations.set(line.reimbursementId, 0)
    return allocations
  }

  const budget = round2(Math.min(pot, totalDue))
  const ratio = budget / totalDue
  const ordered = [...lines].sort(byOldestFirst)
  let distributed = 0

  ordered.forEach((line, index) => {
    // Give the rounding drift to the last line so the parts sum back to budget.
    const share =
      index === ordered.length - 1
        ? round2(budget - distributed)
        : round2(line.amountDue * ratio)
    allocations.set(line.reimbursementId, share)
    distributed = round2(distributed + share)
  })

  return allocations
}

/** Strip accents and case so "VIR ALICE MARTIN" matches the person "Alice Martin". */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

export interface SuggestionContext {
  personName: string
  /** Pending total per category, plus the grand total, for amount matching. */
  pendingTotals: number[]
}

/** Enough to cover a first name and a surname, both spellings, and stop there. */
const MAX_SEARCH_TERMS = 4

/**
 * Terms to hand the server so the person's own receipts are fetched, instead of
 * whatever happens to be recent.
 *
 * One term per name token rather than the name whole: the server matches a
 * substring, so "Chloé TORRES" finds nothing in "Vir Inst Chloe Torres", where
 * the words are reordered. The unaccented spelling is searched alongside the
 * original because that SQL search folds case but not diacritics — the very
 * reason the accented half of a name never matches a bank statement.
 *
 * Replayed over the production ledger, adding these queries to the recent page
 * carries the correct receipt into the list 90 times out of 108, against 57 for
 * the recent page alone.
 */
export function personSearchTerms(personName: string): string[] {
  const terms = new Set<string>()

  for (const token of personName.split(/\s+/)) {
    // A stricter floor than the scoring's three characters, which can afford
    // to be lax because it only re-ranks rows already fetched. A term here is
    // a query: "Moi" — a real person in this ledger — returns every
    // description containing "mois", and burns one of the few slots. Replayed
    // over the production ledger, the stricter floor costs nothing: the same
    // 79 receipts are found either way.
    if (token.length < 4) continue
    terms.add(token)
    const unaccented = token.normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (unaccented !== token) terms.add(unaccented)
  }

  // Longest first: a surname discriminates where a first name does not, and
  // only the first few survive the cap.
  return [...terms]
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_SEARCH_TERMS)
}

export type SuggestionReason = 'name' | 'amount'

/**
 * Rank an income transaction against what the person still owes. Purely a
 * sorting aid: nothing is ever hidden from the list, unlike the category
 * pre-filter this replaces.
 *
 * There is no category signal: a debt only knows the *expense* it repays, and
 * comparing that to the category of an incoming transfer means nothing. The
 * income category it used to be matched against was retired from the debt
 * flow, so it is null on every debt created since.
 */
export function scoreIncomeTransaction(
  transaction: TransactionDto,
  context: SuggestionContext
): { score: number; reasons: SuggestionReason[] } {
  const reasons: SuggestionReason[] = []

  // Listed before the name so the badge the user reads first is the one that
  // actually discriminates.
  const available = availableAmountOf(transaction)
  if (context.pendingTotals.some(total => Math.abs(total - available) < 0.01)) {
    reasons.push('amount')
  }

  const description = normalize(transaction.description)
  const nameTokens = normalize(context.personName)
    .split(/\s+/)
    .filter(token => token.length >= 3)
  if (nameTokens.some(token => description.includes(token))) {
    reasons.push('name')
  }

  // The amount outranks the name, against the intuition that a name is more
  // specific. Replaying the 108 settlements of the production ledger against
  // the debts pending at the time each was made: the amount lands on the right
  // receipt 93 times and, in half the cases, no other available receipt shares
  // that figure. The name lands 79 times and drags a crowd behind it — a
  // household transfer names the same two people every month, so "TORRES"
  // matches a hundred receipts and the tie is then broken on date alone.
  //
  // The name still earns points: dropping it costs five hits. It just cannot
  // outweigh the figure.
  const weights: Record<SuggestionReason, number> = {
    amount: 5,
    name: 2,
  }
  const score = reasons.reduce((sum, reason) => sum + weights[reason], 0)

  return { score, reasons }
}
