import { describe, it, expect } from 'vitest'
import {
  accountsOf,
  clampValidUntil,
  crossAccountDuplicates,
  duplicatePairCounts,
  normalizedLabel,
  signedAmount,
  summariseAccount,
  transactionDate,
  transactionLabel,
  type AccountResource,
  type BankTransaction,
} from './spike-enable-banking-fetch'

function tx(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    transaction_amount: { amount: '12.34', currency: 'EUR' },
    credit_debit_indicator: 'DBIT',
    booking_date: '2026-06-15',
    status: 'BOOK',
    ...overrides,
  }
}

const ACCOUNT: AccountResource = {
  uid: 'acc-uid-1',
  name: 'Compte courant',
  currency: 'EUR',
  account_id: { iban: 'FR7630006000011234567890189' },
}

describe('transactionDate', () => {
  it('prefers the transaction date — "date d\'opération"', () => {
    const t = tx({
      booking_date: '2026-06-15',
      transaction_date: '2026-06-13',
      value_date: '2026-06-16',
    })
    expect(transactionDate(t)).toBe('2026-06-13')
  })

  it('falls back to the booking date, then the value date', () => {
    expect(
      transactionDate({
        booking_date: '2026-06-15',
        value_date: '2026-06-16',
      })
    ).toBe('2026-06-15')
    expect(transactionDate({ value_date: '2026-06-16' })).toBe('2026-06-16')
  })

  it('returns null when the bank dated nothing', () => {
    expect(transactionDate({})).toBeNull()
  })
})

describe('signedAmount', () => {
  it('makes a debit negative and a credit positive', () => {
    expect(signedAmount(tx({ credit_debit_indicator: 'DBIT' }))).toBe(-12.34)
    expect(signedAmount(tx({ credit_debit_indicator: 'CRDT' }))).toBe(12.34)
  })

  it('ignores a sign already present in the magnitude', () => {
    // The API states the direction separately; a minus in the string must not
    // flip a credit into an expense.
    const t = tx({
      transaction_amount: { amount: '-50.00' },
      credit_debit_indicator: 'CRDT',
    })
    expect(signedAmount(t)).toBe(50)
  })

  it('refuses to guess when the indicator is missing', () => {
    const t = tx({ credit_debit_indicator: undefined })
    expect(signedAmount(t)).toBeNull()
  })

  it('returns null on an unparsable or absent amount', () => {
    expect(
      signedAmount(tx({ transaction_amount: { amount: 'n/a' } }))
    ).toBeNull()
    expect(signedAmount(tx({ transaction_amount: undefined }))).toBeNull()
  })
})

describe('transactionLabel', () => {
  it('joins the remittance information', () => {
    const t = tx({ remittance_information: ['CARTE 15/06', 'CARREFOUR'] })
    expect(transactionLabel(t)).toBe('CARTE 15/06 CARREFOUR')
  })

  it('falls back to the counterparty name', () => {
    expect(transactionLabel(tx({ creditor: { name: 'EDF' } }))).toBe('EDF')
    expect(transactionLabel(tx({ debtor: { name: 'ACME SARL' } }))).toBe(
      'ACME SARL'
    )
  })

  it('says so rather than returning an empty string', () => {
    expect(transactionLabel(tx())).toBe('(no label)')
  })

  it('caps the length so a report line stays readable', () => {
    const t = tx({ remittance_information: ['x'.repeat(200)] })
    expect(transactionLabel(t)).toHaveLength(80)
  })
})

describe('clampValidUntil', () => {
  const now = new Date('2026-09-01T12:00:00.000Z')
  const maxSeconds = 180 * 86_400

  it("asks for the bank's maximum when nothing is requested", () => {
    const result = new Date(clampValidUntil(now, maxSeconds))
    const days = (result.getTime() - now.getTime()) / 86_400_000
    expect(days).toBeGreaterThan(179.9)
    expect(days).toBeLessThanOrEqual(180)
  })

  it('never exceeds the ceiling even when more is asked for', () => {
    const result = new Date(clampValidUntil(now, maxSeconds, 365))
    const days = (result.getTime() - now.getTime()) / 86_400_000
    expect(days).toBeLessThanOrEqual(180)
  })

  it('honours a shorter request', () => {
    const result = new Date(clampValidUntil(now, maxSeconds, 30))
    const days = (result.getTime() - now.getTime()) / 86_400_000
    expect(days).toBe(30)
  })

  it('stays just under the ceiling, not exactly on it', () => {
    // Compared against the bank's clock, not ours: landing exactly on the
    // boundary is how a request gets rejected for being one second too long.
    const result = new Date(clampValidUntil(now, maxSeconds))
    expect(result.getTime()).toBeLessThan(now.getTime() + maxSeconds * 1000)
  })
})

