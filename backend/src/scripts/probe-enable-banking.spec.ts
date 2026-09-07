import { describe, it, expect } from 'vitest'
import { createVerify, generateKeyPairSync } from 'crypto'
import {
  buildJwt,
  buildJwtSigningInput,
  isWatched,
  orderForReport,
  summariseAspsp,
  type Aspsp,
} from './probe-enable-banking'

const APP_ID = '550e8400-e29b-41d4-a716-446655440000'

/** A throwaway RSA pair, so signing is exercised without a checked-in key. */
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
}

/** Split a token into its three parts, failing loudly if it has any other shape. */
function segmentsOf(token: string): [string, string, string] {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error(`Expected 3 JWT segments, got ${parts.length}`)
  }
  return parts as [string, string, string]
}

/** The decoded header and payload of a signing input (the token minus its signature). */
function claimsOf(signingInput: string): {
  header: Record<string, unknown>
  payload: Record<string, unknown>
} {
  const parts = signingInput.split('.')
  if (parts.length !== 2) {
    throw new Error(`Expected 2 signing-input segments, got ${parts.length}`)
  }
  const [header, payload] = parts as [string, string]
  return { header: decodeSegment(header), payload: decodeSegment(payload) }
}

function aspsp(overrides: Partial<Aspsp> = {}): Aspsp {
  return {
    name: overrides.name ?? 'Some Bank',
    country: overrides.country ?? 'FR',
    ...overrides,
  }
}

describe('buildJwtSigningInput', () => {
  it('names the application in the header kid', () => {
    const { header } = claimsOf(buildJwtSigningInput(APP_ID, 1_700_000_000))
    expect(header).toMatchObject({
      typ: 'JWT',
      alg: 'RS256',
      kid: APP_ID,
    })
  })

  it('uses the exact issuer and audience the API requires', () => {
    const { payload } = claimsOf(buildJwtSigningInput(APP_ID, 1_700_000_000))
    expect(payload).toMatchObject({
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
    })
  })

  it('expires one hour after issuance by default', () => {
    const { payload } = claimsOf(buildJwtSigningInput(APP_ID, 1_700_000_000))
    expect(payload.iat).toBe(1_700_000_000)
    expect(payload.exp).toBe(1_700_003_600)
  })

  it('emits base64url, never plain base64', () => {
    // A '+' or '/' in the encoded segments is what makes a token fail with an
    // opaque 401 rather than a parse error.
    const input = buildJwtSigningInput(APP_ID, 1_700_000_000)
    expect(input).not.toMatch(/[+/=]/)
  })
})

describe('buildJwt', () => {
  it('produces three segments verifiable with the matching public key', () => {
    const [header, payload, signature] = segmentsOf(
      buildJwt(APP_ID, privateKey, 1_700_000_000)
    )

    const verified = createVerify('RSA-SHA256')
      .update(`${header}.${payload}`)
      .verify(publicKey, Buffer.from(signature, 'base64url'))
    expect(verified).toBe(true)
  })

  it('rejects verification when the signing input is tampered with', () => {
    const [, payload, signature] = segmentsOf(
      buildJwt(APP_ID, privateKey, 1_700_000_000)
    )
    const forgedHeader = Buffer.from(
      JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: 'someone-else' })
    ).toString('base64url')

    const verified = createVerify('RSA-SHA256')
      .update(`${forgedHeader}.${payload}`)
      .verify(publicKey, Buffer.from(signature, 'base64url'))
    expect(verified).toBe(false)
  })
})

describe('isWatched', () => {
  it('matches the registered entity name, not just the brand', () => {
    expect(isWatched('Revolut Bank UAB')).toBe(true)
    expect(isWatched('Boursorama Banque')).toBe(true)
    expect(isWatched('CIC')).toBe(true)
  })

  it('ignores case', () => {
    expect(isWatched('BOURSORAMA')).toBe(true)
  })

  it('leaves unrelated banks out', () => {
    expect(isWatched('Nordea')).toBe(false)
    expect(isWatched('BNP Paribas')).toBe(false)
  })
})

describe('summariseAspsp', () => {
  it('converts the consent validity from seconds to days', () => {
    const v = summariseAspsp(aspsp({ maximum_consent_validity: 90 * 86400 }))
    expect(v.consentDays).toBe(90)
  })

  it('reports an unpublished consent validity as null rather than zero', () => {
    // Zero would read as "no consent at all", which is a different and much
    // worse fact than "the bank does not say".
    expect(summariseAspsp(aspsp()).consentDays).toBeNull()
  })

  it('flags a bank that demands the PSU be present', () => {
    const v = summariseAspsp(
      aspsp({ required_psu_headers: ['psu-ip-address', 'psu-user-agent'] })
    )
    expect(v.requiresPsuPresent).toBe(true)
  })

  it('does not flag a bank that asks only for non-presence headers', () => {
    const v = summariseAspsp(
      aspsp({ required_psu_headers: ['psu-user-agent'] })
    )
    expect(v.requiresPsuPresent).toBe(false)
  })

  it('treats a missing beta flag as not beta', () => {
    expect(summariseAspsp(aspsp()).beta).toBe(false)
  })

  it('drops auth methods that carry neither name nor title', () => {
    const v = summariseAspsp(
      aspsp({
        auth_methods: [{ name: 'redirect' }, {}, { title: 'decoupled' }],
      })
    )
    expect(v.authMethods).toEqual(['redirect', 'decoupled'])
  })
})

describe('orderForReport', () => {
  it('puts the watchlist first, in watchlist order', () => {
    const verdicts = [
      aspsp({ name: 'Revolut Bank UAB' }),
      aspsp({ name: 'Nordea' }),
      aspsp({ name: 'CIC' }),
      aspsp({ name: 'Boursorama Banque' }),
    ].map(summariseAspsp)

    expect(orderForReport(verdicts).map(v => v.name)).toEqual([
      'CIC',
      'Boursorama Banque',
      'Revolut Bank UAB',
      'Nordea',
    ])
  })

  it('sorts the remainder alphabetically', () => {
    const verdicts = [
      aspsp({ name: 'Société Générale' }),
      aspsp({ name: 'BNP Paribas' }),
      aspsp({ name: 'Crédit Agricole' }),
    ].map(summariseAspsp)

    expect(orderForReport(verdicts).map(v => v.name)).toEqual([
      'BNP Paribas',
      'Crédit Agricole',
      'Société Générale',
    ])
  })

  it('leaves the input untouched', () => {
    const verdicts = [aspsp({ name: 'Nordea' }), aspsp({ name: 'CIC' })].map(
      summariseAspsp
    )
    const before = verdicts.map(v => v.name)

    orderForReport(verdicts)

    expect(verdicts.map(v => v.name)).toEqual(before)
  })
})
