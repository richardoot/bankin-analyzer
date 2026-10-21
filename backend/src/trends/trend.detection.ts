/**
 * What changes in a user's everyday spending, month against habit.
 *
 * ## Why it exists
 *
 * The dashboard describes a state: what a period cost, month by month and
 * category by category. It never says what *changes*. This reads the ledger
 * the way the dashboard does and says it in a few sentences: « Restaurants et
 * bars : 312 € en septembre, +38 % par rapport à l'habitude », « Livraison de
 * repas : 3 achats contre 9 par mois d'habitude ».
 * See agent-os/product/spending-trends.md.
 *
 * ## How it reads the ledger
 *
 * 1. Every month of the span is aggregated with the dashboard's own
 *    conventions: the amounts arrive net and divided (the caller applied
 *    `netAmountSql`), the everyday reading drops exceptional lines and trades
 *    a smoothed purchase for its slices, an uncategorised line counts in the
 *    month's total and in no unit. The units of a month add up to its total.
 * 2. Only complete months are read. The month read is the last closed one by
 *    default; the reference is the median of the N complete months before it
 *    (N = 3, 6 or 12, shortened to the history, silent under 3).
 * 3. Four trends (the catalogue's 1 to 4): a category or subcategory's amount,
 *    a variable subcategory's frequency and average basket, the pleasure and
 *    committed shares. A committed subcategory, a recurrence line or a
 *    smoothing slice never feeds a frequency or a basket: a charge that moves
 *    at constant frequency is a price, not a behaviour.
 *    And the catalogue's 5, which reads no habit: the month's lines still to
 *    file, which every other trend leaves unread. It comes first, since it
 *    says how much the others can be trusted.
 * 4. An amount trend and its decomposition (Δamount = Δfrequency × reference
 *    basket + frequency × Δbasket) are one line: the dominant term chooses
 *    the sentence.
 * 5. Merchants (the catalogue's 6 to 8), grouped by `merchantKey` and
 *    `groupByMerchant` as the recurrences group them: visited more or less
 *    often (distinct days, against the habit), new over the last two months,
 *    gone this month after five of the six before. A variable subcategory
 *    gone the same way says it too. The lines of a recurrence never make a
 *    habit, nor do committed, exceptional or smoothed ones.
 * 6. Selection: scored by the gap in euros, a subcategory replaces its
 *    category when it explains 70 % of the category's gap, the category its
 *    subcategories otherwise; a merchant and its unit the same way. Merchants
 *    are units of their own, outside the sum of a month.
 *
 * ## What it refuses to do
 *
 * Compare the current month (two thirds of a month is always « en baisse »),
 * judge a rise, or call a drop a success anywhere but on a pleasure and
 * variable unit.
 *
 * Pure: no database, no clock. The caller passes the registry and the moment
 * of reading.
 */

import { merchantKey } from '../ai-suggestions/merchant-memory'
import { groupByMerchant } from '../recurrences/recurrence.detection'
import { serviceName } from '../recurrences/recurrence.naming'
import { calendarDayIn } from '../tags/tag-status'

/** Every threshold in one place, tuned on the dry run, not on screen. */
export const TREND_RULES = {
  /** The reference windows the card offers, in complete months. */
  windows: [3, 6, 12] as const,
  defaultWindow: 6,
  /** Under this many complete months, every habit trend is silent. */
  minHistoryMonths: 3,
  /**
   * A history starting on or before this day of its first month counts that
   * month as complete: an export taken on the 2nd still covers the month.
   */
  firstMonthGraceDays: 7,
  /** The months a trend's sparkline shows, the month read included. */
  seriesMonths: 7,
  /** What the card shows before « Voir tout ». */
  shown: 5,
  /** Trend 1: silent under 15 % or under 30 €. */
  amount: { minRatio: 0.15, minEuros: 30 },
  /** Trend 2: silent under 2 lines or 30 %, or when the larger side is under 4 lines. */
  frequency: { minLines: 2, minRatio: 0.3, minPeak: 4 },
  /** Trend 3: silent under 20 %, or with fewer than 3 lines on either side. */
  basket: { minRatio: 0.2, minLines: 3 },
  /** Trend 4: silent under 5 points. */
  share: { minPoints: 5 },
  /** A subcategory replaces its category when it explains this much of its gap. */
  subcategoryExplains: 0.7,
  /** Trend 5: silent under 5 lines and under 10 % of the month's lines. */
  uncategorized: { minLines: 5, minShare: 0.1 },
  /**
   * Trend 6: a merchant's distinct days, on trend 2's thresholds, and at
   * least `minLines` on one side. A merchant making `coversUnit` of its
   * subcategory (or category) is that unit: the unit speaks, not it.
   */
  merchant: { minLines: 3, coversUnit: 0.9 },
  /**
   * Trend 7: at least `minLines` days at the merchant over the last
   * `recentMonths` (the month read included, with a line in it), none in the
   * `unseenMonths` before, of which `minUnseenMonths` at least inside the
   * history.
   */
  newHabit: {
    recentMonths: 2,
    minLines: 3,
    unseenMonths: 6,
    minUnseenMonths: 3,
  },
  /**
   * Trend 8: a line in at least `minPresentMonths` of the
   * `referenceMonths` before the month read, none in it.
   */
  lostHabit: { referenceMonths: 6, minPresentMonths: 5 },
  /** How far back the card's month selector goes, in closed months. */
  selectableMonths: 24,
} as const

export type TrendWindow = (typeof TREND_RULES.windows)[number]
export type TrendReading = 'everyday' | 'real'
export type TrendReference = 'median' | 'mean'
export type TrendNature = 'ESSENTIAL' | 'PLEASURE'
export type TrendRhythm = 'COMMITTED' | 'VARIABLE'
export type TrendKind =
  | 'amount'
  | 'frequency'
  | 'basket'
  | 'share'
  | 'uncategorized'
  | 'newHabit'
  | 'lostHabit'
export type TrendUnitType =
  'category' | 'subcategory' | 'structure' | 'uncategorized' | 'merchant'
export type TrendDirection = 'up' | 'down'
export type TrendTone = 'neutral' | 'success'

