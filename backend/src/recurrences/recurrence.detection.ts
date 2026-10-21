/**
 * Which of a user's expenses come back on their own.
 *
 * ## Why it exists
 *
 * A category names a purpose, never a way of paying: Netflix is leisure, the
 * phone plan is telecom, and there is no "Subscriptions" heading to add them
 * up. Yet "what do I pay every month, and what could I stop" is a real
 * question. A recurrence answers it without a category or a tag, because it
 * is a property the ledger already shows: the same merchant, about the same
 * amount, at a regular interval.
 *
 * ## How it reads the ledger
 *
 * 1. Expenses are grouped by merchant: `merchantKey`, then keys close enough
 *    to be the same merchant (`isSameMerchant`) — a landlord's transfer is
 *    sometimes labelled with who sent it, sometimes not.
 * 2. Inside a merchant, amounts are clustered: one shared label (Apple,
 *    PayPal) carries several services, told apart only by their price.
 * 3. Each cluster takes the period its typical gap points to, and is cut
 *    into segments wherever the rhythm breaks. A line too close to the
 *    previous one is an extra (a second line the same month, a one-off
 *    purchase at the same price): it is not counted, and not claimed.
 * 4. A segment that ends where another of the same merchant and period
 *    begins is the same subscription at a new price — Netflix moving
 *    between plans, an insurer revising its premium — and the two become
 *    one recurrence, shown at its latest amount.
 * 5. The user's subscriptions come last: a dismissed one removes what detection
 *    found, a confirmation promotes a candidate or keeps an irregular
 *    charge listed.
 *
 * ## What it refuses to do
 *
 * Guess from a single payment. One line has no interval, so it is never a
 * recurrence, not even an annual candidate; the user confirms it once a
 * second one comes.
 *
 * Pure: no database, no clock. The caller passes the expenses (transfers
 * already out) and the moment of reading.
 */

import { isSameMerchant, merchantKey } from '../ai-suggestions/merchant-memory'
import { humanizeLabel } from '../bank-sync/reconciliation'
import { serviceName } from './recurrence.naming'

export type RecurrencePeriod =
  'WEEKLY' | 'FOUR_WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
export type RecurrenceStatus = 'ACTIVE' | 'STOPPED' | 'CANDIDATE'
export type SubscriptionState = 'CONFIRMED' | 'DISMISSED'

export interface RecurrenceExpense {
  id: string
  date: Date
  /** Signed or not; only its size is read. */
  amount: number
  /**
   * The account's divisor (a joint account's ÷2): what the user's share of
   * the charge is. Shown amounts are divided by it; prices are told apart on
   * the bank's amount, so a series keeps its identity if the divisor moves.
   */
  divisor?: number
  description: string
  categoryId: string | null
  subcategoryId: string | null
}

/**
 * A series the user has a say about, with an identity of its own: followed
 * (CONFIRMED) or set aside (DISMISSED), named, given a rhythm, extended by
 * hand. Detection recognises it by the spellings and the prices it has
 * covered; it learns new ones as the series lives on (`learned`).
 */
export interface SubscriptionInput {
  id: string
  merchantKeys: string[]
  /** Empty: every price of the merchant. */
  amountBuckets: number[]
  state: SubscriptionState
  /** The rhythm the user gave; one payment has no interval to read it from. */
  period: RecurrencePeriod | null
  /** The user's name for it, over the one read from its labels. */
  name: string | null
}

/** An expense the user attached by hand to a subscription. */
export interface SubscriptionLinkInput {
  transactionId: string
  subscriptionId: string
}

export interface DetectedRecurrence {
  /** The user's subscription this series is, when there is one. */
  subscriptionId: string | null
  merchantKey: string
  /** The latest amount rounded to the euro: what tells apart two series of one merchant. */
  amountBucket: number
  /** The most frequent bank label, made readable. */
  label: string
  /** The service it pays for: the user's name, or the one read from its labels. */
  name: string
  categoryId: string | null
  subcategoryId: string | null
  period: RecurrencePeriod
  /** The user's share of the latest charge, positive. */
  amount: number
  monthlyEquivalent: number
  occurrences: number
  /** Everything the series has cost the user, every price it ran at. */
  totalPaid: number
  firstDate: Date
  lastDate: Date
  nextExpected: Date
  status: RecurrenceStatus
  transactionIds: string[]
}

