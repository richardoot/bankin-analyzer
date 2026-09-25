/**
 * What the browser tells Sentry, decided in one place.
 *
 * Errors a component throws, promises nobody caught, and the ones
 * `useAsyncAction` turns into a toast all end up here with a stack trace
 * mapped back to the source, plus page-load and navigation timings.
 *
 * Same rule as the backend, since this is a finance application: nothing
 * sent could be mistaken for the data. No component props (a transaction
 * row's props are the transaction), no request bodies, no query strings,
 * no cookies, no headers. The user is an opaque id set by hand.
 *
 * `sentryOptions` is pure so the policy is assertable in a spec;
 * `installSentry` is the one call main.ts makes.
 */
import * as Sentry from '@sentry/vue'
import type { BrowserOptions } from '@sentry/vue'
import type { App } from 'vue'
import type { Router } from 'vue-router'

export interface SentryEnv {
  VITE_SENTRY_DSN?: string | undefined
  VITE_SENTRY_TRACES_SAMPLE_RATE?: string | undefined
  VITE_API_URL?: string | undefined
  /** Vercel exposes its system variables to Vite under this prefix. */
  VITE_VERCEL_ENV?: string | undefined
  VITE_VERCEL_GIT_COMMIT_SHA?: string | undefined
  MODE?: string | undefined
}

export const DEFAULT_TRACES_SAMPLE_RATE = 0.2

export function sampleRate(
  raw: string | undefined,
  fallback: number = DEFAULT_TRACES_SAMPLE_RATE
): number {
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback
}

/** The origin the trace headers may be sent to: the API, nothing else. */
export function apiOrigin(apiUrl: string | undefined): string {
  try {
    return new URL(apiUrl ?? 'http://localhost:3000').origin
  } catch {
    return 'http://localhost:3000'
  }
}

export type SentryInitOptions = Omit<BrowserOptions, 'integrations'>

export function sentryOptions(env: SentryEnv): SentryInitOptions | undefined {
  if (!env.VITE_SENTRY_DSN) return undefined
  return {
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_VERCEL_ENV ?? env.MODE ?? 'development',
    release: env.VITE_VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: sampleRate(env.VITE_SENTRY_TRACES_SAMPLE_RATE),
    tracePropagationTargets: [apiOrigin(env.VITE_API_URL)],
    dataCollection: {
      userInfo: false,
      cookies: { allow: [] },
      httpHeaders: { allow: [] },
      httpBodies: [],
      urlQueryParams: { allow: [] },
    },
  }
}

/** Start the SDK, or do nothing at all without a DSN. */
export function installSentry(app: App, router: Router): void {
  const options = sentryOptions(import.meta.env as SentryEnv)
  if (!options) return
  Sentry.init({
    app,
    ...options,
    integrations: [
      // No props: a row component's props are the row.
      Sentry.vueIntegration({ attachProps: false }),
      Sentry.browserTracingIntegration({ router }),
    ],
  })
}

/** Who the events belong to, as an opaque id. `null` on sign-out. */
export function setSentryUser(id: string | null | undefined): void {
  Sentry.setUser(id ? { id } : null)
}
