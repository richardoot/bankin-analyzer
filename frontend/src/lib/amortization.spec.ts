import { describe, it, expect } from 'vitest'
import type { AmortizedPurchaseDto } from '@/lib/api'
import {
  isAmortizationCarrier,
  monthsBetween,
  purchasesWithSlicesIn,
  remainingSlices,
  smoothingEnded,
  smoothedSourceIds,
} from './amortization'

const purchase = (
  overrides: Partial<AmortizedPurchaseDto> = {}
): AmortizedPurchaseDto => ({
  transactionId: 'tx-phone',
  description: 'iPhone',
  date: '2026-03-10',
  months: 24,
  netAmount: 1300,
  monthlyAmount: 54.17,
  firstMonth: '2026-03',
  lastMonth: '2028-02',
  categoryId: 'cat-tech',
  subcategoryId: 'sub-phone',
  amountInPeriod: 108.34,
  sliceMonthsInPeriod: ['2026-04', '2026-05'],
  dateInPeriod: false,
  ...overrides,
})

describe('isAmortizationCarrier', () => {
  it('is a row only slices reach: smoothed, and no transaction of its own', () => {
    expect(
      isAmortizationCarrier({ amortizedAmount: 54.17, transactionCount: 0 })
    ).toBe(true)
    expect(
      isAmortizationCarrier({ amortizedAmount: 54.17, transactionCount: 2 })
    ).toBe(false)
    // A row no smoothed purchase touches is never one, even empty.
    expect(isAmortizationCarrier({ transactionCount: 0 })).toBe(false)
  })
})

describe('months', () => {
  it('counts the months between two, both included', () => {
    expect(monthsBetween('2026-06', '2028-02')).toBe(21)
    expect(monthsBetween('2026-06', '2026-06')).toBe(1)
    expect(monthsBetween('2026-07', '2026-06')).toBe(0)
  })

  it('counts the slices still to fall, this month included', () => {
    const phone = purchase()
    expect(remainingSlices(phone, '2026-01')).toBe(24)
    expect(remainingSlices(phone, '2026-03')).toBe(24)
    expect(remainingSlices(phone, '2028-02')).toBe(1)
    expect(remainingSlices(phone, '2028-03')).toBe(0)
  })

  it('ends a smoothing once its last slice has fallen', () => {
    const date = '2026-03-14T00:00:00.000Z'
    expect(smoothingEnded(date, 24, '2026-03')).toBe(false)
    expect(smoothingEnded(date, 24, '2028-02')).toBe(false)
    expect(smoothingEnded(date, 24, '2028-03')).toBe(true)
  })
})

describe('the purchases a figure counts', () => {
  const purchases = [
    purchase(),
    purchase({
      transactionId: 'tx-fridge',
      categoryId: 'cat-home',
      subcategoryId: null,
      sliceMonthsInPeriod: ['2026-05'],
    }),
  ]

  it('keeps those with a slice in the months read, in the scope', () => {
    expect(
      purchasesWithSlicesIn(purchases, { from: '2026-04', to: '2026-04' }).map(
        p => p.transactionId
      )
    ).toEqual(['tx-phone'])
    expect(
      smoothedSourceIds(purchases, { from: '2026-05', to: '2026-05' })
    ).toEqual(['tx-phone', 'tx-fridge'])
    expect(
      smoothedSourceIds(purchases, {
        categoryId: 'cat-home',
        subcategoryId: null,
        from: '2026-04',
        to: '2026-06',
      })
    ).toEqual(['tx-fridge'])
  })

  it('gives no list rather than an empty one', () => {
    expect(
      smoothedSourceIds(purchases, { from: '2026-07', to: '2026-12' })
    ).toBeUndefined()
    expect(
      smoothedSourceIds(undefined, { from: '2026-04', to: '2026-04' })
    ).toBeUndefined()
  })
})
