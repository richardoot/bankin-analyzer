import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SMOOTHING_MONTHS,
  SMOOTHING_PROFILES,
  findSmoothingSuggestions,
  suggestedAmortizationMonths,
  type SuggestionRow,
} from './smoothing-suggestions'
import { catalogSubcategory } from '../categories/catalog'
import {
  AMORTIZATION_MAX_MONTHS,
  AMORTIZATION_MIN_MONTHS,
} from './amortization'

let seq = 0
function row(overrides: Partial<SuggestionRow> = {}): SuggestionRow {
  seq += 1
  return {
    id: `tx-${seq}`,
    date: new Date('2026-06-12'),
    description: 'APPLE STORE',
    net: 1300,
    groupId: 'sub-tech',
    category: 'Shopping et soins',
    categoryKey: 'shopping',
    subcategory: 'High-tech',
    subcategoryKey: 'shopping.tech',
    rhythm: 'VARIABLE',
    smoothed: false,
    exceptional: false,
    ...overrides,
  }
}

const window = {
  since: new Date('2026-04-01'),
  until: new Date('2026-07-01'),
}

describe('smoothing profiles', () => {
  it('names only subcategories the catalogue has, with a duration in bounds', () => {
    for (const [key, profile] of Object.entries(SMOOTHING_PROFILES)) {
      expect(catalogSubcategory(key), key).toBeDefined()
      expect(profile.months).toBeGreaterThanOrEqual(AMORTIZATION_MIN_MONTHS)
      expect(profile.months).toBeLessThanOrEqual(AMORTIZATION_MAX_MONTHS)
    }
  })

  it('proposes one duration per subcategory, by key', () => {
    expect(suggestedAmortizationMonths('shopping.tech')).toBe(24)
    expect(suggestedAmortizationMonths('shopping.sports-gear')).toBe(24)
    expect(suggestedAmortizationMonths('shopping.home')).toBe(48)
    expect(suggestedAmortizationMonths('transport.maintenance')).toBe(12)
    expect(suggestedAmortizationMonths('food.supermarket')).toBe(
      DEFAULT_SMOOTHING_MONTHS
    )
    expect(suggestedAmortizationMonths(null)).toBe(DEFAULT_SMOOTHING_MONTHS)
  })
})

describe('findSmoothingSuggestions', () => {
  it('asks to smoothe a phone, never to make it an episode', () => {
    const phone = row()
    const cable = row({
      net: 24,
      date: new Date('2026-02-10'),
      description: 'CABLE',
    })

    const [suggestion, ...rest] = findSmoothingSuggestions(
      [phone, cable],
      window
    )

    expect(rest).toEqual([])
    expect(suggestion).toMatchObject({
      transactionId: phone.id,
      date: '2026-06-12',
      amount: 1300,
      kind: 'DURABLE',
      question: 'Achat à lisser ?',
      habitMonthly: 2,
    })
    expect(suggestion?.answers.map(a => a.answer)).toEqual(['SMOOTH', 'KEEP'])
    expect(suggestion?.answers[0]).toMatchObject({
      months: 24,
      monthly: 54.17,
    })
    expect(suggestion?.reason).toContain('« High-tech »')
  })

  it('proposes a short smoothing for an unforeseen cost, never an episode', () => {
    const repair = row({
      net: 900,
      groupId: 'sub-car',
      subcategory: 'Entretien et réparation',
      subcategoryKey: 'transport.maintenance',
    })

    const [suggestion] = findSmoothingSuggestions([repair], window)

    expect(suggestion?.kind).toBe('UNFORESEEN')
    expect(suggestion?.answers.map(a => a.answer)).toEqual(['SMOOTH', 'KEEP'])
    expect(suggestion?.answers[0]).toMatchObject({ months: 12, monthly: 75 })
  })

  it('asks « Épisode ou achat à lisser ? » where the subcategory says nothing', () => {
    const festival = row({
      net: 450,
      groupId: 'sub-shows',
      subcategory: 'Concerts, festivals et spectacles',
      subcategoryKey: 'leisure.shows',
    })

    const [suggestion] = findSmoothingSuggestions([festival], window)

    expect(suggestion?.kind).toBe('UNKNOWN')
    expect(suggestion?.question).toBe('Épisode ou achat à lisser ?')
    expect(suggestion?.answers.map(a => a.answer)).toEqual([
      'EPISODE',
      'SMOOTH',
    ])
    expect(suggestion?.answers[1]).toMatchObject({
      months: DEFAULT_SMOOTHING_MONTHS,
    })
  })

  it('leaves out what does not exceed the habit of its subcategory', () => {
    const groceries = Array.from({ length: 12 }, (_, i) =>
      row({
        net: 400,
        groupId: 'sub-food',
        subcategoryKey: 'food.supermarket',
        date: new Date(Date.UTC(2025, 6 + i, 5)),
      })
    )
    const bigShop = row({
      net: 900,
      groupId: 'sub-food',
      subcategoryKey: 'food.supermarket',
    })

    expect(findSmoothingSuggestions([...groceries, bigShop], window)).toEqual(
      []
    )
  })

  it('leaves out small amounts, answered rows, commitments and rows outside the window', () => {
    const rows = [
      row({ net: 150 }),
      row({ smoothed: true }),
      row({ exceptional: true }),
      row({ rhythm: 'COMMITTED', subcategoryKey: 'housing.insurance' }),
      row({ date: new Date('2026-01-15') }),
    ]

    expect(findSmoothingSuggestions(rows, window)).toEqual([])
  })

  it('reads the habit without the rows already answered', () => {
    const smoothedLaptop = row({
      net: 2400,
      smoothed: true,
      date: new Date('2026-01-10'),
    })
    const phone = row()

    const [suggestion] = findSmoothingSuggestions(
      [smoothedLaptop, phone],
      window
    )

    expect(suggestion?.transactionId).toBe(phone.id)
    expect(suggestion?.habitMonthly).toBe(0)
  })

  it('lists the newest first', () => {
    const older = row({ date: new Date('2026-04-20'), groupId: 'a' })
    const newer = row({ date: new Date('2026-06-20'), groupId: 'b' })

    expect(
      findSmoothingSuggestions([older, newer], window).map(s => s.transactionId)
    ).toEqual([newer.id, older.id])
  })
})
