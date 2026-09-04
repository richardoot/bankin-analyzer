/**
 * Deciding whether a transaction the bank just sent is one we already have.
 *
 * ## Why this is the hard part
 *
 * Two sources describe the same money. The Bankin' export has been feeding the
 * database for years; the API now offers the same movements worded slightly
 * differently, dated slightly differently, and reaching back further on some
 * banks than the export ever did. Ingesting them without deciding which ones
 * are already known would double every overlapping month — and the totals that
 * would drift are the ones the user actually looks at.
 *
 * Nothing here touches Prisma, on purpose. Every rule below is a judgement
 * about two records, testable on its own, which is what a matcher has to be:
 * the cost of a wrong answer is a corrupted ledger, not a failed request.
 *
 * ## The rule, and what it deliberately is not
 *
 * A match needs the same account, the same amount to the cent, and a date
 * within a few days — banks and Bankin' disagree by a day or two on when a card
 * payment happened. The label then confirms or breaks the tie; it is never the
 * primary key, because it is the field the two sources agree on least.
 *
 * When several candidates survive, the answer is *ambiguous*, not a guess. Two
 * transfers of the same amount days apart are genuinely indistinguishable, and
 * phase 2 found exactly that: two 50 € transfers between the same people. A
 * human settles those.
 */

/** A transaction as the bank sent it, already reduced to what matching needs. */
export interface StagedTransaction {
  /** Identifies which bank account it came from, in the bank's own terms. */
  externalAccountId: string
  /** `entry_reference`: unique per account, absent on no bank seen so far. */
  externalId: string | null
  /** Booking date, day precision. */
  date: string
  /** Signed: expenses negative, like the rest of this codebase. */
  amount: number
  label: string
}

/** A transaction already in the database, reduced the same way. */
export interface LedgerTransaction {
  id: string
  accountId: string
  date: string
  amount: number
  description: string
  /** Set once the row carries a bank identity; null for every CSV row. */
  externalId: string | null
}

export interface MatchCandidate {
  transactionId: string
  similarity: number
}

/**
 * What the reconciliation concluded about one staged transaction.
 *
 * `alreadyLinked` is separate from `matched` because they call for different
 * actions: the first is a row the sync has seen before and must leave alone,
 * the second is a CSV row that the sync is about to claim.
 */
export type Verdict =
  | { kind: 'alreadyLinked'; transactionId: string }
  | { kind: 'matched'; transactionId: string; similarity: number }
  | { kind: 'ambiguous'; candidates: MatchCandidate[] }
  | { kind: 'new' }

export interface ReconciliationOptions {
  /** How far apart the two sources may date the same movement. */
  dateToleranceDays?: number
  /**
   * Bank account → the account here it corresponds to.
   *
   * Without it every ledger row is a candidate for every fetched transaction,
   * which is fine for the pass that *learns* the mapping and wrong for any
   * pass that acts on it: a purchase would happily match a look-alike filed
   * under a different account. A bank account absent from the map gets no
   * candidates at all, so its transactions come back visibly unresolved rather
   * than quietly mismatched.
   */
  accountIdByExternalAccountId?: Record<string, string>
  /**
   * Which ledger rows may be claimed.
   *
   * `unlinked` — the default — offers rows no bank reference owns yet, which
   * is the sync arriving on a ledger built from CSV exports.
   *
   * `linked` offers only rows that already carry one, which is the opposite
   * direction: a CSV export arriving on rows the sync has already written.
   * The import deduplicates on a hash that includes the description, and the
   * two sources word a transaction differently, so without this a synced month
   * is re-imported wholesale.
   */
  candidates?: 'unlinked' | 'linked'
  /**
   * Below this, a lone candidate is reported as ambiguous rather than matched.
   * Set to 0 to let amount and date decide alone.
   */
  minimumSimilarity?: number
}

const DEFAULT_DATE_TOLERANCE_DAYS = 3

/**
 * Default 0: on the data measured in phase 2, amount plus date already yielded
 * one-to-one matches with no ambiguity, while similarity varied by bank —
 * median 0.80 at CIC, 0.50 at Boursorama, on the same underlying agreement.
 * Requiring a floor would have rejected good matches for a wording difference.
 */
const DEFAULT_MINIMUM_SIMILARITY = 0

/** Amounts are Decimal(12,2); anything under half a cent is noise. */
const EPSILON = 0.005

const DAY_MS = 86_400_000

