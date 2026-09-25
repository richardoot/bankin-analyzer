/**
 * What the backend tells Sentry, decided in one place.
 *
 * Sentry is where a failure survives once Vercel's log window has closed:
 * the stack, the request it happened on, the user it happened to (as an
 * id), and how often. It is also where a route's p95 comes from.
 *
 * This is a finance application, so the rule is that nothing sent there
 * could be mistaken for the data: no request bodies, no query strings, no
 * cookies, no local variables, no headers beyond the harmless few, no
 * prompts. Errors carry a stack and a request id; spans carry route names
 * and parameterised SQL. That is enough to debug and nothing to leak.
 *
 * Pure functions over `process.env`-shaped input, so the policy is
 * assertable in a spec without loading the SDK.
 */
import type { NodeOptions } from '@sentry/nestjs'

export interface SentryEnv {
  SENTRY_DSN?: string | undefined
  SENTRY_TRACES_SAMPLE_RATE?: string | undefined
  VERCEL_ENV?: string | undefined
  NODE_ENV?: string | undefined
  VERCEL_GIT_COMMIT_SHA?: string | undefined
}

/** Applied unless the environment says otherwise. */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.2

/** A rate is a number in [0, 1]; anything else means the default. */
export function sampleRate(
  raw: string | undefined,
  fallback: number = DEFAULT_TRACES_SAMPLE_RATE
): number {
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback
}

const ID_SEGMENT = /^(?:[0-9a-f-]{20,}|\d{6,}|[A-Za-z0-9_-]{32,})$/i

/**
 * A URL with nothing identifying left in it: origin and path, the query
 * string gone, and any path segment that looks like an identifier (a UUID,
 * a long number, an opaque token) replaced by `:id`. Enough to say which
 * upstream endpoint was involved, not which account.
 */
export function scrubUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url.split('?')[0] ?? url
  }
  const path = parsed.pathname
    .split('/')
    .map(segment => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/')
  return `${parsed.origin}${path}`
}

type Breadcrumb = NonNullable<
  Parameters<NonNullable<NodeOptions['beforeBreadcrumb']>>[0]
>

/** Outgoing HTTP breadcrumbs keep the endpoint, lose the identifiers. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const url: unknown = breadcrumb.data?.url
  if (typeof url === 'string') {
    breadcrumb.data = { ...breadcrumb.data, url: scrubUrl(url) }
  }
  return breadcrumb
}

/**
 * The options for `Sentry.init`, or undefined when there is no DSN: at a
 * desk and in the e2e suite the SDK stays out entirely.
 */
export function sentryOptions(env: SentryEnv): NodeOptions | undefined {
  if (!env.SENTRY_DSN) return undefined
  return {
    dsn: env.SENTRY_DSN,
    environment: env.VERCEL_ENV ?? env.NODE_ENV ?? 'development',
    release: env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: sampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
    dataCollection: {
      // The guard sets the user by hand: an id, never an email or an IP.
      userInfo: false,
      cookies: { allow: [] },
      httpHeaders: {
        allow: [
          'content-type',
          'content-length',
          'user-agent',
          'x-vercel-id',
          'x-request-id',
        ],
      },
      httpBodies: [],
      urlQueryParams: { allow: [] },
      // The prompts carry transaction labels and the answers carry
      // categories: neither leaves the process.
      genAI: { inputs: false, outputs: false },
      // A local variable at the crash site is as likely to be an amount as
      // anything else.
      stackFrameVariables: false,
    },
    beforeBreadcrumb: scrubBreadcrumb,
  }
}
