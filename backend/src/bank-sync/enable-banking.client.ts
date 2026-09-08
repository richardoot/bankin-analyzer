/**
 * Everything this application says to Enable Banking.
 *
 * ## Credentials
 *
 * The application id and private key belong to whoever is asking — each
 * call takes them explicitly rather than this class reading them from the
 * environment or disk itself. Resolving "which credentials for this user,
 * falling back to what?" is `EnableBankingCredentialsService`'s job, not
 * this one's; this class only ever signs with what it is handed.
 *
 * ## PSU headers, and the four-a-day limit
 *
 * PSD2 caps unattended account reads at four per account per day, and a
 * request with no PSU headers is an unattended request — even one a person
 * triggered by pressing a button. Every sync here IS that button press, so
 * data-reading methods take the caller's `PsuContext` (IP and user agent,
 * lifted from the HTTP request) and forward it as `Psu-Ip-Address` /
 * `Psu-User-Agent`, which tells the bank the user is present and lifts the
 * cap.
 *
 * A bank may require PSU headers this application cannot supply
 * (`required_psu_headers` — geolocation, say), and the rule is all-or-none:
 * a partial set is refused as `PSU_HEADER_NOT_PROVIDED`. That refusal is
 * retried once with no headers at all, which is exactly the request this
 * client made before PSU headers existed — counted against the quota, but
 * counted, not failed.
 */
import { Injectable, Logger } from '@nestjs/common'
import { buildJwt } from './enable-banking.jwt'

/** Production base URL. `api.tilisy.com` is the deprecated alias. */
const API_BASE = 'https://api.enablebanking.com'

export interface EnableBankingCredentials {
  applicationId: string
  /** Raw PEM content, not a file path. */
  privateKey: string
}

/** Who is at the keyboard, as the banks want it said. */
export interface PsuContext {
  ipAddress?: string
  userAgent?: string
}

/** An API error that kept its status, so a caller can tell 403 from 500. */
export class EnableBankingError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message: string
  ) {
    super(message)
    this.name = 'EnableBankingError'
  }
}

export interface Aspsp {
  name: string
  country: string
  maximum_consent_validity?: number
  beta?: boolean
  bic?: string
  required_psu_headers?: string[]
  /**
   * Public, CORS-open, cacheable — confirmed by fetching one directly rather
   * than trusting the field description alone. Accepts Uploadcare resize
   * suffixes (e.g. `-/resize/64x64/`), also confirmed against a real logo.
   */
  logo?: string
}

export interface BankAccountResource {
  uid?: string
  name?: string
  product?: string
  currency?: string
  cash_account_type?: string
  account_id?: { iban?: string }
  identification_hash?: string
  identification_hashes?: string[]
}

export interface BankSession {
  session_id?: string
  accounts: (BankAccountResource | string)[]
  accounts_data?: BankAccountResource[]
  aspsp?: { name?: string; country?: string }
  access?: { valid_until?: string }
  status?: string
}

export interface BankTransaction {
  entry_reference?: string
  transaction_amount?: { amount?: string; currency?: string }
  credit_debit_indicator?: 'CRDT' | 'DBIT'
  status?: string
  booking_date?: string
  value_date?: string
  transaction_date?: string
  remittance_information?: string[]
  creditor?: { name?: string }
  debtor?: { name?: string }
}

export interface BankBalance {
  balance_type?: string
  balance_amount?: { amount?: string; currency?: string }
  reference_date?: string
  last_committed_transaction?: string
}

/** One page of transactions is capped by the ASPSP; this bounds the loop. */
const MAX_PAGES = 50

@Injectable()
export class EnableBankingClient {
  private readonly logger = new Logger(EnableBankingClient.name)

  private token(credentials: EnableBankingCredentials): string {
    return buildJwt(credentials.applicationId, credentials.privateKey)
  }

  private psuHeaders(psu?: PsuContext): Record<string, string> {
    if (!psu) return {}
    return {
      ...(psu.ipAddress ? { 'Psu-Ip-Address': psu.ipAddress } : {}),
      ...(psu.userAgent ? { 'Psu-User-Agent': psu.userAgent } : {}),
    }
  }