describe('summariseAccount', () => {
  it('measures history depth from the oldest and newest dates', () => {
    const report = summariseAccount(ACCOUNT, [
      tx({ booking_date: '2026-06-15' }),
      tx({ booking_date: '2025-06-15' }),
      tx({ booking_date: '2026-01-01' }),
    ])
    expect(report.oldest).toBe('2025-06-15')
    expect(report.newest).toBe('2026-06-15')
    expect(report.historyDays).toBe(365)
  })

  it('reports entry_reference coverage as the phase 1 go/no-go', () => {
    const report = summariseAccount(ACCOUNT, [
      tx({ entry_reference: 'A1' }),
      tx({ entry_reference: 'A2' }),
      tx(),
      tx({ entry_reference: '' }),
    ])
    expect(report.withEntryReference).toBe(2)
    expect(report.entryReferenceCoverage).toBe(0.5)
  })

  it('surfaces a duplicate entry reference within one account', () => {
    // The spec promises uniqueness per account. A collision here would
    // invalidate the unique constraint phase 1 intends to write.
    const report = summariseAccount(ACCOUNT, [
      tx({ entry_reference: 'DUP' }),
      tx({ entry_reference: 'DUP' }),
      tx({ entry_reference: 'OK' }),
    ])
    expect(report.duplicateEntryReferences).toEqual(['DUP'])
  })

  it('counts statuses, including transactions the bank left unlabelled', () => {
    const report = summariseAccount(ACCOUNT, [
      tx({ status: 'BOOK' }),
      tx({ status: 'BOOK' }),
      tx({ status: 'PDNG' }),
      tx({ status: undefined }),
    ])
    expect(report.statusCounts).toEqual({ BOOK: 2, PDNG: 1, UNKNOWN: 1 })
  })

  it('counts merchant category codes and transaction directions', () => {
    const report = summariseAccount(ACCOUNT, [
      tx({ merchant_category_code: '5411', credit_debit_indicator: 'DBIT' }),
      tx({ credit_debit_indicator: 'CRDT' }),
    ])
    expect(report.withMerchantCategoryCode).toBe(1)
    expect(report.credits).toBe(1)
    expect(report.debits).toBe(1)
  })

  it('handles an account with no transactions without dividing by zero', () => {
    const report = summariseAccount(ACCOUNT, [])
    expect(report.transactionCount).toBe(0)
    expect(report.entryReferenceCoverage).toBe(0)
    expect(report.oldest).toBeNull()
    expect(report.historyDays).toBeNull()
  })

  it('carries the account identity into the report', () => {
    const report = summariseAccount(ACCOUNT, [tx()])
    expect(report.accountUid).toBe('acc-uid-1')
    expect(report.accountName).toBe('Compte courant')
    expect(report.iban).toBe('FR7630006000011234567890189')
  })

  it('falls back to the product name when the account is unnamed', () => {
    const report = summariseAccount({ uid: 'u', product: 'Livret A' }, [tx()])
    expect(report.accountName).toBe('Livret A')
    expect(report.iban).toBeNull()
  })
})

describe('normalizedLabel', () => {
  it('strips the card date and card number Boursorama prepends', () => {
    expect(normalizedLabel('CARTE 06/08/26 FITNESS PARK      CB*7962')).toBe(
      'FITNESS PARK'
    )
  })

  it('leaves a label that carries neither alone', () => {
    expect(normalizedLabel('VIR INST M RICHARD ARMAND BOILLEY')).toBe(
      'VIR INST M RICHARD ARMAND BOILLEY'
    )
  })

  it('collapses the whitespace the stripping leaves behind', () => {
    expect(normalizedLabel('CARTE 01/08/26 TOTAL           4 CB*7962')).toBe(
      'TOTAL 4'
    )
  })
})

