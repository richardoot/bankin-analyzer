/**
 * Phase 2 spike: open one real session and look at what the bank actually
 * returns, before any of it is allowed near the database.
 *
 * ## What it answers
 *
 * Phase 0 established that CIC, Boursorama and Revolut are reachable, grant
 * 180-day consents, and do not demand the PSU be present. Two questions decide
 * the shape of everything after it, and neither can be answered without a
 * session:
 *
 *   1. **How far back does each bank let us read?** This is what keeps the
 *      Bankin CSV import alive: if the API reaches three months, the CSV
 *      remains the only source of the history, permanently. The fetch uses
 *      `strategy=longest`, which asks the connector to reach as far as the
 *      ASPSP allows rather than the default window.
 *
 *   2. **Is `entry_reference` actually populated?** The whole identity rework
 *      of phase 1 rests on it. The spec calls it "unique and immutable […]
 *      across multiple PSU authentication sessions", which is exactly the
 *      stable key the CSV never had — but it also says it is optional, and a
 *      bank that omits it forces the matcher to carry that account on
 *      heuristics alone. Better to learn that now than in phase 4.
 *
 * It also counts what `merchant_category_code` covers: an ISO 18245 code is a
 * far better categorisation input than a free-text label, and if the coverage
 * is good it changes how phase 6 should work.
 *
 * ## What it does not do
 *
 * Write to the database. Nothing here touches Prisma. The fetched
 * transactions land in a JSON file **outside the repository**, because they
 * are real bank records and have no business in git.
 *
 * ## Usage
 *
 * Two steps, because the authorization happens in a browser.
 *
 *   # 1. Start it. Prints a URL to open, and the code to come back with.
 *   pnpm ts-node src/scripts/spike-enable-banking-fetch.ts --aspsp Revolut
 *
 *   # 2. Authorize in the browser. The redirect lands on the standalone page
 *   #    `public/bank-callback.html`, which shows the code — run the frontend
 *   #    with `VITE_HTTPS=1 VITE_PORT=5174 pnpm dev` to serve it. If it does
 *   #    not load, the code is still in the address bar.
 *   pnpm ts-node src/scripts/spike-enable-banking-fetch.ts --code <code>
 *
 * `--country` defaults to FR, `--days` caps the requested consent (default:
 * the bank's own maximum), `--out` overrides the JSON destination.
 */
import { tmpdir } from 'os'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { buildJwt } from './probe-enable-banking'

const API_BASE = 'https://api.enablebanking.com'

/** Personal accounts: this project has no business banking in it. */
const PSU_TYPE = 'personal'

/** One page of transactions is capped by the ASPSP; this bounds the loop. */
const MAX_PAGES = 50

export interface TransactionAmount {
  amount?: string
  currency?: string
}

/** `Transaction`, narrowed to the fields the spike reports on. */
export interface BankTransaction {
  entry_reference?: string
  transaction_id?: string
  merchant_category_code?: string
  transaction_amount?: TransactionAmount
  credit_debit_indicator?: 'CRDT' | 'DBIT'
  status?: string
  booking_date?: string
  value_date?: string
  transaction_date?: string
  remittance_information?: string[]
  creditor?: { name?: string }
  debtor?: { name?: string }
}

export interface AccountResource {
  uid?: string
  name?: string
  product?: string
  currency?: string
  account_id?: { iban?: string; other?: { identification?: string } }
  identification_hash?: string
}

export interface SessionResponse {
  session_id: string
  accounts: AccountResource[]
  aspsp?: { name?: string; country?: string }
  /** The consent as the bank granted it, `valid_until` being when it lapses. */
  access?: { valid_until?: string }
}

/** What the spike concludes about one account. */
export interface AccountReport {
  accountUid: string
  accountName: string
  iban: string | null
  currency: string | null
  transactionCount: number
  /** The two dates that measure history depth. */
  oldest: string | null
  newest: string | null
  historyDays: number | null
  /** The phase 1 question, as a count and a ratio. */
  withEntryReference: number
  entryReferenceCoverage: number
  duplicateEntryReferences: string[]
  /** The phase 6 bonus. */
  withMerchantCategoryCode: number
  statusCounts: Record<string, number>
  credits: number
  debits: number
  sampleLabels: string[]
}

