/**
 * Phase 0 of the bank sync: does Enable Banking actually cover the banks we
 * need, and under what terms?
 *
 * ## Why
 *
 * Everything else in the plan — the transaction identity rework, the matcher,
 * the scheduler — is worthless if CIC, Boursorama or Revolut turn out to be
 * uncovered, beta-only, or to grant consent so short that a user has to
 * re-authenticate every fortnight. That is a factual question with a factual
 * answer, and it costs one API call to get it. So it gets asked first, before
 * a single column is added to the schema.
 *
 * The script reads two endpoints and writes nothing, anywhere. It does not
 * touch the database, it does not start an authorization, and it never sees a
 * bank credential. It is safe to run against production credentials.
 *
 * ## What it cannot tell us
 *
 * How far back each bank lets us read. `ASPSPData` carries no history-depth
 * field — the depth is whatever the bank returns once a session exists, so it
 * can only be measured in phase 2, by asking. The 90-days-after-authorization
 * figure in the docs is a common default, not a promise.
 *
 * ## Usage
 *
 *   # Credentials come from the Control Panel (see README of the phase):
 *   ENABLE_BANKING_APP_ID=<application uuid> \
 *   ENABLE_BANKING_PRIVATE_KEY_PATH=/absolute/path/to/<app-id>.pem \
 *     pnpm ts-node src/scripts/probe-enable-banking.ts
 *
 * `--country` selects the market to list (default FR). `--all` prints every
 * ASPSP of that country instead of only the watchlist.
 */
import { createSign } from 'crypto'
import { readFileSync } from 'fs'

/** Production base URL. `api.tilisy.com` is the deprecated alias. */
const API_BASE = 'https://api.enablebanking.com'

/** How long the signed JWT stays valid. The API caps this at one hour. */
const TOKEN_TTL_SECONDS = 3600

/** Market probed unless `--country` says otherwise. */
const DEFAULT_COUNTRY = 'FR'

/**
 * The banks this project needs, matched loosely against `ASPSPData.name`.
 * Loosely on purpose: the registered name is "Boursorama Banque" or
 * "Revolut Bank UAB" depending on the entity, and an exact match would report
 * a false negative on a bank that is in fact covered.
 */
const WATCHLIST = ['cic', 'boursorama', 'revolut']

/** Shape of `ASPSPData`, narrowed to the fields the probe reports on. */
export interface Aspsp {
  name: string
  country: string
  psu_types?: string[]
  auth_methods?: { name?: string; title?: string }[]
  maximum_consent_validity?: number
  beta?: boolean
  bic?: string
  required_psu_headers?: string[]
}

/** Shape of `GetApplicationResponse`. */
export interface Application {
  name: string
  description?: string
  kid: string
  environment: 'SANDBOX' | 'PRODUCTION'
  redirect_urls: string[]
  active: boolean
  countries?: string[]
  services?: string[]
}

