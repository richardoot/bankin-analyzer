/**
 * Everything this application says to Enable Banking.
 *
 * ## Configuration, and its absence
 *
 * The application id and the private key come from the environment. A backend
 * whose owner has not set them up must still start and serve everything else,
 * so nothing is read at construction and nothing throws until a bank sync is
 * actually asked for. `isConfigured` lets a caller answer "not set up" rather
 * than fail mid-request.
 *
 * The key is read from disk on each use rather than held in memory. It is the
 * sole credential for an application that reads bank accounts, and a value
 * that never sits in a long-lived object is a value that never turns up in a
 * heap dump or a crash report.
 */
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { readFileSync } from 'fs'
import { buildJwt } from './enable-banking.jwt'

/** Production base URL. `api.tilisy.com` is the deprecated alias. */
const API_BASE = 'https://api.enablebanking.com'

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

  /** Whether a bank sync can be attempted at all. */
  isConfigured(): boolean {
    return Boolean(
      process.env.ENABLE_BANKING_APP_ID &&
      process.env.ENABLE_BANKING_PRIVATE_KEY_PATH
    )
  }

  private token(): string {
    const applicationId = process.env.ENABLE_BANKING_APP_ID
    const keyPath = process.env.ENABLE_BANKING_PRIVATE_KEY_PATH
    if (!applicationId || !keyPath) {
      throw new ServiceUnavailableException(
        'Bank sync is not configured on this server: ENABLE_BANKING_APP_ID ' +
          'and ENABLE_BANKING_PRIVATE_KEY_PATH must both be set.'
      )
    }
    try {
      return buildJwt(applicationId, readFileSync(keyPath, 'utf8'))
    } catch (error) {
      // The key is downloaded once from the Control Panel and is not
      // retrievable afterwards, so "cannot read it" and "it is not a key" both
      // mean the same thing to whoever has to fix this.
      this.logger.error(`Cannot sign with ${keyPath}`, error as Error)
      throw new ServiceUnavailableException(
        'Bank sync is configured but its private key cannot be used.'
      )
    }
  }

  private async call<T>(
    path: string,
    init?: { method: string; body: unknown }
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${this.token()}`,
        ...(init ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init ? { body: JSON.stringify(init.body) } : {}),
    })
    if (!response.ok) {
      const body = await response.text()
      throw new EnableBankingError(
        response.status,
        body,
        `${init?.method ?? 'GET'} ${path} → ${response.status} ${response.statusText}`
      )
    }
    return (await response.json()) as T
  }

  async listAspsps(country: string): Promise<Aspsp[]> {
    const { aspsps } = await this.call<{ aspsps: Aspsp[] }>(
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
  async startAuthorization(input: {
    aspspName: string
    aspspCountry: string
    redirectUrl: string
    validUntil: string
    state: string
    psuId: string
  }): Promise<{ url: string; authorization_id?: string }> {
    return this.call('/auth', {
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
  async createSession(code: string): Promise<BankSession> {
    return this.call('/sessions', { method: 'POST', body: { code } })
  }

  /** Read a session already authorised — what a sync does. */
  async getSession(sessionId: string): Promise<BankSession> {
    return this.call(`/sessions/${sessionId}`)
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
  async getAccountDetails(uid: string): Promise<BankAccountResource> {
    return this.call(`/accounts/${uid}/details`)
  }

  /**
   * Balances, and with them `last_committed_transaction` — the date of the
   * bank's most recent booked transaction. Comparing it to our own latest row
   * answers "is there anything new?" without paginating anything.
   */
  async getBalances(uid: string): Promise<BankBalance[]> {
    const { balances } = await this.call<{ balances: BankBalance[] }>(
      `/accounts/${uid}/balances`
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
    uid: string,
    options: { strategy?: 'default' | 'longest'; dateFrom?: string } = {}
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
      }>(`/accounts/${uid}/transactions?${query.toString()}`)

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