/**
 * The date a transaction actually happened, preferring the booking date.
 *
 * Three date fields are offered and they disagree. `booking_date` is the one
 * a bank statement shows and the one the Bankin export lines up with, so it
 * is what the matcher of phase 3 will have to compare against.
 */
export function transactionDate(tx: BankTransaction): string | null {
  return tx.booking_date ?? tx.transaction_date ?? tx.value_date ?? null
}

/**
 * The signed amount, in this project's convention: expenses negative.
 *
 * The API states the sign separately from the magnitude
 * (`credit_debit_indicator`), so a transaction whose indicator is missing
 * cannot be trusted to be an income just because its amount has no minus in
 * front of it. Those return null and are counted, never guessed.
 */
export function signedAmount(tx: BankTransaction): number | null {
  const raw = tx.transaction_amount?.amount
  if (raw === undefined) return null
  const magnitude = Math.abs(Number(raw))
  if (Number.isNaN(magnitude)) return null
  if (tx.credit_debit_indicator === 'CRDT') return magnitude
  if (tx.credit_debit_indicator === 'DBIT') return -magnitude
  return null
}

/** The human-readable label, assembled the way a statement line reads. */
export function transactionLabel(tx: BankTransaction): string {
  const remittance = (tx.remittance_information ?? []).join(' ').trim()
  const party = tx.creditor?.name ?? tx.debtor?.name ?? ''
  return (remittance || party || '(no label)').slice(0, 80)
}

/** Whole days between the oldest and newest transaction, inclusive of neither. */
function daysBetween(oldest: string, newest: string): number {
  const ms = new Date(newest).getTime() - new Date(oldest).getTime()
  return Math.round(ms / 86_400_000)
}

/**
 * A label stripped of what the bank adds and the merchant does not own.
 *
 * Boursorama writes a card line as `CARTE 06/08/26 FITNESS PARK CB*7962`: a
 * date already carried by `booking_date`, and a card number that identifies
 * the card rather than the purchase. The same purchase seen from the current
 * account is worded differently. Removing both is what lets the two be
 * recognised as one event.
 */
export function normalizedLabel(text: string): string {
  return text
    .toUpperCase()
    .replace(/CARTE \d{2}\/\d{2}\/\d{2}/g, '')
    .replace(/CB\*?\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** One purchase reported by two different accounts of the same bank. */
export interface CrossAccountDuplicate {
  /** Account names that all report it, in the order the session listed them. */
  accountNames: string[]
  date: string
  amount: number
  label: string
}

/**
 * Purchases that more than one account of the same bank reports.
 *
 * This is the finding that decides how phase 4 may ingest a bank. Boursorama
 * exposes card accounts beside the current accounts they settle onto, and a
 * card purchase appears in both — with a *different* `entry_reference` in each,
 * because the spec makes that reference unique per account, not per event.
 *
 * So the phase 1 identity key cannot catch this: to the API these are two
 * distinct transactions, and ingesting every account of the bank would count
 * every card expense twice. The rule that catches it has to compare across
 * accounts, on the event rather than on the reference.
 *
 * Two genuinely separate purchases can of course share an amount, a day and a
 * merchant, so a handful of these are real. A systematic pairing between two
 * accounts is not.
 */
export function crossAccountDuplicates(
  transactionsByAccount: Record<string, BankTransaction[]>,
  accountNames: Record<string, string>
): CrossAccountDuplicate[] {
  const byEvent = new Map<
    string,
    { accounts: Set<string>; date: string; amount: number; label: string }
  >()

  for (const [uid, transactions] of Object.entries(transactionsByAccount)) {
    for (const tx of transactions) {
      const date = transactionDate(tx)
      const amount = signedAmount(tx)
      if (date === null || amount === null) continue

      const label = normalizedLabel(transactionLabel(tx))
      const key = `${amount}|${date}|${label}`
      const existing = byEvent.get(key)
      if (existing) existing.accounts.add(uid)
      else byEvent.set(key, { accounts: new Set([uid]), date, amount, label })
    }
  }

  return [...byEvent.values()]
    .filter(event => event.accounts.size > 1)
    .map(event => ({
      accountNames: [...event.accounts].map(uid => accountNames[uid] ?? uid),
      date: event.date,
      amount: event.amount,
      label: event.label,
    }))
}

/** How often each pair of accounts reports the same purchase. */
export function duplicatePairCounts(
  duplicates: CrossAccountDuplicate[]
): { pair: [string, string]; count: number }[] {
  // The pair is kept beside its count rather than encoded into the key:
  // account names carry spaces ("M BOILLEY R OU MLLE TORR"), so splitting a
  // joined string back apart would cut in the wrong place.
  const counts = new Map<string, { pair: [string, string]; count: number }>()
  for (const duplicate of duplicates) {
    const names = [...duplicate.accountNames].sort()
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const pair: [string, string] = [names[i] ?? '', names[j] ?? '']
        const existing = counts.get(pair.join('\u0000'))
        if (existing) existing.count++
        else counts.set(pair.join('\u0000'), { pair, count: 1 })
      }
    }
  }
  return [...counts.values()].sort((x, y) => y.count - x.count)
}

