/**
 * The month a share series is read at, and its habit, by the trends' rule
 * (backend `trend.detection.ts`, `TREND_RULES`): the last closed month, against
 * the median of the closed months before it — six at most, silent under
 * three. A month with no share (nothing spent) is skipped, as the share
 * trend skips it.
 */

/** The months the habit reads, at most: the trends' default window. */
export const SHARE_HABIT_WINDOW = 6
/** Under this many months there is no habit to speak of. */
export const SHARE_HABIT_MIN_MONTHS = 3

export interface ShareReading {
  /** `YYYY-MM` of the month read. */
  month: string
  /** Its share, in percent. */
  share: number
  /** The median of the months before it, null without enough of them. */
  habit: number | null
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

/** The current month, `YYYY-MM`, in local time as the page reads « today ». */
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * The closed months of a series with a share, chronological, and the
 * reading of the last one. Null when no closed month has a share.
 */
export function shareReading(
  series: readonly (number | null)[],
  months: readonly string[],
  currentMonth: string = currentMonthKey()
): ShareReading | null {
  const closed = months.flatMap((month, i) => {
    const share = series[i]
    return month < currentMonth && share !== null && share !== undefined
      ? [{ month, share }]
      : []
  })
  const last = closed.at(-1)
  if (!last) return null
  const before = closed.slice(0, -1).slice(-SHARE_HABIT_WINDOW)
  return {
    month: last.month,
    share: last.share,
    habit:
      before.length >= SHARE_HABIT_MIN_MONTHS
        ? Math.round(median(before.map(m => m.share)) * 10) / 10
        : null,
  }
}