/** One line of the report, already reduced to what a decision needs. */
export interface AspspVerdict {
  name: string
  bic: string | null
  /** Longest consent the bank grants, in days. Null when unpublished. */
  consentDays: number | null
  beta: boolean
  /** True when the bank refuses background fetches (PSU must be present). */
  requiresPsuPresent: boolean
  authMethods: string[]
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Assemble the signing input of the RS256 JWT: `base64url(header).base64url(payload)`.
 *
 * Split out from the signing itself so the claim structure can be asserted in
 * a test without a private key. Enable Banking rejects the token unless `kid`
 * is the application id and `iss`/`aud` are exactly these two constants, and
 * every one of those is a silent 401 when wrong.
 */
export function buildJwtSigningInput(
  applicationId: string,
  issuedAt: number,
  ttlSeconds: number = TOKEN_TTL_SECONDS
): string {
  const header = {
    typ: 'JWT',
    alg: 'RS256',
    kid: applicationId,
  }
  const payload = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  }
  return `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
}

/**
 * Sign the JWT the API expects. Uses Node's own crypto rather than a JWT
 * library: RS256 over a dotted string is three lines here, and a probe should
 * not drag a dependency into the backend to answer a yes/no question.
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

/** Whether an ASPSP name matches one of the banks we care about. */
export function isWatched(
  name: string,
  watchlist: string[] = WATCHLIST
): boolean {
  const haystack = name.toLowerCase()
  return watchlist.some(needle => haystack.includes(needle))
}

/**
 * Reduce an ASPSP to the four facts that decide whether it is usable.
 *
 * `requiresPsuPresent` is the one that quietly kills a scheduled sync: a bank
 * demanding `psu-ip-address` on every call is telling us it will not serve a
 * cron job, only a user sitting in front of the screen.
 */
export function summariseAspsp(aspsp: Aspsp): AspspVerdict {
  const headers = aspsp.required_psu_headers ?? []
  return {
    name: aspsp.name,
    bic: aspsp.bic ?? null,
    consentDays:
      aspsp.maximum_consent_validity === undefined
        ? null
        : Math.round(aspsp.maximum_consent_validity / 86400),
    beta: aspsp.beta ?? false,
    requiresPsuPresent: headers.some(h =>
      h.toLowerCase().includes('psu-ip-address')
    ),
    authMethods: (aspsp.auth_methods ?? [])
      .map(m => m.name ?? m.title ?? '?')
      .filter(name => name !== '?'),
  }
}

/**
 * Sort so the report reads as a decision: the banks we asked about first, in
 * watchlist order, then everything else alphabetically.
 */
export function orderForReport(
  verdicts: AspspVerdict[],
  watchlist: string[] = WATCHLIST
): AspspVerdict[] {
  const rank = (name: string): number => {
    const index = watchlist.findIndex(needle =>
      name.toLowerCase().includes(needle)
    )
    return index === -1 ? watchlist.length : index
  }
  return [...verdicts].sort(
    (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)
  )
}

/** An API error that kept its status code, so a caller can tell 403 from 500. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const body = await response.text()
    throw new ApiError(
      response.status,
      `GET ${path} → ${response.status} ${response.statusText}\n${body}`
    )
  }
  return (await response.json()) as T
}

function formatVerdict(v: AspspVerdict): string {
  const flags = [
    v.beta ? 'BETA' : null,
    v.requiresPsuPresent ? 'PSU-PRESENT-REQUIRED' : null,
  ].filter(Boolean)
  const consent =
    v.consentDays === null
      ? 'consent: unpublished'
      : `consent: ${v.consentDays}d`
  const auth = v.authMethods.length
    ? ` | auth: ${v.authMethods.join(', ')}`
    : ''
  const suffix = flags.length ? `  [${flags.join(' ')}]` : ''
  return `  ${v.name.padEnd(38)} ${consent.padEnd(24)} ${(v.bic ?? '—').padEnd(12)}${auth}${suffix}`
}

export async function main(
  applicationId: string,
  privateKeyPem: string,
  country: string,
  showAll: boolean
): Promise<void> {
  const token = buildJwt(applicationId, privateKeyPem)

  // 1. Credentials and, more usefully, the application's own state: an app
  //    still pending activation reports active=false, which explains an empty
  //    account list later far better than a stack trace would.
  const app = await apiGet<Application>('/application', token)
  console.log('\n=== Application ===')
  console.log(`  name         : ${app.name}`)
  console.log(`  environment  : ${app.environment}`)
  console.log(`  active       : ${app.active}`)
  console.log(`  services     : ${(app.services ?? []).join(', ') || '—'}`)
  console.log(`  countries    : ${(app.countries ?? []).join(', ') || 'all'}`)
  console.log(
    `  redirect_urls: ${app.redirect_urls.join(', ') || '— (none registered!)'}`
  )

  if (!app.active) {
    console.log(
      '\n  ⚠  The application is not active yet. In restricted production this\n' +
        '     stays false until at least one account is linked from the Control\n' +
        '     Panel ("Activate by linking accounts").'
    )
  }
  if (app.redirect_urls.length === 0) {
    console.log(
      '\n  ⚠  No redirect URL registered. POST /auth will refuse every redirect\n' +
        '     until one is whitelisted in the Control Panel.'
    )
  }

  // 2. Coverage. The question phase 0 exists to answer.
  //
  // `/aspsps` is gated behind activation: an application awaiting its first
  // linked account gets 403, not an empty list. That is a state to explain,
  // not an error to throw — the credentials are fine and so is the code.
  let aspsps: Aspsp[]
  try {
    ;({ aspsps } = await apiGet<{ aspsps: Aspsp[] }>(
      `/aspsps?country=${encodeURIComponent(country)}`,
      token
    ))
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      console.log(
        '\n=== ASPSPs ===\n' +
          '  Not readable yet: the API refuses the bank list until the\n' +
          '  application is active (403 "Application is not active").\n\n' +
          '  Unblock it from the Control Panel → Applications → this app →\n' +
          '  "Activate by linking accounts", then authorize one of your own\n' +
          '  accounts at its bank. One account is enough to flip `active`.\n\n' +
          '  Re-run this probe afterwards for the coverage report.\n'
      )
      return
    }
    throw err
  }

  const matched = aspsps.filter(a => isWatched(a.name))
  const verdicts = orderForReport(
    (showAll ? aspsps : matched).map(summariseAspsp)
  )

  console.log(`\n=== ASPSPs in ${country} (${aspsps.length} total) ===`)
  if (verdicts.length === 0) {
    console.log(
      '  none matching the watchlist — run with --all to see the list'
    )
  } else {
    verdicts.forEach(v => console.log(formatVerdict(v)))
  }

  // 3. The go/no-go, stated rather than left to the reader.
  console.log('\n=== Watchlist ===')
  for (const needle of WATCHLIST) {
    const hits = matched.filter(a => a.name.toLowerCase().includes(needle))
    if (hits.length === 0) {
      console.log(`  ${needle.padEnd(12)} NOT COVERED in ${country}`)
      continue
    }
    const worst = Math.min(
      ...hits.map(
        h => summariseAspsp(h).consentDays ?? Number.POSITIVE_INFINITY
      )
    )
    const days = Number.isFinite(worst)
      ? `${worst}d consent`
      : 'consent unpublished'
    console.log(
      `  ${needle.padEnd(12)} ${hits.length} match(es), shortest ${days}`
    )
  }

  console.log(
    '\nHistory depth is deliberately absent: no ASPSP field carries it, so it\n' +
      'can only be measured in phase 2 once a session exists.\n'
  )
}

// Run only when executed directly (not when imported by tests).
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config')

  const args = process.argv.slice(2)
  const countryArg = args.indexOf('--country')
  const country =
    countryArg !== -1
      ? (args[countryArg + 1] ?? DEFAULT_COUNTRY)
      : DEFAULT_COUNTRY
  const showAll = args.includes('--all')

  const applicationId = process.env.ENABLE_BANKING_APP_ID
  const keyPath = process.env.ENABLE_BANKING_PRIVATE_KEY_PATH

  if (!applicationId || !keyPath) {
    console.error(
      'ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY_PATH must be set.\n' +
        'Both come from the Enable Banking Control Panel: the application id is\n' +
        'shown on the application page, and the .pem is downloaded once, at\n' +
        'registration — it is not retrievable afterwards.'
    )
    process.exit(1)
  }

  main(
    applicationId,
    readFileSync(keyPath, 'utf8'),
    country.toUpperCase(),
    showAll
  ).catch(err => {
    console.error(err)
    process.exit(1)
  })
}
