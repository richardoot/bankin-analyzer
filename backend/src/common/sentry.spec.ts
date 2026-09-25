import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRACES_SAMPLE_RATE,
  sampleRate,
  scrubBreadcrumb,
  scrubUrl,
  sentryOptions,
} from './sentry'

describe('sentryOptions', () => {
  it('keeps the SDK out without a DSN', () => {
    expect(sentryOptions({})).toBeUndefined()
    expect(sentryOptions({ SENTRY_DSN: '' })).toBeUndefined()
  })

  it("names the environment and release after Vercel's own", () => {
    const options = sentryOptions({
      SENTRY_DSN: 'https://k@o.ingest.de.sentry.io/1',
      VERCEL_ENV: 'preview',
      NODE_ENV: 'production',
      VERCEL_GIT_COMMIT_SHA: 'abc123',
    })
    expect(options).toMatchObject({
      dsn: 'https://k@o.ingest.de.sentry.io/1',
      environment: 'preview',
      release: 'abc123',
      tracesSampleRate: DEFAULT_TRACES_SAMPLE_RATE,
    })
  })

  it('falls back to NODE_ENV, then development, off Vercel', () => {
    const dsn = { SENTRY_DSN: 'https://k@o.ingest.de.sentry.io/1' }
    expect(sentryOptions({ ...dsn, NODE_ENV: 'production' })?.environment).toBe(
      'production'
    )
    expect(sentryOptions(dsn)?.environment).toBe('development')
  })

  it('sends nothing that could be the data', () => {
    const options = sentryOptions({
      SENTRY_DSN: 'https://k@o.ingest.de.sentry.io/1',
    })
    expect(options?.dataCollection).toMatchObject({
      userInfo: false,
      cookies: { allow: [] },
      httpBodies: [],
      urlQueryParams: { allow: [] },
      genAI: { inputs: false, outputs: false },
      stackFrameVariables: false,
    })
    const headers = options?.dataCollection?.httpHeaders as { allow: string[] }
    expect(headers.allow).not.toContain('authorization')
    expect(headers.allow).not.toContain('cookie')
  })
})

describe('sampleRate', () => {
  it('reads a rate between 0 and 1', () => {
    expect(sampleRate('0.5')).toBe(0.5)
    expect(sampleRate('1')).toBe(1)
    expect(sampleRate('0')).toBe(0)
  })

  it('falls back on anything else', () => {
    expect(sampleRate(undefined)).toBe(DEFAULT_TRACES_SAMPLE_RATE)
    expect(sampleRate('')).toBe(DEFAULT_TRACES_SAMPLE_RATE)
    expect(sampleRate('2')).toBe(DEFAULT_TRACES_SAMPLE_RATE)
    expect(sampleRate('-1')).toBe(DEFAULT_TRACES_SAMPLE_RATE)
    expect(sampleRate('lots')).toBe(DEFAULT_TRACES_SAMPLE_RATE)
  })
})

describe('scrubUrl', () => {
  it('keeps the endpoint, drops the identifiers and the query', () => {
    expect(
      scrubUrl(
        'https://api.enablebanking.com/accounts/8b6f2c1e-4d3a-4f0b-9c2d-1a2b3c4d5e6f/transactions?date_from=2026-01-01'
      )
    ).toBe('https://api.enablebanking.com/accounts/:id/transactions')
    expect(scrubUrl('https://api.enablebanking.com/sessions/123456789')).toBe(
      'https://api.enablebanking.com/sessions/:id'
    )
  })

  it('leaves ordinary paths alone', () => {
    expect(scrubUrl('https://api.anthropic.com/v1/messages')).toBe(
      'https://api.anthropic.com/v1/messages'
    )
  })

  it('still drops the query on something that is not a URL', () => {
    expect(scrubUrl('/relative?token=x')).toBe('/relative')
  })
})

describe('scrubBreadcrumb', () => {
  it('scrubs the url of an http breadcrumb', () => {
    const crumb = scrubBreadcrumb({
      category: 'http',
      data: {
        url: 'https://api.enablebanking.com/sessions/123456789?x=1',
        method: 'GET',
      },
    })
    expect(crumb.data).toEqual({
      url: 'https://api.enablebanking.com/sessions/:id',
      method: 'GET',
    })
  })

  it('leaves a breadcrumb without url untouched', () => {
    const crumb = { category: 'console', message: 'hello' }
    expect(scrubBreadcrumb(crumb)).toBe(crumb)
  })
})
