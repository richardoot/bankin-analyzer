import type { TrendWindow } from '@/lib/api'

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
