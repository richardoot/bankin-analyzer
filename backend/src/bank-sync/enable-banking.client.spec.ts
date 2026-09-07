import { describe, it, expect } from 'vitest'
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
