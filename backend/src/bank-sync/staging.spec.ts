import { describe, it, expect } from 'vitest'
import { isBookable, pickTransactionDate } from './staging'

describe('pickTransactionDate', () => {
  const card = {
    transaction_date: '2026-08-29',
    booking_date: '2026-09-01',
    value_date: '2026-09-01',
  }

  it('files a Boursorama row under its debit date, as Bankin always did', () => {
    expect(pickTransactionDate(card, 'Boursorama Banque')).toBe('2026-09-01')
  })

  it('files a CIC row under its operation date, as Bankin always did', () => {
    expect(pickTransactionDate(card, 'CIC')).toBe('2026-08-29')
  })

  it('falls back through the chain when the preferred date is missing', () => {
    expect(
      pickTransactionDate(
        { transaction_date: '2026-08-29' },
        'Boursorama Banque'
      )
    ).toBe('2026-08-29')
    expect(pickTransactionDate({ value_date: '2026-09-01' }, 'CIC')).toBe(
      '2026-09-01'
    )
  })

  it('answers null rather than guessing when no date came at all', () => {
    expect(pickTransactionDate({}, 'CIC')).toBeNull()
  })
})

describe('isBookable', () => {
  it('lets a booked row through', () => {
    expect(isBookable({ status: 'BOOK' })).toBe(true)
  })

  it('keeps a pending row out of the ledger', () => {
    // Boursorama's pending refs are fabricated hashes that do not survive
    // booking — inserting the row guarantees a duplicate later.
    expect(isBookable({ status: 'PDNG' })).toBe(false)
  })

  it('keeps a rejected or unknown status out too', () => {
    expect(isBookable({ status: 'RJCT' })).toBe(false)
  })

  it('keeps a row whose bank sent no status at all', () => {
    expect(isBookable({})).toBe(true)
  })
})
