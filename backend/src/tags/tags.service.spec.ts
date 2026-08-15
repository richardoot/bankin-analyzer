import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { TagsService } from './tags.service'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'

const USER = 'user-1'

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
  transaction: {
    findMany: vi.fn(),
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
        { provide: PrismaService, useValue: mockPrismaService },
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
          createdAt: mockTag.createdAt,
          updatedAt: mockTag.updatedAt,
        },
      ])
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
        },
        include: { _count: { select: { transactions: true } } },
      })
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
  })
})
