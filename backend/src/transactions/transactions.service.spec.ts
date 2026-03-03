import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { TransactionsService } from './transactions.service'
import { PrismaService } from '../prisma/prisma.service'
import { CategoriesService } from '../categories/categories.service'
import { TransactionType } from '../generated/prisma'
import { Decimal } from 'decimal.js'

const mockUserId = '550e8400-e29b-41d4-a716-446655440001'

const mockCategory = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  userId: mockUserId,
  name: 'Alimentation',
  type: TransactionType.EXPENSE,
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockTransaction = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: mockUserId,
  categoryId: mockCategory.id,
  hash: 'abc123hash',
  date: new Date('2024-01-15T10:30:00.000Z'),
  description: 'Restaurant',
  amount: new Decimal(-45.5),
  type: TransactionType.EXPENSE,
  account: 'Compte Courant',
  subcategory: 'Restaurant - Autres',
  note: null,
  isPointed: false,
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
  category: mockCategory,
}

const mockTransaction2 = {
  ...mockTransaction,
  id: '550e8400-e29b-41d4-a716-446655440002',
  hash: 'def456hash',
  description: 'Supermarché',
  amount: new Decimal(-85.0),
}

const mockPrismaService = {
  transaction: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}

const mockCategoriesService = {
  findOrCreate: vi.fn(),
}

describe('TransactionsService', () => {
  let service: TransactionsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CategoriesService,
          useValue: mockCategoriesService,
        },
      ],
    }).compile()

    service = module.get<TransactionsService>(TransactionsService)

    vi.clearAllMocks()
  })

  describe('findAllByUser', () => {
    it('should return all transactions for a user', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([
        mockTransaction,
        mockTransaction2,
      ])

      const result = await service.findAllByUser(mockUserId)

      expect(result).toEqual([mockTransaction, mockTransaction2])
      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        include: { category: true },
        orderBy: { date: 'desc' },
      })
    })

    it('should filter by type', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([
        mockTransaction,
      ])

      await service.findAllByUser(mockUserId, { type: TransactionType.EXPENSE })

      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          type: TransactionType.EXPENSE,
        },
        include: { category: true },
        orderBy: { date: 'desc' },
      })
    })

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')
      mockPrismaService.transaction.findMany.mockResolvedValue([])

      await service.findAllByUser(mockUserId, { startDate, endDate })

      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          date: { gte: startDate, lte: endDate },
        },
        include: { category: true },
        orderBy: { date: 'desc' },
      })
    })

    it('should filter by categoryId', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])

      await service.findAllByUser(mockUserId, { categoryId: mockCategory.id })

      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          categoryId: mockCategory.id,
        },
        include: { category: true },
        orderBy: { date: 'desc' },
      })
    })
  })

  describe('findOne', () => {
    it('should return a transaction by id', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction)

      const result = await service.findOne(mockTransaction.id, mockUserId)

      expect(result).toEqual(mockTransaction)
      expect(mockPrismaService.transaction.findFirst).toHaveBeenCalledWith({
        where: { id: mockTransaction.id, userId: mockUserId },
        include: { category: true },
      })
    })

    it('should throw NotFoundException when transaction not found', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(null)

      await expect(
        service.findOne('non-existent-id', mockUserId)
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('importTransactions', () => {
    const createTransactionDto = {
      date: '2024-01-15T10:30:00.000Z',
      description: 'Restaurant',
      amount: -45.5,
      category: 'Alimentation',
      account: 'Compte Courant',
      type: TransactionType.EXPENSE,
      subcategory: 'Restaurant - Autres',
      note: undefined,
      isPointed: false,
    }

    it('should import new transactions', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)
      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction)

      const result = await service.importTransactions(mockUserId, [
        createTransactionDto,
      ])

      expect(result).toEqual({
        imported: 1,
        duplicates: 0,
        total: 1,
      })
      expect(mockCategoriesService.findOrCreate).toHaveBeenCalledWith(
        mockUserId,
        'Alimentation',
        TransactionType.EXPENSE
      )
      expect(mockPrismaService.transaction.create).toHaveBeenCalled()
    })

    it('should skip duplicate transactions based on hash', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(
        mockTransaction
      )

      const result = await service.importTransactions(mockUserId, [
        createTransactionDto,
      ])

      expect(result).toEqual({
        imported: 0,
        duplicates: 1,
        total: 1,
      })
      expect(mockPrismaService.transaction.create).not.toHaveBeenCalled()
    })

    it('should handle mixed new and duplicate transactions', async () => {
      const newTransaction = {
        ...createTransactionDto,
        date: '2024-01-16T10:30:00.000Z',
        amount: -30.0,
      }

      // First call: duplicate found
      // Second call: no duplicate
      mockPrismaService.transaction.findUnique
        .mockResolvedValueOnce(mockTransaction)
        .mockResolvedValueOnce(null)

      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction2)

      const result = await service.importTransactions(mockUserId, [
        createTransactionDto,
        newTransaction,
      ])

      expect(result).toEqual({
        imported: 1,
        duplicates: 1,
        total: 2,
      })
    })

    it('should compute consistent hash for same transaction data', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)
      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction)

      // Import same transaction twice (simulating two imports)
      await service.importTransactions(mockUserId, [createTransactionDto])

      const firstCallHash =
        mockPrismaService.transaction.findUnique.mock.calls[0]?.[0].where.hash

      vi.clearAllMocks()
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)
      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction)

      await service.importTransactions(mockUserId, [createTransactionDto])

      const secondCallHash =
        mockPrismaService.transaction.findUnique.mock.calls[0]?.[0].where.hash

      expect(firstCallHash).toBe(secondCallHash)
    })
  })

  describe('update', () => {
    it('should update transaction note', async () => {
      const updatedTransaction = { ...mockTransaction, note: 'New note' }
      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction)
      mockPrismaService.transaction.update.mockResolvedValue(updatedTransaction)

      const result = await service.update(mockTransaction.id, mockUserId, {
        note: 'New note',
      })

      expect(result).toEqual(updatedTransaction)
      expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
        where: { id: mockTransaction.id },
        data: { note: 'New note' },
        include: { category: true },
      })
    })

    it('should update transaction categoryId', async () => {
      const newCategoryId = '550e8400-e29b-41d4-a716-446655440020'
      const updatedTransaction = {
        ...mockTransaction,
        categoryId: newCategoryId,
      }
      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction)
      mockPrismaService.transaction.update.mockResolvedValue(updatedTransaction)

      const result = await service.update(mockTransaction.id, mockUserId, {
        categoryId: newCategoryId,
      })

      expect(result.categoryId).toBe(newCategoryId)
    })

    it('should throw NotFoundException when updating non-existent transaction', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(null)

      await expect(
        service.update('non-existent-id', mockUserId, { note: 'test' })
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('delete', () => {
    it('should delete a transaction', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction)
      mockPrismaService.transaction.delete.mockResolvedValue(mockTransaction)

      const result = await service.delete(mockTransaction.id, mockUserId)

      expect(result).toEqual(mockTransaction)
      expect(mockPrismaService.transaction.delete).toHaveBeenCalledWith({
        where: { id: mockTransaction.id },
      })
    })

    it('should throw NotFoundException when deleting non-existent transaction', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(null)

      await expect(
        service.delete('non-existent-id', mockUserId)
      ).rejects.toThrow(NotFoundException)
    })
  })
})
