import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import {
  TagFamilyAnalysisService,
  compareEditions,
} from './tag-family-analysis.service'
import { TagBaselineService } from '../tags/tag-baseline.service'
import type { TagBaseline } from '../tags/tag-baseline.service'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type { Tag } from '../generated/prisma'
import type { TagFamilyAnalysisTagDto } from './dto'

const USER = 'user-1'

const family = {
  id: 'fam-1',
  userId: USER,
  name: 'HYROX',
  color: '#f97316',
  icon: null,
  annualBudget: new Prisma.Decimal('1500.00'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

const tag = (
  id: string,
  name: string,
  window?: [string, string],
  extra: Partial<Tag> = {}
): Tag => ({
  id,
  userId: USER,
  name,
  color: null,
  icon: null,
  isExceptional: true,
  eventStartDate: window ? new Date(`${window[0]}T00:00:00.000Z`) : null,
  eventEndDate: window ? new Date(`${window[1]}T00:00:00.000Z`) : null,
  budgetAmount: null,
  familyId: 'fam-1',
  createdAt: family.createdAt,
  updatedAt: family.updatedAt,
  ...extra,
})

const familyRow = (
  year: number,
  amount: number,
  count: number,
  category: string | null = 'c-sport',
  type = 'EXPENSE'
) => ({
  year,
  category_id: category,
  category_name: category === null ? 'Autre' : category,
  category_icon: null,
  type,
  transaction_count: count,
  total_amount: amount,
})

const tagRow = (
  tagId: string,
  amount: number,
  count: number,
  years: { event: number; cash: number },
  category: string | null = 'c-sport',
  type = 'EXPENSE'
) => ({
  tag_id: tagId,
  category_id: category,
  type,
  event_year: years.event,
  cash_year: years.cash,
  transaction_count: count,
  total_amount: amount,
})

/** A baseline deducting `daily` a day from category `c-food` only. */
const reference = (eventDays: number, daily: number): TagBaseline => ({
  baseline: {
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    everydayDays: 365,
    eventDays,
  },
  ratePerCategory: new Map([['c-food', daily]]),
})

const prisma = {
  tagFamily: { findFirst: vi.fn() },
  tag: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}

const baselines = {
  refreshRecurrences: vi.fn(),
  computeBaseline: vi.fn(),
}

/** The raw SQL of each `$queryRaw` call, in call order. */
const queries = (): string[] =>
  prisma.$queryRaw.mock.calls.map(([sql]: [{ strings: string[] }]) =>
    sql.strings.join('?')
  )

describe('TagFamilyAnalysisService', () => {
  let service: TagFamilyAnalysisService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TagFamilyAnalysisService,
        { provide: PrismaService, useValue: prisma },
        { provide: TagBaselineService, useValue: baselines },
      ],
    }).compile()
    service = module.get(TagFamilyAnalysisService)
    vi.resetAllMocks()
    prisma.tagFamily.findFirst.mockResolvedValue(family)
    baselines.computeBaseline.mockResolvedValue(null)
  })

  /** The family rows first, then the per-tag rows: the order of the calls. */
  function rows(familyRows: unknown[], tagRows: unknown[]): void {
    prisma.$queryRaw
      .mockResolvedValueOnce(familyRows)
      .mockResolvedValueOnce(tagRows)
  }

  it('answers 404 for another user’s family, reading nothing of it', async () => {
    prisma.tagFamily.findFirst.mockResolvedValue(null)

    await expect(service.getAnalysis('fam-1', 'someone-else')).rejects.toThrow(
      NotFoundException
    )
    expect(prisma.tagFamily.findFirst).toHaveBeenCalledWith({
      where: { id: 'fam-1', userId: 'someone-else' },
    })
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('reads each transaction once and keeps the tag conventions', async () => {
    prisma.tag.findMany.mockResolvedValue([])
    rows([], [])

    await service.getAnalysis('fam-1', USER)

    const [familySql, tagSql] = queries()
    // Grouped by transaction before anything is summed: two tags of the
    // family on one line make one line.
    expect(familySql).toContain('GROUP BY tt.transaction_id')
    for (const sql of [familySql, tagSql]) {
      expect(sql).toContain("t.type IN ('EXPENSE', 'INCOME')")
      expect(sql).toContain('ABS(t.amount::numeric) / COALESCE(a.divisor, 1)')
      expect(sql).toContain('COALESCE(a.is_excluded_from_stats, false) = false')
    }
  })

  it('dates a line by its edition in event basis, by its payment in cash', async () => {
    prisma.tag.findMany.mockResolvedValue([])
    rows([], [])
    await service.getAnalysis('fam-1', USER)
    expect(queries()[0]).toContain('COALESCE(ft.event_start, t.date)')

    prisma.$queryRaw.mockReset()
    rows([], [])
    await service.getAnalysis('fam-1', USER, { basis: 'cash' })
    expect(queries()[0]).not.toContain('COALESCE(ft.event_start, t.date)')
    expect(queries()[0]).toContain('EXTRACT(YEAR FROM t.date)::int AS year')
  })

  it('sums the years into the total and merges a category across years', async () => {
    prisma.tag.findMany.mockResolvedValue([])
    rows(
      [
        familyRow(2025, 300, 2),
        familyRow(2026, 200.5, 1),
        familyRow(2026, 50, 1, 'c-food'),
        familyRow(2026, 20, 1, 'c-refund', 'INCOME'),
      ],
      []
    )

    const result = await service.getAnalysis('fam-1', USER)

    expect(result.year).toBeNull()
    expect(result.basis).toBe('event')
    expect(result.availableYears).toEqual([2025, 2026])
    expect(result.totalExpenses).toBe(550.5)
    expect(result.totalIncome).toBe(20)
    expect(result.net).toBe(-530.5)
    expect(result.transactionCount).toBe(5)
    expect(result.byYear).toEqual([
      { year: 2025, expenses: 300, income: 0, transactionCount: 2 },
      { year: 2026, expenses: 250.5, income: 20, transactionCount: 3 },
    ])
    expect(result.byYear.reduce((sum, y) => sum + y.expenses, 0)).toBe(
      result.totalExpenses
    )
    expect(
      result.byCategory.map(c => [c.categoryId, c.type, c.amount])
    ).toEqual([
      ['c-sport', 'EXPENSE', 500.5],
      ['c-food', 'EXPENSE', 50],
      ['c-refund', 'INCOME', 20],
    ])
  })

  it('narrows to one year, keeping every year in the selector', async () => {
    prisma.tag.findMany.mockResolvedValue([])
    rows([familyRow(2025, 300, 2), familyRow(2026, 200, 1)], [])

    const result = await service.getAnalysis('fam-1', USER, { year: 2026 })

    expect(result.year).toBe(2026)
    expect(result.availableYears).toEqual([2025, 2026])
    expect(result.totalExpenses).toBe(200)
    expect(result.transactionCount).toBe(1)
    expect(result.byYear.map(y => y.year)).toEqual([2026])
  })

  it('gives each edition its days, its spending per day and its status', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'))
    prisma.tag.findMany.mockResolvedValue([
      tag('lyon', 'HYROX Lyon 2026', ['2026-03-14', '2026-03-15'], {
        budgetAmount: new Prisma.Decimal('400.00'),
      }),
      tag('paris', 'HYROX Paris 2026', ['2026-12-05', '2026-12-06']),
      tag('gear', 'Matériel'),
    ])
    rows(
      [],
      [
        tagRow('lyon', 300, 3, { event: 2026, cash: 2025 }),
        tagRow('gear', 80, 1, { event: 2026, cash: 2026 }),
      ]
    )

    const result = await service.getAnalysis('fam-1', USER)

    vi.useRealTimers()
    // Dated editions first, latest on top, then the rest by name.
    expect(result.tags.map(t => t.id)).toEqual(['paris', 'lyon', 'gear'])
    expect(
      result.tags.map(t => ({
        id: t.id,
        status: t.status,
        days: t.days,
        spent: t.spent,
        spentPerDay: t.spentPerDay,
        budgetAmount: t.budgetAmount,
        transactionCount: t.transactionCount,
      }))
    ).toEqual([
      {
        id: 'paris',
        status: 'upcoming',
        days: 2,
        spent: 0,
        spentPerDay: 0,
        budgetAmount: null,
        transactionCount: 0,
      },
      {
        id: 'lyon',
        status: 'past',
        days: 2,
        spent: 300,
        spentPerDay: 150,
        budgetAmount: 400,
        transactionCount: 3,
      },
      {
        id: 'gear',
        status: null,
        days: null,
        spent: 80,
        spentPerDay: null,
        budgetAmount: null,
        transactionCount: 1,
      },
    ])
  })

  it('shows the editions of the year, paid or not, and the lines paid in it', async () => {
    prisma.tag.findMany.mockResolvedValue([
      tag('rome', 'Rome 2026', ['2026-12-20', '2026-12-27']),
      tag('prague', 'Prague 2025', ['2025-05-01', '2025-05-04']),
      tag('lisbon', 'Lisbonne 2027', ['2027-01-03', '2027-01-08']),
    ])
    // Lisbon is paid in 2026 for a trip in 2027.
    rows(
      [],
      [
        tagRow('prague', 500, 2, { event: 2025, cash: 2025 }),
        tagRow('lisbon', 400, 1, { event: 2027, cash: 2026 }),
      ]
    )

    const event = await service.getAnalysis('fam-1', USER, { year: 2026 })
    expect(event.tags.map(t => t.id)).toEqual(['rome'])

    rows(
      [],
      [
        tagRow('prague', 500, 2, { event: 2025, cash: 2025 }),
        tagRow('lisbon', 400, 1, { event: 2027, cash: 2026 }),
      ]
    )
    const cash = await service.getAnalysis('fam-1', USER, {
      year: 2026,
      basis: 'cash',
    })
    expect(cash.tags.map(t => [t.id, t.spent])).toEqual([['lisbon', 400]])
  })

  it('sums the editions’ surplus from their own baseline, refreshed once', async () => {
    prisma.tag.findMany.mockResolvedValue([
      tag('lyon', 'HYROX Lyon 2026', ['2026-03-14', '2026-03-15']),
      tag('nice', 'HYROX Nice 2025', ['2025-10-04', '2025-10-05']),
      tag('gear', 'Matériel'),
    ])
    rows(
      [],
      [
        tagRow('lyon', 200, 2, { event: 2026, cash: 2026 }),
        tagRow('lyon', 60, 1, { event: 2026, cash: 2026 }, 'c-food'),
        tagRow('nice', 150, 1, { event: 2025, cash: 2025 }),
        tagRow('gear', 80, 1, { event: 2026, cash: 2026 }),
      ]
    )
    baselines.computeBaseline.mockImplementation((t: Tag) =>
      Promise.resolve(t.id === 'lyon' ? reference(2, 20) : reference(2, 0))
    )

    const result = await service.getAnalysis('fam-1', USER)

    // Lyon: 200 of sport (no everyday rate) + 60 of food less 2 days × 20.
    expect(result.tags.map(t => [t.id, t.surplus])).toEqual([
      ['lyon', 220],
      ['nice', 150],
      ['gear', null],
    ])
    expect(result.totalSurplus).toBe(370)
    expect(baselines.refreshRecurrences).toHaveBeenCalledTimes(1)
    expect(baselines.computeBaseline).toHaveBeenCalledTimes(2)
    for (const call of baselines.computeBaseline.mock.calls) {
      expect(call[2]).toEqual({ skipRefresh: true })
    }
  })

  it('weighs no surplus for an edition the scope covers only in part', async () => {
    prisma.tag.findMany.mockResolvedValue([
      tag('rome', 'Rome 2026', ['2026-12-20', '2026-12-27']),
    ])
    rows(
      [],
      [
        tagRow('rome', 600, 1, { event: 2026, cash: 2025 }),
        tagRow('rome', 400, 2, { event: 2026, cash: 2026 }),
      ]
    )

    const result = await service.getAnalysis('fam-1', USER, {
      year: 2026,
      basis: 'cash',
    })

    expect(result.tags).toMatchObject([
      { id: 'rome', spent: 400, transactionCount: 2, isPartial: true },
    ])
    expect(result.tags.map(t => t.surplus)).toEqual([null])
    expect(baselines.computeBaseline).not.toHaveBeenCalled()
    expect(result.totalSurplus).toBeNull()
    expect(result.comparison).toBeNull()
  })

  it('names the family and its annual envelope', async () => {
    prisma.tag.findMany.mockResolvedValue([])
    rows([], [])

    const result = await service.getAnalysis('fam-1', USER)

    expect(result.family).toEqual({
      id: 'fam-1',
      name: 'HYROX',
      color: '#f97316',
      icon: null,
      annualBudget: 1500,
    })
    expect(result.comparison).toBeNull()
    expect(result.totalSurplus).toBeNull()
  })
})

