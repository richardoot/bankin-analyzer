import { describe, it, expect } from 'vitest'
import { ReimbursementStatus } from '../generated/prisma'
import {
  cashTotal,
  creditedTotal,
  derivedStatusOf,
  paymentsOf,
  round2,
  splitCredit,
  type LedgerEntry,
} from './reimbursement-ledger'

const CASH: LedgerEntry['kind'] = 'CASH'
const WRITE_OFF: LedgerEntry['kind'] = 'WRITE_OFF'

describe('creditedTotal / cashTotal', () => {
  const ledger: LedgerEntry[] = [
    { amount: 560, kind: CASH },
    { amount: 40, kind: WRITE_OFF },
  ]

  it('credits cash and forgiveness alike', () => {
    expect(creditedTotal(ledger)).toBe(600)
  })

  it('counts only the money as cash', () => {
    expect(cashTotal(ledger)).toBe(560)
  })

  it('totals an empty ledger to zero', () => {
    expect(creditedTotal([])).toBe(0)
    expect(cashTotal([])).toBe(0)
  })

  it('keeps repeated additions off the float cliff', () => {
    const cents: LedgerEntry[] = Array.from({ length: 3 }, () => ({
      amount: 0.1,
      kind: CASH,
    }))

    expect(creditedTotal(cents)).toBe(0.3)
  })
})

describe('derivedStatusOf', () => {
  it('reads the three states off the amounts', () => {
    expect(derivedStatusOf(600, 0)).toBe(ReimbursementStatus.PENDING)
    expect(derivedStatusOf(600, 560)).toBe(ReimbursementStatus.PARTIAL)
    expect(derivedStatusOf(600, 600)).toBe(ReimbursementStatus.COMPLETED)
  })

  it('treats a sub-cent shortfall as settled', () => {
    expect(derivedStatusOf(600, 599.999)).toBe(ReimbursementStatus.COMPLETED)
  })

  it('leaves a debt of nothing settled from the start', () => {
    expect(derivedStatusOf(0, 0)).toBe(ReimbursementStatus.COMPLETED)
  })
})

describe('splitCredit', () => {
  it('is all cash when the line is not force-completed', () => {
    expect(
      splitCredit({
        debtAmount: 600,
        alreadyCredited: 0,
        cash: 200,
        forceComplete: false,
      })
    ).toEqual({ cash: 200, writeOff: 0 })
  })

  it('leaves a shortfall standing when nothing forces the line', () => {
    // 200 of 600: the remaining 400 is still owed, not forgiven.
    const split = splitCredit({
      debtAmount: 600,
      alreadyCredited: 0,
      cash: 200,
      forceComplete: false,
    })

    expect(split.cash + split.writeOff).toBe(200)
  })

  it('forgives exactly what the cash does not cover', () => {
    // 5 EUR closing a 600 EUR debt.
    expect(
      splitCredit({
        debtAmount: 600,
        alreadyCredited: 0,
        cash: 5,
        forceComplete: true,
      })
    ).toEqual({ cash: 5, writeOff: 595 })
  })

  it('counts what was already credited before forgiving the rest', () => {
    // 30 collected earlier, 20 now: only 550 of the 600 is written off.
    expect(
      splitCredit({
        debtAmount: 600,
        alreadyCredited: 30,
        cash: 20,
        forceComplete: true,
      })
    ).toEqual({ cash: 20, writeOff: 550 })
  })

  it('forgives nothing when the cash already settles the debt', () => {
    expect(
      splitCredit({
        debtAmount: 600,
        alreadyCredited: 100,
        cash: 500,
        forceComplete: true,
      })
    ).toEqual({ cash: 500, writeOff: 0 })
  })

  it('forgives nothing when the cash overshoots', () => {
    expect(
      splitCredit({
        debtAmount: 600,
        alreadyCredited: 0,
        cash: 700,
        forceComplete: true,
      })
    ).toEqual({ cash: 700, writeOff: 0 })
  })

  it('ignores a sub-cent shortfall rather than recording a centime', () => {
    expect(
      splitCredit({
        debtAmount: 600,
        alreadyCredited: 0,
        cash: 599.999,
        forceComplete: true,
      }).writeOff
    ).toBe(0)
  })
})

describe('paymentsOf', () => {
  it('records both movements when a shortfall was forgiven', () => {
    expect(paymentsOf({ cash: 5, writeOff: 595 })).toEqual([
      { amount: 5, kind: CASH },
      { amount: 595, kind: WRITE_OFF },
    ])
  })

  it('records only the cash when nothing was forgiven', () => {
    expect(paymentsOf({ cash: 200, writeOff: 0 })).toEqual([
      { amount: 200, kind: CASH },
    ])
  })

  it('records only the write-off when a debt was closed for free', () => {
    expect(paymentsOf({ cash: 0, writeOff: 600 })).toEqual([
      { amount: 600, kind: WRITE_OFF },
    ])
  })

  it('records nothing for an empty split', () => {
    expect(paymentsOf({ cash: 0, writeOff: 0 })).toEqual([])
  })
})

describe('round2', () => {
  it('keeps two decimals', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(round2(599.994)).toBe(599.99)
    expect(round2(599.995)).toBe(600)
  })
})
