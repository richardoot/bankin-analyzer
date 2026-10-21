import { describe, it, expect } from 'vitest'
import { roundCents } from './money'

describe('roundCents', () => {
  it('rounds to the cent', () => {
    expect(roundCents(312.444)).toBe(312.44)
    expect(roundCents(-250.5)).toBe(-250.5)
    expect(roundCents(0)).toBe(0)
  })

  it('rounds a half-cent tie the same way from either side of it', () => {
    expect(roundCents(2457.7249999999985)).toBe(2457.73)
    expect(roundCents(2457.7250000000004)).toBe(2457.73)
    expect(roundCents(2464.56 - 2457.7249999999985)).toBe(
      roundCents(2464.56 - 2457.7250000000004)
    )
  })
})