/** Spellings and prices a subscription was recognised by this time. */
export interface SubscriptionMatch {
  merchantKeys: string[]
  amountBuckets: number[]
}

export interface DetectionResult {
  recurrences: DetectedRecurrence[]
  /** By subscription id: what each recognised subscription now covers. */
  learned: Map<string, SubscriptionMatch>
}

export interface DetectOptions {
  now: Date
  subscriptions?: SubscriptionInput[]
  links?: SubscriptionLinkInput[]
}

interface PeriodRule {
  /** Shortest and longest gap, in days, still on rhythm. */
  min: number
  max: number
  /** Nominal length, in days. */
  days: number
  /** Calendar step to the next charge. */
  step: { days?: number; months?: number }
  /** Charges per month. */
  perMonth: number
  /** Occurrences before a segment is a recurrence rather than a candidate. */
  minOccurrences: number
}

/**
 * The windows are wider than a calendar would suggest because the ledger is:
 * a debit due on a Saturday lands on the Monday, a rent paid by hand goes
 * out on the 1st one month and the 7th the next. Rows seen in production
 * run from 27 to 36 days apart for a monthly charge.
 */
const PERIODS: Record<RecurrencePeriod, PeriodRule> = {
  WEEKLY: {
    min: 5,
    max: 9,
    days: 7,
    step: { days: 7 },
    perMonth: 52 / 12,
    minOccurrences: 3,
  },
  /**
   * Gyms bill every 28 days, thirteen times a year: on the monthly window,
   * told apart afterwards by its mean gap (`refinePeriod`), never inferred
   * from a gap alone.
   */
  FOUR_WEEKLY: {
    min: 24,
    max: 38,
    days: 28,
    step: { days: 28 },
    perMonth: 13 / 12,
    minOccurrences: 3,
  },
  MONTHLY: {
    min: 24,
    max: 38,
    days: 365.25 / 12,
    step: { months: 1 },
    perMonth: 1,
    minOccurrences: 3,
  },
  QUARTERLY: {
    min: 80,
    max: 100,
    days: 365.25 / 4,
    step: { months: 3 },
    perMonth: 1 / 3,
    minOccurrences: 3,
  },
  /** Tight: an annual plan renews on its date, a purchase a year later does not. */
  YEARLY: {
    min: 358,
    max: 372,
    days: 365.25,
    step: { months: 12 },
    perMonth: 1 / 12,
    minOccurrences: 2,
  },
}

const PERIOD_ORDER: RecurrencePeriod[] = [
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
]

/**
 * Every other threshold detection applies, in one place. Each was set on a
 * case read in production; the whole-ledger snapshot
 * (`recurrence.ledgers.spec.ts`) shows what changing one does.
 */
const RULES = {
  /**
   * Two amounts are one price within 5 %, or within a euro for small ones:
   * the rent revised from 650 to 660, AMV from 28.50 to 29.50.
   */
  amountTolerance: { ratio: 0.05, floor: 1 },
  /**
   * A run survives a gap of up to this many periods — one charge missing
   * from the ledger (Apple has no February 2026 line).
   */
  missedChargeSpan: 2,
  /**
   * Missed charges a chain may have: none under this many gaps, then one
   * per `gapsPerMissed` (at least one). A café every 42, 42 and 63 days is
   * no monthly rhythm.
   */
  missedCharges: { minGaps: 4, gapsPerMissed: 10 },
  /**
   * Same-price lines left out of a run may number at most this many per
   * line in it: 19 toll passes beside a "monthly" run of 4 are a habit.
   */
  leftOutPerLine: 1,
  /** A run of at least this many lines is a series of its own, not left-outs. */
  runOfItsOwn: 3,
  /**
   * A monthly chain with at least this many on-rhythm gaps averaging at
   * most this many days bills every four weeks (gyms: 28 days, 13 a year).
   */
  fourWeekly: { minGaps: 3, maxMeanGap: 29 },
  /** Two merchants a spelling bridges become one when they share this many words. */
  bridgeSharedWords: 2,
} as const