/**
 * Strip what the bank wraps around a merchant name.
 *
 * Both sources describe the same purchase, but each pads it: Boursorama writes
 * `CARTE 06/08/26 FITNESS PARK CB*7962`, where the date repeats `booking_date`
 * and the card number names the card rather than the purchase; CIC appends
 * SEPA mandate references like `1052705322624`. Bankin' keeps neither. What
 * remains after removing them is the part the two sources genuinely share.
 */
export function normalizeLabel(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      // Card-line prefix: `CARTE 06/08/26`.
      .replace(/CARTE \d{2}\/\d{2}\/\d{2}/g, ' ')
      // Card number: `CB*7962`.
      .replace(/CB\*?\d+/g, ' ')
      // Mandate and archive references: long digit runs, and the mixed
      // alphanumeric codes banks staple onto SEPA lines.
      .replace(/\b\d{5,}\b/g, ' ')
      .replace(/\b(?=[A-Z0-9]*\d)[A-Z0-9]{8,}\b/g, ' ')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()
  )
}

/** Words worth comparing: short ones carry no signal and inflate the score. */
function tokensOf(text: string): Set<string> {
  return new Set(
    normalizeLabel(text)
      .split(' ')
      .filter(word => word.length > 2)
  )
}

/**
 * How much two labels have in common, as a Jaccard index over their words.
 *
 * Word overlap rather than edit distance: the two sources reorder and truncate
 * far more often than they misspell, and `VIR DE M RICHARD BOILLEY Payment
 * from M Richard Boilley` against `Payment From M Richard Boilley Vir De M
 * Richard Boilley` is the same movement said in a different order.
 */
export function labelSimilarity(left: string, right: string): number {
  const a = tokensOf(left)
  const b = tokensOf(right)
  if (a.size === 0 || b.size === 0) return 0

  let shared = 0
  for (const word of a) if (b.has(word)) shared++
  return shared / (a.size + b.size - shared)
}

/** Whether two dates are close enough to describe the same movement. */
function withinTolerance(left: string, right: string, days: number): boolean {
  const delta = Math.abs(new Date(left).getTime() - new Date(right).getTime())
  return delta <= days * DAY_MS
}

/**
 * Match one staged transaction against the ledger of the account it belongs to.
 *
 * The caller passes only the ledger rows of that account: matching across
 * accounts would turn Boursorama's double reporting of a card purchase into a
 * false match, and a transfer between two of the user's own accounts into a
 * duplicate of itself.
 */
export function reconcileOne(
  staged: StagedTransaction,
  ledger: LedgerTransaction[],
  options: ReconciliationOptions = {}
): Verdict {
  const tolerance = options.dateToleranceDays ?? DEFAULT_DATE_TOLERANCE_DAYS
  const floor = options.minimumSimilarity ?? DEFAULT_MINIMUM_SIMILARITY

  // A row already carrying this bank reference is this transaction, whatever
  // its amount and date say now — that is the whole point of an immutable
  // reference, and it is what keeps a settled transaction from being ingested
  // a second time after the bank restates its date.
  if (staged.externalId !== null) {
    const linked = ledger.find(row => row.externalId === staged.externalId)
    if (linked) return { kind: 'alreadyLinked', transactionId: linked.id }
  }

  const candidates = ledger
    .filter(
      row =>
        // A row already claimed by another bank reference is not available.
        (row.externalId === null || row.externalId === staged.externalId) &&
        Math.abs(row.amount - staged.amount) < EPSILON &&
        withinTolerance(row.date, staged.date, tolerance)
    )
    .map(row => ({
      transactionId: row.id,
      similarity: labelSimilarity(staged.label, row.description),
    }))
    .sort((a, b) => b.similarity - a.similarity)

  if (candidates.length === 0) return { kind: 'new' }

  const best = candidates[0]
  if (!best) return { kind: 'new' }

  if (candidates.length === 1) {
    return best.similarity >= floor
      ? {
          kind: 'matched',
          transactionId: best.transactionId,
          similarity: best.similarity,
        }
      : { kind: 'ambiguous', candidates }
  }

  // Several rows fit the amount and the date. The label decides only if it
  // decides clearly: a best score tied with the runner-up means the label says
  // nothing, and a coin flip here writes a wrong link into the ledger.
  const runnerUp = candidates[1]
  const decisive =
    runnerUp !== undefined &&
    best.similarity > runnerUp.similarity &&
    best.similarity >= floor

  return decisive
    ? {
        kind: 'matched',
        transactionId: best.transactionId,
        similarity: best.similarity,
      }
    : { kind: 'ambiguous', candidates }
}

/** One purchase that several accounts of the same bank reported. */
export interface DuplicateGroup {
  externalAccountIds: string[]
  date: string
  amount: number
  label: string
}

