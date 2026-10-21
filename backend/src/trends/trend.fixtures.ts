/**
 * Small, readable registries for the trend detection: a catalogue shaped
 * like the real one and a month-by-month builder. Amounts are the user's
 * share, net, as the dashboard sums them.
 */

import type {
  TrendCategory,
  TrendFlow,
  TrendLine,
  TrendNature,
  TrendRecurrence,
  TrendRecurrencePeriod,
  TrendRegistry,
  TrendRhythm,
  TrendSmoothedPurchase,
  TrendSubcategory,
} from './trend.detection'

/** The moment of reading: September 2026 is the last closed month. */
export const READ_AT = new Date('2026-10-07T08:00:00.000Z')

/** Thirteen months: September 2025 to September 2026. */
export const HISTORY_START = '2025-09-01'

export const MONTHS = Array.from({ length: 13 }, (_, i) => {
  const index = 2025 * 12 + 8 + i
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
})

export const SEPTEMBER = '2026-09'

function category(
  id: string,
  name: string,
  nature: TrendNature,
  rhythm: TrendRhythm
): TrendCategory {
  return { id, name, icon: `icon-${id}`, nature, rhythm }
}

function subcategory(
  id: string,
  categoryId: string,
  name: string,
  nature: TrendNature,
  rhythm: TrendRhythm
): TrendSubcategory {
  return { id, categoryId, name, icon: null, nature, rhythm }
}

export const CATEGORIES: TrendCategory[] = [
  category('food', 'Alimentation', 'ESSENTIAL', 'VARIABLE'),
  category('restaurants', 'Restaurants et bars', 'PLEASURE', 'VARIABLE'),
  category('housing', 'Logement', 'ESSENTIAL', 'COMMITTED'),
  category('health', 'Santé', 'ESSENTIAL', 'VARIABLE'),
  category('leisure', 'Loisirs', 'PLEASURE', 'VARIABLE'),
  category('tech', 'High-tech', 'PLEASURE', 'VARIABLE'),
  category('travel', 'Voyages', 'PLEASURE', 'VARIABLE'),
]

export const SUBCATEGORIES: TrendSubcategory[] = [
  subcategory('grocery', 'food', 'Supermarché', 'ESSENTIAL', 'VARIABLE'),
  subcategory(
    'restaurant',
    'restaurants',
    'Restaurant',
    'PLEASURE',
    'VARIABLE'
  ),
  subcategory(
    'delivery',
    'restaurants',
    'Livraison de repas',
    'PLEASURE',
    'VARIABLE'
  ),
  subcategory('bar', 'restaurants', 'Bars', 'PLEASURE', 'VARIABLE'),
  subcategory('rent', 'housing', 'Loyer', 'ESSENTIAL', 'COMMITTED'),
  subcategory('pharmacy', 'health', 'Pharmacie', 'ESSENTIAL', 'VARIABLE'),
  subcategory('streaming', 'leisure', 'Streaming', 'PLEASURE', 'COMMITTED'),
  subcategory('lessons', 'leisure', 'Cours', 'PLEASURE', 'VARIABLE'),
  subcategory('phone', 'tech', 'Téléphone', 'PLEASURE', 'VARIABLE'),
  subcategory('flights', 'travel', 'Avions', 'PLEASURE', 'VARIABLE'),
]

const subById = new Map(SUBCATEGORIES.map(s => [s.id, s]))

/** The one merchant each subcategory's lines go to, unless a flag says otherwise. */
export const MERCHANTS: Record<string, string> = {
  grocery: 'CB CARREFOUR MARKET',
  restaurant: 'CB LE BISTROT',
  delivery: 'CB UBER EATS',
  bar: 'CB LE COMPTOIR',
  rent: 'VIR LOYER BEGON',
  pharmacy: 'CB PHARMACIE CENTRALE',
  streaming: 'PRLV NETFLIX',
  lessons: 'CB SIMPLY PIANO',
  phone: 'CB APPLE STORE',
  flights: 'CB AIR FRANCE',
}

/** What a month spends, subcategory by subcategory: one amount per line. */
export type MonthPlan = Partial<Record<string, number[]>>

/** Options on the lines of one subcategory in one month. */
export interface LineFlags {
  recurring?: boolean
  exceptional?: boolean
  /** The bank label, in place of the subcategory's merchant. */
  description?: string
}

let lineCount = 0

/** The lines of one month: the n-th line of a subcategory falls on day 2 + 2n. */
export function monthLines(
  month: string,
  plan: MonthPlan,
  flags: Partial<Record<string, LineFlags>> = {}
): TrendLine[] {
  const lines: TrendLine[] = []
  for (const [subId, amounts] of Object.entries(plan)) {
    const sub = subById.get(subId)
    if (!sub || !amounts) throw new Error(`Unknown subcategory ${subId}`)
    const flag = flags[subId] ?? {}
    amounts.forEach((amount, index) => {
      lineCount++
      lines.push({
        id: `${subId}-${month}-${index + 1}-${lineCount}`,
        date: `${month}-${String(2 + 2 * index).padStart(2, '0')}`,
        amount,
        categoryId: sub.categoryId,
        subcategoryId: sub.id,
        nature: sub.nature,
        rhythm: flag.recurring ? 'COMMITTED' : sub.rhythm,
        isRecurring: flag.recurring ?? false,
        isExceptional: flag.exceptional ?? false,
        description: flag.description ?? MERCHANTS[subId] ?? subId,
      })
    })
  }
  return lines
}