/**
 * Reduce one account's transactions to the facts phase 1 and phase 2 need.
 *
 * Duplicate entry references are collected rather than counted: the spec warns
 * they are unique per account but not globally, and seeing an actual collision
 * inside a single account would invalidate the phase 1 unique constraint
 * before it is written.
 */
export function summariseAccount(
  account: AccountResource,
  transactions: BankTransaction[]
): AccountReport {
  const dates = transactions
    .map(transactionDate)
    .filter((d): d is string => d !== null)
    .sort()
  const oldest = dates[0] ?? null
  const newest = dates[dates.length - 1] ?? null

  const references = transactions
    .map(tx => tx.entry_reference)
    .filter((r): r is string => r !== undefined && r !== '')

  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const ref of references) {
    if (seen.has(ref)) duplicates.add(ref)
    seen.add(ref)
  }

  const statusCounts: Record<string, number> = {}
  for (const tx of transactions) {
    const status = tx.status ?? 'UNKNOWN'
    statusCounts[status] = (statusCounts[status] ?? 0) + 1
  }

  return {
    accountUid: account.uid ?? '(no uid)',
    accountName: account.name ?? account.product ?? '(unnamed)',
    iban: account.account_id?.iban ?? null,
    currency: account.currency ?? null,
    transactionCount: transactions.length,
    oldest,
    newest,
    historyDays: oldest && newest ? daysBetween(oldest, newest) : null,
    withEntryReference: references.length,
    entryReferenceCoverage:
      transactions.length === 0 ? 0 : references.length / transactions.length,
    duplicateEntryReferences: [...duplicates],
    withMerchantCategoryCode: transactions.filter(
      tx => tx.merchant_category_code
    ).length,
    statusCounts,
    credits: transactions.filter(tx => tx.credit_debit_indicator === 'CRDT')
      .length,
    debits: transactions.filter(tx => tx.credit_debit_indicator === 'DBIT')
      .length,
    sampleLabels: transactions.slice(0, 5).map(transactionLabel),
  }
}

/**
 * The consent expiry to request, never beyond what the bank allows.
 *
 * Asking for more than `maximum_consent_validity` is rejected outright, and
 * the ceiling differs per ASPSP, so the request is clamped rather than
 * hard-coded. One minute is shaved off: the value is compared against the
 * bank's clock, not ours.
 */
export function clampValidUntil(
  now: Date,
  maximumConsentValiditySeconds: number,
  requestedDays?: number
): string {
  const ceilingMs = maximumConsentValiditySeconds * 1000 - 60_000
  const requestedMs =
    requestedDays === undefined ? ceilingMs : requestedDays * 86_400_000
  return new Date(
    now.getTime() + Math.min(requestedMs, ceilingMs)
  ).toISOString()
}