const DAY_MS = 86_400_000

interface Line {
  id: string
  time: number
  amount: number
  /** The user's share of `amount`: the account divisor applied. */
  share: number
  description: string
  categoryId: string | null
  subcategoryId: string | null
}

interface Segment {
  lines: Line[]
  period: RecurrencePeriod
  /** Every line at this price, the run's own included. */
  cluster: Line[]
}

/** One merchant's lines, under every spelling folded into it. */
export interface MerchantGroup<T> {
  /** The most common spelling, which names the merchant. */
  key: string
  /** Every key folded into this merchant, for matching decisions. */
  keys: Set<string>
  lines: T[]
}

type Merchant = MerchantGroup<Line>

interface Chain {
  merchant: Merchant
  period: RecurrencePeriod
  lines: Line[]
  /** Every amount the chain was charged at, rounded: what a decision may name. */
  buckets: Set<number>
  /** The price clusters its runs came from. */
  clusters: Set<Line[]>
}

function daysBetween(from: number, to: number): number {
  return Math.round((to - from) / DAY_MS)
}

/** Median of a list the caller knows is not empty. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const upper = sorted[middle] ?? 0
  return sorted.length % 2 === 1
    ? upper
    : ((sorted[middle - 1] ?? upper) + upper) / 2
}

/** First and last line of a run, which is never empty once built. */
function firstLine(lines: Line[]): Line {
  const line = lines[0]
  if (!line) throw new Error('A run of charges cannot be empty')
  return line
}

