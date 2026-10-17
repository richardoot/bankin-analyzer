import { describe, it, expect } from 'vitest'
import { formatCurrency, parseDecimal } from './formatters'

describe('formatCurrency', () => {
  it('formats positive numbers', () => {
    const result = formatCurrency(42)
    expect(result).toContain('42')
    expect(result).toContain('€')
  })

  it('formats negative numbers', () => {
    const result = formatCurrency(-15)
    expect(result).toContain('15')
    expect(result).toContain('€')
    // Should contain a minus sign or equivalent negative indicator
    expect(result).toMatch(/-|−/)
  })

  it('formats zero', () => {
    const result = formatCurrency(0)
    expect(result).toContain('0')
    expect(result).toContain('€')
  })

  it('formats decimal amounts with 2 decimal places', () => {
    const result = formatCurrency(19.99)
    expect(result).toContain('19')
    expect(result).toContain('99')
  })

  it('formats large numbers with thousands separator', () => {
    const result = formatCurrency(1234567.89)
    // fr-FR uses non-breaking space as thousands separator
    const normalized = result.replace(/\s/g, ' ')
    expect(normalized).toContain('1 234 567')
  })

  it('returns EUR currency format', () => {
    const result = formatCurrency(100)
    expect(result).toContain('€')
  })
})

describe('parseDecimal', () => {
  it('reads a comma as the decimal separator', () => {
    expect(parseDecimal('12,5')).toBe(12.5)
    expect(parseDecimal('12.5')).toBe(12.5)
  })

  it('ignores thousands spaces, no-break ones included', () => {
    expect(parseDecimal('1 234,50')).toBe(1234.5)
    expect(parseDecimal('1\u202f234,50')).toBe(1234.5)
  })

  it('says NaN for an empty or non-numeric field', () => {
    expect(parseDecimal('')).toBeNaN()
    expect(parseDecimal('  ')).toBeNaN()
    expect(parseDecimal('abc')).toBeNaN()
  })
})