/** One expense line, as the dashboard's aggregation reads it. */
export interface TrendLine {
  id: string
  /** `YYYY-MM-DD`, the calendar day the dashboard buckets the line by. */
  date: string
  /**
   * The user's share, net of reimbursements as the filters ask, positive for
   * spending: `netAmountSql` of the line.
   */
  amount: number
  categoryId: string | null
  subcategoryId: string | null
  /** The subcategory's nature, or its category's default. */
  nature: TrendNature | null
  /** `EFFECTIVE_RHYTHM`: COMMITTED for a recurrence line, else the subcategory's. */
  rhythm: TrendRhythm | null
  /** `IS_RECURRING`: the line belongs to an active or stopped recurrence. */
  isRecurring: boolean
  /** The line carries an exceptional tag. */
  isExceptional: boolean
  /** The bank label: what a merchant is read from (`merchantKey`). */
  description: string
}

/** A smoothed purchase, with its slices over the span. */
export interface TrendSmoothedPurchase {
  /** The source line, which the everyday reading replaces by the slices. */
  transactionId: string
  categoryId: string | null
  subcategoryId: string | null
  nature: TrendNature | null
  slices: Array<{ month: string; amount: number }>
}

export interface TrendCategory {
  id: string
  name: string
  icon: string | null
  /** The defaults a line filed at the category alone takes. */
  nature: TrendNature | null
  rhythm: TrendRhythm | null
}

export interface TrendSubcategory {
  id: string
  categoryId: string
  name: string
  icon: string | null
  nature: TrendNature | null
  rhythm: TrendRhythm | null
}

/** Everything detection reads: the lines and what names them. */
export interface TrendRegistry {
  lines: TrendLine[]
  /** Smoothed purchases (never exceptional ones: the tag wins). */
  smoothed: TrendSmoothedPurchase[]
  categories: TrendCategory[]
  subcategories: TrendSubcategory[]
  /** `YYYY-MM-DD` of the user's first transaction, null without any. */
  historyStart: string | null
}

export interface DetectTrendsOptions {
  /** The moment of reading: the month read must be closed by then. */
  now: Date
  /** `YYYY-MM`; the last closed month by default. */
  month?: string
  window?: TrendWindow
  reading?: TrendReading
  /** The product reads the median; the dry run compares it with the mean. */
  reference?: TrendReference
}

export interface TrendUnit {
  type: TrendUnitType
  id: string
  /**
   * The category a link opens the unit in: the category itself, or a
   * subcategory's parent. Null for a share and for the lines to file.
   */
  categoryId: string | null
  name: string
  icon: string | null
  /**
   * A merchant only: a word of its labels, for the Transactions page's text
   * search — the page has no merchant filter.
   */
  search?: string
}

export interface TrendPeriod {
  /** `YYYY-MM-DD`, both included. */
  start: string
  end: string
}

/** One trend, shaped as `TrendInsightDto` (lot 1). */
export interface TrendInsight {
  kind: TrendKind
  unit: TrendUnit
  direction: TrendDirection
  tone: TrendTone
  /**
   * The measure of the month read and its reference: euros for an amount or
   * a basket, lines for a frequency, percent of the total for a share. Lines
   * to file (trend 5) read the lines still to file against every line of the
   * month.
   */
  current: number
  reference: number
  delta: number
  /**
   * Relative gap in percent; null on a share (the delta is in points), on
   * lines to file (no habit to compare with) or on a zero reference.
   */
  deltaPct: number | null
  sentence: string
  windows: { current: TrendPeriod; reference: TrendPeriod }
  /** The measure over the 6 months before and the month read, chronological. */
  series: number[]
  /** The gap in euros, what the card sorts by. */
  score: number
}

/** Shaped as `TrendsResponseDto` (lot 1). */
export interface TrendsResult {
  month: string
  reading: TrendReading
  /** The window read, shortened to the history when it must be. */
  window: number
  /** Complete months of history before the month read. */
  completeMonths: number
  /**
   * Every trend that passes its thresholds, best first; the card shows 5.
   * Lines to file (trend 5) always come first.
   */
  insights: TrendInsight[]
  /**
   * « Rien de notable en septembre : … » when the history is long enough
   * and no habit moved; null otherwise.
   */
  quietSentence: string | null
  /**
   * The closed months the card can read, latest first: those with enough
   * history before them, at most `selectableMonths`.
   */
  availableMonths: string[]
  /** Lot 5. */
  digest: null
}

/* ------------------------------------------------------------------ */
/* Months                                                              */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

