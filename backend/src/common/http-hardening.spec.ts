import { describe, it, expect } from 'vitest'
import { apiDocsEnabled, helmetOptions } from './http-hardening'

describe('apiDocsEnabled', () => {
  it('serves the docs in development', () => {
    expect(apiDocsEnabled({ NODE_ENV: 'development' })).toBe(true)
  })

  it('serves the docs when NODE_ENV is unset — a bare local run', () => {
    expect(apiDocsEnabled({})).toBe(true)
  })

  it('refuses the docs in production', () => {
    expect(apiDocsEnabled({ NODE_ENV: 'production' })).toBe(false)
  })

  it('API_DOCS=1 overrides production, explicitly and nothing else', () => {
    expect(apiDocsEnabled({ NODE_ENV: 'production', API_DOCS: '1' })).toBe(
      true
    )
    expect(apiDocsEnabled({ NODE_ENV: 'production', API_DOCS: 'true' })).toBe(
      false
    )
    expect(apiDocsEnabled({ NODE_ENV: 'production', API_DOCS: '0' })).toBe(
      false
    )
  })
})

describe('helmetOptions', () => {
  it('keeps the relaxed profile while the docs are served', () => {
    const options = helmetOptions(true)
    expect(options.contentSecurityPolicy).toBe(false)
    expect(options.crossOriginOpenerPolicy).toBe(false)
  })

  it('denies every CSP source once the docs are off', () => {
    const options = helmetOptions(false)
    expect(options.contentSecurityPolicy).toEqual({
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    })
  })

  it('never disables frame protection in the strict profile', () => {
    const options = helmetOptions(false)
    // frameguard stays at helmet's default (enabled) — only the three
    // explicitly named policies are touched.
    expect('frameguard' in options).toBe(false)
  })
})
