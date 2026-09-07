import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encryptSecret, decryptSecret } from './credential-encryption'

describe('credential-encryption', () => {
  const originalKey = process.env.CREDENTIALS_ENCRYPTION_KEY

  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.from(
      'a'.repeat(32)
    ).toString('base64')
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.CREDENTIALS_ENCRYPTION_KEY
    else process.env.CREDENTIALS_ENCRYPTION_KEY = originalKey
  })

  it('round-trips a private key', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----'
    expect(decryptSecret(encryptSecret(pem))).toBe(pem)
  })

  it('produces a different ciphertext each time, thanks to the random IV', () => {
    const pem = 'same-secret'
    expect(encryptSecret(pem)).not.toBe(encryptSecret(pem))
  })

  it('refuses to decrypt once the ciphertext has been tampered with', () => {
    const stored = encryptSecret('a secret worth protecting')
    const raw = Buffer.from(stored, 'base64')
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0xff
    const tampered = raw.toString('base64')

    expect(() => decryptSecret(tampered)).toThrow()
  })

  it('refuses to decrypt under the wrong key', () => {
    const stored = encryptSecret('a secret worth protecting')
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.from(
      'b'.repeat(32)
    ).toString('base64')

    expect(() => decryptSecret(stored)).toThrow()
  })

  it('refuses to run without an encryption key configured', () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY
    expect(() => encryptSecret('anything')).toThrow(
      /CREDENTIALS_ENCRYPTION_KEY must be set/
    )
  })

  it('refuses a key that is not 32 bytes once decoded', () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY =
      Buffer.from('too-short').toString('base64')
    expect(() => encryptSecret('anything')).toThrow(/32 bytes/)
  })
})
