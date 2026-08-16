import { describe, it, expect } from 'vitest'
import {
  normalizeToUtcMidnight,
  planNormalization,
  movedDates,
  type DateUpdate,
} from './normalize-transaction-dates'
import { computeHashV2, type RehashRow } from './rehash-transactions'

const PARIS = 'Europe/Paris'
const USER_A = '550e8400-e29b-41d4-a716-446655440001'
const ACCT_X = 'aaaaaaaa-0000-0000-0000-000000000001'

function row(overrides: Partial<RehashRow> = {}): RehashRow {
  return {
    id: overrides.id ?? '550e8400-e29b-41d4-a716-446655440010',
    userId: overrides.userId ?? USER_A,
    accountId: overrides.accountId ?? ACCT_X,
    date: overrides.date ?? new Date('2026-05-31T22:00:00.000Z'),
    amount: overrides.amount ?? '-45.50',
    description: overrides.description ?? 'Restaurant',
    createdAt: overrides.createdAt ?? new Date('2026-06-02T08:00:00.000Z'),
  }
}

function findById(updates: DateUpdate[], id: string): DateUpdate {
  const u = updates.find(x => x.id === id)
  if (!u) throw new Error(`No update found for id ${id}`)
  return u
}

describe('normalizeToUtcMidnight', () => {
  it('re-anchors a DST local midnight onto the day it means', () => {
    // Paris summer is UTC+2: local midnight on 1 June was stored as 31 May 22:00.
    expect(
      normalizeToUtcMidnight(new Date('2026-05-31T22:00:00.000Z'), PARIS)
    ).toEqual(new Date('2026-06-01T00:00:00.000Z'))
  })

  it('re-anchors a winter local midnight onto the day it means', () => {
    // Paris winter is UTC+1: local midnight on 1 Feb was stored as 31 Jan 23:00.
    expect(
      normalizeToUtcMidnight(new Date('2026-01-31T23:00:00.000Z'), PARIS)
    ).toEqual(new Date('2026-02-01T00:00:00.000Z'))
  })

  it('leaves a date already anchored at UTC midnight untouched', () => {
    const already = new Date('2026-06-01T00:00:00.000Z')
    expect(normalizeToUtcMidnight(already, PARIS)).toEqual(already)
  })

  it('is idempotent', () => {
    const once = normalizeToUtcMidnight(
      new Date('2026-05-31T22:00:00.000Z'),
      PARIS
    )
    expect(normalizeToUtcMidnight(once, PARIS)).toEqual(once)
  })

  it('truncates a mid-day timestamp to its own day', () => {
    expect(
      normalizeToUtcMidnight(new Date('2026-06-01T10:00:00.000Z'), PARIS)
    ).toEqual(new Date('2026-06-01T00:00:00.000Z'))
  })

  it('crosses a year boundary', () => {
    expect(
      normalizeToUtcMidnight(new Date('2025-12-31T23:00:00.000Z'), PARIS)
    ).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })
})

describe('planNormalization', () => {
  it('pairs each row with its normalized date', () => {
    const a = row({ id: 'id-a', date: new Date('2026-05-31T22:00:00.000Z') })
    const b = row({
      id: 'id-b',
      date: new Date('2026-01-31T23:00:00.000Z'),
      description: 'Loyer',
    })

    const updates = planNormalization([a, b], PARIS)

    expect(findById(updates, 'id-a').newDate).toEqual(
      new Date('2026-06-01T00:00:00.000Z')
    )
    expect(findById(updates, 'id-b').newDate).toEqual(
      new Date('2026-02-01T00:00:00.000Z')
    )
  })

  it('hashes against the normalized date, not the stored one', () => {
    const r = row({ id: 'id-a' })
    const updates = planNormalization([r], PARIS)

    expect(findById(updates, 'id-a').newHash).toBe(
      computeHashV2(
        r.userId,
        new Date('2026-06-01T00:00:00.000Z'),
        r.amount,
        r.accountId,
        r.description
      )
    )
  })

  it('keeps rows unique when normalization merges two timestamps into one day', () => {
    // Same day, same everything — a real duplicate pair that must keep two
    // distinct hashes via the `:N` suffix scheme.
    const a = row({ id: 'id-a', createdAt: new Date('2026-06-02T08:00:00Z') })
    const b = row({ id: 'id-b', createdAt: new Date('2026-06-02T09:00:00Z') })

    const updates = planNormalization([a, b], PARIS)
    const hashes = new Set(updates.map(u => u.newHash))

    expect(updates).toHaveLength(2)
    expect(hashes.size).toBe(2)
  })

  it('is idempotent: a second pass produces the same dates and hashes', () => {
    const rows = [
      row({ id: 'id-a' }),
      row({ id: 'id-b', date: new Date('2026-01-31T23:00:00.000Z') }),
    ]

    const first = planNormalization(rows, PARIS)
    const second = planNormalization(
      rows.map(r => ({ ...r, date: findById(first, r.id).newDate })),
      PARIS
    )

    expect(second.map(u => ({ id: u.id, d: u.newDate, h: u.newHash }))).toEqual(
      first.map(u => ({ id: u.id, d: u.newDate, h: u.newHash }))
    )
  })
})

describe('movedDates', () => {
  it('reports only the rows whose date actually changes', () => {
    const shifted = row({ id: 'id-a' })
    const clean = row({
      id: 'id-b',
      date: new Date('2026-06-01T00:00:00.000Z'),
      description: 'Loyer',
    })

    const rows = [shifted, clean]
    const moved = movedDates(rows, planNormalization(rows, PARIS))

    expect(moved.map(u => u.id)).toEqual(['id-a'])
  })
})