function lastLine(lines: Line[]): Line {
  return firstLine(lines.slice(-1))
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

function bucketOf(amount: number): number {
  return Math.round(amount)
}

function addStep(time: number, period: RecurrencePeriod): Date {
  const date = new Date(time)
  const { step } = PERIODS[period]
  if (step.days) date.setUTCDate(date.getUTCDate() + step.days)
  if (step.months) date.setUTCMonth(date.getUTCMonth() + step.months)
  return date
}

/**
 * Fold the expenses into merchants. Keys are visited from the most frequent
 * down; a key joins the merchants whose main spelling it resembles.
 * Two merchants it bridges become one only when they share two words: a
 * rent transfer labelled with whoever sent it — "begon chloe patrice
 * torres", "begon boilley patrice richard" — meets through the bare "begon
 * patrice", but "amazon prime" and "amazon payments" stay apart although
 * "amazon" alone resembles both. The merchant is named after its most
 * common spelling. The spending trends group their merchants with it too,
 * so « the same merchant » never means two things.
 */
export function groupByMerchant<T extends { key: string }>(
  lines: T[]
): Array<MerchantGroup<T>> {
  const byKey = new Map<string, T[]>()
  for (const line of lines) {
    const bucket = byKey.get(line.key) ?? []
    bucket.push(line)
    byKey.set(line.key, bucket)
  }
  const spellings = [...byKey.entries()].sort(
    ([a, left], [b, right]) => right.length - left.length || a.localeCompare(b)
  )

  let merchants: Array<MerchantGroup<T>> = []
  for (const [key, keyLines] of spellings) {
    // Against each merchant's main spelling: a bare "amazon" absorbed by
    // one merchant must not then pull "amazon prime" in after it.
    const matching = merchants.filter(m => isSameMerchant(m.key, key))
    const [first, ...others] = matching
    if (!first) {
      merchants.push({ key, keys: new Set([key]), lines: [...keyLines] })
      continue
    }
    first.keys.add(key)
    first.lines.push(...keyLines)
    const bridged = others.filter(other => shareTwoWords(first, other))
    for (const other of bridged) {
      for (const known of other.keys) first.keys.add(known)
      first.lines.push(...other.lines)
    }
    merchants = merchants.filter(m => !bridged.includes(m))
  }
  return merchants
}

/** Whether two merchants have spellings with two words in common. */
function shareTwoWords(
  left: MerchantGroup<unknown>,
  right: MerchantGroup<unknown>
): boolean {
  for (const a of left.keys) {
    const words = new Set(a.split(' '))
    for (const b of right.keys) {
      if (
        b.split(' ').filter(word => words.has(word)).length >=
        RULES.bridgeSharedWords
      ) {
        return true
      }
    }
  }
  return false
}

/** Cluster a merchant's lines by price, cheapest first. */
function clusterByAmount(lines: Line[]): Line[][] {
  const sorted = [...lines].sort(
    (a, b) => a.amount - b.amount || a.time - b.time || a.id.localeCompare(b.id)
  )
  const clusters: Line[][] = []
  let current: Line[] = []
  for (const line of sorted) {
    if (current.length > 0) {
      const center = median(current.map(l => l.amount))
      const tolerance = Math.max(
        center * RULES.amountTolerance.ratio,
        RULES.amountTolerance.floor
      )
      if (line.amount - center > tolerance) {
        clusters.push(current)
        current = []
      }
    }
    current.push(line)
  }
  if (current.length > 0) clusters.push(current)
  return clusters.map(c =>
    c.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
  )
}

/** The period a typical gap falls in, or null when it falls in none. */
function periodForGap(gap: number): RecurrencePeriod | null {
  return (
    PERIOD_ORDER.find(p => gap >= PERIODS[p].min && gap <= PERIODS[p].max) ??
    null
  )
}

/** The period closest to a gap, for a confirmed charge too irregular to have one. */
function nearestPeriod(gap: number): RecurrencePeriod {
  let best: RecurrencePeriod = 'MONTHLY'
  for (const period of PERIOD_ORDER) {
    if (
      Math.abs(PERIODS[period].days - gap) < Math.abs(PERIODS[best].days - gap)
    ) {
      best = period
    }
  }
  return best
}

/**
 * Gaps between the distinct days of a cluster. Same-week repeats are left
 * out so that a second line the same month does not drag the median down.
 */
function clusterGaps(lines: Line[]): number[] {
  const gaps: number[] = []
  lines.slice(1).forEach((line, index) => {
    const gap = daysBetween(firstLine(lines.slice(index)).time, line.time)
    if (gap >= PERIODS.WEEKLY.min) gaps.push(gap)
  })
  return gaps
}

/**
 * Whether a gap keeps a run going: one period, or two when a single charge
 * is missing from the ledger — a debit that failed and was taken with the
 * next, a month the bank export skipped.
 */
function continuesRun(gap: number, rule: PeriodRule): boolean {
  return gap >= rule.min && gap <= RULES.missedChargeSpan * rule.max
}

/**
 * Cut a cluster into runs on its period. A line closer to the run's last
 * one than the period allows is an extra and is skipped; a line further
 * away than one missed charge allows starts a new run.
 */
function segmentCluster(lines: Line[]): Segment[] {
  const gaps = clusterGaps(lines)
  if (gaps.length === 0) return []
  const period = periodForGap(median(gaps))
  if (!period) return []
  const rule = PERIODS[period]

  const segments: Segment[] = []
  let current: Line[] = [firstLine(lines)]
  for (const line of lines.slice(1)) {
    const gap = daysBetween(lastLine(current).time, line.time)
    if (gap < rule.min) continue
    if (!continuesRun(gap, rule)) {
      segments.push({ lines: current, period, cluster: lines })
      current = [line]
      continue
    }
    current.push(line)
  }
  segments.push({ lines: current, period, cluster: lines })
  return segments.filter(s => s.lines.length >= 2)
}

const firstOf = (s: { lines: Line[] }): number => firstLine(s.lines).time
const lastOf = (s: { lines: Line[] }): number => lastLine(s.lines).time

/**
 * Join each segment to the one it took over from: same merchant, same
 * period, starting one period after the other stopped. Each segment has at
 * most one predecessor and one successor; the latest-ending candidate wins.
 */
function chainSegments(merchant: Merchant, segments: Segment[]): Chain[] {
  const ordered = [...segments].sort((a, b) => firstOf(a) - firstOf(b))
  const predecessor = new Map<Segment, Segment>()
  const taken = new Set<Segment>()

  for (const next of ordered) {
    const rule = PERIODS[next.period]
    let best: Segment | null = null
    for (const previous of ordered) {
      if (previous === next || taken.has(previous)) continue
      if (previous.period !== next.period) continue
      const gap = daysBetween(lastOf(previous), firstOf(next))
      if (!continuesRun(gap, rule)) continue
      if (!best || lastOf(previous) > lastOf(best)) best = previous
    }
    if (best) {
      predecessor.set(next, best)
      taken.add(best)
    }
  }

  return ordered
    .filter(segment => !taken.has(segment))
    .map(head => {
      const lines: Line[] = []
      const clusters = new Set<Line[]>()
      let segment: Segment | undefined = head
      while (segment) {
        lines.unshift(...segment.lines)
        clusters.add(segment.cluster)
        segment = predecessor.get(segment)
      }
      return {
        merchant,
        period: head.period,
        lines,
        buckets: new Set(lines.map(l => bucketOf(l.amount))),
        clusters,
      }
    })
}

/**
 * Whether a chain reads as a commitment rather than a habit. Production
 * showed what a rhythm alone lets through: a laundry, a toll, a supermarket
 * paid at the same price often enough that some of its lines fall on a
 * rhythm. Two things give a habit away.
 *
 * - Lines left out: a subscription is charged on its rhythm and nowhere
 *   else; a habit has more same-price lines beside the run than in it
 *   (19 toll passes beside a "monthly" run of 4). Lines of another real run
 *   at that price (three or more) are not counted against it.
 * - Missed charges: one is a failed debit, a skipped export; a run of them
 *   is no rhythm (a café every 42, 42 and 63 days). None is allowed under
 *   four gaps, then one per ten.
 */
function gapsOf(lines: Line[]): number[] {
  return lines
    .slice(1)
    .map((line, index) =>
      daysBetween(firstLine(lines.slice(index)).time, line.time)
    )
}

/**
 * A chain with more missed charges than it may have is cut at each of them
 * and every piece judged on its own: a messy year must not take down the
 * clean run that follows it, and a habit falls apart into pieces too short
 * to be anything.
 */
function splitAtMisses(chain: Chain): Chain[] {
  const rule = PERIODS[chain.period]
  const gaps = gapsOf(chain.lines)
  const missed = gaps.filter(gap => gap > rule.max).length
  const allowed =
    gaps.length < RULES.missedCharges.minGaps
      ? 0
      : Math.max(1, Math.floor(gaps.length / RULES.missedCharges.gapsPerMissed))
  if (missed <= allowed) return [chain]

  const pieces: Line[][] = [[firstLine(chain.lines)]]
  chain.lines.slice(1).forEach((line, index) => {
    if ((gaps[index] ?? 0) > rule.max) pieces.push([line])
    else pieces[pieces.length - 1]?.push(line)
  })
  return pieces
    .filter(lines => lines.length >= 2)
    .map(lines => ({
      ...chain,
      lines,
      buckets: new Set(lines.map(l => bucketOf(l.amount))),
    }))
}

function isCredible(chain: Chain, segments: Segment[]): boolean {
  const inRuns = new Set(chain.lines.map(l => l.id))
  for (const segment of segments) {
    if (segment.lines.length < RULES.runOfItsOwn) continue
    for (const line of segment.lines) inRuns.add(line.id)
  }
  let leftOut = 0
  for (const cluster of chain.clusters) {
    for (const line of cluster) if (!inRuns.has(line.id)) leftOut++
  }
  return leftOut <= RULES.leftOutPerLine * chain.lines.length
}

/**
 * A monthly chain whose charges come every 28 days is a four-weekly one:
 * the mean of its on-rhythm gaps gives it away once there are three of them
 * (a calendar month averages 30.4 days; a February alone does not decide).
 */
function refinePeriod(chain: Chain): Chain {
  if (chain.period !== 'MONTHLY') return chain
  const rule = PERIODS.MONTHLY
  const gaps = chain.lines
    .slice(1)
    .map((line, index) =>
      daysBetween(firstLine(chain.lines.slice(index)).time, line.time)
    )
    .filter(gap => gap <= rule.max)
  if (gaps.length < RULES.fourWeekly.minGaps) return chain
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
  return mean <= RULES.fourWeekly.maxMeanGap
    ? { ...chain, period: 'FOUR_WEEKLY' }
    : chain
}

function statusOf(
  chain: { period: RecurrencePeriod; lines: Line[] },
  now: number
): RecurrenceStatus | null {
  const rule = PERIODS[chain.period]
  // A stopped charge stays listed for good: it is the history of what the
  // user paid for, and its past months stay committed on the dashboard.
  if (isOverdue(chain, rule, now)) {
    return chain.lines.length >= rule.minOccurrences ? 'STOPPED' : null
  }
  return chain.lines.length >= rule.minOccurrences ? 'ACTIVE' : 'CANDIDATE'
}

/**
 * Ended as soon as the next charge is later than the longest gap the
 * period's window accepts: 38 days for a monthly, 372 for an annual. A
 * late debit shows the charge as ended until it arrives, which brings it
 * back.
 */
function isOverdue(
  chain: { lines: Line[] },
  rule: PeriodRule,
  now: number
): boolean {
  return (now - lastOf(chain)) / DAY_MS > rule.max
}

/** The description seen most often, the latest breaking a tie, made readable. */
function labelOf(lines: Line[]): string {
  const counts = new Map<string, { count: number; time: number }>()
  for (const line of lines) {
    const entry = counts.get(line.description) ?? { count: 0, time: 0 }
    entry.count++
    entry.time = Math.max(entry.time, line.time)
    counts.set(line.description, entry)
  }
  const [description] = [...counts.entries()].sort(
    ([, a], [, b]) => b.count - a.count || b.time - a.time
  )[0] ?? ['']
  return humanizeLabel(description)
}

/** The labels of a chain, each once, the latest first. */
function labelsOf(lines: Line[]): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const line of [...lines].reverse()) {
    if (seen.has(line.description)) continue
    seen.add(line.description)
    labels.push(line.description)
  }
  return labels
}

