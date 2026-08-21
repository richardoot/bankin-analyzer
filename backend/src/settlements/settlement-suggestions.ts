/**
 * Guessing which incoming transfer repays which debt.
 *
 * ## Why this exists
 *
 * The old model deducted refunds automatically: file an income transaction
 * under a category paired with an expense category, and the deduction happened
 * on its own, forever, with no further gesture. The payment ledger is exact
 * where that was crude — it knows the transaction, the date and the amount —
 * but it asks for something the association never did: an explicit link, once
 * per encashment.
 *
 * That is a real ergonomic debt, and this is what pays it back. Nothing here
 * decides anything: it ranks candidates so the obvious ones can be confirmed in
 * one gesture instead of hunted down person by person.
 *
 * ## The signals
 *
 * Three, deliberately shallow and explainable — a suggestion the user cannot
 * understand is a suggestion they cannot trust:
 *
 *  - **name** — the payer's name appears in the bank's wording ("VIR ALICE
 *    MARTIN"). By far the strongest, and the one a human reads first.
 *  - **category** — the transfer landed in an income category the user has
 *    paired with the expense category of a pending debt. This is all that is
 *    left of `CategoryAssociation`: a hint for the eye, never a calculation.
 *  - **amount** — the cash available matches what someone still owes. Weakest
 *    on its own, since round numbers collide constantly.
 *
 * The weights only order the list; they are not a probability, and nothing is
 * ever hidden because it scored low.
 */

/** A debt still owed, flattened for matching. */
export interface PendingDebt {
  reimbursementId: string
  personId: string
  personName: string
  /** What the expense was, as the bank worded it. */
  description: string
  /** Date of the expense being repaid — drives the cascade order. */
  expenseDate: Date
  /** Expense category of the transaction being repaid, null when it has none. */
  expenseCategoryId: string | null
  expenseCategoryName: string | null
  amountRemaining: number
}

/** An income transaction with cash nobody has claimed yet. */
export interface UnsettledIncome {
  transactionId: string
  date: Date
  description: string
  amount: number
  /** Amount minus the cash already drawn from it by existing settlements. */
  availableAmount: number
  categoryId: string | null
}

/** Income category → expense category, from `CategoryAssociation`. */
export type AssociationHints = Map<string, string>

export type SuggestionReason = 'name' | 'category' | 'amount'

/**
 * Name first: it is the only signal a human reads off the statement without
 * thinking. The amount comes last because two debts of 20 EUR are common and
 * mean nothing on their own.
 */
const REASON_WEIGHTS: Record<SuggestionReason, number> = {
  name: 4,
  category: 2,
  amount: 1,
}

/** Half a cent: amounts are Decimal(12,2), so anything below this is noise. */
const EPSILON = 0.005

export interface Suggestion {
  transactionId: string
  date: Date
  description: string
  availableAmount: number
  personId: string
  personName: string
  score: number
  reasons: SuggestionReason[]
  /** Debts of that person this transfer could settle, oldest owed first. */
  debts: PendingDebt[]
  /** What the transfer would cover: its cash, capped by what is owed. */
  coverage: number
}

/** Strip accents and case so "VIR ALICE MARTIN" matches the person "Alice Martin". */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

/**
 * Does the payer's name show through the bank's wording?
 *
 * Tokens shorter than three characters are dropped: initials and particles
 * ("de", "le") appear in half the labels a bank produces and would fire on
 * everything.
 */
export function nameMatches(description: string, personName: string): boolean {
  const haystack = normalize(description)
  return normalize(personName)
    .split(/\s+/)
    .filter(token => token.length >= 3)
    .some(token => haystack.includes(token))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Rank every (unsettled income, person owing something) pair that shows at
 * least one signal. Pairs with no signal at all are left out entirely — an
 * unranked list of every transfer against every person is not a suggestion,
 * it is the raw data the user already has.
 */
export function suggestSettlements(
  incomes: UnsettledIncome[],
  debts: PendingDebt[],
  hints: AssociationHints = new Map()
): Suggestion[] {
  const byPerson = new Map<string, PendingDebt[]>()
  for (const debt of debts) {
    if (debt.amountRemaining <= EPSILON) continue
    const list = byPerson.get(debt.personId)
    if (list) list.push(debt)
    else byPerson.set(debt.personId, [debt])
  }

  const suggestions: Suggestion[] = []

  for (const income of incomes) {
    if (income.availableAmount <= EPSILON) continue

    for (const [personId, personDebts] of byPerson) {
      const reasons: SuggestionReason[] = []
      const personName = personDebts[0]?.personName ?? ''

      if (nameMatches(income.description, personName)) {
        reasons.push('name')
      }

      // The transfer landed where the user files this kind of refund, and one
      // of the debts repays an expense of the paired category.
      const hintedExpenseCategoryId = income.categoryId
        ? hints.get(income.categoryId)
        : undefined
      if (
        hintedExpenseCategoryId &&
        personDebts.some(d => d.expenseCategoryId === hintedExpenseCategoryId)
      ) {
        reasons.push('category')
      }

      // Either the whole balance, or one debt on its own.
      const owed = round2(
        personDebts.reduce((sum, d) => sum + d.amountRemaining, 0)
      )
      const candidates = [owed, ...personDebts.map(d => d.amountRemaining)]
      if (
        candidates.some(
          amount => Math.abs(amount - income.availableAmount) < 0.01
        )
      ) {
        reasons.push('amount')
      }

      if (reasons.length === 0) continue

      suggestions.push({
        transactionId: income.transactionId,
        date: income.date,
        description: income.description,
        availableAmount: income.availableAmount,
        personId,
        personName,
        score: reasons.reduce((sum, r) => sum + REASON_WEIGHTS[r], 0),
        reasons,
        // Oldest debt first: the order the settlement cascade uses, so the
        // preview matches what confirming actually does.
        debts: [...personDebts].sort(
          (a, b) =>
            a.expenseDate.getTime() - b.expenseDate.getTime() ||
            a.reimbursementId.localeCompare(b.reimbursementId)
        ),
        coverage: round2(Math.min(income.availableAmount, owed)),
      })
    }
  }

  // Best first; then the biggest coverage, so a transfer that closes a whole
  // balance outranks one that nibbles at it. Ties fall back to the id so the
  // order never wobbles between two runs.
  return suggestions.sort(
    (a, b) =>
      b.score - a.score ||
      b.coverage - a.coverage ||
      a.transactionId.localeCompare(b.transactionId) ||
      a.personId.localeCompare(b.personId)
  )
}
