import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  formatCompactCurrency,
  formatDate,
  formatDateTime,
  formatMonth,
  formatMonthRange,
  MONTHS_FR,
  MONTHS_FR_LONG,
  parseDecimal,
  parseIsoDate,
} from './formatters'

const spaces = (s: string) => s.replace(/[\s\u00a0\u202f]/g, ' ')

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

describe('formatCompactCurrency', () => {
  it('drops the cents', () => {
    expect(spaces(formatCompactCurrency(1234.56))).toBe('1 235 €')
  })

  it('shortens thousands when asked', () => {
    expect(spaces(formatCompactCurrency(3450, { compact: true }))).toBe(
      '3,5 k €'
    )
  })
})

describe('parseDecimal', () => {
  it('reads a comma as the decimal separator', () => {
    expect(parseDecimal('12,5')).toBe(12.5)
    expect(parseDecimal('12.5')).toBe(12.5)
  })

  it('ignores thousands spaces, no-break ones included', () => {
    expect(parseDecimal('1 234,50')).toBe(1234.5)
    expect(parseDecimal('1 234,50')).toBe(1234.5)
  })

  it('says NaN for an empty or non-numeric field', () => {
    expect(parseDecimal('')).toBeNaN()
    expect(parseDecimal('  ')).toBeNaN()
    expect(parseDecimal('abc')).toBeNaN()
  })
})

describe('parseIsoDate', () => {
  it('reads a plain day as a local midnight, never the day before', () => {
    const date = parseIsoDate('2026-10-17')
    expect(date?.getDate()).toBe(17)
    expect(date?.getMonth()).toBe(9)
    expect(date?.getHours()).toBe(0)
  })

  it('reads a month key as its first day', () => {
    expect(parseIsoDate('2026-02')?.getMonth()).toBe(1)
  })

  it('says null for nothing or garbage', () => {
    expect(parseIsoDate(null)).toBeNull()
    expect(parseIsoDate('')).toBeNull()
    expect(parseIsoDate('pas une date')).toBeNull()
  })
})

describe('formatDate', () => {
  it('is numeric by default', () => {
    expect(formatDate('2026-10-17')).toBe('17/10/2026')
  })

  it('offers a medium and a long style', () => {
    expect(formatDate('2026-10-17', 'medium')).toBe('17 oct. 2026')
    expect(formatDate('2026-10-17', 'long')).toBe('17 octobre 2026')
  })

  it('accepts a timestamp or a Date', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('05/01/2026')
    expect(formatDate('2026-01-05T10:00:00')).toBe('05/01/2026')
  })

  it('shows a dash for nothing', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('adds the time to the numeric date', () => {
    expect(spaces(formatDateTime('2026-10-17T14:32:00'))).toBe(
      '17/10/2026 14:32'
    )
  })

  it('shows a dash for nothing', () => {
    expect(formatDateTime(null)).toBe('—')
  })
})

describe('formatMonthRange', () => {
  it('names a span over two years with both years', () => {
    expect(formatMonthRange('2025-11', '2026-10')).toBe(
      'novembre 2025 à octobre 2026'
    )
  })

  it('says the year once within one year, and a single month alone', () => {
    expect(formatMonthRange('2026-03', '2026-10')).toBe('mars à octobre 2026')
    expect(formatMonthRange('2026-10', '2026-10')).toBe('octobre 2026')
  })

  it('reads ISO dates as their months', () => {
    expect(formatMonthRange('2025-11-01', '2026-10-24')).toBe(
      'novembre 2025 à octobre 2026'
    )
  })
})

describe('formatMonth', () => {
  it('names the month of a YYYY-MM key, with its year', () => {
    expect(formatMonth('2026-02')).toBe('Févr. 2026')
  })

  it('spells it out on request, with or without the year', () => {
    expect(formatMonth('2026-02-10', { style: 'long' })).toBe('Février 2026')
    expect(formatMonth('2026-02-10', { year: false })).toBe('Févr.')
  })

  it('lowers the case inside a sentence', () => {
    expect(formatMonth('2026-02', { capitalize: false })).toBe('févr. 2026')
  })

  it('keeps the two tables in step', () => {
    expect(MONTHS_FR).toHaveLength(12)
    expect(MONTHS_FR_LONG).toHaveLength(12)
    expect(MONTHS_FR[7]).toBe('Août')
    expect(MONTHS_FR_LONG[11]).toBe('Décembre')
  })
})
