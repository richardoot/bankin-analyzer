import { describe, it, expect } from 'vitest'
import { budgetMonthReading, type BudgetMonthInput } from './budgetMonth'

/**
 * A plan of 1 850 € a month on two envelopes, read on 23 October: July,
 * August and September are complete, October is running.
 */
function input(overrides: Partial<BudgetMonthInput> = {}): BudgetMonthInput {
  return {
    plan: {
      entries: [
        {
          id: 'e1',
          categoryId: 'food',
          categoryName: 'Alimentation',
          amount: 1700,
        },
        {
          id: 'e2',
          categoryId: 'bars',
          categoryName: 'Restaurants et bars',
          amount: 150,
        },
      ],
      referenceIncome: 2465,
      savingsTarget: 500,
    },
    months: ['2026-07', '2026-08', '2026-09', '2026-10'],
    completeMonthsCount: 3,
    selectedMonth: '2026-10',
    progress: { elapsedDays: 23, totalDays: 31 },
    categories: [
      {
        categoryId: 'food',
        categoryName: 'Alimentation',
        amounts: [1600, 1800, 1500, 867],
      },
      {
        categoryId: 'bars',
        categoryName: 'Restaurants et bars',
        amounts: [190, 140, 150, 162],
      },
    ],
    income: [2600, 2600, 2600, 0],
    ...overrides,
  }
}