async function apiCall<T>(
  path: string,
  token: string,
  init?: { method: string; body: unknown }
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init ? { body: JSON.stringify(init.body) } : {}),
  })
  if (!response.ok) {
    const body = await response.text()
    // The redirect URL is whitelisted in the Control Panel, not in the code,
    // so this failure is about configuration elsewhere and the raw error says
    // nothing about which URLs *are* allowed. Ask, and show them.
    if (body.includes('REDIRECT_URI_NOT_ALLOWED')) {
      throw new RedirectNotAllowedError(await registeredRedirectUrls(token))
    }
    // An authorization code is single-use. Reusing one is easy to do by
    // accident — they are indistinguishable UUIDs and an old one is one scroll
    // away — and "Session is already authorized" does not say which mistake
    // was made, nor that the fix is a whole new authorization rather than a
    // retry.
    if (body.includes('ALREADY_AUTHORIZED')) {
      throw new Error(
        'This authorization code has already been exchanged.\n\n' +
          'Codes are single-use, so the fix is a new authorization, not a\n' +
          'retry: run the script again without --code, open the URL it\n' +
          'prints, and use the code that comes back from *that* round.'
      )
    }
    throw new Error(
      `${init?.method ?? 'GET'} ${path} → ${response.status} ${response.statusText}\n${body}`
    )
  }
  return (await response.json()) as T
}

/** Raised when the redirect URL was never whitelisted for this application. */
class RedirectNotAllowedError extends Error {
  constructor(allowed: string[]) {
    const list = allowed.map(u => `  - ${u}`).join('\n') || '  (none)'
    super(
      'Redirect URL refused: it is not registered for this application.\n\n' +
        `Registered right now:\n${list}\n\n` +
        'Either pass one of those with --redirect, or add the one you want in\n' +
        'the Control Panel → Applications → your app → redirect URLs.'
    )
    this.name = 'RedirectNotAllowedError'
  }
}

/** The redirect URLs the application currently declares. */
async function registeredRedirectUrls(token: string): Promise<string[]> {
  const response = await fetch(`${API_BASE}/application`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return []
  const app = (await response.json()) as { redirect_urls?: string[] }
  return app.redirect_urls ?? []
}

/** Fetch every page of transactions for one account. */
async function fetchAllTransactions(
  accountUid: string,
  token: string
): Promise<BankTransaction[]> {
  const all: BankTransaction[] = []
  let continuationKey: string | undefined

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ strategy: 'longest' })
    if (continuationKey) query.set('continuation_key', continuationKey)

    const body = await apiCall<{
      transactions: BankTransaction[]
      continuation_key?: string
    }>(`/accounts/${accountUid}/transactions?${query.toString()}`, token)

    all.push(...(body.transactions ?? []))
    // A continuation key means "not everything is here yet" — the loop must
    // keep going until the API stops returning one, not until a page is short.
    if (!body.continuation_key) return all
    continuationKey = body.continuation_key
    process.stdout.write(`    …${all.length} transactions\n`)
  }

  console.warn(`  ⚠  Stopped after ${MAX_PAGES} pages; more may remain.`)
  return all
}