/** `n` lines of `amount`. */
export const times = (n: number, amount: number): number[] =>
  Array.from({ length: n }, () => amount)

/** A habit that does not move: what every month of the constant ledger spends. */
export const HABIT: MonthPlan = {
  grocery: times(8, 48),
  restaurant: times(4, 56.5),
  delivery: times(9, 15),
  rent: [650],
  pharmacy: times(3, 20),
  streaming: [13.49],
}

export function registry(
  lines: TrendLine[],
  smoothed: TrendSmoothedPurchase[] = [],
  historyStart: string | null = HISTORY_START,
  recurrences: TrendRecurrence[] = []
): TrendRegistry {
  return {
    lines,
    smoothed,
    categories: CATEGORIES,
    subcategories: SUBCATEGORIES,
    historyStart,
    recurrences,
  }
}

const PER_MONTH: Record<TrendRecurrencePeriod, number> = {
  WEEKLY: 52 / 12,
  FOUR_WEEKLY: 13 / 12,
  MONTHLY: 1,
  QUARTERLY: 1 / 3,
  YEARLY: 1 / 12,
}

/**
 * A series of the recurrence cache, built from its charges (`date`, price)
 * the way detection writes it: latest amount, first and last dates, the
 * next one a period after the last. Divisor 1: the share is the price.
 */
export function recurrence(input: {
  name: string
  merchantKey: string
  subcategoryId: string
  status?: TrendRecurrence['status']
  period?: TrendRecurrencePeriod
  charges: Array<[date: string, amount: number]>
  nextExpected?: string
}): TrendRecurrence {
  const sub = subById.get(input.subcategoryId)
  if (!sub) throw new Error(`Unknown subcategory ${input.subcategoryId}`)
  const period = input.period ?? 'MONTHLY'
  const charges = input.charges.map(([date, amount]) => ({
    transactionId: `${input.merchantKey}-${date}`,
    date,
    amount,
    share: amount,
  }))
  const first = charges[0]
  const last = charges[charges.length - 1]
  if (!first || !last) throw new Error('A series has charges')
  const next = new Date(`${last.date}T00:00:00.000Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return {
    id: `rec-${input.merchantKey}`,
    merchantKey: input.merchantKey,
    amountBucket: Math.round(last.amount),
    name: input.name,
    status: input.status ?? 'ACTIVE',
    period,
    amount: last.amount,
    monthlyEquivalent: Math.round(last.amount * PER_MONTH[period] * 100) / 100,
    firstDate: first.date,
    lastDate: last.date,
    nextExpected: input.nextExpected ?? next.toISOString().slice(0, 10),
    categoryId: sub.categoryId,
    subcategoryId: sub.id,
    charges,
  }
}

/** The lines of a series, as the ledger holds them: recurring, committed. */
export function recurrenceLines(series: TrendRecurrence): TrendLine[] {
  const sub = subById.get(series.subcategoryId ?? '')
  if (!sub) throw new Error(`Unknown subcategory ${series.subcategoryId}`)
  return series.charges.map(charge => ({
    id: charge.transactionId,
    date: charge.date,
    amount: charge.share,
    categoryId: sub.categoryId,
    subcategoryId: sub.id,
    nature: sub.nature,
    rhythm: 'COMMITTED',
    isRecurring: true,
    isExceptional: false,
    description: `PRLV ${series.merchantKey.toUpperCase()}`,
  }))
}

/** Every month of the history spends the habit; `september` replaces the last. */
export function ledger(
  september: MonthPlan = HABIT,
  flags: Partial<Record<string, LineFlags>> = {}
): TrendLine[] {
  return MONTHS.flatMap(month =>
    month === SEPTEMBER
      ? monthLines(month, september, flags)
      : monthLines(month, HABIT)
  )
}

/**
 * September as the plan's examples read it: fewer deliveries, the same
 * number of supermarket visits at a dearer basket, more restaurants, the
 * rent revised by 10 €.
 */
export const SEPTEMBER_CHANGES: MonthPlan = {
  ...HABIT,
  grocery: times(8, 62),
  restaurant: times(5, 62.4),
  delivery: times(3, 15),
  rent: [660],
}

/**
 * Income and savings for every month of the history: `income` a month,
 * `savings` set aside, `september` in place of the last three months.
 */
export function flows(
  income: number,
  savings: number,
  lastQuarter: number = savings
): TrendFlow[] {
  const quarter = MONTHS.slice(-3)
  return MONTHS.map(month => ({
    month,
    income,
    savings: quarter.includes(month) ? lastQuarter : savings,
  }))
}
