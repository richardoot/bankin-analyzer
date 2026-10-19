import { describe, it, expect } from 'vitest'
import { calendarDayIn, tagEventStatus } from './tag-status'

describe('tagEventStatus', () => {
  const today = '2026-07-15'

  it('is upcoming when the window starts after today', () => {
    expect(tagEventStatus('2026-07-16', '2026-07-20', today)).toBe('upcoming')
  })

  it('is ongoing on the first day of the window', () => {
    expect(tagEventStatus('2026-07-15', '2026-07-20', today)).toBe('ongoing')
  })

  it('is ongoing on the last day of the window', () => {
    expect(tagEventStatus('2026-07-10', '2026-07-15', today)).toBe('ongoing')
  })

  it('is past once the last day is behind', () => {
    expect(tagEventStatus('2026-07-10', '2026-07-14', today)).toBe('past')
  })

  it('reads a one-day window as upcoming, ongoing, then past', () => {
    expect(tagEventStatus('2026-07-15', '2026-07-15', '2026-07-14')).toBe(
      'upcoming'
    )
    expect(tagEventStatus('2026-07-15', '2026-07-15', '2026-07-15')).toBe(
      'ongoing'
    )
    expect(tagEventStatus('2026-07-15', '2026-07-15', '2026-07-16')).toBe(
      'past'
    )
  })

  it('has no status without a window', () => {
    expect(tagEventStatus(null, null, today)).toBeNull()
  })

  it('has no status with a half-filled window', () => {
    expect(tagEventStatus('2026-07-10', null, today)).toBeNull()
    expect(tagEventStatus(null, '2026-07-20', today)).toBeNull()
  })
})

describe('calendarDayIn', () => {
  it('gives the Paris day, not the UTC day, just after midnight in Paris', () => {
    // 22:30 UTC on the 14th is 00:30 on the 15th in Paris (summer time).
    expect(calendarDayIn(new Date('2026-07-14T22:30:00.000Z'))).toBe(
      '2026-07-15'
    )
  })

  it('gives the same day in the middle of a Paris day', () => {
    expect(calendarDayIn(new Date('2026-01-15T12:00:00.000Z'))).toBe(
      '2026-01-15'
    )
  })
})
