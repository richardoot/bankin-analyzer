import { describe, it, expect } from 'vitest'
import {
  decide,
  decideAll,
  expiringConnections,
  interpretFailure,
  stateAfterFailure,
  type ConnectionState,
} from './sync-policy'

const NOW = new Date('2026-09-02T12:00:00.000Z')

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000)
}

function inDays(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000)
}

function connection(overrides: Partial<ConnectionState> = {}): ConnectionState {
  return {
    id: 'conn-1',
    aspspName: 'Boursorama Banque',
    status: 'ACTIVE',
    consentValidUntil: inDays(120),
    lastSyncAt: hoursAgo(24),
    fetchesToday: 0,
    retryAfter: null,
    ...overrides,
  }
}

describe('decide', () => {
  it('fetches a connection that is due', () => {
    expect(decide(connection(), NOW)).toMatchObject({ action: 'fetch' })
  })

  it('sends the user to their bank once the consent has lapsed', () => {
    // No scheduler can renew this: it needs a person, a browser and the bank's
    // own authentication.
    expect(decide(connection({ status: 'EXPIRED' }), NOW)).toMatchObject({
      action: 'reconnect',
    })
  })

  it('notices a consent that ran out between two runs', () => {
    const decision = decide(connection({ consentValidUntil: inDays(-1) }), NOW)
    expect(decision.action).toBe('reconnect')
  })

  it('leaves a withdrawn connection alone for good', () => {
    const decision = decide(connection({ status: 'REVOKED' }), NOW)
    expect(decision).toMatchObject({ action: 'skip' })
    expect(decision.reason).toContain('withdrawn')
  })

  it('waits out a backoff the bank asked for', () => {
    const decision = decide(
      connection({ retryAfter: new Date(NOW.getTime() + 4 * 3_600_000) }),
      NOW
    )
    expect(decision.action).toBe('skip')
    expect(decision.reason).toContain('4h')
  })

  it('fetches again once the backoff has passed', () => {
    expect(decide(connection({ retryAfter: hoursAgo(1) }), NOW)).toMatchObject({
      action: 'fetch',
    })
  })

  it('stops at the daily quota', () => {
    expect(decide(connection({ fetchesToday: 3 }), NOW)).toMatchObject({
      action: 'skip',
    })
  })

  it('keeps one fetch a day in hand for the user', () => {
    // Most banks allow four. The scheduler uses three, so asking for a refresh
    // by hand is never met with the bank's refusal.
    expect(decide(connection({ fetchesToday: 2 }), NOW)).toMatchObject({
      action: 'fetch',
    })
    expect(decide(connection({ fetchesToday: 3 }), NOW)).toMatchObject({
      action: 'skip',
    })
  })

  it('respects the minimum gap between two fetches', () => {
    expect(decide(connection({ lastSyncAt: hoursAgo(2) }), NOW)).toMatchObject({
      action: 'skip',
    })
    expect(decide(connection({ lastSyncAt: hoursAgo(9) }), NOW)).toMatchObject({
      action: 'fetch',
    })
  })

  it('fetches a connection that has never synced', () => {
    expect(decide(connection({ lastSyncAt: null }), NOW)).toMatchObject({
      action: 'fetch',
    })
  })

  it('asks for a reconnection before rationing requests', () => {
    // There is no sense counting requests to a bank that will refuse them all.
    const decision = decide(
      connection({ status: 'EXPIRED', fetchesToday: 99 }),
      NOW
    )
    expect(decision.action).toBe('reconnect')
  })

  it('treats an unstated consent expiry as no expiry', () => {
    expect(decide(connection({ consentValidUntil: null }), NOW)).toMatchObject({
      action: 'fetch',
    })
  })
})

describe('decideAll', () => {
  it('answers for every connection, in order', () => {
    const decisions = decideAll(
      [
        connection({ id: 'a' }),
        connection({ id: 'b', status: 'REVOKED' }),
        connection({ id: 'c', fetchesToday: 5 }),
      ],
      NOW
    )
    expect(decisions.map(d => `${d.connectionId}:${d.action}`)).toEqual([
      'a:fetch',
      'b:skip',
      'c:skip',
    ])
  })
})

describe('expiringConnections', () => {
  it('warns before the consent runs out, not after', () => {
    const warnings = expiringConnections(
      [connection({ consentValidUntil: inDays(10) })],
      NOW
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.daysLeft).toBe(10)
    expect(warnings[0]?.expired).toBe(false)
  })

  it('stays quiet while there is plenty of time', () => {
    expect(
      expiringConnections([connection({ consentValidUntil: inDays(120) })], NOW)
    ).toEqual([])
  })

  it('reports one already expired', () => {
    const [warning] = expiringConnections(
      [connection({ consentValidUntil: inDays(-3) })],
      NOW
    )
    expect(warning?.expired).toBe(true)
    expect(warning?.daysLeft).toBeLessThan(0)
  })

  it('puts the most urgent first', () => {
    const warnings = expiringConnections(
      [
        connection({ id: 'later', consentValidUntil: inDays(12) }),
        connection({ id: 'sooner', consentValidUntil: inDays(2) }),
      ],
      NOW
    )
    expect(warnings.map(w => w.connectionId)).toEqual(['sooner', 'later'])
  })

  it('says nothing about a connection the user withdrew', () => {
    expect(
      expiringConnections(
        [connection({ status: 'REVOKED', consentValidUntil: inDays(1) })],
        NOW
      )
    ).toEqual([])
  })

  it('says nothing about a consent with no stated end', () => {
    expect(
      expiringConnections([connection({ consentValidUntil: null })], NOW)
    ).toEqual([])
  })
})

describe('interpretFailure', () => {
  it('recognises a session the bank has forgotten', () => {
    expect(interpretFailure('{"error":"EXPIRED_SESSION"}', NOW)).toEqual({
      kind: 'expiredSession',
    })
  })

  it('recognises quota exhaustion and says when to return', () => {
    const failure = interpretFailure(
      '{"error":"ASPSP_RATE_LIMIT_EXCEEDED"}',
      NOW
    )
    expect(failure.kind).toBe('rateLimited')
    if (failure.kind === 'rateLimited') {
      const hours = (failure.retryAfter.getTime() - NOW.getTime()) / 3_600_000
      expect(hours).toBe(6)
    }
  })

  it('leaves anything else as itself', () => {
    const failure = interpretFailure('{"error":"INTERNAL"}', NOW)
    expect(failure.kind).toBe('other')
  })

  it('keeps only a readable part of an unknown failure', () => {
    const failure = interpretFailure('x'.repeat(1000), NOW)
    if (failure.kind === 'other') expect(failure.detail).toHaveLength(200)
  })
})

describe('stateAfterFailure', () => {
  it('marks a connection expired when the session is gone', () => {
    expect(stateAfterFailure({ kind: 'expiredSession' })).toEqual({
      status: 'EXPIRED',
    })
  })

  it('records when to come back after a refusal', () => {
    const retryAfter = inDays(1)
    expect(stateAfterFailure({ kind: 'rateLimited', retryAfter })).toEqual({
      retryAfter,
    })
  })

  it('changes nothing on a failure it does not understand', () => {
    // Marking a connection expired over a network blip would send the user to
    // their bank for nothing.
    expect(stateAfterFailure({ kind: 'other', detail: 'boom' })).toEqual({})
  })
})
