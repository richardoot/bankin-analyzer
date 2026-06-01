import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import {
  computeHashV2,
  planRehash,
  assertUniqueHashes,
  type RehashRow,
  type RehashUpdate,
} from './rehash-transactions'

const USER_A = '550e8400-e29b-41d4-a716-446655440001'
const USER_B = '550e8400-e29b-41d4-a716-446655440002'
const ACCT_X = 'aaaaaaaa-0000-0000-0000-000000000001'
const ACCT_Y = 'bbbbbbbb-0000-0000-0000-000000000002'

function row(overrides: Partial<RehashRow> = {}): RehashRow {
  return {
    id: overrides.id ?? '550e8400-e29b-41d4-a716-446655440010',
    userId: overrides.userId ?? USER_A,
    accountId: overrides.accountId ?? ACCT_X,
    date: overrides.date ?? new Date('2024-01-15T10:30:00.000Z'),
    amount: overrides.amount ?? '-45.50',
    description: overrides.description ?? 'Restaurant',
    createdAt: overrides.createdAt ?? new Date('2024-01-16T08:00:00.000Z'),
  }
}

function uniqueHashes(updates: RehashUpdate[]): Set<string> {
  return new Set(updates.map(u => u.newHash))
}

function findById(updates: RehashUpdate[], id: string): string {
  const u = updates.find(x => x.id === id)
  if (!u) throw new Error(`No update found for id ${id}`)
  return u.newHash
}

describe('computeHashV2', () => {
  it('produces a 64-char hex SHA-256', () => {
    const h = computeHashV2(
      USER_A,
      new Date('2024-01-15T10:30:00.000Z'),
      '-45.50',
      ACCT_X,
      'Restaurant'
    )
    expect(h).toMatch(/^[a-f0-9]{64}$/)
  })

  it('is deterministic for identical inputs', () => {
    const args: Parameters<typeof computeHashV2> = [
      USER_A,
      new Date('2024-01-15T10:30:00.000Z'),
      '-45.50',
      ACCT_X,
      'Restaurant',
    ]
    expect(computeHashV2(...args)).toBe(computeHashV2(...args))
  })

  it('produces different hashes when any input differs', () => {
    const base = new Date('2024-01-15T10:30:00.000Z')
    const h0 = computeHashV2(USER_A, base, '-45.50', ACCT_X, 'Restaurant')
    expect(
      computeHashV2(USER_B, base, '-45.50', ACCT_X, 'Restaurant')
    ).not.toBe(h0)
    expect(
      computeHashV2(
        USER_A,
        new Date('2024-01-16T10:30:00.000Z'),
        '-45.50',
        ACCT_X,
        'Restaurant'
      )
    ).not.toBe(h0)
    expect(
      computeHashV2(USER_A, base, '-45.51', ACCT_X, 'Restaurant')
    ).not.toBe(h0)
    expect(
      computeHashV2(USER_A, base, '-45.50', ACCT_Y, 'Restaurant')
    ).not.toBe(h0)
    expect(computeHashV2(USER_A, base, '-45.50', ACCT_X, 'Resto')).not.toBe(h0)
  })

  it('uses ISO 8601 with milliseconds for the date component', () => {
    const date = new Date('2024-01-15T10:30:00.123Z')
    const expected = createHash('sha256')
      .update(`${USER_A}|2024-01-15T10:30:00.123Z|-45.50|${ACCT_X}|Restaurant`)
      .digest('hex')
    expect(computeHashV2(USER_A, date, '-45.50', ACCT_X, 'Restaurant')).toBe(
      expected
    )
  })

  it('appends the suffix with a leading pipe when provided', () => {
    const date = new Date('2024-01-15T10:30:00.000Z')
    const noSuffix = computeHashV2(USER_A, date, '-45.50', ACCT_X, 'Resto')
    const withSuffix = computeHashV2(
      USER_A,
      date,
      '-45.50',
      ACCT_X,
      'Resto',
      ':2'
    )
    expect(noSuffix).not.toBe(withSuffix)

    const expected = createHash('sha256')
      .update(`${USER_A}|2024-01-15T10:30:00.000Z|-45.50|${ACCT_X}|Resto|:2`)
      .digest('hex')
    expect(withSuffix).toBe(expected)
  })

  it('treats empty-string suffix as "no suffix"', () => {
    const date = new Date('2024-01-15T10:30:00.000Z')
    const noSuffix = computeHashV2(USER_A, date, '-45.50', ACCT_X, 'Resto')
    const emptySuffix = computeHashV2(
      USER_A,
      date,
      '-45.50',
      ACCT_X,
      'Resto',
      ''
    )
    expect(emptySuffix).toBe(noSuffix)
  })
})

