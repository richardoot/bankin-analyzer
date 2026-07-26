import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import {
  useBudgetComparison,
  type ComparisonRange,
} from './useBudgetComparison'
import type {
  BudgetPlanDto,
  BudgetStatisticsDto,
  CategoryAverageDto,
} from '@/lib/api'

function makePlan(start: string, end: string): BudgetPlanDto {
  return {
    id: 'plan-1',
    name: 'Test plan',
    startDate: start,
    endDate: end,
    monthCount: 1,
    totalAmount: 0,
    entries: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

function makeComparison(start: string, end: string): ComparisonRange {
  return {
    startDate: start,
    endDate: end,
    startMonth: start.slice(0, 7),
    endMonth: end.slice(0, 7),
    label: 'comparison',
    source: 'custom',
  }
}

function makeStats(
  monthLabels: string[],
  categories: CategoryAverageDto[],
  income: CategoryAverageDto[] = []
): BudgetStatisticsDto {
  return {
    periodMonths: monthLabels.length,
    totalExpenses: 0,
    totalIncome: 0,
    averageMonthlyExpenses: 0,
    averageMonthlyIncome: 0,
    expensesByCategory: categories,
    incomeByCategory: income,
    monthLabels,
  }
}

function cat(
  categoryId: string,
  categoryName: string,
  monthlyAmounts: number[]
): CategoryAverageDto {
  return {
    categoryId,
    categoryName,
    totalAmount: monthlyAmounts.reduce((a, b) => a + b, 0),
    transactionCount: monthlyAmounts.length,
    averagePerMonth:
      monthlyAmounts.reduce((a, b) => a + b, 0) /
      Math.max(1, monthlyAmounts.length),
    monthlyAmounts,
  }
}

describe('useBudgetComparison', () => {
  describe('widerRange', () => {
    it('returns the plan range when no comparison is set', () => {
      const { widerRange } = useBudgetComparison({
        plan: ref(makePlan('2026-05-01', '2026-05-31')),
        comparison: ref(null),
        statistics: ref(null),
      })
      expect(widerRange.value).toEqual({
        startDate: '2026-05-01',
        endDate: '2026-05-31',
      })
    })

    it('envelops plan + comparison when set (comparison before plan)', () => {
      const { widerRange } = useBudgetComparison({
        plan: ref(makePlan('2026-05-01', '2026-05-31')),
        comparison: ref(makeComparison('2026-02-01', '2026-04-30')),
        statistics: ref(null),
      })
      expect(widerRange.value).toEqual({
        startDate: '2026-02-01',
        endDate: '2026-05-31',
      })
    })

    it('envelops plan + comparison when set (comparison after plan)', () => {
      const { widerRange } = useBudgetComparison({
        plan: ref(makePlan('2026-05-01', '2026-05-31')),
        comparison: ref(makeComparison('2026-07-01', '2026-09-30')),
        statistics: ref(null),
      })
      expect(widerRange.value).toEqual({
        startDate: '2026-05-01',
        endDate: '2026-09-30',
      })
    })

    it('returns null when no plan', () => {
      const { widerRange } = useBudgetComparison({
        plan: ref(null),
        comparison: ref(null),
        statistics: ref(null),
      })
      expect(widerRange.value).toBeNull()
    })
  })

  describe('classifyMonth', () => {
    it('returns "plan" for months inside the plan range', () => {
      const { classifyMonth } = useBudgetComparison({
        plan: ref(makePlan('2026-05-01', '2026-07-31')),
        comparison: ref(null),
        statistics: ref(null),
      })
      expect(classifyMonth('2026-05')).toBe('plan')
      expect(classifyMonth('2026-06')).toBe('plan')
      expect(classifyMonth('2026-07')).toBe('plan')
    })

    it('returns "comparison" for months inside the comparison range', () => {
      const { classifyMonth } = useBudgetComparison({
        plan: ref(makePlan('2026-05-01', '2026-05-31')),
        comparison: ref(makeComparison('2026-02-01', '2026-04-30')),
        statistics: ref(null),
      })
      expect(classifyMonth('2026-02')).toBe('comparison')
      expect(classifyMonth('2026-04')).toBe('comparison')
    })

    it('returns "gap" for months strictly between comparison and plan', () => {
      const { classifyMonth } = useBudgetComparison({
        plan: ref(makePlan('2026-06-01', '2026-06-30')),
        comparison: ref(makeComparison('2026-01-01', '2026-03-31')),
        statistics: ref(null),
      })
      // April and May are in the gap
      expect(classifyMonth('2026-04')).toBe('gap')
      expect(classifyMonth('2026-05')).toBe('gap')
      // Plan months and comparison months keep their classification
      expect(classifyMonth('2026-06')).toBe('plan')
      expect(classifyMonth('2026-01')).toBe('comparison')
    })

    it('returns "outside" when no comparison and month is outside the plan', () => {
      const { classifyMonth } = useBudgetComparison({
        plan: ref(makePlan('2026-05-01', '2026-05-31')),
        comparison: ref(null),
        statistics: ref(null),
      })
      expect(classifyMonth('2026-01')).toBe('outside')
    })
  })

  describe('planAverage / comparisonAverage', () => {
    it('averages monthlyAmounts over the right indices', () => {
      const plan = ref(makePlan('2026-04-01', '2026-05-31'))
      const comparison = ref(makeComparison('2026-01-01', '2026-03-31'))
      // monthLabels covers Jan–May 2026 (5 months)
      const stats = ref(
        makeStats(
          ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'],
          [cat('cat-1', 'Alimentation', [100, 200, 300, 400, 500])]
        )
      )

      const { planAverage, comparisonAverage } = useBudgetComparison({
        plan,
        comparison,
        statistics: stats,
      })

      const c = stats.value!.expensesByCategory[0]!
      // Comparison = avg(100, 200, 300) = 200
      expect(comparisonAverage(c)).toBe(200)
      // Plan = avg(400, 500) = 450
      expect(planAverage(c)).toBe(450)
    })

    it('returns 0 when no data for the zone', () => {
      const { planAverage, comparisonAverage } = useBudgetComparison({
        plan: ref(makePlan('2026-05-01', '2026-05-31')),
        comparison: ref(makeComparison('2026-01-01', '2026-01-31')),
        statistics: ref(
          makeStats(
            ['2026-05'], // only the plan month
            [cat('cat-1', 'Test', [100])]
          )
        ),
      })
      const c = { ...cat('cat-1', 'Test', [100]) }
      // Plan: just May → 100; comparison: no January data → 0
      expect(planAverage(c)).toBe(100)
      expect(comparisonAverage(c)).toBe(0)
    })
  })

  describe('aggregatesFor / incomeAggregates', () => {
    it('sums then averages across visible categories per zone', () => {
      const stats = ref(
        makeStats(
          ['2026-01', '2026-02', '2026-03', '2026-04'],
          [
            cat('a', 'A', [100, 200, 300, 400]),
            cat('b', 'B', [10, 20, 30, 40]),
          ],
          [cat('inc', 'Salaire', [1000, 1100, 1200, 1300])]
        )
      )

      const { aggregatesFor, incomeAggregates } = useBudgetComparison({
        plan: ref(makePlan('2026-04-01', '2026-04-30')),
        comparison: ref(makeComparison('2026-01-01', '2026-03-31')),
        statistics: stats,
      })

      const exp = aggregatesFor(stats.value!.expensesByCategory)
      // Plan = April only = 400 + 40 = 440
      expect(exp.planExpenseAvg).toBe(440)
      // Comparison = avg((100+10), (200+20), (300+30)) = (110+220+330)/3 = 220
      expect(exp.comparisonExpenseAvg).toBe(220)

      const inc = incomeAggregates(stats.value!.incomeByCategory)
      // Plan = April only = 1300
      expect(inc.planIncomeAvg).toBe(1300)
      // Comparison = avg(1000, 1100, 1200) = 1100
      expect(inc.comparisonIncomeAvg).toBe(1100)
    })
  })

  describe('completePlanMonthsCount', () => {
    it('counts only plan months that have fully elapsed', () => {
      // Pretend today is 2026-06-15. April + May are complete; June isn't.
      const fakeNow = () => new Date('2026-06-15T12:00:00Z')
      const stats = ref(
        makeStats(
          ['2026-04', '2026-05', '2026-06'],
          [cat('a', 'A', [100, 200, 300])]
        )
      )

      const { completePlanMonthsCount } = useBudgetComparison({
        plan: ref(makePlan('2026-04-01', '2026-06-30')),
        comparison: ref(null),
        statistics: stats,
        now: fakeNow,
      })

      expect(completePlanMonthsCount.value).toBe(2) // April + May
    })

    it('returns 0 when plan is entirely in the future', () => {
      const fakeNow = () => new Date('2026-03-15T12:00:00Z')
      const stats = ref(makeStats(['2026-05'], [cat('a', 'A', [0])]))
      const { completePlanMonthsCount } = useBudgetComparison({
        plan: ref(makePlan('2026-05-01', '2026-05-31')),
        comparison: ref(null),
        statistics: stats,
        now: fakeNow,
      })
      expect(completePlanMonthsCount.value).toBe(0)
    })
  })

  describe('planActualAverage & isPlanFinished', () => {
    it('averages only over plan months that are fully elapsed', () => {
      // Today = 2026-06-15. Plan runs Apr → Jun. Apr & May complete, Jun in
      // progress. The "real" average should ignore June's partial figure.
      const fakeNow = () => new Date('2026-06-15T12:00:00Z')
      const stats = ref(
        makeStats(
          ['2026-04', '2026-05', '2026-06'],
          [cat('a', 'A', [100, 200, 50])]
        )
      )

      const { planActualAverage, isPlanFinished } = useBudgetComparison({
        plan: ref(makePlan('2026-04-01', '2026-06-30')),
        comparison: ref(null),
        statistics: stats,
        now: fakeNow,
      })

      const c = stats.value!.expensesByCategory[0]!
      // Real avg = (100 + 200) / 2 = 150 (excludes June)
      expect(planActualAverage(c)).toBe(150)
      // Plan is NOT finished — June still in progress
      expect(isPlanFinished.value).toBe(false)
    })

    it('reports the plan as finished when every plan month is in the past', () => {
      const fakeNow = () => new Date('2026-07-15T12:00:00Z')
      const stats = ref(
        makeStats(
          ['2026-04', '2026-05', '2026-06'],
          [cat('a', 'A', [100, 200, 150])]
        )
      )

      const { planActualAverage, isPlanFinished, completePlanMonthsCount } =
        useBudgetComparison({
          plan: ref(makePlan('2026-04-01', '2026-06-30')),
          comparison: ref(null),
          statistics: stats,
          now: fakeNow,
        })

      const c = stats.value!.expensesByCategory[0]!
      // Real avg = (100 + 200 + 150) / 3 = 150
      expect(planActualAverage(c)).toBe(150)
      expect(completePlanMonthsCount.value).toBe(3)
      expect(isPlanFinished.value).toBe(true)
    })

    it('returns 0 when no plan months have elapsed yet', () => {
      const fakeNow = () => new Date('2026-03-15T12:00:00Z')
      const stats = ref(makeStats(['2026-05'], [cat('a', 'A', [0])]))
      const { planActualAverage, isPlanFinished } = useBudgetComparison({
        plan: ref(makePlan('2026-05-01', '2026-05-31')),
        comparison: ref(null),
        statistics: stats,
        now: fakeNow,
      })
      const c = stats.value!.expensesByCategory[0]!
      expect(planActualAverage(c)).toBe(0)
      expect(isPlanFinished.value).toBe(false)
    })
  })

  describe('aggregatesFor + incomeAggregates', () => {
    it('exposes planActualExpenseAvg restricted to complete plan months', () => {
      const fakeNow = () => new Date('2026-06-15T12:00:00Z')
      const stats = ref(
        makeStats(
          ['2026-04', '2026-05', '2026-06'],
          [cat('a', 'A', [100, 200, 50]), cat('b', 'B', [10, 20, 5])],
          [cat('inc', 'Salaire', [1000, 1100, 400])]
        )
      )

      const { aggregatesFor, incomeAggregates } = useBudgetComparison({
        plan: ref(makePlan('2026-04-01', '2026-06-30')),
        comparison: ref(null),
        statistics: stats,
        now: fakeNow,
      })

      const exp = aggregatesFor(stats.value!.expensesByCategory)
      // Plan all = avg over Apr+May+Jun:
      //   (110 + 220 + 55) / 3 = 128.33…
      expect(exp.planExpenseAvg).toBeCloseTo((110 + 220 + 55) / 3)
      // Plan actual = avg over Apr+May only: (110 + 220) / 2 = 165
      expect(exp.planActualExpenseAvg).toBe(165)

      const inc = incomeAggregates(stats.value!.incomeByCategory)
      // (1000 + 1100) / 2 = 1050 (June dropped — incomplete)
      expect(inc.planActualIncomeAvg).toBe(1050)
    })

    it('planToDateIncomeAvg averages started months only, not future ones', () => {
      // Plan June→Dec 2026, today mid-July: June elapsed, July in progress,
      // Aug→Dec empty. planIncomeAvg dilutes over 7 months; planToDate must
      // divide by the 2 started months only.
      const fakeNow = () => new Date('2026-07-15T12:00:00Z')
      const stats = ref(
        makeStats(
          [
            '2026-06',
            '2026-07',
            '2026-08',
            '2026-09',
            '2026-10',
            '2026-11',
            '2026-12',
          ],
          [cat('a', 'A', [1709, 1709, 0, 0, 0, 0, 0])],
          [cat('inc', 'Salaire', [1232, 1232, 0, 0, 0, 0, 0])]
        )
      )

      const { incomeAggregates } = useBudgetComparison({
        plan: ref(makePlan('2026-06-01', '2026-12-31')),
        comparison: ref(null),
        statistics: stats,
        now: fakeNow,
      })

      const inc = incomeAggregates(stats.value!.incomeByCategory)
      // Diluted over 7 months: 2464 / 7 ≈ 352
      expect(inc.planIncomeAvg).toBeCloseTo(2464 / 7, 2)
      // Started months (June + July): 2464 / 2 = 1232
      expect(inc.planToDateIncomeAvg).toBe(1232)
      // Complete months (June only): 1232
      expect(inc.planActualIncomeAvg).toBe(1232)
    })
  })
})
