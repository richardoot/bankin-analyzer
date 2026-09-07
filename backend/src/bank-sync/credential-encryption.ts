/**
 * Encrypting a private key at rest, and nothing more ambitious than that.
 *
 * AES-256-GCM: a random 12-byte IV per encryption, the 16-byte auth tag GCM
 * produces, and the ciphertext — concatenated in that order and base64'd, so
 * the database holds one opaque string rather than three columns to keep in
 * step. Node's own `crypto`, the same choice `enable-banking.jwt.ts` already
 * made for signing: a private key is small and this is a dozen lines, not a
 * dependency.
 *
 * The key that does the encrypting is not this application's to generate —
 * it lives in `CREDENTIALS_ENCRYPTION_KEY`, 32 bytes, base64. Losing it
 * loses every stored credential at once; that is the operator's backup to
 * take, not a case this module tries to soften.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function loadKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'CREDENTIALS_ENCRYPTION_KEY must be set to store or read a bank credential.'
    )
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error(
      'CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes for AES-256 — ' +
        `got ${key.length}. Generate one with: openssl rand -base64 32`
    )
  }
  return key
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, loadKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')
}

export function decryptSecret(stored: string): string {
  const raw = Buffer.from(stored, 'base64')
  const iv = raw.subarray(0, IV_LENGTH)
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, loadKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8')
}
