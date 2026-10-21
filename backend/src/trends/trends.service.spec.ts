import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { FilterPreferencesService } from '../filter-preferences/filter-preferences.service'
import { PrismaService } from '../prisma/prisma.service'
import { RecurrencesService } from '../recurrences/recurrences.service'
import { AmortizedSlicesService } from '../transactions/amortized-slices.service'
import { TrendsService } from './trends.service'

const now = new Date('2026-10-07T08:00:00.000Z')

/** The three queries' rows, in the order the reader runs them. */
function lineRows(): unknown[] {
  const rows: unknown[] = []
  for (const month of [
    '2025-09',
    '2025-10',
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
  ]) {
    rows.push({
      id: `r-${month}`,
      date: `${month}-10`,
      amount: 226,
      category_id: 'restaurants',
      subcategory_id: 'restaurant',
      nature: 'PLEASURE',
      rhythm: 'VARIABLE',
      is_recurring: false,
      is_exceptional: false,
    })
  }
  rows.push({
    id: 'r-2026-09',
    date: '2026-09-10',
    amount: 312,
    category_id: 'restaurants',
    subcategory_id: 'restaurant',
    nature: 'PLEASURE',
    rhythm: 'VARIABLE',
    is_recurring: false,
    is_exceptional: false,
  })
  return rows
}

describe('TrendsService', () => {
  let service: TrendsService
  const calls: string[] = []
  const prisma = { $queryRaw: vi.fn() }
  const recurrences = {
    refreshQuietly: vi.fn(() => {
      calls.push('refresh')
      return Promise.resolve()
    }),
  }
  const filterPreferences = { deductsPendingByDefault: vi.fn() }
  const amortizedSlices = { read: vi.fn() }

  beforeEach(async () => {
    calls.length = 0
    vi.clearAllMocks()
    prisma.$queryRaw
      .mockImplementationOnce(() => {
        calls.push('lines')
        return Promise.resolve(lineRows())
      })
      .mockResolvedValueOnce([
        {
          id: 'restaurants',
          name: 'Restaurants et bars',
          icon: 'utensils',
          nature: 'PLEASURE',
          rhythm: 'VARIABLE',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'restaurant',
          category_id: 'restaurants',
          name: 'Restaurant',
          icon: null,
          nature: 'PLEASURE',
          rhythm: 'VARIABLE',
        },
      ])
      .mockResolvedValueOnce([{ start: '2025-09-01' }])
    filterPreferences.deductsPendingByDefault.mockResolvedValue(true)
    amortizedSlices.read.mockResolvedValue([])

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RecurrencesService, useValue: recurrences },
        { provide: FilterPreferencesService, useValue: filterPreferences },
        { provide: AmortizedSlicesService, useValue: amortizedSlices },
      ],
    }).compile()
    service = module.get(TrendsService)
  })

  it('brings the recurrences up to date before reading the registry', async () => {
    await service.getTrends('user-1', {}, now)

    expect(calls).toEqual(['refresh', 'lines'])
    expect(recurrences.refreshQuietly).toHaveBeenCalledWith('user-1')
  })

  it('reads the last closed month against its habit, in the everyday reading', async () => {
    const result = await service.getTrends('user-1', {}, now)

    expect(result).toMatchObject({
      month: '2026-09',
      reading: 'everyday',
      window: 6,
      completeMonths: 12,
      digest: null,
    })
    // One subcategory carries the whole category: it alone is shown.
    expect(result.insights.map(i => i.sentence)).toEqual([
      "Restaurant : 312 € en septembre, +38 % par rapport à l'habitude des 6 mois précédents (226 €).",
    ])
  })

  it('reads the month and the twelve before it, smoothed purchases included', async () => {
    await service.getTrends('user-1', { window: 3 }, now)

    expect(amortizedSlices.read).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        firstMonth: '2025-09-01',
        lastMonth: '2026-09-01',
        start: new Date('2025-09-01T00:00:00.000Z'),
        end: new Date('2026-09-30T23:59:59.999Z'),
      })
    )
  })

  it('takes the pending deduction from the preferences unless told', async () => {
    await service.getTrends('user-1', {}, now)
    expect(filterPreferences.deductsPendingByDefault).toHaveBeenCalledWith(
      'user-1'
    )

    filterPreferences.deductsPendingByDefault.mockClear()
    prisma.$queryRaw
      .mockResolvedValueOnce(lineRows())
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ start: '2025-09-01' }])
    await service.getTrends(
      'user-1',
      { deductPendingReimbursements: false },
      now
    )
    expect(filterPreferences.deductsPendingByDefault).not.toHaveBeenCalled()
  })
})
