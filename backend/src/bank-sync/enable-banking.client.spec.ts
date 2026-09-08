import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { EnableBankingClient } from './enable-banking.client'
import type { BankSession } from './enable-banking.client'

describe('EnableBankingClient.accountsOf', () => {
  it('reads the accounts a created session returns inline', () => {
    const session: BankSession = {
      session_id: 's',
      accounts: [{ uid: 'a', name: 'Compte courant' }],
    }
    expect(EnableBankingClient.accountsOf(session).map(a => a.uid)).toEqual([
      'a',
    ])
  })

  it('reads the accounts a read session puts aside', () => {
    // The shape that once made a background fetch read nothing: bare ids in
    // `accounts`, the objects in `accounts_data`.
    const session: BankSession = {
      accounts: ['a', 'b'],
      accounts_data: [{ uid: 'a' }, { uid: 'b' }],
    }
    expect(EnableBankingClient.accountsOf(session).map(a => a.uid)).toEqual([
      'a',
      'b',
    ])
  })

  it('drops bare ids nothing describes', () => {
    // Better none than accounts with no uid, every fetch skipped, and a run
    // reporting success having read nothing.
    expect(EnableBankingClient.accountsOf({ accounts: ['a'] })).toEqual([])
  })
})

describe('EnableBankingClient signing', () => {
  it('cannot sign a call with a key that is not actually a key', async () => {
    // Whether the credentials are even usable is validated once, at save
    // time, by EnableBankingCredentialsService. This class trusts what it is
    // handed and simply fails to sign if that trust was misplaced.
    const client = new EnableBankingClient()

    await expect(
      client.listAspsps(
        { applicationId: 'an-id', privateKey: 'not-a-pem' },
        'FR'
      )
    ).rejects.toThrow()
  })
})

describe('EnableBankingClient PSU headers', () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  const credentials = { applicationId: 'app-1', privateKey }
  const psu = { ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0 (test)' }
  const mockFetch = vi.fn()

  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function ok(body: unknown): Response {
    return {
      ok: true,
      json: () => Promise.resolve(body),
    } as unknown as Response
  }

  function sentHeaders(callIndex = 0): Record<string, string> {
    const [, init] = mockFetch.mock.calls[callIndex] as [string, RequestInit]
    return init.headers as Record<string, string>
  }

  it('tells the bank the user is present on a read that carries a PSU context', async () => {
    mockFetch.mockResolvedValue(ok({ transactions: [] }))
    const client = new EnableBankingClient()

    await client.listTransactions(credentials, 'account-1', { psu })

    expect(sentHeaders()['Psu-Ip-Address']).toBe('203.0.113.7')
    expect(sentHeaders()['Psu-User-Agent']).toBe('Mozilla/5.0 (test)')
  })

  it('says nothing about the user when no context is given', async () => {
    // No headers at all is the valid "unattended" shape; a partial or empty
    // header is what banks refuse.
    mockFetch.mockResolvedValue(ok({ transactions: [] }))
    const client = new EnableBankingClient()

    await client.listTransactions(credentials, 'account-1')

    expect(sentHeaders()).not.toHaveProperty('Psu-Ip-Address')
    expect(sentHeaders()).not.toHaveProperty('Psu-User-Agent')
  })

  it('retries as an unattended call when the bank wants headers we cannot give', async () => {
    // The PSU header set is all-or-none per bank. A bank requiring, say,
    // geolocation refuses our partial set — better one read counted against
    // the quota than a sync that fails outright.
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () =>
          Promise.resolve('{"error":{"code":"PSU_HEADER_NOT_PROVIDED"}}'),
      } as unknown as Response)
      .mockResolvedValueOnce(ok({ transactions: [{ status: 'BOOK' }] }))
    const client = new EnableBankingClient()

    const transactions = await client.listTransactions(
      credentials,
      'account-1',
      { psu }
    )

    expect(transactions).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(sentHeaders(1)).not.toHaveProperty('Psu-Ip-Address')
  })

  it('does not turn an ordinary refusal into a retry', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: () =>
        Promise.resolve('{"error":{"code":"ASPSP_RATE_LIMIT_EXCEEDED"}}'),
    } as unknown as Response)
    const client = new EnableBankingClient()

    await expect(
      client.listTransactions(credentials, 'account-1', { psu })
    ).rejects.toThrow(/429/)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
