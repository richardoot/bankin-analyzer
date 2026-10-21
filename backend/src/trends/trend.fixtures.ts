/**
 * Small, readable registries for the trend detection: a catalogue shaped
 * like the real one and a month-by-month builder. Amounts are the user's
 * share, net, as the dashboard sums them.
 */

import type {
  TrendCategory,
  TrendLine,
  TrendNature,
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
  historyStart: string | null = HISTORY_START
): TrendRegistry {
  return {
    lines,
    smoothed,
    categories: CATEGORIES,
    subcategories: SUBCATEGORIES,
    historyStart,
  }
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