/**
 * Purchases reported by more than one account of the same bank.
 *
 * Boursorama exposes card accounts beside the current accounts they settle
 * onto, and one card purchase appears on both — 597 of them in a single
 * session — with a *different* `entry_reference` on each side, because the API
 * makes that reference unique per account rather than per event.
 *
 * So neither the `(account_id, external_id)` constraint nor `reconcileOne` can
 * see it: to both, these are two unrelated transactions on two unrelated
 * accounts. Only comparing across accounts, on the event itself, catches it.
 *
 * Two separate purchases can legitimately share an amount, a day and a
 * merchant, so a handful of these are real. A pair of accounts colliding
 * hundreds of times is not.
 */
export function findDuplicateGroups(
  staged: StagedTransaction[]
): DuplicateGroup[] {
  const byEvent = new Map<
    string,
    { accounts: Set<string>; date: string; amount: number; label: string }
  >()

  for (const transaction of staged) {
    const label = normalizeLabel(transaction.label)
    const key = `${transaction.amount}|${transaction.date}|${label}`
    const existing = byEvent.get(key)
    if (existing) existing.accounts.add(transaction.externalAccountId)
    else
      byEvent.set(key, {
        accounts: new Set([transaction.externalAccountId]),
        date: transaction.date,
        amount: transaction.amount,
        label,
      })
  }

  return [...byEvent.values()]
    .filter(event => event.accounts.size > 1)
    .map(event => ({
      externalAccountIds: [...event.accounts],
      date: event.date,
      amount: event.amount,
      label: event.label,
    }))
}

/**
 * The event a staged transaction describes, independent of which account
 * reported it. Two rows sharing this key are one purchase seen twice.
 */
export function eventKey(transaction: StagedTransaction): string {
  return `${transaction.amount}|${transaction.date}|${normalizeLabel(transaction.label)}`
}

/**
 * What the reconciliation concluded about one staged transaction, once every
 * other staged transaction has had its say.
 *
 * `duplicate` is the verdict `reconcileOne` cannot reach on its own: the row
 * describes a purchase another staged row already describes, so ingesting both
 * would double it whatever the ledger says.
 */
export type AssignedVerdict =
  | { kind: 'alreadyLinked'; transactionId: string }
  | { kind: 'matched'; transactionId: string; similarity: number }
  | { kind: 'duplicate'; ofIndex: number }
  | { kind: 'ambiguous'; candidates: MatchCandidate[] }
  | { kind: 'new' }

/**
 * Reconcile a whole fetch at once, so that no ledger row is claimed twice.
 *
 * ## Why one-at-a-time is not enough
 *
 * `reconcileOne` answers for a single transaction, and two transactions asked
 * separately will happily give the same answer. Measured against the real
 * ledger, that is not a corner case: 759 ledger rows were claimed by more than
 * one fetched transaction, one of them by six. Written out, each of those is a
 * duplicate.
 *
 * Matching is therefore an assignment, not a series of independent decisions.
 * Each ledger row may be claimed once, and the claims are settled in order of
 * confidence: the most convincing pair takes its row, and the rest compete for
 * what is left.
 *
 * ## Why greedy rather than optimal
 *
 * A globally optimal assignment (Hungarian) would squeeze out a few more
 * pairings, at the cost of an algorithm nobody can eyeball when it produces a
 * surprising link. Greedy-by-confidence is explainable — "this pair scored
 * highest, so it was taken first" — and a matcher whose output cannot be
 * argued with is a matcher whose mistakes go unnoticed. What it cannot settle
 * comes back as `ambiguous`, which is a person's decision anyway.
 */