/** `YYYY-MM` `count` months after (or before) `month`. */
export function addMonths(month: string, count: number): string {
  const [year, mon] = month.split('-').map(Number)
  const index = (year ?? 0) * 12 + ((mon ?? 1) - 1) + count
  const y = Math.floor(index / 12)
  const m = index - y * 12 + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

/** The month before the one `now` falls in, in Paris. */
export function lastClosedMonth(now: Date): string {
  return addMonths(calendarDayIn(now).slice(0, 7), -1)
}

function lastDayOf(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const day = new Date(Date.UTC(year ?? 0, mon ?? 1, 0)).getUTCDate()
  return `${month}-${String(day).padStart(2, '0')}`
}

function monthsBetween(first: string, last: string): string[] {
  const months: string[] = []
  for (let m = first; m <= last; m = addMonths(m, 1)) months.push(m)
  return months
}

/** « de septembre », « d'août ». */
function ofMonth(name: string): string {
  return /^[aeiouéâ]/i.test(name) ? `d'${name}` : `de ${name}`
}

/** The first month the history covers whole. */
function firstCompleteMonth(historyStart: string): string {
  const day = Number(historyStart.slice(8, 10))
  const month = historyStart.slice(0, 7)
  return day <= TREND_RULES.firstMonthGraceDays ? month : addMonths(month, 1)
}

/** Complete months of history strictly before `month`. */
export function completeMonthsBefore(
  historyStart: string | null,
  month: string
): number {
  if (!historyStart) return 0
  const first = firstCompleteMonth(historyStart)
  if (first >= month) return 0
  return monthsBetween(first, addMonths(month, -1)).length
}

/**
 * The closed months worth reading, latest first: each has at least
 * `minHistoryMonths` complete months before it.
 */
export function availableMonths(
  historyStart: string | null,
  closed: string
): string[] {
  if (!historyStart) return []
  const first = addMonths(
    firstCompleteMonth(historyStart),
    TREND_RULES.minHistoryMonths
  )
  const months: string[] = []
  for (
    let m = closed;
    m >= first && months.length < TREND_RULES.selectableMonths;
    m = addMonths(m, -1)
  ) {
    months.push(m)
  }
  return months
}

/* ------------------------------------------------------------------ */
/* Aggregation                                                         */
/* ------------------------------------------------------------------ */

/** A unit over one month. */
export interface UnitMonth {
  /** Everything the unit cost, slices included. */
  amount: number
  /** Lines a frequency counts: no recurrence line, no slice. */
  count: number
  /** What those lines cost, for the basket. */
  countedAmount: number
}

/** One month, read the way the dashboard reads it. */
export interface MonthAggregate {
  /** `everydayNetExpenses` (or `netExpenses` in the real reading). */
  total: number
  /** Lines with no category: in the total, in no unit. */
  uncategorized: number
  pleasure: number
  committed: number
  /** Keyed `category:<id>` and `subcategory:<id>`. */
  units: Map<string, UnitMonth>
}

const categoryKey = (id: string): string => `category:${id}`
const subcategoryKey = (id: string): string => `subcategory:${id}`

/** A slice runs every month without a decision: committed while it lasts. */
const SLICE_RHYTHM: TrendRhythm = 'COMMITTED'

function emptyMonth(): MonthAggregate {
  return {
    total: 0,
    uncategorized: 0,
    pleasure: 0,
    committed: 0,
    units: new Map(),
  }
}

function addToUnit(
  month: MonthAggregate,
  key: string,
  amount: number,
  counted: boolean
): void {
  const unit = month.units.get(key) ?? { amount: 0, count: 0, countedAmount: 0 }
  unit.amount += amount
  if (counted) {
    unit.count += 1
    unit.countedAmount += amount
  }
  month.units.set(key, unit)
}

function addEntry(
  month: MonthAggregate,
  entry: {
    amount: number
    categoryId: string | null
    subcategoryId: string | null
    nature: TrendNature | null
    rhythm: TrendRhythm | null
    /** Feeds a frequency and a basket. */
    counted: boolean
  }
): void {
  month.total += entry.amount
  if (entry.nature === 'PLEASURE') month.pleasure += entry.amount
  if (entry.rhythm === 'COMMITTED') month.committed += entry.amount
  if (!entry.categoryId) {
    month.uncategorized += entry.amount
    return
  }
  addToUnit(month, categoryKey(entry.categoryId), entry.amount, entry.counted)
  if (entry.subcategoryId) {
    addToUnit(
      month,
      subcategoryKey(entry.subcategoryId),
      entry.amount,
      entry.counted
    )
  }
}

/**
 * Every month of `months`, aggregated in `reading`. Exported for the
 * invariant the golden master of lot 1 builds on: a month's units add up to
 * its total.
 */
export function aggregateMonths(
  registry: Pick<TrendRegistry, 'lines' | 'smoothed'>,
  reading: TrendReading,
  months: string[]
): Map<string, MonthAggregate> {
  const result = new Map<string, MonthAggregate>()
  for (const month of months) result.set(month, emptyMonth())

  const everyday = reading === 'everyday'
  const smoothedIds = new Set(
    everyday ? registry.smoothed.map(p => p.transactionId) : []
  )

  for (const line of registry.lines) {
    const month = result.get(line.date.slice(0, 7))
    if (!month) continue
    if (everyday && line.isExceptional) continue
    // The everyday reading counts a smoothed purchase by its slices.
    if (smoothedIds.has(line.id)) continue
    addEntry(month, {
      amount: line.amount,
      categoryId: line.categoryId,
      subcategoryId: line.subcategoryId,
      nature: line.nature,
      rhythm: line.rhythm,
      counted: !line.isRecurring,
    })
  }

  if (everyday) {
    for (const purchase of registry.smoothed) {
      for (const slice of purchase.slices) {
        const month = result.get(slice.month)
        if (!month) continue
        addEntry(month, {
          amount: slice.amount,
          categoryId: purchase.categoryId,
          subcategoryId: purchase.subcategoryId,
          nature: purchase.nature,
          rhythm: SLICE_RHYTHM,
          // A slice is not a visit to the shop.
          counted: false,
        })
      }
    }
  }
  return result
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

const cents = (v: number): number => Math.round(v * 100) / 100
const tenths = (v: number): number => Math.round(v * 10) / 10

/* ------------------------------------------------------------------ */
/* Sentences                                                           */
/* ------------------------------------------------------------------ */

const MINUS = '−'

/** « 312 € », « 4,50 € », « 1 240 € ». */
export function formatEuros(value: number): string {
  const abs = Math.abs(value)
  const text =
    abs >= 20
      ? String(Math.round(abs))
      : abs.toFixed(2).replace(/\.00$/, '').replace('.', ',')
  const grouped = text.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${value < 0 ? MINUS : ''}${grouped} €`
}

/** « 9 », « 4,5 ». */
function formatCount(value: number): string {
  return String(tenths(value)).replace('.', ',')
}

function formatPct(value: number): string {
  const rounded = Math.round(Math.abs(value))
  return `${value < 0 ? MINUS : '+'}${rounded} %`
}

function achats(count: number): string {
  return `${formatCount(count)} achat${count >= 2 ? 's' : ''}`
}

interface SentenceContext {
  monthName: string
  /** « des 6 mois précédents ». */
  windowOf: string
  /** « sur les 6 mois précédents ». */
  windowOn: string
  reading: TrendReading
}

function amountSentence(
  name: string,
  current: number,
  reference: number,
  tone: TrendTone,
  ctx: SentenceContext
): string {
  const cur = current === 0 ? 'rien' : formatEuros(current)
  if (reference === 0) {
    return `${name} : ${cur} en ${ctx.monthName}, contre rien d'habitude ${ctx.windowOn}.`
  }
  const pct = formatPct(((current - reference) / reference) * 100)
  if (tone === 'success') {
    return `${name} : vous avez réduit, ${cur} en ${ctx.monthName} contre ${formatEuros(reference)} d'habitude ${ctx.windowOn} (${pct}).`
  }
  return `${name} : ${cur} en ${ctx.monthName}, ${pct} par rapport à l'habitude ${ctx.windowOf} (${formatEuros(reference)}).`
}

function frequencySentence(
  name: string,
  current: number,
  reference: number,
  tone: TrendTone,
  ctx: SentenceContext,
  amounts: { current: number; reference: number } | null
): string {
  const euros = (v: number): string => (v === 0 ? 'rien' : formatEuros(v))
  const tail = amounts
    ? `, soit ${euros(amounts.current)} contre ${euros(amounts.reference)}`
    : ''
  const cur = current === 0 ? 'aucun achat' : achats(current)
  const ref =
    reference === 0
      ? `aucun d'habitude ${ctx.windowOn}`
      : `${formatCount(reference)} par mois d'habitude ${ctx.windowOn}`
  if (tone === 'success') {
    return `${name} : vous avez réduit la fréquence, ${cur} en ${ctx.monthName} contre ${ref}${tail}.`
  }
  return `${name} : ${cur} en ${ctx.monthName}, contre ${ref}${tail}.`
}

function basketSentence(
  name: string,
  current: number,
  reference: number,
  tone: TrendTone,
  ctx: SentenceContext,
  counts: { current: number; same: boolean }
): string {
  if (tone === 'success') {
    return `${name} : vous avez réduit le panier moyen, ${formatEuros(current)} en ${ctx.monthName} contre ${formatEuros(reference)} d'habitude ${ctx.windowOn}.`
  }
  if (counts.same) {
    return `${name} : autant d'achats, mais ${formatEuros(current)} en moyenne en ${ctx.monthName} contre ${formatEuros(reference)} d'habitude ${ctx.windowOn}.`
  }
  return `${name} : ${achats(counts.current)} en ${ctx.monthName}, à ${formatEuros(current)} en moyenne contre ${formatEuros(reference)} d'habitude ${ctx.windowOn}.`
}

function shareSentence(
  axis: 'pleasure' | 'committed',
  current: number,
  reference: number,
  ctx: SentenceContext
): string {
  const what = axis === 'pleasure' ? 'La part plaisir' : 'La part engagée'
  const of = ctx.reading === 'everyday' ? 'de la vie courante' : 'des dépenses'
  return `${what} ${of} passe à ${Math.round(current)} % en ${ctx.monthName}, contre ${Math.round(reference)} % d'habitude ${ctx.windowOn}.`
}

/* ------------------------------------------------------------------ */
/* Detection                                                           */
/* ------------------------------------------------------------------ */

interface Candidate extends TrendInsight {
  /** The category a subcategory belongs to, for the selection. */
  parentCategoryId: string | null
  /** The unit's amount gap, whatever the kind: what « explains » compares. */
  amountDelta: number
  /**
   * A merchant only: the subcategory and category its lines are mostly
   * filed in, and how much of each unit's spending it makes.
   */
  merchantOf?: {
    subcategoryId: string | null
    categoryId: string | null
    coversSubcategory: number
    coversCategory: number
  }
}

/**
 * A unit's name in a sentence. The catalogue gives every category an
 * « Autre » subcategory: alone, the word says nothing.
 */
function unitName(
  sub: TrendSubcategory | undefined,
  category: TrendCategory | undefined
): string {
  if (!sub) return category?.name ?? 'Autre'
  if (sub.name === 'Autre' && category) return `${category.name}, autre`
  return sub.name
}

/** Tone: a drop is a success only on a pleasure and variable unit. */
function toneOf(
  direction: TrendDirection,
  nature: TrendNature | null,
  rhythm: TrendRhythm | null
): TrendTone {
  return direction === 'down' && nature === 'PLEASURE' && rhythm === 'VARIABLE'
    ? 'success'
    : 'neutral'
}

function passesAmount(delta: number, reference: number): boolean {
  const rule = TREND_RULES.amount
  if (Math.abs(delta) < rule.minEuros) return false
  if (reference > 0 && Math.abs(delta) / reference < rule.minRatio) return false
  return true
}

function passesFrequency(current: number, reference: number): boolean {
  const rule = TREND_RULES.frequency
  const delta = Math.abs(current - reference)
  if (delta < rule.minLines) return false
  if (Math.max(current, reference) < rule.minPeak) return false
  if (reference > 0 && delta / reference < rule.minRatio) return false
  return true
}

function passesBasket(
  current: number | null,
  reference: number | null,
  currentCount: number,
  referenceCount: number
): boolean {
  const rule = TREND_RULES.basket
  if (current === null || reference === null || reference <= 0) return false
  if (currentCount < rule.minLines || referenceCount < rule.minLines) {
    return false
  }
  return Math.abs(current - reference) / reference >= rule.minRatio
}

/** Reads every trend of the month and keeps the ones worth a sentence. */
export function detectTrends(
  registry: TrendRegistry,
  options: DetectTrendsOptions
): TrendsResult {
  const reading = options.reading ?? 'everyday'
  const requested = options.window ?? TREND_RULES.defaultWindow
  const closed = lastClosedMonth(options.now)
  const month = options.month ?? closed
  if (month > closed) {
    throw new Error(
      `Month ${month} is not closed on ${options.now.toISOString()}`
    )
  }
  const completeMonths = completeMonthsBefore(registry.historyStart, month)
  const window = Math.min(requested, completeMonths)

  const referenceMonths = monthsBetween(
    addMonths(month, -window),
    addMonths(month, -1)
  )
  const seriesMonths = monthsBetween(
    addMonths(month, -(TREND_RULES.seriesMonths - 1)),
    month
  )
  const windows = {
    current: { start: `${month}-01`, end: lastDayOf(month) },
    reference: {
      start: `${referenceMonths[0] ?? month}-01`,
      end: lastDayOf(referenceMonths[referenceMonths.length - 1] ?? month),
    },
  }
  const monthIndex = Number(month.slice(5, 7)) - 1
  const monthName = MONTH_NAMES[monthIndex] ?? month

  // Trend 5 reads no habit: it speaks even on a short history.
  const toFile = uncategorizedInsight(
    registry.lines,
    month,
    monthName,
    seriesMonths,
    windows
  )
  const lead: TrendInsight[] = toFile ? [toFile] : []
  const silent: TrendsResult = {
    month,
    reading,
    window,
    completeMonths,
    insights: lead,
    quietSentence: null,
    availableMonths: availableMonths(registry.historyStart, closed),
    digest: null,
  }
  if (completeMonths < TREND_RULES.minHistoryMonths) return silent

  const span = monthsBetween(
    [referenceMonths[0] ?? month, seriesMonths[0] ?? month].sort()[0] ?? month,
    month
  )
  const aggregates = aggregateMonths(registry, reading, span)
  const at = (m: string): MonthAggregate => aggregates.get(m) ?? emptyMonth()
  const current = at(month)
  const reference = options.reference === 'mean' ? mean : median

  const ctx: SentenceContext = {
    monthName,
    windowOf: `des ${window} mois précédents`,
    windowOn: `sur les ${window} mois précédents`,
    reading,
  }

  const categories = new Map(registry.categories.map(c => [c.id, c]))
  const subcategories = new Map(registry.subcategories.map(s => [s.id, s]))
  const candidates: Candidate[] = []
  const iconOf = (
    categoryId: string | null,
    subcategoryId: string | null
  ): string | null =>
    (subcategoryId ? subcategories.get(subcategoryId)?.icon : null) ??
    (categoryId ? categories.get(categoryId)?.icon : null) ??
    null

  const unitOf = (key: string): UnitMonth | undefined => current.units.get(key)
  const keys = new Set<string>()
  for (const m of [month, ...referenceMonths]) {
    for (const key of at(m).units.keys()) keys.add(key)
  }

  for (const key of [...keys].sort()) {
    const isSub = key.startsWith('subcategory:')
    const id = key.slice(key.indexOf(':') + 1)
    const sub = isSub ? subcategories.get(id) : undefined
    const category = isSub
      ? sub
        ? categories.get(sub.categoryId)
        : undefined
      : categories.get(id)
    if (isSub && !sub) continue
    const name = unitName(sub, category)
    const unit: TrendUnit = {
      type: isSub ? 'subcategory' : 'category',
      id,
      categoryId: isSub ? (sub?.categoryId ?? null) : id,
      name,
      icon: (isSub ? (sub?.icon ?? category?.icon) : category?.icon) ?? null,
    }
    const nature = (isSub ? sub?.nature : category?.nature) ?? null
    const rhythm = (isSub ? sub?.rhythm : category?.rhythm) ?? null
    const parentCategoryId = isSub ? (sub?.categoryId ?? null) : null

    const cur = unitOf(key) ?? { amount: 0, count: 0, countedAmount: 0 }
    const refAmounts = referenceMonths.map(
      m => at(m).units.get(key)?.amount ?? 0
    )
    const refAmount = reference(refAmounts)
    const amountDelta = cur.amount - refAmount
    const amountPass = passesAmount(amountDelta, refAmount)

    const base = {
      unit,
      windows,
      parentCategoryId,
      amountDelta,
    }
    const pushAmount = (): void => {
      candidates.push(amountInsight())
    }
    const amountInsight = (): Candidate => {
      const direction: TrendDirection = amountDelta >= 0 ? 'up' : 'down'
      const tone = toneOf(direction, nature, rhythm)
      return {
        ...base,
        kind: 'amount',
        direction,
        tone,
        current: cents(cur.amount),
        reference: cents(refAmount),
        delta: cents(amountDelta),
        deltaPct:
          refAmount > 0 ? tenths((amountDelta / refAmount) * 100) : null,
        sentence: amountSentence(name, cur.amount, refAmount, tone, ctx),
        series: seriesMonths.map(m => cents(at(m).units.get(key)?.amount ?? 0)),
        score: cents(Math.abs(amountDelta)),
      }
    }

    // Frequency and basket: a variable subcategory only, on the lines a
    // person decides — no recurrence line, no slice.
    if (!isSub || rhythm !== 'VARIABLE') {
      if (amountPass) pushAmount()
      continue
    }

    // Trend 8: a variable habit with no line this month says it in one
    // line, in place of its amount or its frequency.
    const lost = lostHabitInsight({
      unit,
      nature,
      month,
      completeMonths,
      monthsBack: m => at(m).units.get(key)?.count ?? 0,
      amountOf: m => at(m).units.get(key)?.amount ?? 0,
      seriesMonths,
      monthName,
    })
    if (lost) {
      candidates.push({ ...lost, parentCategoryId, amountDelta })
      continue
    }

    const refCounts = referenceMonths.map(m => at(m).units.get(key)?.count ?? 0)
    const refCount = reference(refCounts)
    const refBaskets = referenceMonths.flatMap(m => {
      const u = at(m).units.get(key)
      return u && u.count > 0 ? [u.countedAmount / u.count] : []
    })
    const refBasket = refBaskets.length > 0 ? reference(refBaskets) : null
    const curBasket = cur.count > 0 ? cur.countedAmount / cur.count : null

    const frequencyPass = passesFrequency(cur.count, refCount)
    const basketPass = passesBasket(curBasket, refBasket, cur.count, refCount)
    // Δamount = Δfrequency × reference basket + frequency × Δbasket.
    const frequencyEffect =
      (cur.count - refCount) * (refBasket ?? curBasket ?? 0)
    const basketEffect =
      curBasket !== null && refBasket !== null
        ? cur.count * (curBasket - refBasket)
        : 0

    // With the amount moving, the dominant term tells it, and only if it
    // passes its own thresholds and points the same way: fewer purchases
    // never explain an amount that went up.
    const dominant: TrendKind =
      Math.abs(frequencyEffect) >= Math.abs(basketEffect)
        ? 'frequency'
        : 'basket'
    let kind: TrendKind | null = null
    if (amountPass) {
      const effect = dominant === 'frequency' ? frequencyEffect : basketEffect
      const passes = dominant === 'frequency' ? frequencyPass : basketPass
      if (passes && Math.sign(effect) === Math.sign(amountDelta))
        kind = dominant
    } else if (frequencyPass && basketPass) kind = dominant
    else if (frequencyPass) kind = 'frequency'
    else if (basketPass) kind = 'basket'

    if (kind === null) {
      if (amountPass) pushAmount()
      continue
    }

    // One line per unit: the amount gap, when it passes, is the score.
    const score = amountPass
      ? Math.abs(amountDelta)
      : Math.abs(kind === 'frequency' ? frequencyEffect : basketEffect)

    if (kind === 'frequency') {
      const delta = cur.count - refCount
      const direction: TrendDirection = delta >= 0 ? 'up' : 'down'
      const tone = toneOf(direction, nature, rhythm)
      candidates.push({
        ...base,
        kind,
        direction,
        tone,
        current: cur.count,
        reference: tenths(refCount),
        delta: tenths(delta),
        deltaPct: refCount > 0 ? tenths((delta / refCount) * 100) : null,
        sentence: frequencySentence(
          name,
          cur.count,
          refCount,
          tone,
          ctx,
          amountPass ? { current: cur.amount, reference: refAmount } : null
        ),
        series: seriesMonths.map(m => at(m).units.get(key)?.count ?? 0),
        score: cents(score),
      })
    } else {
      const curB = curBasket ?? 0
      const refB = refBasket ?? 0
      const delta = curB - refB
      const direction: TrendDirection = delta >= 0 ? 'up' : 'down'
      const tone = toneOf(direction, nature, rhythm)
      candidates.push({
        ...base,
        kind,
        direction,
        tone,
        current: cents(curB),
        reference: cents(refB),
        delta: cents(delta),
        deltaPct: refB > 0 ? tenths((delta / refB) * 100) : null,
        sentence: basketSentence(name, curB, refB, tone, ctx, {
          current: cur.count,
          same: Math.abs(cur.count - refCount) < TREND_RULES.frequency.minLines,
        }),
        series: seriesMonths.map(m => {
          const u = at(m).units.get(key)
          return u && u.count > 0 ? cents(u.countedAmount / u.count) : 0
        }),
        score: cents(score),
      })
    }
  }

  // Trends 6 to 8 on merchants, the lines of a recurrence left out.
  candidates.push(
    ...merchantInsights(registry, {
      month,
      reading,
      window,
      referenceMonths,
      seriesMonths,
      completeMonths,
      monthName,
      ctx,
      reference,
      windows,
      unitAmount: (m, unitKey) => at(m).units.get(unitKey)?.amount ?? 0,
      iconOf,
    })
  )

  // Trend 4: the pleasure and committed shares of the month's total.
  for (const axis of ['pleasure', 'committed'] as const) {
    const shareOf = (m: MonthAggregate): number | null =>
      m.total > 0 ? (m[axis] / m.total) * 100 : null
    const cur = shareOf(current)
    const refShares = referenceMonths.flatMap(m => {
      const share = shareOf(at(m))
      return share === null ? [] : [share]
    })
    if (cur === null || refShares.length === 0) continue
    const ref = reference(refShares)
    const delta = cur - ref
    if (Math.abs(delta) < TREND_RULES.share.minPoints) continue
    candidates.push({
      kind: 'share',
      unit: {
        type: 'structure',
        id: axis,
        categoryId: null,
        name: axis === 'pleasure' ? 'Part plaisir' : 'Part engagée',
        icon: null,
      },
      direction: delta >= 0 ? 'up' : 'down',
      tone: 'neutral',
      current: tenths(cur),
      reference: tenths(ref),
      delta: tenths(delta),
      deltaPct: null,
      sentence: shareSentence(axis, cur, ref, ctx),
      windows,
      series: seriesMonths.map(m => tenths(shareOf(at(m)) ?? 0)),
      // What the shift of the mix weighs this month, in euros.
      score: cents(Math.abs((delta / 100) * current.total)),
      parentCategoryId: null,
      amountDelta: 0,
    })
  }

  const habits = select(candidates)
  return {
    ...silent,
    insights: [...lead, ...habits],
    quietSentence: habits.length === 0 ? quietSentence(ctx) : null,
  }
}

/* ------------------------------------------------------------------ */
/* Habits that come and go (trends 7 and 8)                            */
/* ------------------------------------------------------------------ */

/** « juillet », or « décembre 2025 » when the year is not the month read's. */
function monthIn(month: string, read: string): string {
  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month
  return month.slice(0, 4) === read.slice(0, 4)
    ? name
    : `${name} ${month.slice(0, 4)}`
}

/**
 * Trend 8: a habit with no line in the month read, though at least 5 of the
 * 6 months before it had one. Its own horizon, not the card's window: an
 * abandoned habit is read against the half-year it was a habit in. Says how
 * long it has been gone — twice at most, after which the habit is no longer
 * one.
 */
function lostHabitInsight(input: {
  unit: TrendUnit
  nature: TrendNature | null
  month: string
  completeMonths: number
  /** Lines (days, for a merchant) in a month. */
  monthsBack: (month: string) => number
  amountOf: (month: string) => number
  seriesMonths: string[]
  monthName: string
}): TrendInsight | null {
  const rule = TREND_RULES.lostHabit
  const { month, unit } = input
  if (input.completeMonths < rule.referenceMonths) return null
  if (input.monthsBack(month) > 0) return null
  const before = monthsBetween(
    addMonths(month, -rule.referenceMonths),
    addMonths(month, -1)
  )
  const present = before.filter(m => input.monthsBack(m) > 0).length
  if (present < rule.minPresentMonths) return null

  let gone = 1
  while (
    gone < rule.referenceMonths &&
    input.monthsBack(addMonths(month, -gone)) === 0
  ) {
    gone++
  }
  const since = addMonths(month, -(gone - 1))
  const habitCount = median(before.map(input.monthsBack))
  const habitAmount = median(before.map(input.amountOf))
  const tone = toneOf('down', input.nature, 'VARIABLE')
  const when =
    gone === 1 ? `en ${input.monthName}` : `depuis ${monthIn(since, month)}`
  const lead = tone === 'success' ? 'vous avez arrêté, plus' : 'plus'
  return {
    kind: 'lostHabit',
    unit,
    direction: 'down',
    tone,
    current: 0,
    reference: tenths(habitCount),
    delta: tenths(-habitCount),
    deltaPct: null,
    sentence: `${unit.name} : ${lead} aucun achat ${when}, contre ${formatCount(habitCount)} par mois d'habitude sur les ${rule.referenceMonths} mois précédents (${formatEuros(habitAmount)}).`,
    windows: {
      current: { start: `${since}-01`, end: lastDayOf(month) },
      reference: {
        start: `${before[0] ?? month}-01`,
        end: lastDayOf(addMonths(month, -1)),
      },
    },
    series: input.seriesMonths.map(input.monthsBack),
    // What the habit used to cost in a month.
    score: cents(habitAmount),
  }
}

/* ------------------------------------------------------------------ */
/* Merchants (trends 6 to 8)                                           */
/* ------------------------------------------------------------------ */

interface MerchantLine {
  id: string
  date: string
  amount: number
  key: string
  description: string
  categoryId: string
  subcategoryId: string | null
  nature: TrendNature | null
}

/**
 * The lines a merchant habit reads: filed, variable, not a recurrence line
 * (a subscription is not a habit, `EFFECTIVE_RHYTHM` already makes it
 * committed), and in the everyday reading neither exceptional nor smoothed
 * — a smoothed purchase counts by its slices, and a slice is not a visit.
 */
function merchantLines(
  registry: TrendRegistry,
  reading: TrendReading
): MerchantLine[] {
  const everyday = reading === 'everyday'
  const smoothed = new Set(
    everyday ? registry.smoothed.map(p => p.transactionId) : []
  )
  const lines: MerchantLine[] = []
  for (const line of registry.lines) {
    if (!line.categoryId || line.isRecurring) continue
    if (line.rhythm !== 'VARIABLE') continue
    if (everyday && (line.isExceptional || smoothed.has(line.id))) continue
    const key = merchantKey(line.description)
    if (key === '') continue
    lines.push({
      id: line.id,
      date: line.date,
      amount: line.amount,
      key,
      description: line.description,
      categoryId: line.categoryId,
      subcategoryId: line.subcategoryId,
      nature: line.nature,
    })
  }
  return lines.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  )
}

