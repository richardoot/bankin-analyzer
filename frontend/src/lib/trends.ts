import type { TrendInsightDto, TrendWindow } from '@/lib/api'

/**
 * The reference windows « Ce qui change » offers, in complete months before
 * the month read: 3 for a recent habit, 6 (the default) for « avant », 12
 * for the whole year. The server accepts these three and no other.
 */
export const TREND_WINDOWS: readonly TrendWindow[] = [3, 6, 12]

export const DEFAULT_TREND_WINDOW: TrendWindow = 6

export function isTrendWindow(value: unknown): value is TrendWindow {
  return TREND_WINDOWS.includes(value as TrendWindow)
}

/**
 * The groups « Ce qui change » files its lines under, in the order it shows
 * them: what is paid each month, the categories, the merchants, then the
 * month as a whole. Display only — the score still orders the lines.
 */
export type TrendGroupKey = 'charges' | 'categories' | 'merchants' | 'overview'

export const TREND_GROUPS: ReadonlyArray<{
  key: TrendGroupKey
  title: string
}> = [
  { key: 'charges', title: 'Abonnements et charges' },
  { key: 'categories', title: 'Catégories' },
  { key: 'merchants', title: 'Enseignes' },
  { key: 'overview', title: "Vue d'ensemble" },
]

const isCategoryUnit = (insight: Pick<TrendInsightDto, 'unit'>): boolean =>
  insight.unit.type === 'category' || insight.unit.type === 'subcategory'

/**
 * The group a line reads in, from its kind and its unit; null for the lines
 * to file, a warning shown above the groups rather than a trend. A habit
 * that came or went belongs to its merchant, or to its category when it is
 * one; a frequency to its merchant when it reads one. Any kind this card
 * does not know yet reads in « Catégories ».
 */
export function trendGroupOf(
  insight: Pick<TrendInsightDto, 'kind' | 'unit'>
): TrendGroupKey | null {
  switch (insight.kind) {
    case 'uncategorized':
      return null
    case 'subscription':
    case 'price':
      return 'charges'
    case 'share':
    case 'savings':
      return 'overview'
    case 'newHabit':
    case 'lostHabit':
      return isCategoryUnit(insight) ? 'categories' : 'merchants'
    case 'frequency':
      return insight.unit.type === 'merchant' ? 'merchants' : 'categories'
    default:
      return 'categories'
  }
}