  private async call<T>(
    credentials: EnableBankingCredentials,
    path: string,
    init?: { method: string; body: unknown },
    psu?: PsuContext
  ): Promise<T> {
    const psuHeaders = this.psuHeaders(psu)
    const response = await fetch(`${API_BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${this.token(credentials)}`,
        ...(init ? { 'Content-Type': 'application/json' } : {}),
        ...psuHeaders,
      },
      ...(init ? { body: JSON.stringify(init.body) } : {}),
    })
    if (!response.ok) {
      const body = await response.text()
      // The bank wanted PSU headers this application cannot supply — the
      // set is all-or-none, so fall back to none: the same unattended
      // request this client always made, counted against the quota rather
      // than failed.
      if (
        Object.keys(psuHeaders).length > 0 &&
        body.includes('PSU_HEADER_NOT_PROVIDED')
      ) {
        this.logger.warn(
          `${path} refused our PSU headers; retrying as an unattended call`
        )
        return this.call(credentials, path, init)
      }
      throw new EnableBankingError(
        response.status,
        body,
        `${init?.method ?? 'GET'} ${path} → ${response.status} ${response.statusText}`
      )
    }
    return (await response.json()) as T
  }

  async listAspsps(
    credentials: EnableBankingCredentials,
    country: string
  ): Promise<Aspsp[]> {
    const { aspsps } = await this.call<{ aspsps: Aspsp[] }>(
      credentials,
      `/aspsps?country=${encodeURIComponent(country)}`
    )
    return aspsps
  }

  /**
   * Start an authorization and return where to send the user.
   *
   * `validUntil` is clamped by the caller against the bank's own maximum:
   * asking for more is refused outright, and the ceiling differs per bank.
   *
   * `psuId` is an identifier we choose, stored hashed, whose documented
   * purpose is matching the sessions of one user across the
   * re-authorizations a lapsing consent forces.
   */
  async startAuthorization(
    credentials: EnableBankingCredentials,
    input: {
      aspspName: string
      aspspCountry: string
      redirectUrl: string
      validUntil: string
      state: string
      psuId: string
    }
  ): Promise<{ url: string; authorization_id?: string }> {
    return this.call(credentials, '/auth', {
      method: 'POST',
      body: {
        access: {
          valid_until: input.validUntil,
          balances: true,
          transactions: true,
        },
        aspsp: { name: input.aspspName, country: input.aspspCountry },
        redirect_url: input.redirectUrl,
        psu_type: 'personal',
        state: input.state,
        psu_id: input.psuId,
      },
    })
  }

  /** Exchange the code the redirect carried for a session. */
  async createSession(
    credentials: EnableBankingCredentials,
    code: string
  ): Promise<BankSession> {
    return this.call(credentials, '/sessions', {
      method: 'POST',
      body: { code },
    })
  }

  /** Read a session already authorised — what a sync does. */
  async getSession(
    credentials: EnableBankingCredentials,
    sessionId: string,
    psu?: PsuContext
  ): Promise<BankSession> {
    return this.call(credentials, `/sessions/${sessionId}`, undefined, psu)
  }

  /**
   * The accounts of a session, whichever endpoint described it.
   *
   * The two disagree in a way that is easy to miss because both have an
   * `accounts` field: creating a session fills it with account objects, while
   * reading one fills it with bare ids and puts the objects in
   * `accounts_data`. Reading the wrong one yields accounts with no `uid`,
   * every fetch silently skipped, and a run reporting success having read
   * nothing.
   */
  static accountsOf(session: BankSession): BankAccountResource[] {
    if (session.accounts_data && session.accounts_data.length > 0) {
      return session.accounts_data
    }
    return session.accounts.filter(
      (account): account is BankAccountResource => typeof account !== 'string'
    )
  }

  /**
   * What the bank says about one account: its name, IBAN and ISO 20022 type.
   *
   * None of it is on the session, and the type is what decides whether an
   * account should be ingested at all — a `CARD` account reports the same
   * money as the `CACC` it settles onto.
   */
  async getAccountDetails(
    credentials: EnableBankingCredentials,
    uid: string,
    psu?: PsuContext
  ): Promise<BankAccountResource> {
    return this.call(credentials, `/accounts/${uid}/details`, undefined, psu)
  }

  /**
   * Balances, and with them `last_committed_transaction` — the date of the
   * bank's most recent booked transaction. Comparing it to our own latest row
   * answers "is there anything new?" without paginating anything.
   */
  async getBalances(
    credentials: EnableBankingCredentials,
    uid: string,
    psu?: PsuContext
  ): Promise<BankBalance[]> {
    const { balances } = await this.call<{ balances: BankBalance[] }>(
      credentials,
      `/accounts/${uid}/balances`,
      undefined,
      psu
    )
    return balances ?? []
  }

  /**
   * Every transaction of an account, following the pagination to its end.
   *
   * `strategy` is `longest` right after an authorization, where the deep
   * history is briefly available — 729 days against the 90 a later fetch
   * reaches. A routine sync passes `dateFrom` instead and asks for what is new.
   */
  async listTransactions(
    credentials: EnableBankingCredentials,
    uid: string,
    options: {
      strategy?: 'default' | 'longest'
      dateFrom?: string
      psu?: PsuContext
    } = {}
  ): Promise<BankTransaction[]> {
    const all: BankTransaction[] = []
    let continuationKey: string | undefined

    for (let page = 0; page < MAX_PAGES; page++) {
      const query = new URLSearchParams()
      if (options.strategy) query.set('strategy', options.strategy)
      if (options.dateFrom) query.set('date_from', options.dateFrom)
      if (continuationKey) query.set('continuation_key', continuationKey)

      const body = await this.call<{
        transactions: BankTransaction[]
        continuation_key?: string
      }>(
        credentials,
        `/accounts/${uid}/transactions?${query.toString()}`,
        undefined,
        options.psu
      )

      all.push(...(body.transactions ?? []))
      // A continuation key means "not everything is here yet". The loop ends
      // when the API stops returning one, never when a page looks short.
      if (!body.continuation_key) return all
      continuationKey = body.continuation_key
    }

    this.logger.warn(
      `Stopped after ${MAX_PAGES} pages for account ${uid}; more may remain.`
    )
    return all
  }
}