/** The key with the most weight, ties broken by key: a merchant's filing. */
function heaviest<K extends string | null>(weights: Map<K, number>): K | null {
  let best: K | null = null
  let bestWeight = -Infinity
  for (const [key, weight] of [...weights].sort(([a], [b]) =>
    String(a).localeCompare(String(b))
  )) {
    if (weight > bestWeight) {
      best = key
      bestWeight = weight
    }
  }
  return best
}

/**
 * The word the Transactions page searches a merchant by: the first word of
 * its name (the brand) when every spelling has it, else the longest word
 * they all share, else its main spelling's longest. The page matches the
 * label, so the link may show a namesake: a way in, not a proof.
 */
function searchWord(name: string, key: string, keys: Set<string>): string {
  const words = key.split(' ').filter(w => w !== '')
  const shared = words.filter(word =>
    [...keys].every(other => other.split(' ').includes(word))
  )
  const brand = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)[0]
  if (brand && shared.includes(brand)) return brand
  const pool = shared.length > 0 ? shared : words
  return (
    [...pool].sort((a, b) => b.length - a.length || a.localeCompare(b))[0] ??
    key
  )
}

interface MerchantContext {
  month: string
  reading: TrendReading
  window: number
  referenceMonths: string[]
  seriesMonths: string[]
  completeMonths: number
  monthName: string
  ctx: SentenceContext
  reference: (values: number[]) => number
  windows: TrendInsight['windows']
  /** A category or subcategory unit's amount in a month, slices included. */
  unitAmount: (month: string, unitKey: string) => number
  iconOf: (
    categoryId: string | null,
    subcategoryId: string | null
  ) => string | null
}