describe('planRehash', () => {
  it('returns empty for empty input', () => {
    expect(planRehash([])).toEqual([])
  })

  it('a single transaction gets the base hash (no suffix)', () => {
    const r = row({ id: 'tx-1' })
    const updates = planRehash([r])
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe('tx-1')
    expect(updates[0].newHash).toBe(
      computeHashV2(r.userId, r.date, r.amount, r.accountId, r.description)
    )
  })

  it('two transactions in different groups both get base hashes', () => {
    const r1 = row({ id: 'tx-1', description: 'Restaurant' })
    const r2 = row({ id: 'tx-2', description: 'Supermarché' })
    const updates = planRehash([r1, r2])
    expect(updates).toHaveLength(2)
    expect(uniqueHashes(updates).size).toBe(2)
    expect(findById(updates, 'tx-1')).toBe(
      computeHashV2(r1.userId, r1.date, r1.amount, r1.accountId, r1.description)
    )
    expect(findById(updates, 'tx-2')).toBe(
      computeHashV2(r2.userId, r2.date, r2.amount, r2.accountId, r2.description)
    )
  })

  it('two real duplicates: 1st gets base, 2nd gets :2 suffix', () => {
    const r1 = row({
      id: 'tx-1',
      createdAt: new Date('2024-01-16T08:00:00.000Z'),
    })
    const r2 = row({
      id: 'tx-2',
      createdAt: new Date('2024-01-16T09:00:00.000Z'),
    })
    const updates = planRehash([r1, r2])
    expect(uniqueHashes(updates).size).toBe(2)

    const baseHash = computeHashV2(
      r1.userId,
      r1.date,
      r1.amount,
      r1.accountId,
      r1.description
    )
    const secondHash = computeHashV2(
      r1.userId,
      r1.date,
      r1.amount,
      r1.accountId,
      r1.description,
      ':2'
    )

    expect(findById(updates, 'tx-1')).toBe(baseHash)
    expect(findById(updates, 'tx-2')).toBe(secondHash)
  })

  it('three real duplicates get base, :2, :3 in createdAt order', () => {
    const rows = [
      row({ id: 'tx-3', createdAt: new Date('2024-01-16T12:00:00.000Z') }),
      row({ id: 'tx-1', createdAt: new Date('2024-01-16T08:00:00.000Z') }),
      row({ id: 'tx-2', createdAt: new Date('2024-01-16T10:00:00.000Z') }),
    ]
    const updates = planRehash(rows)
    expect(uniqueHashes(updates).size).toBe(3)
    const base = computeHashV2(
      rows[0].userId,
      rows[0].date,
      rows[0].amount,
      rows[0].accountId,
      rows[0].description
    )
    expect(findById(updates, 'tx-1')).toBe(base)
    expect(findById(updates, 'tx-2')).toBe(
      computeHashV2(
        rows[0].userId,
        rows[0].date,
        rows[0].amount,
        rows[0].accountId,
        rows[0].description,
        ':2'
      )
    )
    expect(findById(updates, 'tx-3')).toBe(
      computeHashV2(
        rows[0].userId,
        rows[0].date,
        rows[0].amount,
        rows[0].accountId,
        rows[0].description,
        ':3'
      )
    )
  })

  it('uses id as last-resort tiebreaker when createdAt is identical', () => {
    const sameCreatedAt = new Date('2024-01-16T08:00:00.000Z')
    const r1 = row({ id: 'aaaa-1', createdAt: sameCreatedAt })
    const r2 = row({ id: 'bbbb-2', createdAt: sameCreatedAt })
    // Input order intentionally reversed
    const updates = planRehash([r2, r1])
    const base = computeHashV2(
      r1.userId,
      r1.date,
      r1.amount,
      r1.accountId,
      r1.description
    )
    const second = computeHashV2(
      r1.userId,
      r1.date,
      r1.amount,
      r1.accountId,
      r1.description,
      ':2'
    )
    expect(findById(updates, 'aaaa-1')).toBe(base)
    expect(findById(updates, 'bbbb-2')).toBe(second)
  })

  it('groups are scoped per user (same fields across users do not collide)', () => {
    const date = new Date('2024-01-15T10:30:00.000Z')
    const r1 = row({ id: 'tx-A', userId: USER_A, date })
    const r2 = row({ id: 'tx-B', userId: USER_B, date })
    const updates = planRehash([r1, r2])
    expect(uniqueHashes(updates).size).toBe(2)
    // Both get base hash (each user is their own group)
    expect(findById(updates, 'tx-A')).toBe(
      computeHashV2(USER_A, date, r1.amount, r1.accountId, r1.description)
    )
    expect(findById(updates, 'tx-B')).toBe(
      computeHashV2(USER_B, date, r2.amount, r2.accountId, r2.description)
    )
  })

  it('groups are scoped per account (same fields across accounts do not collide)', () => {
    const r1 = row({ id: 'tx-X', accountId: ACCT_X })
    const r2 = row({ id: 'tx-Y', accountId: ACCT_Y })
    const updates = planRehash([r1, r2])
    expect(uniqueHashes(updates).size).toBe(2)
  })

  it('is order-invariant: shuffling the input produces the same updates', () => {
    const data: RehashRow[] = [
      row({
        id: 'a',
        description: 'Restaurant',
        createdAt: new Date('2024-01-16T08:00:00.000Z'),
      }),
      row({
        id: 'b',
        description: 'Restaurant',
        createdAt: new Date('2024-01-16T09:00:00.000Z'),
      }),
      row({ id: 'c', description: 'Supermarché' }),
      row({ id: 'd', userId: USER_B, description: 'Restaurant' }),
    ]
    const updates1 = planRehash([...data])
    const updates2 = planRehash([data[3]!, data[1]!, data[0]!, data[2]!])

    // Compare as id→hash maps to ignore output order
    const map = (us: RehashUpdate[]) => new Map(us.map(u => [u.id, u.newHash]))
    expect(map(updates1)).toEqual(map(updates2))
  })

  it('is idempotent on the canonical form (same rows → same updates)', () => {
    const data: RehashRow[] = [
      row({ id: 'a', createdAt: new Date('2024-01-16T08:00:00.000Z') }),
      row({ id: 'b', createdAt: new Date('2024-01-16T09:00:00.000Z') }),
      row({ id: 'c', createdAt: new Date('2024-01-16T10:00:00.000Z') }),
    ]
    expect(planRehash(data)).toEqual(planRehash(data))
  })

  it('preserves uniqueness across a mixed scenario', () => {
    const rows: RehashRow[] = [
      // user A, account X — three real duplicates
      row({ id: 'a1', createdAt: new Date('2024-01-16T08:00:00.000Z') }),
      row({ id: 'a2', createdAt: new Date('2024-01-16T09:00:00.000Z') }),
      row({ id: 'a3', createdAt: new Date('2024-01-16T10:00:00.000Z') }),
      // user A, account X — one unique tx
      row({ id: 'a4', description: 'Coffee' }),
      // user A, account Y — same fields as the duplicates above
      row({ id: 'a5', accountId: ACCT_Y }),
      // user B, account X — same fields as user A's duplicates
      row({ id: 'b1', userId: USER_B }),
      row({
        id: 'b2',
        userId: USER_B,
        createdAt: new Date('2024-01-16T11:00:00.000Z'),
      }),
    ]
    const updates = planRehash(rows)
    expect(updates).toHaveLength(7)
    expect(uniqueHashes(updates).size).toBe(7)
  })

  it('amount strings are compared as strings (caller must canonicalize)', () => {
    // Two semantically-equal amounts in different string forms become DIFFERENT
    // groups. The migration script normalises via Decimal.toString() so this
    // shouldn't happen in practice, but the test pins the contract.
    const r1 = row({ id: 'tx-1', amount: '-45.5' })
    const r2 = row({ id: 'tx-2', amount: '-45.50' })
    const updates = planRehash([r1, r2])
    expect(uniqueHashes(updates).size).toBe(2)
    // Both are 1st-of-group, so both use the base hash with their respective amount
    expect(findById(updates, 'tx-1')).toBe(
      computeHashV2(r1.userId, r1.date, '-45.5', r1.accountId, r1.description)
    )
    expect(findById(updates, 'tx-2')).toBe(
      computeHashV2(r2.userId, r2.date, '-45.50', r2.accountId, r2.description)
    )
  })

  it('handles a large run of identical duplicates without collision', () => {
    const sameCreatedAt = new Date('2024-01-16T08:00:00.000Z')
    const rows: RehashRow[] = Array.from({ length: 50 }, (_, i) =>
      row({
        id: `tx-${i.toString().padStart(3, '0')}`,
        createdAt: new Date(sameCreatedAt.getTime() + i * 1000),
      })
    )
    const updates = planRehash(rows)
    expect(updates).toHaveLength(50)
    expect(uniqueHashes(updates).size).toBe(50)
    // First gets base, others get :2 ... :50
    const base = computeHashV2(
      rows[0]!.userId,
      rows[0]!.date,
      rows[0]!.amount,
      rows[0]!.accountId,
      rows[0]!.description
    )
    expect(findById(updates, 'tx-000')).toBe(base)
    expect(findById(updates, 'tx-049')).toBe(
      computeHashV2(
        rows[0]!.userId,
        rows[0]!.date,
        rows[0]!.amount,
        rows[0]!.accountId,
        rows[0]!.description,
        ':50'
      )
    )
  })
})