function toRecurrence(
  chain: Chain,
  status: RecurrenceStatus,
  subscription: SubscriptionInput | null
): DetectedRecurrence {
  const latest = lastLine(chain.lines)
  const rule = PERIODS[chain.period]
  return {
    subscriptionId: subscription?.id ?? null,
    merchantKey: chain.merchant.key,
    amountBucket: bucketOf(latest.amount),
    label: labelOf(chain.lines),
    name: subscription?.name ?? serviceName(labelsOf(chain.lines)),
    categoryId: latest.categoryId,
    subcategoryId: latest.subcategoryId,
    period: chain.period,
    amount: roundCents(latest.share),
    monthlyEquivalent: roundCents(latest.share * rule.perMonth),
    occurrences: chain.lines.length,
    totalPaid: roundCents(chain.lines.reduce((sum, l) => sum + l.share, 0)),
    firstDate: new Date(firstOf(chain)),
    lastDate: new Date(lastOf(chain)),
    nextExpected: addStep(lastOf(chain), chain.period),
    status,
    transactionIds: chain.lines.map(l => l.id),
  }
}

/** Whether a subscription covers a merchant at one of these prices. */
function subscriptionMatches(
  subscription: SubscriptionInput,
  merchant: Merchant,
  buckets: Set<number>
): boolean {
  if (!subscription.merchantKeys.some(key => merchant.keys.has(key))) {
    return false
  }
  return (
    subscription.amountBuckets.length === 0 ||
    subscription.amountBuckets.some(bucket => buckets.has(bucket))
  )
}