describe('compareEditions', () => {
  const line = (
    id: string,
    spent: number,
    days: number | null,
    extra: Partial<TagFamilyAnalysisTagDto> = {}
  ): TagFamilyAnalysisTagDto => ({
    id,
    name: id,
    color: null,
    icon: null,
    isExceptional: true,
    status: 'past',
    eventStartDate: null,
    eventEndDate: null,
    days,
    spent,
    spentPerDay: null,
    surplus: null,
    budgetAmount: null,
    transactionCount: 1,
    isPartial: false,
    ...extra,
  })

  it('is null without an edition', () => {
    expect(compareEditions([])).toBeNull()
    expect(compareEditions([line('gear', 80, null)])).toBeNull()
  })

  it('weighs the editions: mean, median, per day, dearest and cheapest', () => {
    const result = compareEditions([
      line('a', 300, 2),
      line('b', 100, 1),
      line('c', 200, 2),
      line('gear', 1000, null),
    ])

    expect(result).toEqual({
      editionCount: 3,
      averageSpent: 200,
      medianSpent: 200,
      averagePerDay: 120,
      mostExpensive: { id: 'a', name: 'a', spent: 300 },
      leastExpensive: { id: 'b', name: 'b', spent: 100 },
    })
  })

  it('takes the mean of the middle two for an even count', () => {
    expect(
      compareEditions([line('a', 100, 1), line('b', 300, 1)])?.medianSpent
    ).toBe(200)
  })

  it('leaves out an edition with nothing paid and one seen in part', () => {
    const result = compareEditions([
      line('paid', 120, 2),
      line('upcoming', 0, 2, { transactionCount: 0 }),
      line('split', 50, 3, { isPartial: true }),
    ])

    expect(result?.editionCount).toBe(1)
    expect(result?.averagePerDay).toBe(60)
  })
})
