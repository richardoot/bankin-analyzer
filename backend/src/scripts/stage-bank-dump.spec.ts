import { describe, it, expect } from 'vitest'
import { toStaged } from './stage-bank-dump'
import type { BankTransaction } from './spike-enable-banking-fetch'

function tx(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    entry_reference: 'ENTRY-1',
    transaction_amount: { amount: '39.99', currency: 'EUR' },
    credit_debit_indicator: 'DBIT',
    booking_date: '2026-08-25',
    status: 'BOOK',
    remittance_information: ['CARTE 25/08/26 APPLE.COM/BILL CB*7962'],
    ...overrides,
  }
}

describe('toStaged', () => {
  it('carries the bank identity and the account it came from', () => {
    const rows = toStaged({ 'acc-1': [tx()] }, { 'acc-1': 'Compte courant' })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.staged).toMatchObject({
      externalAccountId: 'acc-1',
      externalId: 'ENTRY-1',
      date: '2026-08-25',
      amount: -39.99,
    })
    expect(rows[0]?.accountName).toBe('Compte courant')
  })

  it('falls back to the account id when the bank named nothing', () => {
    const rows = toStaged({ 'acc-1': [tx()] }, {})
    expect(rows[0]?.accountName).toBe('acc-1')
  })

  it('records a missing reference as null rather than inventing one', () => {
    const rows = toStaged({ 'acc-1': [tx({ entry_reference: undefined })] }, {})
    expect(rows[0]?.staged.externalId).toBeNull()
  })

  it('drops a transaction the bank left undated', () => {
    // Unmatched on any rule, and guessing a date is how a wrong link is made.
    const rows = toStaged(
      {
        'acc-1': [
          tx({
            booking_date: undefined,
            transaction_date: undefined,
            value_date: undefined,
          }),
        ],
      },
      {}
    )
    expect(rows).toEqual([])
  })

  it('drops a transaction whose direction the bank did not state', () => {
    const rows = toStaged(
      { 'acc-1': [tx({ credit_debit_indicator: undefined })] },
      {}
    )
    expect(rows).toEqual([])
  })

  it('keeps the untouched payload beside the reduced row', () => {
    const original = tx()
    const rows = toStaged({ 'acc-1': [original] }, {})
    expect(rows[0]?.raw).toBe(original)
  })

  it('flattens several accounts into one list', () => {
    const rows = toStaged(
      { a: [tx(), tx({ entry_reference: 'ENTRY-2' })], b: [tx()] },
      {}
    )
    expect(rows).toHaveLength(3)
    expect(rows.map(r => r.staged.externalAccountId)).toEqual(['a', 'a', 'b'])
  })
})