/**
 * Trends 6 to 8 on merchants — `merchantKey`, then `groupByMerchant` as the
 * recurrences fold them. One line per merchant at most: gone (8) before new
 * (7) before more or less often (6). Frequency counts distinct days: two
 * Amazon lines the same day are one order.
 */
function merchantInsights(
  registry: TrendRegistry,
  input: MerchantContext
): Candidate[] {
  const { month, referenceMonths, seriesMonths } = input
  const lines = merchantLines(registry, input.reading)
  const firstObservable = registry.historyStart
    ? firstCompleteMonth(registry.historyStart)
    : month
  const coverMonths = [...referenceMonths, month]
  const candidates: Candidate[] = []

  for (const group of groupByMerchant(lines)) {
    const byMonth = new Map<string, { days: Set<string>; amount: number }>()
    const bySub = new Map<string | null, number>()
    const byCategory = new Map<string, number>()
    const byNature = new Map<TrendNature | null, number>()
    for (const line of group.lines) {
      const m = line.date.slice(0, 7)
      const entry = byMonth.get(m) ?? { days: new Set(), amount: 0 }
      entry.days.add(line.date)
      entry.amount += line.amount
      byMonth.set(m, entry)
      const weight = Math.abs(line.amount)
      bySub.set(
        line.subcategoryId,
        (bySub.get(line.subcategoryId) ?? 0) + weight
      )
      byCategory.set(
        line.categoryId,
        (byCategory.get(line.categoryId) ?? 0) + weight
      )
      byNature.set(line.nature, (byNature.get(line.nature) ?? 0) + weight)
    }
    const daysIn = (m: string): number => byMonth.get(m)?.days.size ?? 0
    const amountIn = (m: string): number => byMonth.get(m)?.amount ?? 0

    const categoryId = heaviest(byCategory)
    const subcategoryId = heaviest(bySub)
    const nature = heaviest(byNature)
    const labels: string[] = []
    for (const line of [...group.lines].reverse()) {
      if (!labels.includes(line.description)) labels.push(line.description)
    }
    const name = serviceName(labels) || group.key
    const unit: TrendUnit = {
      type: 'merchant',
      id: group.key,
      categoryId,
      name,
      icon: input.iconOf(categoryId, subcategoryId),
      search: searchWord(name, group.key, group.keys),
    }

    // What the merchant makes of its units, over the month and the window.
    const merchantTotal = coverMonths.reduce((sum, m) => sum + amountIn(m), 0)
    const covers = (unitKey: string | null): number => {
      if (!unitKey) return 0
      const total = coverMonths.reduce(
        (sum, m) => sum + input.unitAmount(m, unitKey),
        0
      )
      return total > 0 ? Math.min(1, merchantTotal / total) : 0
    }
    const refAmount = input.reference(referenceMonths.map(amountIn))
    const base = {
      parentCategoryId: null,
      amountDelta: amountIn(month) - refAmount,
      merchantOf: {
        subcategoryId,
        categoryId,
        coversSubcategory: covers(
          subcategoryId ? subcategoryKey(subcategoryId) : null
        ),
        coversCategory: covers(categoryId ? categoryKey(categoryId) : null),
      },
    }

    // Trend 8.
    const lost = lostHabitInsight({
      unit,
      nature,
      month,
      completeMonths: input.completeMonths,
      monthsBack: daysIn,
      amountOf: amountIn,
      seriesMonths,
      monthName: input.monthName,
    })
    if (lost) {
      candidates.push({ ...lost, ...base })
      continue
    }

    // Trend 7: new over the last two months, never seen in the six before.
    const rule = TREND_RULES.newHabit
    const recent = monthsBetween(
      addMonths(month, -(rule.recentMonths - 1)),
      month
    )
    const unseen = monthsBetween(
      addMonths(recent[0] ?? month, -rule.unseenMonths),
      addMonths(recent[0] ?? month, -1)
    )
    const recentDays = recent.reduce((sum, m) => sum + daysIn(m), 0)
    if (
      daysIn(month) > 0 &&
      recentDays >= rule.minLines &&
      unseen.every(m => daysIn(m) === 0) &&
      unseen.filter(m => m >= firstObservable).length >= rule.minUnseenMonths
    ) {
      const since = recent.find(m => daysIn(m) > 0) ?? month
      const recentAmount = recent.reduce((sum, m) => sum + amountIn(m), 0)
      const when =
        since === month
          ? `en ${input.monthName}`
          : `depuis ${monthIn(since, month)}`
      candidates.push({
        ...base,
        kind: 'newHabit',
        unit,
        direction: 'up',
        tone: 'neutral',
        current: recentDays,
        reference: 0,
        delta: recentDays,
        deltaPct: null,
        sentence: `${unit.name} : nouveau, ${achats(recentDays)} ${when} (${formatEuros(recentAmount)}), aucun sur les ${rule.unseenMonths} mois précédents.`,
        windows: {
          current: { start: `${since}-01`, end: lastDayOf(month) },
          reference: {
            start: `${unseen[0] ?? month}-01`,
            end: lastDayOf(unseen[unseen.length - 1] ?? month),
          },
        },
        series: seriesMonths.map(daysIn),
        // What the new habit cost in the month read.
        score: cents(Math.abs(amountIn(month))),
      })
      continue
    }

    // Trend 6: more or less often than the habit, in distinct days.
    const current = daysIn(month)
    const refDays = input.reference(referenceMonths.map(daysIn))
    if (Math.max(current, refDays) < TREND_RULES.merchant.minLines) continue
    if (!passesFrequency(current, refDays)) continue
    const refBaskets = referenceMonths.flatMap(m =>
      daysIn(m) > 0 ? [amountIn(m) / daysIn(m)] : []
    )
    const basket =
      refBaskets.length > 0
        ? input.reference(refBaskets)
        : current > 0
          ? amountIn(month) / current
          : 0
    const delta = current - refDays
    const direction: TrendDirection = delta >= 0 ? 'up' : 'down'
    const tone = toneOf(direction, nature, 'VARIABLE')
    candidates.push({
      ...base,
      kind: 'frequency',
      unit,
      direction,
      tone,
      current,
      reference: tenths(refDays),
      delta: tenths(delta),
      deltaPct: refDays > 0 ? tenths((delta / refDays) * 100) : null,
      sentence: frequencySentence(
        unit.name,
        current,
        refDays,
        tone,
        input.ctx,
        {
          current: amountIn(month),
          reference: refAmount,
        }
      ),
      windows: input.windows,
      series: seriesMonths.map(daysIn),
      // Δ days × the reference basket: what the change of rhythm weighs.
      score: cents(Math.abs(delta * basket)),
    })
  }
  return candidates
}

