/**
 * Helpers around "exceptional" tag periods.
 *
 * A tag flagged `isExceptional` may carry an event window (`eventStartDate` /
 * `eventEndDate`). During that window the user's everyday life is suspended —
 * they are away, so the usual groceries/fuel/commute simply do not happen.
 * Those days must therefore be removed from the denominator of every "everyday"
 * average, otherwise the baseline is mechanically under-estimated.
 *
 * All computations are done on UTC day boundaries: the columns are `@db.Date`,
 * so the driver hands back UTC midnights and any local-timezone arithmetic
 * would drift by a day around DST changes.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** An inclusive [start, end] range of whole days. */
export interface DayInterval {
  start: Date
  end: Date
}

/** Truncate a date to its UTC midnight, in milliseconds. */
function toUtcDayMs(date: Date): number {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0
  )
}

/** Number of whole days covered by [start, end], both bounds included. */
export function daysBetweenInclusive(start: Date, end: Date): number {
  const diff = toUtcDayMs(end) - toUtcDayMs(start)
  if (diff < 0) return 0
  return Math.floor(diff / MS_PER_DAY) + 1
}

/**
 * Merge overlapping or contiguous intervals so that overlapping events (a
 * birthday celebrated during a holiday) are never counted twice.
 */
export function mergeDayIntervals(intervals: DayInterval[]): DayInterval[] {
  if (intervals.length === 0) return []

  const sorted = intervals
    .map(i => ({ start: toUtcDayMs(i.start), end: toUtcDayMs(i.end) }))
    .filter(i => i.end >= i.start)
    .sort((a, b) => a.start - b.start)

  const merged: { start: number; end: number }[] = []
  for (const current of sorted) {
    const last = merged[merged.length - 1]
    // `+ MS_PER_DAY` so that two back-to-back intervals (ending the 5th and
    // starting the 6th) collapse into one.
    if (last && current.start <= last.end + MS_PER_DAY) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push({ ...current })
    }
  }

  return merged.map(i => ({ start: new Date(i.start), end: new Date(i.end) }))
}

/**
 * Total number of days covered by `intervals` that fall inside the
 * [windowStart, windowEnd] window (both inclusive). Intervals are merged first,
 * then clipped to the window.
 */
export function countDaysInWindow(
  intervals: DayInterval[],
  windowStart: Date,
  windowEnd: Date
): number {
  const windowStartMs = toUtcDayMs(windowStart)
  const windowEndMs = toUtcDayMs(windowEnd)
  if (windowEndMs < windowStartMs) return 0

  let total = 0
  for (const interval of mergeDayIntervals(intervals)) {
    const start = Math.max(toUtcDayMs(interval.start), windowStartMs)
    const end = Math.min(toUtcDayMs(interval.end), windowEndMs)
    if (end < start) continue
    total += Math.floor((end - start) / MS_PER_DAY) + 1
  }
  return total
}

/**
 * Build the day intervals of the exceptional tags that declare an event window.
 * Tags without a window describe an *additive* event (a party at home): the
 * user's everyday life carried on, so they consume no everyday days.
 */
export function toEventIntervals(
  tags: { eventStartDate: Date | null; eventEndDate: Date | null }[]
): DayInterval[] {
  const intervals: DayInterval[] = []
  for (const tag of tags) {
    if (tag.eventStartDate && tag.eventEndDate) {
      intervals.push({ start: tag.eventStartDate, end: tag.eventEndDate })
    }
  }
  return intervals
}
