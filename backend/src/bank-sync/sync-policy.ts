/**
 * When a bank may be asked again, and when it must be re-authorised instead.
 *
 * ## Why this is a policy and not a cron expression
 *
 * The bank sets the limits, not us. Most ASPSPs allow four background fetches
 * a day and refuse the fifth; consent lasts at most 180 days and then the user
 * has to stand in front of their bank again, which no scheduler can do on its
 * own. A fixed schedule that ignores either produces the same two failures
 * forever: quota errors during the day, and silence after six months that
 * looks exactly like "nothing happened this week".
 *
 * So the decision is computed from what the connection has actually done, and
 * the trigger — an in-process timer, a cron hitting an endpoint, a person
 * running a script — only asks the question. Every rule below is a judgement
 * over dates and counters, which is why none of it touches Prisma.
 */

export type ConnectionStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED'

/** What a connection has done, as far as scheduling cares. */
export interface ConnectionState {
  id: string
  aspspName: string
  status: ConnectionStatus
  /** When the bank stops answering. Null when the consent said nothing. */
  consentValidUntil: Date | null
  lastSyncAt: Date | null
  /**
   * Fetches already made in the current day, counted from the sync runs
   * rather than stored. A counter would drift the first time a run failed
   * halfway; the runs are the record.
   */
  fetchesToday: number
  /** Set when the bank last said it had had enough. */
  retryAfter: Date | null
}

export type SyncAction =
  /** Ask the bank now. */
  | 'fetch'
  /** Nothing to do; the reason says why. */
  | 'skip'
  /** Only the user can unblock this, in a browser, at their bank. */
  | 'reconnect'

export interface SyncDecision {
  connectionId: string
  action: SyncAction
  /** Said in words, because this is what a report or a log will show. */
  reason: string
}

export interface SyncPolicyOptions {
  /**
   * Fetches allowed per day per connection.
   *
   * Three rather than the four most banks permit: the fourth is kept in hand
   * for a fetch the user asks for themselves. Being locked out of your own
   * data because a scheduler used the last one is a bad trade.
   */
  maxFetchesPerDay?: number
  /** Shortest gap between two scheduled fetches. */
  minimumIntervalHours?: number
  /** How long before expiry the user should be told to reconnect. */
  warnBeforeExpiryDays?: number
}

const DEFAULT_MAX_FETCHES_PER_DAY = 3
const DEFAULT_MINIMUM_INTERVAL_HOURS = 8
const DEFAULT_WARN_BEFORE_EXPIRY_DAYS = 14

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/**
 * Decide what to do with one connection.
 *
 * The order of the rules is the point. Consent is checked before quota, and
 * quota before interval, because each answers a question the next one has no
 * business asking: there is no sense rationing requests to a bank that will
 * refuse every one of them.
 */
export function decide(
  connection: ConnectionState,
  now: Date,
  options: SyncPolicyOptions = {}
): SyncDecision {
  const maxFetches = options.maxFetchesPerDay ?? DEFAULT_MAX_FETCHES_PER_DAY
  const minimumInterval =
    options.minimumIntervalHours ?? DEFAULT_MINIMUM_INTERVAL_HOURS

  const at = (action: SyncAction, reason: string): SyncDecision => ({
    connectionId: connection.id,
    action,
    reason,
  })

  if (connection.status === 'REVOKED') {
    return at('skip', 'access was withdrawn')
  }

  if (connection.status === 'EXPIRED') {
    return at('reconnect', 'the consent has lapsed')
  }

  if (
    connection.consentValidUntil !== null &&
    connection.consentValidUntil.getTime() <= now.getTime()
  ) {
    // Reached without the status having been updated: the consent ran out
    // between two runs and nobody has asked the bank since.
    return at('reconnect', 'the consent expired on its own')
  }

  if (
    connection.retryAfter !== null &&
    connection.retryAfter.getTime() > now.getTime()
  ) {
    const hours = Math.ceil(
      (connection.retryAfter.getTime() - now.getTime()) / HOUR_MS
    )
    return at('skip', `the bank asked us to wait ${hours}h more`)
  }

  if (connection.fetchesToday >= maxFetches) {
    return at('skip', `${connection.fetchesToday} fetches already made today`)
  }

  if (
    connection.lastSyncAt !== null &&
    now.getTime() - connection.lastSyncAt.getTime() < minimumInterval * HOUR_MS
  ) {
    return at('skip', `fetched less than ${minimumInterval}h ago`)
  }

  return at('fetch', 'due')
}