async function startAuthorization(
  token: string,
  aspspName: string,
  country: string,
  redirectUrl: string,
  requestedDays: number | undefined
): Promise<void> {
  const { aspsps } = await apiCall<{
    aspsps: {
      name: string
      country: string
      maximum_consent_validity?: number
    }[]
  }>(`/aspsps?country=${encodeURIComponent(country)}`, token)

  const aspsp = aspsps.find(
    a => a.name.toLowerCase() === aspspName.toLowerCase()
  )
  if (!aspsp) {
    const near = aspsps
      .filter(a => a.name.toLowerCase().includes(aspspName.toLowerCase()))
      .map(a => a.name)
    throw new Error(
      `No ASPSP named exactly "${aspspName}" in ${country}.` +
        (near.length ? `\nDid you mean: ${near.join(', ')}?` : '')
    )
  }

  const validUntil = clampValidUntil(
    new Date(),
    aspsp.maximum_consent_validity ?? 90 * 86_400,
    requestedDays
  )

  const { url } = await apiCall<{ url: string; authorization_id: string }>(
    '/auth',
    token,
    {
      method: 'POST',
      body: {
        access: { valid_until: validUntil, balances: true, transactions: true },
        aspsp: { name: aspsp.name, country: aspsp.country },
        redirect_url: redirectUrl,
        psu_type: PSU_TYPE,
        state: randomUUID(),
      },
    }
  )

  console.log(`\nConsent requested until ${validUntil}\n`)
  console.log('Open this URL and authorize:\n')
  console.log(`  ${url}\n`)
  console.log(
    `You will be redirected to ${redirectUrl}, which shows the code and the\n` +
      'command to run next. Start the dev server first, or the page will not\n' +
      'load:\n\n' +
      '  cd frontend && VITE_HTTPS=1 VITE_PORT=5174 pnpm dev\n\n' +
      'The code is in the address bar either way, so a page that fails to load\n' +
      'costs nothing — copy `code` out of the URL and run:\n\n' +
      '  pnpm ts-node src/scripts/spike-enable-banking-fetch.ts --code <code>\n'
  )
}

function printReport(report: AccountReport): void {
  const pct = (n: number): string => `${Math.round(n * 100)}%`
  console.log(`\n  ── ${report.accountName} (${report.iban ?? 'no IBAN'})`)
  console.log(`     transactions : ${report.transactionCount}`)
  console.log(
    `     history      : ${report.oldest ?? '—'} → ${report.newest ?? '—'}` +
      (report.historyDays === null ? '' : `  (${report.historyDays} days)`)
  )
  console.log(
    `     entry_ref    : ${report.withEntryReference}/${report.transactionCount} (${pct(report.entryReferenceCoverage)})` +
      (report.duplicateEntryReferences.length
        ? `  ⚠ ${report.duplicateEntryReferences.length} DUPLICATES`
        : '')
  )
  console.log(
    `     MCC          : ${report.withMerchantCategoryCode}/${report.transactionCount}`
  )
  console.log(
    `     status       : ${Object.entries(report.statusCounts)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`
  )
  console.log(
    `     sign         : ${report.credits} CRDT / ${report.debits} DBIT`
  )
  console.log(`     sample       : ${report.sampleLabels.join(' | ')}`)
}

/**
 * How the script was invoked. The optionals spell out `| undefined` because
 * `exactOptionalPropertyTypes` is on: an absent flag and a flag set to
 * undefined are the same thing here, and the CLI parser produces the latter.
 */
export interface SpikeOptions {
  /** Present on the second step only: the code copied out of the address bar. */
  code?: string | undefined
  aspsp?: string | undefined
  country: string
  redirectUrl: string
  days?: number | undefined
  out: string
}