/**
 * A subscription detection cannot see as regular — an annual plan paid
 * once, a charge gone irregular: every line at the prices it covers, on
 * the rhythm the user gave, else the one nearest its typical gap.
 */
function rebuildFromLines(
  merchant: Merchant,
  lines: Line[],
  now: number,
  declared: RecurrencePeriod | null
): { chain: Chain; status: RecurrenceStatus } {
  const sorted = [...lines].sort(
    (a, b) => a.time - b.time || a.id.localeCompare(b.id)
  )
  const gaps = clusterGaps(sorted)
  const period =
    declared ?? (gaps.length > 0 ? nearestPeriod(median(gaps)) : 'MONTHLY')
  const chain: Chain = {
    merchant,
    period,
    lines: sorted,
    buckets: new Set(sorted.map(l => bucketOf(l.amount))),
    clusters: new Set([sorted]),
  }
  const overdue = isOverdue(chain, PERIODS[period], now)
  return { chain, status: overdue ? 'STOPPED' : 'ACTIVE' }
}

/**
 * Fold the lines the user attached into their subscription's series. A
 * series the user extended by hand is one they follow: it reads its status
 * from its new last line, never as a candidate.
 */
function attachLinks(
  chain: Chain,
  linked: Line[],
  now: number
): { chain: Chain; status: RecurrenceStatus } {
  const lines = [...chain.lines, ...linked].sort(
    (a, b) => a.time - b.time || a.id.localeCompare(b.id)
  )
  const merged: Chain = { ...chain, lines }
  const overdue = isOverdue(merged, PERIODS[merged.period], now)
  return { chain: merged, status: overdue ? 'STOPPED' : 'ACTIVE' }
}