export function reconcileAll(
  staged: StagedTransaction[],
  ledger: LedgerTransaction[],
  options: ReconciliationOptions = {}
): AssignedVerdict[] {
  const tolerance = options.dateToleranceDays ?? DEFAULT_DATE_TOLERANCE_DAYS
  const floor = options.minimumSimilarity ?? DEFAULT_MINIMUM_SIMILARITY

  // One representative per event. The others are duplicates of it and take no
  // part in the assignment — letting them compete would be letting a purchase
  // claim two ledger rows.
  const representativeOf = new Map<string, number>()
  const duplicateOf = new Map<number, number>()
  staged.forEach((transaction, index) => {
    const key = eventKey(transaction)
    const first = representativeOf.get(key)
    if (first === undefined) representativeOf.set(key, index)
    else duplicateOf.set(index, first)
  })

  const verdicts: AssignedVerdict[] = staged.map(() => ({ kind: 'new' }))
  const claimed = new Set<string>()

  // Rows the sync already owns are settled before anything competes for them.
  const ledgerByExternalId = new Map<string, LedgerTransaction>()
  for (const row of ledger) {
    if (row.externalId !== null) ledgerByExternalId.set(row.externalId, row)
  }

  const contenders: number[] = []
  for (const index of representativeOf.values()) {
    const transaction = staged[index]
    if (!transaction) continue
    const linked =
      transaction.externalId === null
        ? undefined
        : ledgerByExternalId.get(transaction.externalId)
    if (linked) {
      verdicts[index] = { kind: 'alreadyLinked', transactionId: linked.id }
      claimed.add(linked.id)
    } else {
      contenders.push(index)
    }
  }

  // Every plausible pairing, strongest first. Ties are broken by date distance
  // and then by position, so the same input always produces the same output —
  // a matcher that reshuffles between runs cannot be reviewed.
  interface Pair {
    stagedIndex: number
    transactionId: string
    similarity: number
    dayGap: number
  }
  const pairs: Pair[] = []
  const candidatesByIndex = new Map<number, MatchCandidate[]>()

  const mapping = options.accountIdByExternalAccountId
  const wanted = options.candidates ?? 'unlinked'
  for (const index of contenders) {
    const transaction = staged[index]
    if (!transaction) continue
    // An unmapped bank account offers nothing: better a transaction that comes
    // back as new than one matched against another account's look-alike.
    const expectedAccountId = mapping?.[transaction.externalAccountId]
    if (mapping !== undefined && expectedAccountId === undefined) {
      candidatesByIndex.set(index, [])
      continue
    }
    const candidates: MatchCandidate[] = []
    for (const row of ledger) {
      if (
        expectedAccountId !== undefined &&
        row.accountId !== expectedAccountId
      )
        continue
      // Which side of the ledger is on offer. See `candidates` for why the
      // import needs the opposite of what the sync does.
      const alreadySynced = row.externalId !== null
      if (wanted === 'unlinked' ? alreadySynced : !alreadySynced) continue
      if (Math.abs(row.amount - transaction.amount) >= EPSILON) continue
      if (!withinTolerance(row.date, transaction.date, tolerance)) continue

      const similarity = labelSimilarity(transaction.label, row.description)
      candidates.push({ transactionId: row.id, similarity })
      pairs.push({
        stagedIndex: index,
        transactionId: row.id,
        similarity,
        dayGap: Math.abs(
          new Date(row.date).getTime() - new Date(transaction.date).getTime()
        ),
      })
    }
    candidates.sort((a, b) => b.similarity - a.similarity)
    candidatesByIndex.set(index, candidates)
  }

  pairs.sort(
    (a, b) =>
      b.similarity - a.similarity ||
      a.dayGap - b.dayGap ||
      a.stagedIndex - b.stagedIndex ||
      a.transactionId.localeCompare(b.transactionId)
  )

  const assigned = new Set<number>()
  for (const pair of pairs) {
    if (assigned.has(pair.stagedIndex)) continue
    if (claimed.has(pair.transactionId)) continue
    if (pair.similarity < floor) continue

    verdicts[pair.stagedIndex] = {
      kind: 'matched',
      transactionId: pair.transactionId,
      similarity: pair.similarity,
    }
    assigned.add(pair.stagedIndex)
    claimed.add(pair.transactionId)
  }

  // A contender that found candidates but was outbid for all of them is not
  // "new": something in the ledger looks like it, and only a person can say
  // whether the resemblance is the same movement or a coincidence.
  for (const index of contenders) {
    if (assigned.has(index)) continue
    const candidates = candidatesByIndex.get(index) ?? []
    if (candidates.length > 0)
      verdicts[index] = { kind: 'ambiguous', candidates }
  }

  for (const [index, representative] of duplicateOf) {
    verdicts[index] = { kind: 'duplicate', ofIndex: representative }
  }

  return verdicts
}

export interface ReconciliationSummary {
  total: number
  alreadyLinked: number
  matched: number
  duplicate: number
  ambiguous: number
  new: number
}

/** Count the verdicts, which is what decides whether a sync is safe to run. */
export function summarize(
  verdicts: (Verdict | AssignedVerdict)[]
): ReconciliationSummary {
  const summary: ReconciliationSummary = {
    total: verdicts.length,
    alreadyLinked: 0,
    matched: 0,
    duplicate: 0,
    ambiguous: 0,
    new: 0,
  }
  for (const verdict of verdicts) summary[verdict.kind]++
  return summary
}