export async function main(
  applicationId: string,
  privateKeyPem: string,
  options: SpikeOptions
): Promise<void> {
  const token = buildJwt(applicationId, privateKeyPem)

  if (!options.code) {
    await startAuthorization(
      token,
      options.aspsp ?? 'Revolut',
      options.country,
      options.redirectUrl,
      options.days
    )
    return
  }

  const session = await apiCall<SessionResponse>('/sessions', token, {
    method: 'POST',
    body: { code: options.code },
  })

  console.log(`\nSession ${session.session_id}`)
  console.log(`ASPSP   ${session.aspsp?.name ?? '—'}`)
  console.log(`Accounts: ${session.accounts.length}`)

  // A successful authorization that yields nothing is the signature of
  // restricted production: the API compares what the bank returned against the
  // accounts linked to the application and strips everything else. So an
  // account the user just authorized is silently removed unless it was also
  // whitelisted — and the response says none of that, it simply comes back
  // empty.
  if (session.accounts.length === 0) {
    console.log(
      '\n  The authorization succeeded, so this is not a login problem: in\n' +
        '  restricted production the API returns only the accounts linked to\n' +
        '  the application, and strips the rest without comment.\n\n' +
        `  Link this account first — Control Panel → Applications → your app →\n` +
        '  "Activate by linking accounts" → choose ' +
        `${session.aspsp?.name ?? 'the bank'} — then run the\n` +
        '  authorization again.\n'
    )
    return
  }

  const reports: AccountReport[] = []
  const dump: Record<string, BankTransaction[]> = {}

  for (const account of session.accounts) {
    if (!account.uid) continue
    console.log(`\n  Fetching ${account.name ?? account.uid}…`)
    const transactions = await fetchAllTransactions(account.uid, token)
    dump[account.uid] = transactions
    const report = summariseAccount(account, transactions)
    reports.push(report)
    printReport(report)
  }

  // The one check that only makes sense across accounts, and the one that
  // decides whether this bank can be ingested account by account at all.
  const namesByUid = Object.fromEntries(
    session.accounts
      .filter(a => a.uid)
      .map(a => [a.uid as string, a.name ?? a.product ?? (a.uid as string)])
  )
  const duplicates = crossAccountDuplicates(dump, namesByUid)

  console.log('\n=== Same purchase seen on several accounts ===')
  if (duplicates.length === 0) {
    console.log('  none — every account reports its own transactions only')
  } else {
    console.log(
      `  ${duplicates.length} purchases appear on more than one account.\n` +
        '  `entry_reference` does NOT catch these: it is unique per account,\n' +
        '  so the same purchase carries a different one on each side.\n'
    )
    for (const { pair, count } of duplicatePairCounts(duplicates).slice(0, 6)) {
      console.log(`    ${String(count).padStart(5)}  ${pair[0]}  ⇄  ${pair[1]}`)
    }
    console.log('\n  Examples:')
    for (const d of duplicates.slice(0, 4)) {
      console.log(
        `    ${d.date}  ${d.amount.toFixed(2).padStart(9)}  "${d.label.slice(0, 40)}"`
      )
      for (const name of d.accountNames) console.log(`        · ${name}`)
    }
  }

  writeFileSync(
    options.out,
    // The bank's name and the consent expiry travel with the transactions.
    // Without them the ingestion has to guess which bank a dump came from —
    // it named a connection after its first account — and phase 5 has no date
    // to warn the user before the consent runs out.
    JSON.stringify(
      {
        session: session.session_id,
        aspsp: session.aspsp?.name ?? null,
        aspspCountry: session.aspsp?.country ?? null,
        consentValidUntil: session.access?.valid_until ?? null,
        reports,
        duplicates,
        dump,
      },
      null,
      2
    )
  )
  console.log(`\nRaw transactions written to:\n  ${options.out}`)
  console.log(
    '\nThis file holds real bank records. It is deliberately outside the\n' +
      'repository — keep it that way, and delete it once phase 3 is done.\n'
  )
}

// Run only when executed directly (not when imported by tests).
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config')

  const args = process.argv.slice(2)
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`)
    return i === -1 ? undefined : args[i + 1]
  }

  const applicationId = process.env.ENABLE_BANKING_APP_ID
  const keyPath = process.env.ENABLE_BANKING_PRIVATE_KEY_PATH
  if (!applicationId || !keyPath) {
    console.error(
      'ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY_PATH must be set.'
    )
    process.exit(1)
  }

  const daysFlag = flag('days')
  const options = {
    ...(flag('code') !== undefined && { code: flag('code') }),
    ...(flag('aspsp') !== undefined && { aspsp: flag('aspsp') }),
    country: (flag('country') ?? 'FR').toUpperCase(),
    redirectUrl:
      flag('redirect') ?? 'https://localhost:5174/bank-callback.html',
    ...(daysFlag !== undefined && { days: Number(daysFlag) }),
    out:
      flag('out') ?? join(tmpdir(), `enable-banking-spike-${Date.now()}.json`),
  }

  main(applicationId, readFileSync(keyPath, 'utf8'), options).catch(err => {
    console.error(err)
    process.exit(1)
  })
}
