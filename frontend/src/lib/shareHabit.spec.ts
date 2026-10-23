import { describe, it, expect } from 'vitest'
import { shareReading } from './shareHabit'

const MONTHS = [
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
]

describe('shareReading', () => {
  it('reads the last closed month against the median of the six before it', () => {
    // February falls out of the window; October is the current month.
    const series = [90, 40, 38, 36, 38, 41, 37, 31, 20]
    expect(shareReading(series, MONTHS, '2026-10')).toEqual({
      month: '2026-09',
      share: 31,
      habit: 38,
    })
  })

  it('skips a month with no share, and stays silent under three months', () => {
    const series = [null, null, null, null, null, 40, null, 31, 20]
    expect(shareReading(series, MONTHS, '2026-10')).toEqual({
      month: '2026-09',
      share: 31,
      habit: null,
    })
  })

  it('has nothing to read without a closed month', () => {
    expect(shareReading([20], ['2026-10'], '2026-10')).toBeNull()
  })
})