describe('assertUniqueHashes', () => {
  it('passes when all hashes are unique', () => {
    expect(() =>
      assertUniqueHashes([
        { id: 'a', newHash: 'h1' },
        { id: 'b', newHash: 'h2' },
        { id: 'c', newHash: 'h3' },
      ])
    ).not.toThrow()
  })

  it('passes on an empty list', () => {
    expect(() => assertUniqueHashes([])).not.toThrow()
  })

  it('throws with a helpful message when a collision exists', () => {
    expect(() =>
      assertUniqueHashes([
        { id: 'a', newHash: 'h1' },
        { id: 'b', newHash: 'h1' },
      ])
    ).toThrow(/collision detected.*a.*b.*h1/)
  })

  it('mentions both colliding transaction ids', () => {
    let thrown: Error | null = null
    try {
      assertUniqueHashes([
        { id: 'first-tx', newHash: 'samehash' },
        { id: 'second-tx', newHash: 'samehash' },
      ])
    } catch (e) {
      thrown = e as Error
    }
    expect(thrown).not.toBeNull()
    expect(thrown!.message).toContain('first-tx')
    expect(thrown!.message).toContain('second-tx')
    expect(thrown!.message).toContain('samehash')
  })
})

describe('planRehash + assertUniqueHashes (integration)', () => {
  it('a realistic mixed batch passes the unicity check', () => {
    const rows: RehashRow[] = [
      row({ id: 'a1', createdAt: new Date('2024-01-16T08:00:00.000Z') }),
      row({ id: 'a2', createdAt: new Date('2024-01-16T09:00:00.000Z') }),
      row({ id: 'a3', description: 'Other' }),
      row({ id: 'a4', userId: USER_B }),
      row({ id: 'a5', accountId: ACCT_Y }),
    ]
    const updates = planRehash(rows)
    expect(() => assertUniqueHashes(updates)).not.toThrow()
  })
})