function learn(
  learned: Map<string, SubscriptionMatch>,
  subscription: SubscriptionInput,
  merchant: Merchant,
  buckets: Set<number>
): void {
  const previous = learned.get(subscription.id)
  const keys = new Set([
    ...subscription.merchantKeys,
    ...(previous?.merchantKeys ?? []),
    ...merchant.keys,
  ])
  // A subscription covering every price keeps covering every price.
  const prices =
    subscription.amountBuckets.length === 0
      ? []
      : [
          ...new Set([
            ...subscription.amountBuckets,
            ...(previous?.amountBuckets ?? []),
            ...buckets,
          ]),
        ].sort((a, b) => a - b)
  learned.set(subscription.id, {
    merchantKeys: [...keys].sort(),
    amountBuckets: prices,
  })
}

export function detect(
  expenses: RecurrenceExpense[],
  options: DetectOptions
): DetectionResult {
  const now = options.now.getTime()
  const subscriptions = options.subscriptions ?? []
  const links = options.links ?? []
  const confirmed = subscriptions.filter(s => s.state === 'CONFIRMED')
  const dismissed = subscriptions.filter(s => s.state === 'DISMISSED')
  const learned = new Map<string, SubscriptionMatch>()

  const all = expenses
    .map(expense => ({
      id: expense.id,
      time: expense.date.getTime(),
      amount: Math.abs(expense.amount),
      share: Math.abs(expense.amount) / (expense.divisor || 1),
      description: expense.description,
      categoryId: expense.categoryId,
      subcategoryId: expense.subcategoryId,
      key: merchantKey(expense.description),
    }))
    .filter(line => line.amount > 0)
  // A line the user attached belongs to that subscription alone: it takes
  // no part in reading rhythms elsewhere.
  const linkOf = new Map(links.map(link => [link.transactionId, link]))
  const linkedLines = all.filter(line => linkOf.has(line.id))
  const linkedTo = (subscriptionId: string): Line[] =>
    linkedLines.filter(
      line => linkOf.get(line.id)?.subscriptionId === subscriptionId
    )
  const lines = all.filter(line => line.key !== '' && !linkOf.has(line.id))

  /** Each subscription is one series at most: its identity is unique. */
  const assigned = new Set<string>()
  const results: DetectedRecurrence[] = []
  const emit = (
    chain: Chain,
    status: RecurrenceStatus,
    subscription: SubscriptionInput | null
  ): void => {
    if (subscription) {
      assigned.add(subscription.id)
      const extended = attachLinks(chain, linkedTo(subscription.id), now)
      results.push(toRecurrence(extended.chain, extended.status, subscription))
    } else {
      results.push(toRecurrence(chain, status, null))
    }
  }

  for (const merchant of groupByMerchant(lines)) {
    const clusters = clusterByAmount(merchant.lines)
    const segments = clusters.flatMap(segmentCluster)
    const chains = chainSegments(merchant, segments)
      .flatMap(splitAtMisses)
      .filter(chain => isCredible(chain, segments))
      .map(refinePeriod)

    // One recurrence per price: a series that paused and resumed at the
    // same amount is shown once, as its latest run.
    const byBucket = new Map<
      number,
      { chain: Chain; status: RecurrenceStatus }
    >()
    for (const chain of chains) {
      const status = statusOf(chain, now)
      if (!status) continue
      const bucket = bucketOf(lastLine(chain.lines).amount)
      const existing = byBucket.get(bucket)
      if (!existing || lastOf(existing.chain) < lastOf(chain)) {
        byBucket.set(bucket, { chain, status })
      }
    }

    for (const { chain, status } of byBucket.values()) {
      const setAside = dismissed.filter(s =>
        subscriptionMatches(s, merchant, chain.buckets)
      )
      if (setAside.length > 0) {
        for (const s of setAside) learn(learned, s, merchant, chain.buckets)
        continue
      }
      const followed = confirmed.find(
        s =>
          !assigned.has(s.id) && subscriptionMatches(s, merchant, chain.buckets)
      )
      if (followed) learn(learned, followed, merchant, chain.buckets)
      emit(chain, status, followed ?? null)
    }

    // Followed subscriptions detection found no series for: rebuilt from
    // every line at the prices they cover.
    for (const subscription of confirmed) {
      if (assigned.has(subscription.id)) continue
      if (subscription.amountBuckets.length === 0) continue
      if (!subscription.merchantKeys.some(key => merchant.keys.has(key))) {
        continue
      }
      const covered = clusters
        .filter(cluster =>
          subscriptionMatches(
            subscription,
            merchant,
            new Set(cluster.map(l => bucketOf(l.amount)))
          )
        )
        .flat()
      if (covered.length === 0) continue
      const rebuilt = rebuildFromLines(
        merchant,
        covered,
        now,
        subscription.period
      )
      learn(learned, subscription, merchant, rebuilt.chain.buckets)
      emit(rebuilt.chain, rebuilt.status, subscription)
    }
  }

  // Followed subscriptions made only of lines attached by hand.
  for (const subscription of confirmed) {
    if (assigned.has(subscription.id)) continue
    const own = linkedTo(subscription.id)
    if (own.length === 0) continue
    const key =
      subscription.merchantKeys[0] ?? merchantKey(lastLine(own).description)
    const merchant: Merchant = { key, keys: new Set([key]), lines: own }
    const rebuilt = rebuildFromLines(merchant, own, now, subscription.period)
    assigned.add(subscription.id)
    results.push(toRecurrence(rebuilt.chain, rebuilt.status, subscription))
  }

  results.sort(
    (a, b) =>
      b.monthlyEquivalent - a.monthlyEquivalent ||
      a.name.localeCompare(b.name) ||
      a.amountBucket - b.amountBucket
  )
  return { recurrences: results, learned }
}

/** The recurrences alone, for callers that do not keep subscriptions up to date. */
export function detectRecurrences(
  expenses: RecurrenceExpense[],
  options: DetectOptions
): DetectedRecurrence[] {
  return detect(expenses, options).recurrences
}
