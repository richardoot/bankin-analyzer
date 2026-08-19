import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { CategoriesService } from './categories.service'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma, TransactionType } from '../generated/prisma'

const mockCategory = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Alimentation',
  type: TransactionType.EXPENSE,
  icon: null,
  isExcludedFromBudget: false,
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockCategory2 = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  userId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Salaires',
  type: TransactionType.INCOME,
  icon: null,
  isExcludedFromBudget: false,
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockPrismaService = {
  category: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  transaction: {
    aggregate: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
  },
  subcategory: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  budgetPlanEntry: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  reimbursementRequest: {
    count: vi.fn(),
  },
  categoryAssociation: {
    findFirst: vi.fn(),
  },
  filterPreferences: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  // Deletion runs in a transaction; the mock hands the same client back so the
  // assertions below still see every call.
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(mockPrismaService)
  ),
}

/** Prisma returns Decimal for money columns; only toNumber() is exercised. */
const decimal = (value: number) => ({ toNumber: () => value })

const emptyPreferences = {
  hiddenExpenseCategoryIds: [],
  hiddenIncomeCategoryIds: [],
  globalHiddenExpenseCategoryIds: [],
  globalHiddenIncomeCategoryIds: [],
}

/** Every lookup of getDeletionSummary answered with "nothing attached". */
function stubEmptySummary(): void {
  mockPrismaService.transaction.aggregate.mockResolvedValue({
    _count: { _all: 0 },
    _min: { date: null },
    _max: { date: null },
  })
  mockPrismaService.transaction.count.mockResolvedValue(0)
  mockPrismaService.subcategory.findMany.mockResolvedValue([])
  mockPrismaService.budgetPlanEntry.findMany.mockResolvedValue([])
  mockPrismaService.reimbursementRequest.count.mockResolvedValue(0)
  mockPrismaService.categoryAssociation.findFirst.mockResolvedValue(null)
  mockPrismaService.filterPreferences.findUnique.mockResolvedValue(null)
}

