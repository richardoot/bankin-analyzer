import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRACES_SAMPLE_RATE,
  apiOrigin,
  sampleRate,
  sentryOptions,
} from './sentry'

describe('sentryOptions', () => {
  it('keeps the SDK out without a DSN', () => {
    expect(sentryOptions({})).toBeUndefined()
    expect(sentryOptions({ VITE_SENTRY_DSN: '' })).toBeUndefined()
  })

  it("names the environment and release after Vercel's own", () => {
    const options = sentryOptions({
      VITE_SENTRY_DSN: 'https://k@o.ingest.de.sentry.io/2',
      VITE_VERCEL_ENV: 'production',
      VITE_VERCEL_GIT_COMMIT_SHA: 'abc123',
      MODE: 'production',
    })
    expect(options).toMatchObject({
      dsn: 'https://k@o.ingest.de.sentry.io/2',
      environment: 'production',
      release: 'abc123',
      tracesSampleRate: DEFAULT_TRACES_SAMPLE_RATE,
    })
  })

  it('falls back to the Vite mode off Vercel', () => {
    expect(
      sentryOptions({
        VITE_SENTRY_DSN: 'https://k@o.ingest.de.sentry.io/2',
        MODE: 'development',
      })?.environment
    ).toBe('development')
  })

  it('propagates traces to the API origin only', () => {
    const options = sentryOptions({
      VITE_SENTRY_DSN: 'https://k@o.ingest.de.sentry.io/2',
      VITE_API_URL: 'https://bankin-analyzer-backend.vercel.app/',
    })
    expect(options?.tracePropagationTargets).toEqual([
      'https://bankin-analyzer-backend.vercel.app',
    ])
  })

  it('sends nothing that could be the data', () => {
    const options = sentryOptions({
      VITE_SENTRY_DSN: 'https://k@o.ingest.de.sentry.io/2',
    })
    expect(options?.dataCollection).toEqual({
      userInfo: false,
      cookies: { allow: [] },
      httpHeaders: { allow: [] },
      httpBodies: [],
      urlQueryParams: { allow: [] },
    })
  })
})

describe('apiOrigin', () => {
  it('is the origin of the API url', () => {
    expect(apiOrigin('https://api.example.com/v1')).toBe(
      'https://api.example.com'
    )
  })

  it('is the local backend when unset or malformed', () => {
    expect(apiOrigin(undefined)).toBe('http://localhost:3000')
    expect(apiOrigin('not a url')).toBe('http://localhost:3000')
  })
})

describe('sampleRate', () => {
  it('reads a rate between 0 and 1, falls back otherwise', () => {
    expect(sampleRate('0.5')).toBe(0.5)
    expect(sampleRate(undefined)).toBe(DEFAULT_TRACES_SAMPLE_RATE)
    expect(sampleRate('7')).toBe(DEFAULT_TRACES_SAMPLE_RATE)
  })
})
