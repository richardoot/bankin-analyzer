import { describe, it, expect } from 'vitest'
import type { TrendInsightDto, TrendKind, TrendUnitDto } from '@/lib/api'
import { TREND_GROUPS, trendGroupOf } from './trends'

function line(
  kind: TrendKind,
  type: TrendUnitDto['type']
): Pick<TrendInsightDto, 'kind' | 'unit'> {
  return {
    kind,
    unit: { type, id: 'u', categoryId: null, name: 'u', icon: null },
  }
}

describe('trendGroupOf', () => {
  it('files the groups in their order of display', () => {
    expect(TREND_GROUPS.map(g => g.title)).toEqual([
      'Abonnements et charges',
      'Catégories',
      'Enseignes',
      "Vue d'ensemble",
    ])
  })

  it('keeps the lines to file out of every group', () => {
    expect(trendGroupOf(line('uncategorized', 'uncategorized'))).toBeNull()
  })

  it('files subscriptions and prices under the charges', () => {
    expect(trendGroupOf(line('subscription', 'recurrence'))).toBe('charges')
    expect(trendGroupOf(line('price', 'recurrence'))).toBe('charges')
  })

  it.each([
    'amount',
    'frequency',
    'basket',
    'shift',
    'drift',
    'record',
    'yearAgo',
  ] as const)(
    'files %s on a category or a subcategory under the categories',
    kind => {
      expect(trendGroupOf(line(kind, 'category'))).toBe('categories')
      expect(trendGroupOf(line(kind, 'subcategory'))).toBe('categories')
    }
  )

  it('files a habit that came or went, and a merchant frequency, under the merchants', () => {
    expect(trendGroupOf(line('newHabit', 'merchant'))).toBe('merchants')
    expect(trendGroupOf(line('lostHabit', 'merchant'))).toBe('merchants')
    expect(trendGroupOf(line('frequency', 'merchant'))).toBe('merchants')
  })

  it('files a habit lost on a subcategory under the categories', () => {
    expect(trendGroupOf(line('lostHabit', 'subcategory'))).toBe('categories')
    expect(trendGroupOf(line('lostHabit', 'category'))).toBe('categories')
  })

  it('files shares and savings under the overview', () => {
    expect(trendGroupOf(line('share', 'structure'))).toBe('overview')
    expect(trendGroupOf(line('savings', 'savings'))).toBe('overview')
  })

  it('files a kind it does not know under the categories', () => {
    const unknown = line('amount', 'category')
    expect(
      trendGroupOf({ ...unknown, kind: 'someday' as unknown as TrendKind })
    ).toBe('categories')
  })
})