describe('budgetMonthReading', () => {
  it('prorates the envelope on the running month', () => {
    const r = budgetMonthReading(input())
    expect(r.kind).toBe('month')
    expect(r.month).toBe('2026-10')
    expect(r.isRunning).toBe(true)
    expect(r.asOfDay).toBe(23)
    expect(r.spent).toBe(1029)
    expect(r.envelope).toBe(1850)
    expect(r.envelopeToDate).toBeCloseTo((1850 * 23) / 31, 6)
    // 1 029 against 1 373: −25 %, under.
    expect(r.spentGap?.tone).toBe('under')
    expect(r.spentGap?.ratio).toBeCloseTo(1029 / ((1850 * 23) / 31) - 1, 6)
    // What is left to finish the month: the whole envelope − spent.
    expect(r.remaining).toBe(821)
    expect(r.daysLeft).toBe(8)
    expect(r.spentSeries).toEqual([1790, 1940, 1650, 1029])
  })

  it('judges a complete month against the whole envelope', () => {
    const r = budgetMonthReading(
      input({ selectedMonth: '2026-08', progress: null })
    )
    expect(r.kind).toBe('month')
    expect(r.isRunning).toBe(false)
    expect(r.asOfDay).toBeNull()
    expect(r.spent).toBe(1940)
    expect(r.envelopeToDate).toBe(1850)
    // +4.9 %: within ±5 %, neutral.
    expect(r.spentGap?.tone).toBe('neutral')
    expect(r.remaining).toBe(-90)
    expect(r.daysLeft).toBeNull()
  })

  it('averages the complete months on « Moyenne du plan »', () => {
    const r = budgetMonthReading(input({ selectedMonth: null, progress: null }))
    expect(r.kind).toBe('average')
    expect(r.month).toBeNull()
    // (1 790 + 1 940 + 1 650) / 3, October left out.
    expect(r.spent).toBeCloseTo(5380 / 3, 6)
    expect(r.envelopeToDate).toBe(1850)
    expect(r.remaining).toBeCloseTo(1850 - 5380 / 3, 6)
    // Bars: (190 + 140 + 150) / 3 = 160 over 150.
    expect(r.envelopesOver.map(e => e.categoryId)).toEqual(['bars'])
  })

  it('reads a month outside the plan as the average', () => {
    const r = budgetMonthReading(
      input({ selectedMonth: '2026-03', progress: null })
    )
    expect(r.kind).toBe('average')
  })

  it('reads whatever amounts it is given: the reading is the caller’s', () => {
    const everyday = budgetMonthReading(input())
    const real = budgetMonthReading(
      input({
        categories: [
          {
            categoryId: 'food',
            categoryName: 'Alimentation',
            // A one-off event in October, counted in the real reading.
            amounts: [1600, 1800, 1500, 1567],
          },
          {
            categoryId: 'bars',
            categoryName: 'Restaurants et bars',
            amounts: [190, 140, 150, 162],
          },
        ],
      })
    )
    expect(everyday.spent).toBe(1029)
    expect(real.spent).toBe(1729)
    expect(real.spentGap?.tone).toBe('over')
    expect(real.envelopesOver.map(e => e.categoryId)).toEqual(['bars'])
  })

  it('says the planned savings against the decided ones', () => {
    const r = budgetMonthReading(input())
    // 2 465 − 1 850 = 615, 115 above the 500 decided: teal.
    expect(r.savingsPlanned).toBe(615)
    expect(r.savingsDecided).toBe(500)
    expect(r.savingsGap).toEqual({ tone: 'under', amount: 115 })
    // Over July → September: 2 600 − 5 380 / 3.
    expect(r.savingsActual).toBeCloseTo(2600 - 5380 / 3, 6)
    expect(r.savingsActualMonths).toBe(3)
  })

  it('turns amber when the plan saves less than decided', () => {
    const r = budgetMonthReading(
      input({
        plan: { ...input().plan, referenceIncome: 2200, savingsTarget: 500 },
      })
    )
    expect(r.savingsPlanned).toBe(350)
    expect(r.savingsGap).toEqual({ tone: 'over', amount: -150 })
  })

  it('has no planned savings without a reference income', () => {
    const r = budgetMonthReading(
      input({
        plan: { ...input().plan, referenceIncome: null, savingsTarget: null },
      })
    )
    expect(r.savingsPlanned).toBeNull()
    expect(r.savingsDecided).toBeNull()
    expect(r.savingsGap).toBeNull()
    // What was saved is still read off the months.
    expect(r.savingsActual).not.toBeNull()
  })

  it('has no gap without a decided target', () => {
    // A plan drawn up before the wizard asked for one: no key at all.
    const { entries, referenceIncome } = input().plan
    const r = budgetMonthReading(
      input({ plan: { entries, referenceIncome: referenceIncome ?? null } })
    )
    expect(r.savingsPlanned).toBe(615)
    expect(r.savingsGap).toBeNull()
  })

  it('has no savings made before a month is complete', () => {
    const r = budgetMonthReading(
      input({
        months: ['2026-10'],
        completeMonthsCount: 0,
        categories: [
          { categoryId: 'food', categoryName: 'Alimentation', amounts: [867] },
        ],
        income: [0],
      })
    )
    expect(r.savingsActual).toBeNull()
    expect(r.savingsActualMonths).toBe(0)
  })

  it('lists the envelopes spent past, the largest overrun first', () => {
    const r = budgetMonthReading(
      input({
        selectedMonth: '2026-08',
        progress: null,
      })
    )
    // August: food 1 800 on 1 700, 100 over; bars 140 on 150, held.
    expect(r.envelopesOver).toEqual([
      {
        categoryId: 'food',
        categoryName: 'Alimentation',
        spent: 1800,
        envelope: 1700,
        overBy: 100,
      },
    ])
    expect(r.envelopesCount).toBe(2)

    const july = budgetMonthReading(
      input({ selectedMonth: '2026-07', progress: null })
    )
    expect(july.envelopesOver.map(e => e.categoryId)).toEqual(['bars'])
  })

  it('never flags a category without an envelope', () => {
    const r = budgetMonthReading(
      input({
        categories: [
          ...input().categories,
          {
            categoryId: 'tax',
            categoryName: 'Impôts et taxes',
            amounts: [0, 0, 27, 59],
          },
        ],
      })
    )
    expect(r.envelopesOver.map(e => e.categoryId)).toEqual(['bars'])
    expect(r.envelopesCount).toBe(2)
  })

  it('reads only the envelope and the savings before the plan begins', () => {
    const r = budgetMonthReading(
      input({
        months: [],
        completeMonthsCount: 0,
        selectedMonth: null,
        progress: null,
        categories: [],
        income: [],
      })
    )
    expect(r.kind).toBe('future')
    expect(r.spent).toBeNull()
    expect(r.remaining).toBeNull()
    expect(r.spentGap).toBeNull()
    expect(r.envelope).toBe(1850)
    expect(r.savingsPlanned).toBe(615)
    expect(r.envelopesOver).toEqual([])
  })
})
