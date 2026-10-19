import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { TagsService, windowMonthCount } from './tags.service'
import { RecurrencesService } from '../recurrences/recurrences.service'
import { TagFamiliesService } from '../tag-families/tag-families.service'
import { TagBaselineService } from './tag-baseline.service'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type { Tag } from '../generated/prisma'

const USER = 'user-1'

const TAG_INCLUDE = {
  _count: { select: { transactions: true } },
  family: { select: { id: true, name: true, color: true } },
}

const mockTag = {
  id: 'tag-1',
  userId: USER,
  name: 'Vacances Italie',
  color: '#ef4444',
  icon: null,
  isExceptional: false,
  eventStartDate: null,
  eventEndDate: null,
  budgetAmount: null,
  familyId: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

const mockPrismaService = {
  tag: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  tagFamily: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
  },
  transactionTag: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
}

describe('TagsService', () => {
  let service: TagsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        TagBaselineService,
        TagFamiliesService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: RecurrencesService,
          useValue: { refreshQuietly: vi.fn() },
        },
      ],
    }).compile()

    service = module.get<TagsService>(TagsService)
    vi.clearAllMocks()
  })

  describe('findAllByUser', () => {
    it('maps tags to responses with transactionCount', async () => {
      mockPrismaService.tag.findMany.mockResolvedValue([
        { ...mockTag, _count: { transactions: 3 } },
      ])

      const result = await service.findAllByUser(USER)

      expect(result).toEqual([
        {
          id: mockTag.id,
          name: mockTag.name,
          color: mockTag.color,
          icon: mockTag.icon,
          transactionCount: 3,
          isExceptional: false,
          eventStartDate: null,
          eventEndDate: null,
          budgetAmount: null,
          status: null,
          familyId: null,
          family: null,
          createdAt: mockTag.createdAt,
          updatedAt: mockTag.updatedAt,
        },
      ])
    })

    describe('status of a dated tag', () => {
      /** A dated tag as Prisma hands it back: `@db.Date` as UTC midnights. */
      const dated = (id: string, start: string, end: string): Tag => ({
        ...mockTag,
        id,
        isExceptional: true,
        eventStartDate: new Date(`${start}T00:00:00.000Z`),
        eventEndDate: new Date(`${end}T00:00:00.000Z`),
      })

      afterEach(() => {
        vi.useRealTimers()
      })

      it('reads each window against the Paris day, bounds included', async () => {
        // 22:30 UTC on the 14th: already the 15th in Paris.
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-07-14T22:30:00.000Z'))
        mockPrismaService.tag.findMany.mockResolvedValue([
          dated('starts-today', '2026-07-15', '2026-07-20'),
          dated('ends-today', '2026-07-10', '2026-07-15'),
          dated('one-day-today', '2026-07-15', '2026-07-15'),
          dated('starts-tomorrow', '2026-07-16', '2026-07-16'),
          dated('ended-yesterday', '2026-07-01', '2026-07-14'),
          { ...mockTag, id: 'no-window', isExceptional: true },
        ])

        const result = await service.findAllByUser(USER)

        expect(result.map(t => [t.id, t.status])).toEqual([
          ['starts-today', 'ongoing'],
          ['ends-today', 'ongoing'],
          ['one-day-today', 'ongoing'],
          ['starts-tomorrow', 'upcoming'],
          ['ended-yesterday', 'past'],
          ['no-window', null],
        ])
      })

      it('carries the status on a single tag too', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-07-15T10:00:00.000Z'))
        mockPrismaService.tag.findFirst.mockResolvedValue(
          dated('tag-1', '2026-07-16', '2026-07-18')
        )

        const result = await service.findOne('tag-1', USER)

        expect(result.status).toBe('upcoming')
      })
    })

    it('defaults transactionCount to 0 when _count is missing', async () => {
      mockPrismaService.tag.findMany.mockResolvedValue([mockTag])

      const result = await service.findAllByUser(USER)

      expect(result[0]?.transactionCount).toBe(0)
    })
  })

  describe('create', () => {
    it('creates a tag', async () => {
      mockPrismaService.tag.create.mockResolvedValue({
        ...mockTag,
        _count: { transactions: 0 },
      })

      const result = await service.create(USER, {
        name: mockTag.name,
        color: mockTag.color,
      })

      expect(result.name).toBe(mockTag.name)
      expect(mockPrismaService.tag.create).toHaveBeenCalledWith({
        data: {
          userId: USER,
          name: mockTag.name,
          color: mockTag.color,
          icon: null,
          isExceptional: false,
          eventStartDate: null,
          eventEndDate: null,
          budgetAmount: null,
          familyId: null,
        },
        include: TAG_INCLUDE,
      })
    })

    it('files the tag under one of the user’s families', async () => {
      mockPrismaService.tagFamily.findFirst.mockResolvedValue({ id: 'fam-1' })
      mockPrismaService.tag.create.mockResolvedValue({
        ...mockTag,
        familyId: 'fam-1',
        family: { id: 'fam-1', name: 'Voyages', color: '#22c55e' },
        _count: { transactions: 0 },
      })

      const result = await service.create(USER, {
        name: mockTag.name,
        familyId: 'fam-1',
      })

      expect(mockPrismaService.tagFamily.findFirst).toHaveBeenCalledWith({
        where: { id: 'fam-1', userId: USER },
        select: { id: true },
      })
      expect(mockPrismaService.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ familyId: 'fam-1' }),
        })
      )
      expect(result.familyId).toBe('fam-1')
      expect(result.family).toEqual({
        id: 'fam-1',
        name: 'Voyages',
        color: '#22c55e',
      })
    })

    it('refuses another user’s family as not found, writing nothing', async () => {
      mockPrismaService.tagFamily.findFirst.mockResolvedValue(null)

      await expect(
        service.create(USER, { name: mockTag.name, familyId: 'foreign' })
      ).rejects.toThrow(NotFoundException)
      expect(mockPrismaService.tag.create).not.toHaveBeenCalled()
    })

    it('throws ConflictException on duplicate name', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      })
      mockPrismaService.tag.create.mockRejectedValue(p2002)

      await expect(
        service.create(USER, { name: mockTag.name })
      ).rejects.toThrow(ConflictException)
    })
  })

  describe('update', () => {
    it('throws NotFoundException when the tag is not owned', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(null)

      await expect(
        service.update('tag-x', USER, { name: 'x' })
      ).rejects.toThrow(NotFoundException)
    })

    it('refuses to make a tag exceptional while it carries smoothed purchases', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(mockTag)
      mockPrismaService.transaction.count.mockResolvedValue(1)
      mockPrismaService.transaction.findMany.mockResolvedValue([
        { description: 'APPLE STORE IPHONE 17 PRO' },
      ])

      const refusal = service.update(mockTag.id, USER, { isExceptional: true })

      await expect(refusal).rejects.toThrow(BadRequestException)
      await expect(refusal).rejects.toThrow(
        /« APPLE STORE IPHONE 17 PRO » est étalée/
      )
      expect(mockPrismaService.transaction.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { tags: { some: { tagId: mockTag.id } } },
            { userId: USER, amortizationMonths: { not: null } },
          ],
        },
      })
      expect(mockPrismaService.tag.update).not.toHaveBeenCalled()
    })

    it('makes a tag exceptional when none of its rows is smoothed', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(mockTag)
      mockPrismaService.transaction.count.mockResolvedValue(0)
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockPrismaService.tag.update.mockResolvedValue({
        ...mockTag,
        isExceptional: true,
      })

      const result = await service.update(mockTag.id, USER, {
        isExceptional: true,
      })

      expect(result.isExceptional).toBe(true)
    })

    it('does not look for smoothed rows when the flag does not turn on', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue({
        ...mockTag,
        isExceptional: true,
      })
      mockPrismaService.tag.update.mockResolvedValue({
        ...mockTag,
        isExceptional: true,
        name: 'Italie',
      })

      await service.update(mockTag.id, USER, {
        name: 'Italie',
        isExceptional: true,
      })

      expect(mockPrismaService.transaction.count).not.toHaveBeenCalled()
    })
  })

  describe('update, family', () => {
    it('moves a tag into one of the user’s families', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(mockTag)
      mockPrismaService.tagFamily.findFirst.mockResolvedValue({ id: 'fam-1' })
      mockPrismaService.tag.update.mockResolvedValue({
        ...mockTag,
        familyId: 'fam-1',
        family: { id: 'fam-1', name: 'Voyages', color: null },
        _count: { transactions: 2 },
      })

      const result = await service.update(mockTag.id, USER, {
        familyId: 'fam-1',
      })

      expect(mockPrismaService.tag.update).toHaveBeenCalledWith({
        where: { id: mockTag.id },
        data: { familyId: 'fam-1' },
        include: TAG_INCLUDE,
      })
      expect(result.family?.name).toBe('Voyages')
    })

    it('takes a tag out of its family on an explicit null', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue({
        ...mockTag,
        familyId: 'fam-1',
      })
      mockPrismaService.tag.update.mockResolvedValue({
        ...mockTag,
        family: null,
        _count: { transactions: 0 },
      })

      const result = await service.update(mockTag.id, USER, { familyId: null })

      expect(mockPrismaService.tagFamily.findFirst).not.toHaveBeenCalled()
      expect(mockPrismaService.tag.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { familyId: null } })
      )
      expect(result.familyId).toBeNull()
      expect(result.family).toBeNull()
    })

    it('refuses another user’s family as not found, writing nothing', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(mockTag)
      mockPrismaService.tagFamily.findFirst.mockResolvedValue(null)

      await expect(
        service.update(mockTag.id, USER, { familyId: 'foreign' })
      ).rejects.toThrow(NotFoundException)
      expect(mockPrismaService.tag.update).not.toHaveBeenCalled()
    })
  })

  describe('attachTransactions', () => {
    it('only links transactions owned by the user', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(mockTag)
      // Only 'tx-1' belongs to the user; 'tx-foreign' is filtered out.
      mockPrismaService.transaction.findMany.mockResolvedValue([{ id: 'tx-1' }])
      mockPrismaService.transactionTag.createMany.mockResolvedValue({
        count: 1,
      })

      const result = await service.attachTransactions(mockTag.id, USER, [
        'tx-1',
        'tx-foreign',
      ])

      expect(result).toEqual({ attached: 1 })
      expect(mockPrismaService.transactionTag.createMany).toHaveBeenCalledWith({
        data: [{ tagId: mockTag.id, transactionId: 'tx-1' }],
        skipDuplicates: true,
      })
    })

    it('returns 0 and skips createMany when no owned transactions', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(mockTag)
      mockPrismaService.transaction.findMany.mockResolvedValue([])

      const result = await service.attachTransactions(mockTag.id, USER, ['x'])

      expect(result).toEqual({ attached: 0 })
      expect(mockPrismaService.transactionTag.createMany).not.toHaveBeenCalled()
    })

    it('throws NotFoundException when the tag is not owned', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(null)

      await expect(
        service.attachTransactions('tag-x', USER, ['tx-1'])
      ).rejects.toThrow(NotFoundException)
    })

    it('refuses an exceptional tag on smoothed purchases, naming them', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue({
        ...mockTag,
        isExceptional: true,
      })
      mockPrismaService.transaction.count.mockResolvedValue(5)
      mockPrismaService.transaction.findMany.mockResolvedValue([
        { description: 'IPHONE' },
        { description: 'MACBOOK' },
        { description: 'LAVE-LINGE' },
      ])

      const refusal = service.attachTransactions(mockTag.id, USER, [
        'tx-1',
        'tx-2',
      ])

      await expect(refusal).rejects.toThrow(BadRequestException)
      await expect(refusal).rejects.toThrow(
        /5 transactions sont étalées .*« IPHONE », « MACBOOK », « LAVE-LINGE » et 2 autre\(s\)/
      )
      expect(mockPrismaService.transaction.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { id: { in: ['tx-1', 'tx-2'] } },
            { userId: USER, amortizationMonths: { not: null } },
          ],
        },
      })
      expect(mockPrismaService.transactionTag.createMany).not.toHaveBeenCalled()
    })

    it('lets an ordinary tag land on a smoothed purchase', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(mockTag)
      mockPrismaService.transaction.findMany.mockResolvedValue([{ id: 'tx-1' }])
      mockPrismaService.transactionTag.createMany.mockResolvedValue({
        count: 1,
      })

      await service.attachTransactions(mockTag.id, USER, ['tx-1'])

      expect(mockPrismaService.transaction.count).not.toHaveBeenCalled()
    })
  })

  describe('detachTransaction', () => {
    it('deletes the join row', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(mockTag)
      mockPrismaService.transactionTag.deleteMany.mockResolvedValue({
        count: 1,
      })

      await service.detachTransaction(mockTag.id, USER, 'tx-1')

      expect(mockPrismaService.transactionTag.deleteMany).toHaveBeenCalledWith({
        where: { tagId: mockTag.id, transactionId: 'tx-1' },
      })
    })
  })

  describe('getAnalysis', () => {
    it('aggregates totals, categories and months', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(mockTag)
      mockPrismaService.$queryRaw
        // category rows
        .mockResolvedValueOnce([
          {
            category_id: 'c1',
            category_name: 'Restaurant',
            category_icon: '🍽️',
            type: 'EXPENSE',
            transaction_count: 2,
            total_amount: 120,
          },
          {
            category_id: 'c2',
            category_name: 'Salaire',
            category_icon: null,
            type: 'INCOME',
            transaction_count: 1,
            total_amount: 50,
          },
        ])
        // month rows
        .mockResolvedValueOnce([
          { month_key: '2026-06', expenses: 120, income: 50 },
        ])
        // summary rows
        .mockResolvedValueOnce([
          {
            total_expenses: 120,
            total_income: 50,
            transaction_count: 3,
            first_date: new Date('2026-06-01T00:00:00.000Z'),
            last_date: new Date('2026-06-20T00:00:00.000Z'),
          },
        ])

      const result = await service.getAnalysis(mockTag.id, USER)

      expect(result.tag.name).toBe(mockTag.name)
      expect(result.totalExpenses).toBe(120)
      expect(result.totalIncome).toBe(50)
      expect(result.net).toBe(-70)
      expect(result.transactionCount).toBe(3)
      expect(result.firstDate).toBe('2026-06-01T00:00:00.000Z')
      // sorted by amount desc → Restaurant (120) first
      expect(result.byCategory[0]?.categoryName).toBe('Restaurant')
      expect(result.byMonth).toEqual([
        { month: '2026-06', expenses: 120, income: 50 },
      ])
      // No event period declared → no baseline / surplus.
      expect(result.baseline).toBeNull()
      expect(result.totalSurplus).toBeNull()
    })

    it('builds the baseline from variable spending only, transfers aside', async () => {
      // A dated event: the baseline is computed, from the year before it.
      mockPrismaService.tag.findFirst.mockResolvedValue({
        ...mockTag,
        isExceptional: true,
        eventStartDate: new Date('2026-06-10T00:00:00.000Z'),
        eventEndDate: new Date('2026-06-14T00:00:00.000Z'),
      })
      mockPrismaService.transaction.findFirst.mockResolvedValue({
        date: new Date('2025-01-01T00:00:00.000Z'),
      })
      mockPrismaService.tag.findMany.mockResolvedValue([])
      mockPrismaService.$queryRaw.mockResolvedValue([])

      await service.getAnalysis(mockTag.id, USER)

      const queries = mockPrismaService.$queryRaw.mock.calls.map(
        ([sql]: [{ strings: string[] }]) => sql.strings.join('')
      )
      // The three tag queries leave transfers out of every total.
      const tagQueries = queries.filter((q: string) =>
        q.includes('WHERE tt.tag_id')
      )
      expect(tagQueries).toHaveLength(3)
      for (const q of tagQueries) {
        expect(q).toContain("t.type IN ('EXPENSE', 'INCOME')")
      }
      // The baseline reads the rhythm and drops what keeps running away.
      const baseline = queries.find((q: string) => q.includes('everyday'))
      // A line of a recurrence is committed whatever its subcategory says.
      const rhythmClause = /END\s+IS DISTINCT FROM 'COMMITTED'/
      const withRhythm = queries.filter((q: string) => rhythmClause.test(q))
      expect(withRhythm).toHaveLength(1)
      const clause = baseline ?? withRhythm[0]
      expect(clause).toMatch(rhythmClause)
      expect(clause).toContain(
        "WHEN rtx.transaction_id IS NOT NULL THEN 'COMMITTED'"
      )
      expect(clause).toContain('COALESCE(sc.rhythm, c.default_rhythm)')
      // A smoothed purchase keeps falling while the user is away: committed,
      // never part of what a trip suspends.
      expect(withRhythm[0]).toContain(
        'AND (t.amortization_months IS NULL OR t.amount >= 0)'
      )
    })

    it('returns zeroed analysis when the tag has no transactions', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(mockTag)
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            total_expenses: null,
            total_income: null,
            transaction_count: 0,
            first_date: null,
            last_date: null,
          },
        ])

      const result = await service.getAnalysis(mockTag.id, USER)

      expect(result.totalExpenses).toBe(0)
      expect(result.totalIncome).toBe(0)
      expect(result.net).toBe(0)
      expect(result.firstDate).toBeNull()
      expect(result.byCategory).toEqual([])
    })

    it('names the family the tag is filed under, for the page to link it', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue({
        ...mockTag,
        familyId: 'fam-1',
        family: { id: 'fam-1', name: 'Voyages', color: '#22c55e' },
      })
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getAnalysis(mockTag.id, USER)

      expect(mockPrismaService.tag.findFirst).toHaveBeenCalledWith({
        where: { id: mockTag.id, userId: USER },
        include: { family: TAG_INCLUDE.family },
      })
      expect(result.tag.family).toEqual({
        id: 'fam-1',
        name: 'Voyages',
        color: '#22c55e',
      })
    })

    it('throws NotFoundException when the tag is not owned', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(null)

      await expect(service.getAnalysis('tag-x', USER)).rejects.toThrow(
        NotFoundException
      )
    })
  })

  describe('getBudgetSummary', () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'tag-trip',
      name: 'Vacances Italie',
      color: '#06b6d4',
      icon: null,
      event_start_date: new Date('2025-12-10T00:00:00.000Z'),
      event_end_date: new Date('2025-12-14T00:00:00.000Z'),
      budget_amount: 1500,
      spent: 1259,
      ...over,
    })

    // A user without a family with an envelope: what every case above the
    // family ones reads, unchanged by the families.
    beforeEach(() => {
      mockPrismaService.tagFamily.findMany.mockResolvedValue([])
    })

    it('weighs each project against its envelope', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([row()])

      const result = await service.getBudgetSummary(
        USER,
        '2025-01-01',
        '2026-12-31'
      )

      expect(result.items).toEqual([
        {
          id: 'tag-trip',
          name: 'Vacances Italie',
          color: '#06b6d4',
          icon: null,
          eventStartDate: '2025-12-10',
          eventEndDate: '2025-12-14',
          budgetAmount: 1500,
          spent: 1259,
        },
      ])
      expect(result.totalBudget).toBe(1500)
      expect(result.totalSpent).toBe(1259)
    })

    it('counts a project without an envelope as spend only', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        row({ budget_amount: 1500, spent: 1259 }),
        row({
          id: 'tag-ski',
          name: 'Week-end Ski',
          budget_amount: null,
          spent: 450,
        }),
      ])

      const result = await service.getBudgetSummary(
        USER,
        '2025-01-01',
        '2026-12-31'
      )

      expect(result.items[1]?.budgetAmount).toBeNull()
      // The envelope total ignores it, the spend total does not — that gap is
      // exactly what the user needs to see.
      expect(result.totalBudget).toBe(1500)
      expect(result.totalSpent).toBe(1709)
    })

    it('returns zeroed totals when nothing overlaps the window', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([])

      const result = await service.getBudgetSummary(
        USER,
        '2025-01-01',
        '2025-01-31'
      )

      expect(result.items).toEqual([])
      expect(result.totalBudget).toBe(0)
      expect(result.totalSpent).toBe(0)
    })

    it('scopes to the user and to exceptional tags only', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([])

      await service.getBudgetSummary(USER, '2025-01-01', '2025-12-31')

      const call = mockPrismaService.$queryRaw.mock.calls[0][0]
      const sql = call.strings.join('')
      expect(sql).toContain('tg.is_exceptional = true')
      expect(sql).toContain('tg.user_id')
      // An additive event with no period is still in scope when it has spend.
      expect(sql).toContain('COUNT(t.id) > 0')
      expect(call.values).toContain(USER)
    })

    describe('with a family carrying an annual envelope', () => {
      const travel = {
        id: 'fam-travel',
        userId: USER,
        name: 'Voyages',
        color: '#0ea5e9',
        icon: null,
        annualBudget: new Prisma.Decimal('1200.00'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }

      it('charges its prorata in place of its tags’ envelopes', async () => {
        mockPrismaService.tagFamily.findMany.mockResolvedValue([travel])
        mockPrismaService.$queryRaw
          .mockResolvedValueOnce([
            row({ family_id: 'fam-travel', budget_amount: 900, spent: 400 }),
            row({
              id: 'tag-rome',
              name: 'Rome 2026',
              family_id: 'fam-travel',
              budget_amount: 700,
              spent: 150,
            }),
            row({
              id: 'tag-move',
              name: 'Déménagement',
              family_id: null,
              budget_amount: 500,
              spent: 80,
            }),
          ])
          // One line carries both trips: the family counts it once.
          .mockResolvedValueOnce([{ family_id: 'fam-travel', spent: 520 }])

        const result = await service.getBudgetSummary(
          USER,
          '2026-01-01',
          '2026-03-31'
        )

        // 1 200 € a year over 3 months: 300 €, the tags' 900 and 700 ignored.
        expect(result.families).toEqual([
          {
            id: 'fam-travel',
            name: 'Voyages',
            color: '#0ea5e9',
            icon: null,
            annualBudget: 1200,
            proratedBudget: 300,
            spent: 520,
            items: [
              expect.objectContaining({ id: 'tag-trip', budgetAmount: 900 }),
              expect.objectContaining({ id: 'tag-rome', budgetAmount: 700 }),
            ],
          },
        ])
        // The tag outside any family keeps its own envelope.
        expect(result.items.map(i => [i.id, i.budgetAmount])).toEqual([
          ['tag-move', 500],
        ])
        expect(result.totalBudget).toBe(800)
        expect(result.totalSpent).toBe(600)

        const familySql = mockPrismaService.$queryRaw.mock.calls[1][0]
        expect(familySql.strings.join('')).toContain(
          'SELECT DISTINCT tg.family_id, tt.transaction_id'
        )
        expect(mockPrismaService.tagFamily.findMany).toHaveBeenCalledWith({
          where: { userId: USER, annualBudget: { not: null } },
          orderBy: { name: 'asc' },
        })
      })

      it('commits its prorata even without a tag in the window', async () => {
        mockPrismaService.tagFamily.findMany.mockResolvedValue([travel])
        mockPrismaService.$queryRaw
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])

        const result = await service.getBudgetSummary(
          USER,
          '2026-01-01',
          '2026-12-31'
        )

        expect(
          result.families.map(f => [f.id, f.proratedBudget, f.spent, f.items])
        ).toEqual([['fam-travel', 1200, 0, []]])
        expect(result.totalBudget).toBe(1200)
        expect(result.totalSpent).toBe(0)
      })

      it('leaves a family without an envelope to its tags', async () => {
        // Only families with an envelope come back from the lookup.
        mockPrismaService.$queryRaw.mockResolvedValueOnce([
          row({ family_id: 'fam-concerts', budget_amount: 150, spent: 90 }),
        ])

        const result = await service.getBudgetSummary(
          USER,
          '2026-01-01',
          '2026-03-31'
        )

        expect(result.families).toEqual([])
        expect(result.items.map(i => i.id)).toEqual(['tag-trip'])
        expect(result.totalBudget).toBe(150)
        expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('windowMonthCount', () => {
    it('counts whole months, both ends included, like a plan', () => {
      const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`)
      expect(windowMonthCount(d('2026-01-01'), d('2026-03-31'))).toBe(3)
      expect(windowMonthCount(d('2026-01-01'), d('2026-12-31'))).toBe(12)
      expect(windowMonthCount(d('2025-11-01'), d('2026-02-28'))).toBe(4)
      expect(windowMonthCount(d('2026-03-10'), d('2026-03-12'))).toBe(1)
    })
  })

  describe('spentByTag', () => {
    it('maps each tag to its rounded spend, in one query', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        { tag_id: 'tag-1', spent: 120.456 },
        { tag_id: 'tag-2', spent: 30 },
      ])

      const spent = await service.spentByTag(USER)

      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(1)
      expect([...spent.entries()]).toEqual([
        ['tag-1', 120.46],
        ['tag-2', 30],
      ])
    })
  })

  describe('findCandidates', () => {
    it('refuses a tag without a window, naming it', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(mockTag)

      await expect(service.findCandidates('tag-1', USER)).rejects.toThrow(
        BadRequestException
      )
      await expect(service.findCandidates('tag-1', USER)).rejects.toThrow(
        "L'étiquette « Vacances Italie » n'a pas de fenêtre"
      )
      expect(mockPrismaService.$queryRaw).not.toHaveBeenCalled()
    })

    it("is a 404 on someone else's tag", async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue(null)

      await expect(service.findCandidates('tag-x', USER)).rejects.toThrow(
        NotFoundException
      )
    })

    it('says the window it searched, two days wider on each side', async () => {
      mockPrismaService.tag.findFirst.mockResolvedValue({
        ...mockTag,
        isExceptional: true,
        eventStartDate: new Date('2026-03-01T00:00:00.000Z'),
        eventEndDate: new Date('2026-03-02T00:00:00.000Z'),
      })
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          id: 'tx-1',
          date: new Date('2026-02-27T00:00:00.000Z'),
          description: 'CB TRAITEUR',
          amount: -42.5,
          account_id: 'acc-1',
          category_id: null,
          category_name: null,
          category_key: null,
          subcategory_id: null,
          subcategory_name: null,
          subcategory_key: null,
          rhythm: null,
          amortization_months: null,
        },
      ])

      const result = await service.findCandidates('tag-1', USER)

      expect(result).toMatchObject({
        tag: { eventStartDate: '2026-03-01', eventEndDate: '2026-03-02' },
        searchedFrom: '2026-02-27',
        searchedTo: '2026-03-04',
      })
      expect(result.candidates).toEqual([
        {
          id: 'tx-1',
          date: '2026-02-27',
          label: 'CB TRAITEUR',
          amount: -42.5,
          accountId: 'acc-1',
          categoryId: null,
          category: null,
          categoryKey: null,
          subcategoryId: null,
          subcategory: null,
          subcategoryKey: null,
          rhythm: null,
          amortizationMonths: null,
        },
      ])
    })
  })
})