/** What the card says when no habit moved. */
function quietSentence(ctx: SentenceContext): string {
  const what =
    ctx.reading === 'everyday'
      ? "la vie courante est dans l'habitude"
      : "les dépenses sont dans l'habitude"
  return `Rien de notable en ${ctx.monthName} : ${what}.`
}

/**
 * Trend 5: the month's expense lines filed in no category. Every other trend
 * leaves them out, so a month with many of them reads emptier than it was.
 * Counted whatever the reading — a line to file is to file, event or not —
 * and silent under 5 lines and 10 % of the month's lines.
 */
function uncategorizedInsight(
  lines: TrendLine[],
  month: string,
  monthName: string,
  seriesMonths: string[],
  windows: TrendInsight['windows']
): TrendInsight | null {
  const counts = new Map<string, { all: number; toFile: number }>()
  let amount = 0
  for (const line of lines) {
    const key = line.date.slice(0, 7)
    const count = counts.get(key) ?? { all: 0, toFile: 0 }
    count.all += 1
    if (!line.categoryId) {
      count.toFile += 1
      if (key === month) amount += line.amount
    }
    counts.set(key, count)
  }
  const current = counts.get(month) ?? { all: 0, toFile: 0 }
  const rule = TREND_RULES.uncategorized
  if (current.toFile === 0) return null
  if (
    current.toFile < rule.minLines &&
    current.toFile / current.all < rule.minShare
  ) {
    return null
  }
  const n = current.toFile
  const sentence =
    n === 1
      ? `1 dépense ${ofMonth(monthName)} est à classer : les tendances ne la lisent pas.`
      : `${n} dépenses ${ofMonth(monthName)} sont à classer : les tendances ne les lisent pas.`
  return {
    kind: 'uncategorized',
    unit: {
      type: 'uncategorized',
      id: 'uncategorized',
      categoryId: null,
      name: 'À classer',
      icon: null,
    },
    direction: 'up',
    tone: 'neutral',
    current: n,
    reference: current.all,
    delta: n,
    deltaPct: null,
    sentence,
    windows,
    series: seriesMonths.map(m => counts.get(m)?.toFile ?? 0),
    score: cents(Math.abs(amount)),
  }
}