/** Decide for a whole set, so a report can show every connection at once. */
export function decideAll(
  connections: ConnectionState[],
  now: Date,
  options: SyncPolicyOptions = {}
): SyncDecision[] {
  return connections.map(connection => decide(connection, now, options))
}

export interface ExpiryWarning {
  connectionId: string
  aspspName: string
  daysLeft: number
  expired: boolean
}

/**
 * Connections whose consent is running out, soonest first.
 *
 * Worth surfacing well before the fact: renewing needs the user, a browser and
 * their bank's authentication, none of which happens in the ten minutes after
 * they notice the figures have stopped moving.
 */
export function expiringConnections(
  connections: ConnectionState[],
  now: Date,
  options: SyncPolicyOptions = {}
): ExpiryWarning[] {
  const warnWithin =
    options.warnBeforeExpiryDays ?? DEFAULT_WARN_BEFORE_EXPIRY_DAYS

  return connections
    .filter(
      connection =>
        connection.status !== 'REVOKED' && connection.consentValidUntil !== null
    )
    .map(connection => {
      const validUntil = connection.consentValidUntil as Date
      const daysLeft = Math.floor(
        (validUntil.getTime() - now.getTime()) / DAY_MS
      )
      return {
        connectionId: connection.id,
        aspspName: connection.aspspName,
        daysLeft,
        expired: daysLeft < 0,
      }
    })
    .filter(warning => warning.daysLeft <= warnWithin)
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

/** What the bank said, reduced to what the caller has to do about it. */
export type ApiFailure =
  /** The session is gone; only a new authorization brings it back. */
  | { kind: 'expiredSession' }
  /** Too many requests. `retryAfter` is when to come back. */
  | { kind: 'rateLimited'; retryAfter: Date }
  /** Anything else: worth logging, not worth changing state over. */
  | { kind: 'other'; detail: string }

/**
 * Banks answer quota exhaustion with no useful hint about when to return, and
 * Enable Banking's own advice is to wait six hours. Guessing shorter earns
 * another refusal and burns a request doing it.
 */
const RATE_LIMIT_BACKOFF_HOURS = 6

/**
 * Read a failed API response.
 *
 * The two cases worth recognising are the two that need a different response
 * rather than a retry: one wants a person, the other wants patience. Matching
 * on the error code rather than the HTTP status because both arrive as 4xx and
 * the status alone cannot tell them apart.
 */
export function interpretFailure(
  body: string,
  now: Date,
  backoffHours: number = RATE_LIMIT_BACKOFF_HOURS
): ApiFailure {
  if (body.includes('EXPIRED_SESSION') || body.includes('SESSION_NOT_FOUND')) {
    return { kind: 'expiredSession' }
  }
  if (
    body.includes('ASPSP_RATE_LIMIT_EXCEEDED') ||
    body.includes('RATE_LIMIT_EXCEEDED')
  ) {
    return {
      kind: 'rateLimited',
      retryAfter: new Date(now.getTime() + backoffHours * HOUR_MS),
    }
  }
  return { kind: 'other', detail: body.slice(0, 200) }
}

/** The state change a failure implies, ready to be written. */
export function stateAfterFailure(failure: ApiFailure): {
  status?: ConnectionStatus
  retryAfter?: Date
} {
  switch (failure.kind) {
    case 'expiredSession':
      return { status: 'EXPIRED' }
    case 'rateLimited':
      return { retryAfter: failure.retryAfter }
    case 'other':
      // Deliberately nothing. A transient failure that marked a connection
      // expired would send the user to their bank for a network blip.
      return {}
  }
}
