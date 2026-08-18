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
    categoryId: reimbursement.categoryId,
    categoryName: reimbursement.categoryName || NO_CATEGORY_LABEL,
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
  /**
   * Category ids with a pending balance for this person, `null` standing for
   * the uncategorized ones. Ids rather than names: a rename must not quietly
   * stop the suggestion from firing.
   */
  pendingCategoryIds: Set<string | null>
  /** Pending total per category, plus the grand total, for amount matching. */
  pendingTotals: number[]
}

export type SuggestionReason = 'name' | 'category' | 'amount'

/**
 * Rank an income transaction against what the person still owes. Purely a
 * sorting aid: nothing is ever hidden from the list, unlike the category
 * pre-filter this replaces.
 */
export function scoreIncomeTransaction(
  transaction: TransactionDto,
  context: SuggestionContext
): { score: number; reasons: SuggestionReason[] } {
  const reasons: SuggestionReason[] = []

  const description = normalize(transaction.description)
  const nameTokens = normalize(context.personName)
    .split(/\s+/)
    .filter(token => token.length >= 3)
  if (nameTokens.some(token => description.includes(token))) {
    reasons.push('name')
  }

  if (context.pendingCategoryIds.has(transaction.categoryId ?? null)) {
    reasons.push('category')
  }

  const available = availableAmountOf(transaction)
  if (context.pendingTotals.some(total => Math.abs(total - available) < 0.01)) {
    reasons.push('amount')
  }

  // Name is the strongest signal, then the category convention, then the amount
  // (which collides easily across small round numbers).
  const weights: Record<SuggestionReason, number> = {
    name: 4,
    category: 2,
    amount: 1,
  }
  const score = reasons.reduce((sum, reason) => sum + weights[reason], 0)

  return { score, reasons }
}
