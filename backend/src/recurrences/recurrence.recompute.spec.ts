import { describe, it, expect } from 'vitest'
import { isFresh } from './recurrence.recompute'

const now = new Date('2026-10-09T12:00:00.000Z')
const hoursAgo = (hours: number): Date =>
  new Date(now.getTime() - hours * 3_600_000)

describe('isFresh', () => {
  it('is stale for a user never computed', () => {
    expect(isFresh(null, now)).toBe(false)
    expect(
      isFresh({ version: 0n, computedVersion: null, computedAt: null }, now)
    ).toBe(false)
  })

  it('is fresh when no change came after the version it was built from', () => {
    expect(
      isFresh(
        { version: 4n, computedVersion: 4n, computedAt: hoursAgo(2) },
        now
      )
    ).toBe(true)
  })

  it('is stale once the ledger changed since', () => {
    expect(
      isFresh(
        { version: 5n, computedVersion: 4n, computedAt: hoursAgo(2) },
        now
      )
    ).toBe(false)
  })

  it('is stale after a day, the ledger untouched: time ends charges too', () => {
    expect(
      isFresh(
        { version: 4n, computedVersion: 4n, computedAt: hoursAgo(25) },
        now
      )
    ).toBe(false)
  })
})
