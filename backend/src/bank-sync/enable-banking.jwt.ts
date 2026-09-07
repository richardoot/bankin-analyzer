/**
 * The token every call to Enable Banking carries.
 *
 * Lives here rather than in the script that first needed it, because the
 * scripts and the application now both sign, and two copies of a signature
 * routine drift in exactly the way that produces an opaque 401.
 */
import { createSign } from 'crypto'

/** How long a signed token stays valid. The API caps this at one hour. */
const TOKEN_TTL_SECONDS = 3600

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Assemble the signing input: `base64url(header).base64url(payload)`.
 *
 * Separate from the signing so the claims can be asserted without a private
 * key. Every one of them is a silent 401 when wrong: `kid` must be the
 * application id, and `iss`/`aud` exactly these two constants.
 */
export function buildJwtSigningInput(
  applicationId: string,
  issuedAt: number,
  ttlSeconds: number = TOKEN_TTL_SECONDS
): string {
  const header = { typ: 'JWT', alg: 'RS256', kid: applicationId }
  const payload = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  }
  return `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
}

/**
 * Sign the token the API expects.
 *
 * Node's own crypto rather than a JWT library: RS256 over a dotted string is
 * three lines, and this does not warrant a dependency.
 */
export function buildJwt(
  applicationId: string,
  privateKeyPem: string,
  issuedAt: number = Math.floor(Date.now() / 1000)
): string {
  const signingInput = buildJwtSigningInput(applicationId, issuedAt)
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(privateKeyPem)
  return `${signingInput}.${base64url(signature)}`
}