/**
 * A subcategory and its category never show together: the subcategory when
 * it explains 70 % of the category's gap, the category otherwise.
 *
 * A merchant and its unit — its subcategory if that one speaks, else its
 * category — the same way: the merchant when it explains 70 % of the unit's
 * gap, the unit otherwise. Except a merchant that is the unit (90 % of its
 * spending over the month and the window): the unit says the same thing,
 * under the catalogue's name, and stays. And a unit read as a basket (3)
 * stays too: what each visit costs is not explained by where they went.
 *
 * Then the gap in euros orders the list, ties broken by name for a stable
 * card.
 */
function select(candidates: Candidate[]): TrendInsight[] {
  const explains = (child: Candidate, parent: Candidate): boolean =>
    parent.amountDelta !== 0 &&
    child.amountDelta / parent.amountDelta >= TREND_RULES.subcategoryExplains

  const categoryInsights = new Map(
    candidates.filter(c => c.unit.type === 'category').map(c => [c.unit.id, c])
  )
  const dropped = new Set<Candidate>()
  for (const [categoryId, category] of categoryInsights) {
    const children = candidates.filter(c => c.parentCategoryId === categoryId)
    if (children.length === 0) continue
    if (children.some(child => explains(child, category))) dropped.add(category)
    else for (const child of children) dropped.add(child)
  }

  const standing = (
    type: TrendUnitType,
    id: string | null
  ): Candidate | undefined =>
    id === null
      ? undefined
      : candidates.find(
          c => c.unit.type === type && c.unit.id === id && !dropped.has(c)
        )
  const merchantsOf = new Map<Candidate, Candidate[]>()
  for (const merchant of candidates) {
    const of = merchant.merchantOf
    if (!of) continue
    const sub = standing('subcategory', of.subcategoryId)
    const parent = sub ?? standing('category', of.categoryId)
    if (!parent) continue
    const covers = sub ? of.coversSubcategory : of.coversCategory
    if (covers >= TREND_RULES.merchant.coversUnit) {
      dropped.add(merchant)
      continue
    }
    merchantsOf.set(parent, [...(merchantsOf.get(parent) ?? []), merchant])
  }
  for (const [parent, merchants] of merchantsOf) {
    // A dearer visit everywhere is not explained by where the visits went.
    if (
      parent.kind !== 'basket' &&
      merchants.some(merchant => explains(merchant, parent))
    ) {
      dropped.add(parent)
    } else {
      for (const merchant of merchants) dropped.add(merchant)
    }
  }

  return candidates
    .filter(c => !dropped.has(c))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.unit.name.localeCompare(b.unit.name, 'fr') ||
        a.kind.localeCompare(b.kind) ||
        a.unit.id.localeCompare(b.unit.id)
    )
    .map(
      ({ parentCategoryId: _p, amountDelta: _a, merchantOf: _m, ...insight }) =>
        insight
    )
}