describe('CategoriesService', () => {
  let service: CategoriesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile()

    service = module.get<CategoriesService>(CategoriesService)

    vi.clearAllMocks()
  })

  describe('findAllByUser', () => {
    it('should return all categories for a user', async () => {
      mockPrismaService.category.findMany.mockResolvedValue([
        mockCategory,
        mockCategory2,
      ])

      const result = await service.findAllByUser(mockCategory.userId)

      expect(result).toEqual([mockCategory, mockCategory2])
      expect(mockPrismaService.category.findMany).toHaveBeenCalledWith({
        where: { userId: mockCategory.userId },
        orderBy: { name: 'asc' },
      })
    })

    it('should return empty array when no categories', async () => {
      mockPrismaService.category.findMany.mockResolvedValue([])

      const result = await service.findAllByUser('user-without-categories')

      expect(result).toEqual([])
    })
  })

  describe('findOrCreate', () => {
    it('should return existing category if found', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(mockCategory)

      const result = await service.findOrCreate(
        mockCategory.userId,
        mockCategory.name,
        mockCategory.type
      )

      expect(result).toEqual(mockCategory)
      expect(mockPrismaService.category.findUnique).toHaveBeenCalledWith({
        where: {
          userId_name_type: {
            userId: mockCategory.userId,
            name: mockCategory.name,
            type: mockCategory.type,
          },
        },
      })
      expect(mockPrismaService.category.create).not.toHaveBeenCalled()
    })

    it('should create new category if not found', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(null)
      mockPrismaService.category.create.mockResolvedValue(mockCategory)

      const result = await service.findOrCreate(
        mockCategory.userId,
        mockCategory.name,
        mockCategory.type
      )

      expect(result).toEqual(mockCategory)
      expect(mockPrismaService.category.create).toHaveBeenCalledWith({
        data: {
          userId: mockCategory.userId,
          name: mockCategory.name,
          type: mockCategory.type,
        },
      })
    })
  })

  describe('create', () => {
    it('should create a new category via findOrCreate', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(null)
      mockPrismaService.category.create.mockResolvedValue(mockCategory)

      const result = await service.create(mockCategory.userId, {
        name: mockCategory.name,
        type: mockCategory.type,
      })

      expect(result).toEqual(mockCategory)
    })

    it('should return existing category if already exists', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(mockCategory)

      const result = await service.create(mockCategory.userId, {
        name: mockCategory.name,
        type: mockCategory.type,
      })

      expect(result).toEqual(mockCategory)
      expect(mockPrismaService.category.create).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('should update isExcludedFromBudget for an owned category', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      mockPrismaService.category.update.mockResolvedValue({
        ...mockCategory,
        isExcludedFromBudget: true,
      })

      const result = await service.update(
        mockCategory.userId,
        mockCategory.id,
        {
          isExcludedFromBudget: true,
        }
      )

      expect(result.isExcludedFromBudget).toBe(true)
      expect(mockPrismaService.category.findFirst).toHaveBeenCalledWith({
        where: { id: mockCategory.id, userId: mockCategory.userId },
      })
      expect(mockPrismaService.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: { isExcludedFromBudget: true },
      })
    })

    it('should throw NotFoundException when the category is not owned', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(null)

      await expect(
        service.update('other-user', mockCategory.id, {
          isExcludedFromBudget: true,
        })
      ).rejects.toThrow(NotFoundException)
      expect(mockPrismaService.category.update).not.toHaveBeenCalled()
    })

    it('should not set fields left undefined in the DTO', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      mockPrismaService.category.update.mockResolvedValue(mockCategory)

      await service.update(mockCategory.userId, mockCategory.id, {})

      expect(mockPrismaService.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: {},
      })
    })
  })

  describe('update — renaming', () => {
    const renamed = { ...mockCategory, name: 'Courses' }

    it('should rename the category', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      mockPrismaService.category.update.mockResolvedValue(renamed)

      const result = await service.update(
        mockCategory.userId,
        mockCategory.id,
        {
          name: 'Courses',
        }
      )

      expect(result.name).toBe('Courses')
      expect(mockPrismaService.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: { name: 'Courses' },
      })
    })

    // Everything referencing a category — transactions, budget entries,
    // associations, hidden-category preferences — does so by id, so a rename
    // is one UPDATE and nothing else. The Prisma mock exposes no other model,
    // so any attempt at a side write would throw here.
    it('should rename an income category the same single-statement way', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory2)
      mockPrismaService.category.update.mockResolvedValue({
        ...mockCategory2,
        name: 'Paie',
      })

      await service.update(mockCategory2.userId, mockCategory2.id, {
        name: 'Paie',
      })

      expect(mockPrismaService.category.update).toHaveBeenCalledTimes(1)
      expect(mockPrismaService.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory2.id },
        data: { name: 'Paie' },
      })
    })

    it('should reject a name already taken by another category of the same type', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      mockPrismaService.category.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.0.0',
        })
      )

      await expect(
        service.update(mockCategory.userId, mockCategory.id, {
          name: 'Loisirs',
        })
      ).rejects.toThrow(ConflictException)
    })
  })

  describe('getDeletionSummary', () => {
    it('should report nothing attached for an unused category', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      stubEmptySummary()

      const summary = await service.getDeletionSummary(
        mockCategory.userId,
        mockCategory.id
      )

      expect(summary).toEqual({
        categoryId: mockCategory.id,
        categoryName: 'Alimentation',
        type: TransactionType.EXPENSE,
        transactionCount: 0,
        firstTransactionDate: null,
        lastTransactionDate: null,
        subcategoryNames: [],
        labelledTransactionCount: 0,
        budgetPlanEntries: [],
        reimbursementCount: 0,
        associatedCategoryName: null,
        isGloballyHidden: false,
        isExcludedFromBudget: false,
      })
    })

    it('should describe every attached item', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      stubEmptySummary()
      mockPrismaService.transaction.aggregate.mockResolvedValue({
        _count: { _all: 340 },
        _min: { date: new Date('2024-01-05T00:00:00.000Z') },
        _max: { date: new Date('2024-11-28T00:00:00.000Z') },
      })
      mockPrismaService.transaction.count.mockResolvedValue(312)
      mockPrismaService.subcategory.findMany.mockResolvedValue([
        { name: 'Courses' },
        { name: 'Restaurant' },
      ])
      mockPrismaService.budgetPlanEntry.findMany.mockResolvedValue([
        {
          amount: decimal(450),
          budgetPlan: {
            name: 'Budget 2024',
            startDate: new Date('2024-01-01T00:00:00.000Z'),
            endDate: new Date('2024-12-31T00:00:00.000Z'),
          },
        },
      ])
      mockPrismaService.reimbursementRequest.count.mockResolvedValue(3)
      mockPrismaService.categoryAssociation.findFirst.mockResolvedValue({
        expenseCategory: { name: 'Alimentation' },
        incomeCategory: { name: 'Remboursement courses' },
      })
      mockPrismaService.filterPreferences.findUnique.mockResolvedValue({
        ...emptyPreferences,
        globalHiddenExpenseCategoryIds: [mockCategory.id],
      })

      const summary = await service.getDeletionSummary(
        mockCategory.userId,
        mockCategory.id
      )

      expect(summary.transactionCount).toBe(340)
      expect(summary.labelledTransactionCount).toBe(312)
      expect(summary.firstTransactionDate).toEqual(
        new Date('2024-01-05T00:00:00.000Z')
      )
      expect(summary.subcategoryNames).toEqual(['Courses', 'Restaurant'])
      expect(summary.budgetPlanEntries).toEqual([
        {
          planName: 'Budget 2024',
          amount: 450,
          startDate: new Date('2024-01-01T00:00:00.000Z'),
          endDate: new Date('2024-12-31T00:00:00.000Z'),
        },
      ])
      expect(summary.reimbursementCount).toBe(3)
      expect(summary.isGloballyHidden).toBe(true)
    })

    it('should name the other side of the association', async () => {
      // Asked from the income side, the pairing must report the expense one.
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory2)
      stubEmptySummary()
      mockPrismaService.categoryAssociation.findFirst.mockResolvedValue({
        expenseCategory: { name: 'Alimentation' },
        incomeCategory: { name: 'Salaires' },
      })

      const summary = await service.getDeletionSummary(
        mockCategory2.userId,
        mockCategory2.id
      )

      expect(summary.associatedCategoryName).toBe('Alimentation')
    })

    it('should throw NotFoundException when the category is not owned', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(null)

      await expect(
        service.getDeletionSummary('other-user', mockCategory.id)
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('remove', () => {
    function stubCounts(transactions = 0, subcategories = 0, entries = 0) {
      mockPrismaService.transaction.count.mockResolvedValue(transactions)
      mockPrismaService.subcategory.count.mockResolvedValue(subcategories)
      mockPrismaService.budgetPlanEntry.count.mockResolvedValue(entries)
    }

    it('should delete the category and report what it took with it', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      mockPrismaService.filterPreferences.findUnique.mockResolvedValue(null)
      stubCounts(340, 2, 1)

      const result = await service.remove(mockCategory.userId, mockCategory.id)

      expect(result).toEqual({
        uncategorizedTransactions: 340,
        deletedSubcategories: 2,
        deletedBudgetPlanEntries: 1,
      })
      expect(mockPrismaService.category.delete).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
      })
    })

    it('should clear the denormalized subcategory label of its transactions', async () => {
      // The subcategory rows cascade away but this copy would not, and the
      // dashboard groups on it — the orphan label would outlive its category.
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      mockPrismaService.filterPreferences.findUnique.mockResolvedValue(null)
      stubCounts(340, 2, 0)

      await service.remove(mockCategory.userId, mockCategory.id)

      // `subcategoryId` must be nulled here too: leaving it to the ON DELETE
      // SET NULL of the subcategory cascade trips
      // transactions_subcategory_id_fkey, because these rows have already been
      // updated in the same transaction.
      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith({
        where: { categoryId: mockCategory.id, userId: mockCategory.userId },
        data: { subcategory: null, subcategoryId: null },
      })
    })

    it('should not touch transactions when the category carries none', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      mockPrismaService.filterPreferences.findUnique.mockResolvedValue(null)
      stubCounts(0, 0, 0)

      await service.remove(mockCategory.userId, mockCategory.id)

      expect(mockPrismaService.transaction.updateMany).not.toHaveBeenCalled()
    })

    it('should drop the deleted id from the hidden lists', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      mockPrismaService.filterPreferences.findUnique.mockResolvedValue({
        ...emptyPreferences,
        hiddenExpenseCategoryIds: [mockCategory.id, 'cat-other'],
        globalHiddenExpenseCategoryIds: [mockCategory.id],
      })
      stubCounts()

      await service.remove(mockCategory.userId, mockCategory.id)

      expect(mockPrismaService.filterPreferences.update).toHaveBeenCalledWith({
        where: { userId: mockCategory.userId },
        data: {
          hiddenExpenseCategoryIds: ['cat-other'],
          globalHiddenExpenseCategoryIds: [],
        },
      })
    })

    it('should leave the preferences alone when the id was not hidden', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      mockPrismaService.filterPreferences.findUnique.mockResolvedValue({
        ...emptyPreferences,
        hiddenExpenseCategoryIds: ['cat-other'],
      })
      stubCounts()

      await service.remove(mockCategory.userId, mockCategory.id)

      expect(mockPrismaService.filterPreferences.update).not.toHaveBeenCalled()
    })

    it('should throw NotFoundException when the category is not owned', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(null)

      await expect(
        service.remove('other-user', mockCategory.id)
      ).rejects.toThrow(NotFoundException)
      expect(mockPrismaService.category.delete).not.toHaveBeenCalled()
    })
  })
})
