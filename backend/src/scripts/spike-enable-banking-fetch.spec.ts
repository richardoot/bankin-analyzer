import { describe, it, expect } from 'vitest'
import {
  clampValidUntil,
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
  it('prefers the booking date, which is what a statement shows', () => {
    const t = tx({
      booking_date: '2026-06-15',
      transaction_date: '2026-06-13',
      value_date: '2026-06-16',
    })
    expect(transactionDate(t)).toBe('2026-06-15')
  })

  it('falls back to the transaction date, then the value date', () => {
    expect(
      transactionDate({
        transaction_date: '2026-06-13',
        value_date: '2026-06-16',
      })
    ).toBe('2026-06-13')
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
