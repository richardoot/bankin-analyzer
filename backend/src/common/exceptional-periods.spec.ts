import { describe, it, expect } from 'vitest'
import {
  countDaysInWindow,
  daysBetweenInclusive,
  mergeDayIntervals,
  toEventIntervals,
} from './exceptional-periods'

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('daysBetweenInclusive', () => {
  it('counts both bounds', () => {
    expect(daysBetweenInclusive(d('2026-07-12'), d('2026-07-25'))).toBe(14)
  })

  it('counts a single day as one', () => {
    expect(daysBetweenInclusive(d('2026-07-12'), d('2026-07-12'))).toBe(1)
  })

  it('returns 0 for an inverted range', () => {
    expect(daysBetweenInclusive(d('2026-07-25'), d('2026-07-12'))).toBe(0)
  })

  it('crosses a DST boundary without drifting', () => {
    // Europe/Paris switches on 2026-03-29; local-time arithmetic would return 31.
    expect(daysBetweenInclusive(d('2026-03-01'), d('2026-03-31'))).toBe(31)
  })
})

describe('mergeDayIntervals', () => {
  it('merges overlapping intervals', () => {
    const merged = mergeDayIntervals([
      { start: d('2026-07-01'), end: d('2026-07-10') },
      { start: d('2026-07-05'), end: d('2026-07-15') },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.start.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(merged[0]?.end.toISOString()).toBe('2026-07-15T00:00:00.000Z')
  })

  it('merges back-to-back intervals', () => {
    const merged = mergeDayIntervals([
      { start: d('2026-07-01'), end: d('2026-07-05') },
      { start: d('2026-07-06'), end: d('2026-07-08') },
    ])
    expect(merged).toHaveLength(1)
  })

  it('keeps disjoint intervals apart', () => {
    const merged = mergeDayIntervals([
      { start: d('2026-07-01'), end: d('2026-07-05') },
      { start: d('2026-08-01'), end: d('2026-08-03') },
    ])
    expect(merged).toHaveLength(2)
  })
})

describe('countDaysInWindow', () => {
  it('clips intervals to the window', () => {
    const days = countDaysInWindow(
      [{ start: d('2026-06-25'), end: d('2026-07-10') }],
      d('2026-07-01'),
      d('2026-07-31')
    )
    expect(days).toBe(10)
  })

  it('never counts an overlap twice', () => {
    // A birthday celebrated during the holiday must not consume 2 days.
    const days = countDaysInWindow(
      [
        { start: d('2026-07-12'), end: d('2026-07-25') },
        { start: d('2026-07-20'), end: d('2026-07-20') },
      ],
      d('2026-07-01'),
      d('2026-07-31')
    )
    expect(days).toBe(14)
  })

  it('ignores intervals outside the window', () => {
    const days = countDaysInWindow(
      [{ start: d('2025-01-01'), end: d('2025-01-10') }],
      d('2026-07-01'),
      d('2026-07-31')
    )
    expect(days).toBe(0)
  })
})

describe('toEventIntervals', () => {
  it('keeps only tags declaring both bounds', () => {
    const intervals = toEventIntervals([
      { eventStartDate: d('2026-07-12'), eventEndDate: d('2026-07-25') },
      // An additive event (a party at home) consumes no everyday days.
      { eventStartDate: null, eventEndDate: null },
      { eventStartDate: d('2026-07-12'), eventEndDate: null },
    ])
    expect(intervals).toHaveLength(1)
  })
})
