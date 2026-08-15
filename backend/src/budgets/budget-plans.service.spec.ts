import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { BudgetPlansService } from './budget-plans.service'
import { PrismaService } from '../prisma/prisma.service'

describe('BudgetPlansService', () => {
  let service: BudgetPlansService
  const mockUserId = 'user-123'

  const utcDate = (iso: string) => new Date(`${iso}T00:00:00Z`)

  const mockPrismaService = {
    budgetPlan: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    budgetPlanEntry: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetPlansService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile()

    service = module.get<BudgetPlansService>(BudgetPlansService)
    vi.clearAllMocks()

    // Default: no overlap
    mockPrismaService.budgetPlan.findFirst.mockResolvedValue(null)
    // Default: all categories owned
    mockPrismaService.category.findMany.mockImplementation(
      ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map(id => ({ id })))
    )
  })

  // ── findAllForUser ─────────────────────────────────────────────────────

  describe('findAllForUser', () => {
    it('returns plans summary sorted by startDate desc with totals computed', async () => {
      mockPrismaService.budgetPlan.findMany.mockResolvedValue([
        {
          id: 'plan-2',
          name: 'Q2',
          startDate: utcDate('2026-04-01'),
          endDate: utcDate('2026-06-30'),
          createdAt: utcDate('2026-03-15'),
          entries: [{ amount: 200 }, { amount: 100.5 }],
        },
        {
          id: 'plan-1',
          name: 'Q1',
          startDate: utcDate('2026-01-01'),
          endDate: utcDate('2026-03-31'),
          createdAt: utcDate('2025-12-15'),
          entries: [{ amount: 50 }],
        },
      ])

      const result = await service.findAllForUser(mockUserId)

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        id: 'plan-2',
        name: 'Q2',
        startDate: '2026-04-01',
        endDate: '2026-06-30',
        monthCount: 3,
        totalAmount: 300.5,
        entryCount: 2,
      })
      expect(result[1]).toMatchObject({
        id: 'plan-1',
        startDate: '2026-01-01',
        monthCount: 3,
        totalAmount: 50,
        entryCount: 1,
      })
    })
  })

  // ── findCurrentForUser ─────────────────────────────────────────────────

  describe('findCurrentForUser', () => {
    it('returns null when no plan covers today', async () => {
      mockPrismaService.budgetPlan.findFirst.mockResolvedValue(null)
      const result = await service.findCurrentForUser(mockUserId)
      expect(result).toBeNull()
    })

    it('returns the plan covering today with entries mapped', async () => {
      mockPrismaService.budgetPlan.findFirst.mockResolvedValue({
        id: 'plan-current',
        name: 'Mai',
        startDate: utcDate('2026-05-01'),
        endDate: utcDate('2026-05-31'),
        createdAt: utcDate('2026-04-25'),
        updatedAt: utcDate('2026-04-25'),
        entries: [
          {
            id: 'e1',
            categoryId: 'cat-1',
            amount: 300,
            category: { name: 'Alimentation', icon: '🍽️' },
          },
        ],
      })

      const result = await service.findCurrentForUser(mockUserId)

      expect(result).not.toBeNull()
      expect(result!.entries).toEqual([
        {
          id: 'e1',
          categoryId: 'cat-1',
          categoryName: 'Alimentation',
          categoryIcon: '🍽️',
          amount: 300,
        },
      ])
      expect(result!.totalAmount).toBe(300)
      expect(result!.monthCount).toBe(1)
    })
  })

  // ── findOne ────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('throws NotFoundException when plan does not exist or belongs to another user', async () => {
      mockPrismaService.budgetPlan.findFirst.mockResolvedValue(null)
      await expect(service.findOne(mockUserId, 'missing')).rejects.toThrow(
        NotFoundException
      )
    })
  })

  // ── create — validation ────────────────────────────────────────────────

  describe('create — month boundary validation', () => {
    it('rejects startDate that is not the 1st of a month', async () => {
      await expect(
        service.create(mockUserId, {
          name: 'Plan',
          startDate: '2026-05-02',
          endDate: '2026-05-31',
          entries: [],
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('rejects endDate that is not the last day of a month', async () => {
      await expect(
        service.create(mockUserId, {
          name: 'Plan',
          startDate: '2026-05-01',
          endDate: '2026-05-30',
          entries: [],
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('rejects endDate before startDate (impossible after boundary check, but guarded)', async () => {
      await expect(
        service.create(mockUserId, {
          name: 'Plan',
          startDate: '2026-06-01',
          endDate: '2026-04-30',
          entries: [],
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('accepts a 3-month plan from April 1 to June 30', async () => {
      mockPrismaService.budgetPlan.create.mockResolvedValue({
        id: 'plan-new',
        name: 'Q2',
        startDate: utcDate('2026-04-01'),
        endDate: utcDate('2026-06-30'),
        createdAt: utcDate('2026-03-15'),
        updatedAt: utcDate('2026-03-15'),
        entries: [],
      })

      const result = await service.create(mockUserId, {
        name: 'Q2',
        startDate: '2026-04-01',
        endDate: '2026-06-30',
        entries: [],
      })

      expect(result.monthCount).toBe(3)
      expect(result.totalAmount).toBe(0)
      expect(mockPrismaService.budgetPlan.create).toHaveBeenCalledOnce()
    })
  })

  describe('create — overlap detection', () => {
    it('rejects when an existing plan overlaps the requested range', async () => {
      mockPrismaService.budgetPlan.findFirst.mockResolvedValueOnce({
        id: 'plan-existing',
        name: 'Q1',
        startDate: utcDate('2026-01-01'),
        endDate: utcDate('2026-04-30'),
      })

      await expect(
        service.create(mockUserId, {
          name: 'Plan',
          startDate: '2026-04-01',
          endDate: '2026-06-30',
          entries: [],
        })
      ).rejects.toThrow(ConflictException)
    })

    it('accepts an adjacent plan that starts the day after another ends', async () => {
      // Existing plan ends 2026-03-31; new plan starts 2026-04-01.
      mockPrismaService.budgetPlan.findFirst.mockResolvedValue(null)
      mockPrismaService.budgetPlan.create.mockResolvedValue({
        id: 'plan-new',
        name: 'Q2',
        startDate: utcDate('2026-04-01'),
        endDate: utcDate('2026-06-30'),
        createdAt: utcDate('2026-03-30'),
        updatedAt: utcDate('2026-03-30'),
        entries: [],
      })

      await expect(
        service.create(mockUserId, {
          name: 'Q2',
          startDate: '2026-04-01',
          endDate: '2026-06-30',
          entries: [],
        })
      ).resolves.toBeDefined()
    })
  })

  describe('create — category ownership', () => {
    it('rejects entries with duplicate categoryIds', async () => {
      await expect(
        service.create(mockUserId, {
          name: 'Plan',
          startDate: '2026-04-01',
          endDate: '2026-04-30',
          entries: [
            { categoryId: 'cat-1', amount: 100 },
            { categoryId: 'cat-1', amount: 200 },
          ],
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('rejects entries referencing a category that does not belong to the user', async () => {
      mockPrismaService.category.findMany.mockResolvedValueOnce([
        { id: 'cat-1' },
      ])

      await expect(
        service.create(mockUserId, {
          name: 'Plan',
          startDate: '2026-04-01',
          endDate: '2026-04-30',
          entries: [
            { categoryId: 'cat-1', amount: 100 },
            { categoryId: 'cat-foreign', amount: 200 },
          ],
        })
      ).rejects.toThrow(BadRequestException)
    })
  })

  // ── update ─────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFound when the plan does not exist', async () => {
      mockPrismaService.budgetPlan.findFirst.mockResolvedValueOnce(null)
      await expect(
        service.update(mockUserId, 'missing', { name: 'x' })
      ).rejects.toThrow(NotFoundException)
    })

    it('does not re-validate dates when only name/entries change', async () => {
      mockPrismaService.budgetPlan.findFirst.mockResolvedValueOnce({
        id: 'plan-1',
        name: 'Old',
        startDate: utcDate('2026-04-01'),
        endDate: utcDate('2026-04-30'),
      })
      mockPrismaService.$transaction.mockImplementation(async cb => {
        return cb({
          budgetPlan: {
            update: vi.fn().mockResolvedValue(undefined),
            findUniqueOrThrow: vi.fn().mockResolvedValue({
              id: 'plan-1',
              name: 'New',
              startDate: utcDate('2026-04-01'),
              endDate: utcDate('2026-04-30'),
              createdAt: utcDate('2026-03-15'),
              updatedAt: utcDate('2026-04-01'),
              entries: [],
            }),
          },
          budgetPlanEntry: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        })
      })

      const result = await service.update(mockUserId, 'plan-1', {
        name: 'New',
      })

      expect(result.name).toBe('New')
      // Overlap check is only performed when dates change
      expect(mockPrismaService.budgetPlan.findFirst).toHaveBeenCalledTimes(1)
    })
  })

  // ── delete ─────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('throws NotFound when the plan does not exist', async () => {
      mockPrismaService.budgetPlan.findFirst.mockResolvedValueOnce(null)
      await expect(service.delete(mockUserId, 'missing')).rejects.toThrow(
        NotFoundException
      )
    })

    it('deletes the plan when found', async () => {
      mockPrismaService.budgetPlan.findFirst.mockResolvedValueOnce({
        id: 'plan-1',
      })
      mockPrismaService.budgetPlan.delete.mockResolvedValue({})

      await service.delete(mockUserId, 'plan-1')

      expect(mockPrismaService.budgetPlan.delete).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
      })
    })
  })

  // ── savings target / project reserve ───────────────────────────────────

  describe('project reserve', () => {
    /** A 3-month plan holding 500/month of envelopes. */
    const planRow = (over: Record<string, unknown> = {}) => ({
      id: 'plan-1',
      name: 'Trimestre',
      startDate: utcDate('2026-01-01'),
      endDate: utcDate('2026-03-31'),
      savingsTarget: null,
      referenceIncome: null,
      createdAt: utcDate('2025-12-01'),
      updatedAt: utcDate('2025-12-01'),
      entries: [
        {
          id: 'e1',
          categoryId: 'cat-1',
          amount: 500,
          category: { name: 'Alimentation', icon: null },
        },
      ],
      ...over,
    })

    it('derives the reserve over the whole plan', async () => {
      mockPrismaService.budgetPlan.findFirst.mockResolvedValueOnce(
        planRow({ savingsTarget: 400, referenceIncome: 2000 })
      )

      const result = await service.findOne(mockUserId, 'plan-1')

      // (2000 − 400 − 500) × 3 months
      expect(result.projectReserve).toBe(3300)
      expect(result.savingsTarget).toBe(400)
      expect(result.referenceIncome).toBe(2000)
    })

    it('reports a negative reserve rather than clamping it', async () => {
      mockPrismaService.budgetPlan.findFirst.mockResolvedValueOnce(
        planRow({ savingsTarget: 1600, referenceIncome: 2000 })
      )

      const result = await service.findOne(mockUserId, 'plan-1')

      // (2000 − 1600 − 500) × 3 — the plan does not add up, and says so.
      expect(result.projectReserve).toBe(-300)
    })

    it('leaves the reserve null when the equation is incomplete', async () => {
      mockPrismaService.budgetPlan.findFirst.mockResolvedValueOnce(
        planRow({ savingsTarget: 400 })
      )

      const result = await service.findOne(mockUserId, 'plan-1')

      expect(result.projectReserve).toBeNull()
      expect(result.referenceIncome).toBeNull()
    })

    it('persists both figures on create', async () => {
      mockPrismaService.budgetPlan.create.mockResolvedValue(
        planRow({ savingsTarget: 400, referenceIncome: 2000 })
      )

      await service.create(mockUserId, {
        name: 'Trimestre',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        savingsTarget: 400,
        referenceIncome: 2000,
        entries: [{ categoryId: 'cat-1', amount: 500 }],
      })

      const data = mockPrismaService.budgetPlan.create.mock.calls[0][0].data
      expect(data.savingsTarget).toBe(400)
      expect(data.referenceIncome).toBe(2000)
    })

    it('stores null when the plan is created without an equation', async () => {
      mockPrismaService.budgetPlan.create.mockResolvedValue(planRow())

      await service.create(mockUserId, {
        name: 'Trimestre',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        entries: [],
      })

      const data = mockPrismaService.budgetPlan.create.mock.calls[0][0].data
      expect(data.savingsTarget).toBeNull()
      expect(data.referenceIncome).toBeNull()
    })

    describe('update', () => {
      let planUpdate: ReturnType<typeof vi.fn>

      beforeEach(() => {
        planUpdate = vi.fn().mockResolvedValue(undefined)
        mockPrismaService.budgetPlan.findFirst.mockResolvedValueOnce(planRow())
        mockPrismaService.$transaction.mockImplementation(async cb =>
          cb({
            budgetPlan: {
              update: planUpdate,
              findUniqueOrThrow: vi.fn().mockResolvedValue(planRow()),
            },
            budgetPlanEntry: {
              deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
              createMany: vi.fn().mockResolvedValue({ count: 0 }),
            },
          })
        )
      })

      it('leaves the equation alone when only entries change', async () => {
        await service.update(mockUserId, 'plan-1', {
          entries: [{ categoryId: 'cat-1', amount: 600 }],
        })

        const data = planUpdate.mock.calls[0][0].data
        expect(data).not.toHaveProperty('savingsTarget')
        expect(data).not.toHaveProperty('referenceIncome')
      })

      it('clears the target when null is sent explicitly', async () => {
        await service.update(mockUserId, 'plan-1', { savingsTarget: null })

        expect(planUpdate.mock.calls[0][0].data.savingsTarget).toBeNull()
      })

      it('updates the target when a number is sent', async () => {
        await service.update(mockUserId, 'plan-1', { savingsTarget: 250 })

        expect(planUpdate.mock.calls[0][0].data.savingsTarget).toBe(250)
      })
    })
  })
})
