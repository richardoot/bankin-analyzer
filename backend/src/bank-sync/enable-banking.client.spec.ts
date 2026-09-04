import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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

describe('EnableBankingClient configuration', () => {
  const client = new EnableBankingClient()
  const saved = {
    id: process.env.ENABLE_BANKING_APP_ID,
    key: process.env.ENABLE_BANKING_PRIVATE_KEY_PATH,
  }

  beforeEach(() => {
    delete process.env.ENABLE_BANKING_APP_ID
    delete process.env.ENABLE_BANKING_PRIVATE_KEY_PATH
  })

  afterEach(() => {
    if (saved.id) process.env.ENABLE_BANKING_APP_ID = saved.id
    if (saved.key) process.env.ENABLE_BANKING_PRIVATE_KEY_PATH = saved.key
  })

  it('reports itself unconfigured rather than failing at startup', () => {
    // A backend whose owner never set up a bank sync must still serve
    // everything else.
    expect(client.isConfigured()).toBe(false)
  })

  it('needs both halves of the credential', () => {
    process.env.ENABLE_BANKING_APP_ID = 'an-id'
    expect(client.isConfigured()).toBe(false)

    process.env.ENABLE_BANKING_PRIVATE_KEY_PATH = '/somewhere/key.pem'
    expect(client.isConfigured()).toBe(true)
  })

  it('refuses a call rather than signing with nothing', async () => {
    await expect(client.listAspsps('FR')).rejects.toThrow(/not configured/)
  })

  it('says so when the key cannot be used', async () => {
    process.env.ENABLE_BANKING_APP_ID = 'an-id'
    process.env.ENABLE_BANKING_PRIVATE_KEY_PATH = '/nowhere/missing.pem'

    await expect(client.listAspsps('FR')).rejects.toThrow(
      /private key cannot be used/
    )
  })
})
