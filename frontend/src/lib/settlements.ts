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
  /** The expense the debt hangs off — what a link to its row names. */
  transactionId: string
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

export const NO_CATEGORY_LABEL = 'Sans catégorie'

export function toAllocationLine(
  reimbursement: ReimbursementDto
): AllocationLine {
  return {
    reimbursementId: reimbursement.id,
    transactionId: reimbursement.transactionId,
    // The expense, not `categoryId`: the latter is the retired income hint,
    // null on most debts, which filed every line under "Sans catégorie".
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

/** A pending debt line, as the income-first settlement ranks it. */
export interface RankedDebtLine extends AllocationLine {
  /** This very debt still owes exactly what the income has available. */
  exactAmount: boolean
}

/** One person's pending debts, scored against an income transaction. */
export interface RankedDebtGroup {
  personId: string
  personName: string
  /** Oldest first, the cascade's order. */
  lines: RankedDebtLine[]
  /** Everything the person still owes. */
  due: number
  score: number
  /** Amount first, as in `scoreIncomeTransaction`: the badge that discriminates. */
  reasons: SuggestionReason[]
}

const REASON_WEIGHTS: Record<SuggestionReason, number> = { amount: 5, name: 2 }

function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01
}

/**
 * `scoreIncomeTransaction` turned around: instead of ranking receipts for one
 * person, rank every person's pending debts for one receipt. Same signals,
 * same weights, same normalisation; still a sorting aid only — every pending
 * debt stays in the list.
 *
 * - `amount` (5): one of the person's debts, or their whole pending total,
 *   equals what the income still has available;
 * - `name` (2): a word of the person's name (3 characters or more, accents
 *   folded) appears in the income's description.
 *
 * Groups sort by score, then by name; a person's debts stay oldest first.
 */
export function rankDebtGroups(
  reimbursements: ReimbursementDto[],
  transaction: TransactionDto
): RankedDebtGroup[] {
  const available = availableAmountOf(transaction)
  const description = normalize(transaction.description)
  const byPerson = new Map<string, RankedDebtGroup>()

  for (const reimbursement of reimbursements) {
    if (reimbursement.amountRemaining <= 0) continue
    let group = byPerson.get(reimbursement.personId)
    if (!group) {
      group = {
        personId: reimbursement.personId,
        personName: reimbursement.personName,
        lines: [],
        due: 0,
        score: 0,
        reasons: [],
      }
      byPerson.set(reimbursement.personId, group)
    }
    const line = toAllocationLine(reimbursement)
    group.lines.push({
      ...line,
      exactAmount: available > 0 && sameAmount(line.amountDue, available),
    })
    group.due = round2(group.due + line.amountDue)
  }

  const groups = [...byPerson.values()]
  for (const group of groups) {
    group.lines.sort(byOldestFirst)

    const reasons: SuggestionReason[] = []
    if (
      available > 0 &&
      (group.lines.some(line => line.exactAmount) ||
        sameAmount(group.due, available))
    ) {
      reasons.push('amount')
    }
    const nameTokens = normalize(group.personName)
      .split(/\s+/)
      .filter(token => token.length >= 3)
    if (nameTokens.some(token => description.includes(token))) {
      reasons.push('name')
    }
    group.reasons = reasons
    group.score = reasons.reduce(
      (sum, reason) => sum + REASON_WEIGHTS[reason],
      0
    )
  }

  return groups.sort(
    (a, b) => b.score - a.score || a.personName.localeCompare(b.personName)
  )
}

/** The one debt (or set of debts) an income almost certainly settles. */
export interface SureMatch {
  personId: string
  personName: string
  /** What to tick when the settlement modal opens. */
  reimbursementIds: string[]
  /** What those debts still owe together. */
  amount: number
  /** The expense(s) being repaid, as the row's tooltip names them. */
  description: string
}

/**
 * A match sure enough to put a « Régler {personne} » button on the income's
 * row: exactly one person both owes the available amount (on one debt, or in
 * total) and is named in the description. Two such people, or one signal
 * alone, is a guess — the row then only offers the generic icon.
 *
 * The debt with the exact amount is preferred (the oldest, if several); the
 * whole of the person's debts otherwise, since it is then their total that
 * matched.
 */
export function sureMatch(
  reimbursements: ReimbursementDto[],
  transaction: TransactionDto
): SureMatch | null {
  const candidates = rankDebtGroups(reimbursements, transaction).filter(
    group => group.reasons.includes('amount') && group.reasons.includes('name')
  )
  const [group] = candidates
  if (!group || candidates.length !== 1) return null

  const exact = group.lines.find(line => line.exactAmount)
  const lines = exact ? [exact] : group.lines

  return {
    personId: group.personId,
    personName: group.personName,
    reimbursementIds: lines.map(line => line.reimbursementId),
    amount: round2(lines.reduce((sum, line) => sum + line.amountDue, 0)),
    description: lines.map(line => line.description).join(', '),
  }
}