describe('crossAccountDuplicates', () => {
  const names = { card: 'Carte Visa Ultim', current: 'Compte courant' }

  it('pairs a card purchase with its twin on the current account', () => {
    // The same purchase, worded differently by each account — which is exactly
    // how Boursorama reports it.
    const found = crossAccountDuplicates(
      {
        card: [
          tx({
            booking_date: '2026-08-25',
            transaction_amount: { amount: '39.99' },
            remittance_information: ['CARTE 25/08/26 APPLE.COM/BILL CB*7962'],
          }),
        ],
        current: [
          tx({
            booking_date: '2026-08-25',
            transaction_amount: { amount: '39.99' },
            remittance_information: ['APPLE.COM/BILL'],
          }),
        ],
      },
      names
    )

    expect(found).toHaveLength(1)
    expect(found[0]?.accountNames.sort()).toEqual([
      'Carte Visa Ultim',
      'Compte courant',
    ])
  })

  it('is not fooled by a different entry_reference on each side', () => {
    // The point of the check: the API gives the two copies distinct
    // references, so the phase 1 identity key cannot see they are one event.
    const found = crossAccountDuplicates(
      {
        card: [tx({ entry_reference: 'CARD-1' })],
        current: [tx({ entry_reference: 'CURRENT-1' })],
      },
      names
    )
    expect(found).toHaveLength(1)
  })

  it('leaves genuinely distinct purchases alone', () => {
    const found = crossAccountDuplicates(
      {
        card: [tx({ transaction_amount: { amount: '10.00' } })],
        current: [tx({ transaction_amount: { amount: '20.00' } })],
      },
      names
    )
    expect(found).toEqual([])
  })

  it('does not pair two transactions of the same account with each other', () => {
    const found = crossAccountDuplicates({ card: [tx(), tx()] }, names)
    expect(found).toEqual([])
  })

  it('skips transactions the bank left undated or unsigned', () => {
    const found = crossAccountDuplicates(
      {
        card: [
          tx({
            booking_date: undefined,
            transaction_date: undefined,
            value_date: undefined,
          }),
        ],
        current: [tx({ credit_debit_indicator: undefined })],
      },
      names
    )
    expect(found).toEqual([])
  })
})

describe('duplicatePairCounts', () => {
  it('ranks the account pairs by how often they collide', () => {
    const counts = duplicatePairCounts([
      { accountNames: ['A', 'B'], date: '2026-01-01', amount: -1, label: 'x' },
      { accountNames: ['A', 'B'], date: '2026-01-02', amount: -2, label: 'y' },
      { accountNames: ['A', 'C'], date: '2026-01-03', amount: -3, label: 'z' },
    ])
    expect(counts[0]).toEqual({ pair: ['A', 'B'], count: 2 })
    expect(counts[1]).toEqual({ pair: ['A', 'C'], count: 1 })
  })

  it('keeps names containing spaces intact', () => {
    // "M BOILLEY R OU MLLE TORR" must not be cut at a space on the way back.
    const counts = duplicatePairCounts([
      {
        accountNames: ['M BOILLEY RICHARD', 'Carte Visa Ultim - CHLOE'],
        date: '2026-01-01',
        amount: -1,
        label: 'x',
      },
    ])
    expect(counts[0]?.pair).toEqual([
      'Carte Visa Ultim - CHLOE',
      'M BOILLEY RICHARD',
    ])
  })

  it('counts every pair when three accounts report one purchase', () => {
    const counts = duplicatePairCounts([
      {
        accountNames: ['A', 'B', 'C'],
        date: '2026-01-01',
        amount: -1,
        label: 'x',
      },
    ])
    expect(counts).toHaveLength(3)
  })
})

describe('accountsOf', () => {
  it('reads the accounts POST /sessions returns inline', () => {
    const accounts = accountsOf({
      session_id: 's',
      accounts: [{ uid: 'a', name: 'Compte courant' }],
    })
    expect(accounts.map(a => a.uid)).toEqual(['a'])
  })

  it('reads the accounts GET /sessions/{id} puts aside', () => {
    // The shape that made a background fetch read nothing: `accounts` holds
    // bare ids there, and the objects live in `accounts_data`.
    const accounts = accountsOf({
      accounts: ['a', 'b'],
      accounts_data: [
        { uid: 'a', name: 'Compte courant' },
        { uid: 'b', name: 'Carte' },
      ],
    })
    expect(accounts.map(a => a.uid)).toEqual(['a', 'b'])
  })

  it('drops bare ids when nothing describes them', () => {
    // Better none than six accounts with no uid, every fetch skipped, and a
    // run reporting success having read nothing.
    expect(accountsOf({ accounts: ['a', 'b'] })).toEqual([])
  })

  it('prefers the described accounts over the bare ids', () => {
    const accounts = accountsOf({
      accounts: ['a'],
      accounts_data: [{ uid: 'a', name: 'Compte courant' }],
    })
    expect(accounts[0]?.name).toBe('Compte courant')
  })
})
