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

    it('should compute different hash for transactions with different descriptions', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)
      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction)

      const transactionA = {
        ...createTransactionDto,
        description: 'Restaurant A',
      }
      const transactionB = {
        ...createTransactionDto,
        description: 'Restaurant B',
      }

      await service.importTransactions(mockUserId, [transactionA, transactionB])

      const hashA =
        mockPrismaService.transaction.findUnique.mock.calls[0]?.[0].where.hash
      const hashB =
        mockPrismaService.transaction.findUnique.mock.calls[1]?.[0].where.hash

      expect(hashA).not.toBe(hashB)
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

  describe('previewImport', () => {
    const createTransactionDto = {
      date: '2024-01-15T10:30:00.000Z',
      description: 'Restaurant',
      amount: -45.5,
      category: 'Alimentation',
      account: 'Compte Courant',
      type: TransactionType.EXPENSE,
    }

    it('should identify all new transactions when none exist in DB', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)

      const result = await service.previewImport(mockUserId, [
        createTransactionDto,
        { ...createTransactionDto, description: 'Supermarché' },
      ])

      expect(result).toEqual({
        newCount: 2,
        internalDuplicateCount: 0,
        externalDuplicateCount: 0,
        total: 2,
        internalDuplicates: [],
        externalDuplicates: [],
      })
    })

    it('should identify external duplicates (existing in DB)', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        ...mockTransaction,
        category: mockCategory,
      })

      const result = await service.previewImport(mockUserId, [
        createTransactionDto,
      ])

      expect(result.newCount).toBe(0)
      expect(result.externalDuplicateCount).toBe(1)
      expect(result.externalDuplicates).toHaveLength(1)
      expect(result.externalDuplicates[0]?.uploaded.description).toBe(
        'Restaurant'
      )
      expect(result.externalDuplicates[0]?.existing.id).toBe(mockTransaction.id)
    })

    it('should identify internal duplicates (same transaction twice in import)', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)

      const result = await service.previewImport(mockUserId, [
        createTransactionDto,
        createTransactionDto, // Same transaction = internal duplicate
      ])

      expect(result.newCount).toBe(0)
      expect(result.internalDuplicateCount).toBe(1)
      expect(result.internalDuplicates).toHaveLength(1)
      expect(result.internalDuplicates[0]?.indices).toEqual([0, 1])
      expect(result.internalDuplicates[0]?.transactions).toHaveLength(2)
    })

    it('should handle mixed new, internal and external duplicates', async () => {
      const newTx = { ...createTransactionDto, description: 'New Restaurant' }
      const duplicateInDb = createTransactionDto
      const internalDup1 = {
        ...createTransactionDto,
        description: 'Supermarché',
      }
      const internalDup2 = {
        ...createTransactionDto,
        description: 'Supermarché',
      }

      mockPrismaService.transaction.findUnique
        .mockResolvedValueOnce(null) // newTx - new
        .mockResolvedValueOnce({ ...mockTransaction, category: mockCategory }) // duplicateInDb - external duplicate
        .mockResolvedValueOnce(null) // internalDup1 - first occurrence (new)

      const result = await service.previewImport(mockUserId, [
        newTx,
        duplicateInDb,
        internalDup1,
        internalDup2,
      ])

      expect(result.newCount).toBe(1) // Only newTx
      expect(result.externalDuplicateCount).toBe(1) // duplicateInDb
      expect(result.internalDuplicateCount).toBe(1) // internalDup1 + internalDup2
      expect(result.total).toBe(4)
    })

    it('should handle empty transactions array', async () => {
      const result = await service.previewImport(mockUserId, [])

      expect(result).toEqual({
        newCount: 0,
        internalDuplicateCount: 0,
        externalDuplicateCount: 0,
        total: 0,
        internalDuplicates: [],
        externalDuplicates: [],
      })
    })

    it('should handle 3+ internal duplicates in same group', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)

      const result = await service.previewImport(mockUserId, [
        createTransactionDto,
        createTransactionDto,
        createTransactionDto,
      ])

      expect(result.newCount).toBe(0)
      expect(result.internalDuplicateCount).toBe(1)
      expect(result.internalDuplicates[0]?.indices).toEqual([0, 1, 2])
      expect(result.internalDuplicates[0]?.transactions).toHaveLength(3)
    })

    it('should handle multiple internal duplicate groups', async () => {
      const tx1 = createTransactionDto
      const tx2 = { ...createTransactionDto, description: 'Supermarché' }

      mockPrismaService.transaction.findUnique.mockResolvedValue(null)

      const result = await service.previewImport(mockUserId, [
        tx1,
        tx1, // Internal dup group 1
        tx2,
        tx2, // Internal dup group 2
      ])

      expect(result.newCount).toBe(0)
      expect(result.internalDuplicateCount).toBe(2)
      expect(result.internalDuplicates).toHaveLength(2)
    })

    it('should include optional fields in uploaded transaction', async () => {
      const txWithOptionals = {
        ...createTransactionDto,
        subcategory: 'Restaurant - Italien',
        note: 'Business lunch',
      }
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)

      const result = await service.previewImport(mockUserId, [txWithOptionals])

      expect(result.newCount).toBe(1)
      // No duplicates, so check the internal tracking worked
      expect(result.internalDuplicates).toHaveLength(0)
    })

    it('should include optional fields in existing transaction', async () => {
      const existingWithOptionals = {
        ...mockTransaction,
        subcategory: 'Restaurant - Italien',
        note: 'Old note',
        category: mockCategory,
      }
      mockPrismaService.transaction.findUnique.mockResolvedValue(
        existingWithOptionals
      )

      const result = await service.previewImport(mockUserId, [
        createTransactionDto,
      ])

      expect(result.externalDuplicateCount).toBe(1)
      expect(result.externalDuplicates[0]?.existing.subcategory).toBe(
        'Restaurant - Italien'
      )
      expect(result.externalDuplicates[0]?.existing.note).toBe('Old note')
    })

    it('should not include optional fields when null in existing transaction', async () => {
      const existingNoOptionals = {
        ...mockTransaction,
        subcategory: null,
        note: null,
        category: null,
      }
      mockPrismaService.transaction.findUnique.mockResolvedValue(
        existingNoOptionals
      )

      const result = await service.previewImport(mockUserId, [
        createTransactionDto,
      ])

      expect(result.externalDuplicates[0]?.existing.subcategory).toBeUndefined()
      expect(result.externalDuplicates[0]?.existing.note).toBeUndefined()
      expect(
        result.externalDuplicates[0]?.existing.categoryName
      ).toBeUndefined()
    })

    it('should correctly set index for each uploaded transaction', async () => {
      const tx1 = { ...createTransactionDto, description: 'First' }
      const tx2 = { ...createTransactionDto, description: 'Second' }
      const tx3 = { ...createTransactionDto, description: 'Third' }

      mockPrismaService.transaction.findUnique
        .mockResolvedValueOnce({ ...mockTransaction, category: mockCategory })
        .mockResolvedValueOnce({ ...mockTransaction, category: mockCategory })
        .mockResolvedValueOnce({ ...mockTransaction, category: mockCategory })

      const result = await service.previewImport(mockUserId, [tx1, tx2, tx3])

      expect(result.externalDuplicates[0]?.uploaded.index).toBe(0)
      expect(result.externalDuplicates[1]?.uploaded.index).toBe(1)
      expect(result.externalDuplicates[2]?.uploaded.index).toBe(2)
    })

    it('should handle internal duplicate not counting as external when first seen', async () => {
      // Internal duplicates should not trigger external duplicate check after first occurrence
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)

      const result = await service.previewImport(mockUserId, [
        createTransactionDto,
        createTransactionDto,
      ])

      // findUnique should only be called once (for first occurrence)
      expect(mockPrismaService.transaction.findUnique).toHaveBeenCalledTimes(1)
      expect(result.internalDuplicateCount).toBe(1)
      expect(result.externalDuplicateCount).toBe(0)
    })
  })

  describe('importTransactions with forceImport', () => {
    const createTransactionDto = {
      date: '2024-01-15T10:30:00.000Z',
      description: 'Restaurant',
      amount: -45.5,
      category: 'Alimentation',
      account: 'Compte Courant',
      type: TransactionType.EXPENSE,
    }

    it('should import duplicate when forceImport is true', async () => {
      // First import without forceImport
      mockPrismaService.transaction.findUnique.mockResolvedValue(
        mockTransaction
      )

      const resultWithoutForce = await service.importTransactions(mockUserId, [
        createTransactionDto,
      ])
      expect(resultWithoutForce.duplicates).toBe(1)
      expect(resultWithoutForce.imported).toBe(0)

      vi.clearAllMocks()

      // Second import with forceImport - generates unique key so hash is different
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)
      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction)

      const resultWithForce = await service.importTransactions(mockUserId, [
        { ...createTransactionDto, forceImport: true },
      ])

      expect(resultWithForce.imported).toBe(1)
      expect(resultWithForce.duplicates).toBe(0)
    })

    it('should generate different hashes with forceImport', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)
      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction)

      // Import same transaction twice with forceImport
      await service.importTransactions(mockUserId, [
        { ...createTransactionDto, forceImport: true },
        { ...createTransactionDto, forceImport: true },
      ])

      const hash1 =
        mockPrismaService.transaction.findUnique.mock.calls[0]?.[0].where.hash
      const hash2 =
        mockPrismaService.transaction.findUnique.mock.calls[1]?.[0].where.hash

      // Each should have a unique hash due to forceImport
      expect(hash1).not.toBe(hash2)
    })

    it('should mix forceImport and normal transactions in same import', async () => {
      mockPrismaService.transaction.findUnique
        .mockResolvedValueOnce(mockTransaction) // First tx - duplicate
        .mockResolvedValueOnce(null) // Second tx with forceImport - new

      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction)

      const result = await service.importTransactions(mockUserId, [
        createTransactionDto, // Will be skipped as duplicate
        { ...createTransactionDto, forceImport: true }, // Will be imported
      ])

      expect(result.imported).toBe(1)
      expect(result.duplicates).toBe(1)
      expect(mockPrismaService.transaction.create).toHaveBeenCalledTimes(1)
    })

    it('should not use forceImport when flag is false', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(
        mockTransaction
      )

      const result = await service.importTransactions(mockUserId, [
        { ...createTransactionDto, forceImport: false },
      ])

      expect(result.duplicates).toBe(1)
      expect(result.imported).toBe(0)
    })

    it('should not use forceImport when flag is undefined', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(
        mockTransaction
      )

      const result = await service.importTransactions(mockUserId, [
        { ...createTransactionDto, forceImport: undefined },
      ])

      expect(result.duplicates).toBe(1)
      expect(result.imported).toBe(0)
    })

    it('should create transaction with correct hash when forceImport is true', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)
      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction)

      await service.importTransactions(mockUserId, [
        { ...createTransactionDto, forceImport: true },
      ])

      // The hash passed to create should match the hash used for findUnique
      const searchedHash =
        mockPrismaService.transaction.findUnique.mock.calls[0]?.[0].where.hash
      const createdHash =
        mockPrismaService.transaction.create.mock.calls[0]?.[0].data.hash

      expect(searchedHash).toBe(createdHash)
      // Hash should contain "force-" pattern indicator from uniqueKey
      expect(searchedHash).toMatch(/^[a-f0-9]{64}$/) // SHA-256 hash format
    })
  })

  describe('hash computation', () => {
    const createTransactionDto = {
      date: '2024-01-15T10:30:00.000Z',
      description: 'Restaurant',
      amount: -45.5,
      category: 'Alimentation',
      account: 'Compte Courant',
      type: TransactionType.EXPENSE,
    }

    it('should compute different hash for different users', async () => {
      const otherUserId = '550e8400-e29b-41d4-a716-446655440099'
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)
      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction)

      await service.importTransactions(mockUserId, [createTransactionDto])
      const hash1 =
        mockPrismaService.transaction.findUnique.mock.calls[0]?.[0].where.hash

      vi.clearAllMocks()
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)
      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction)

      await service.importTransactions(otherUserId, [createTransactionDto])
      const hash2 =
        mockPrismaService.transaction.findUnique.mock.calls[0]?.[0].where.hash

      expect(hash1).not.toBe(hash2)
    })

    it('should compute different hash for different dates', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)
      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction)

      await service.importTransactions(mockUserId, [
        createTransactionDto,
        { ...createTransactionDto, date: '2024-01-16T10:30:00.000Z' },
      ])

      const hash1 =
        mockPrismaService.transaction.findUnique.mock.calls[0]?.[0].where.hash
      const hash2 =
        mockPrismaService.transaction.findUnique.mock.calls[1]?.[0].where.hash

      expect(hash1).not.toBe(hash2)
    })

    it('should compute different hash for different amounts', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)
      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction)

      await service.importTransactions(mockUserId, [
        createTransactionDto,
        { ...createTransactionDto, amount: -50.0 },
      ])

      const hash1 =
        mockPrismaService.transaction.findUnique.mock.calls[0]?.[0].where.hash
      const hash2 =
        mockPrismaService.transaction.findUnique.mock.calls[1]?.[0].where.hash

      expect(hash1).not.toBe(hash2)
    })

    it('should compute different hash for different accounts', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)
      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction)

      await service.importTransactions(mockUserId, [
        createTransactionDto,
        { ...createTransactionDto, account: 'Autre Compte' },
      ])

      const hash1 =
        mockPrismaService.transaction.findUnique.mock.calls[0]?.[0].where.hash
      const hash2 =
        mockPrismaService.transaction.findUnique.mock.calls[1]?.[0].where.hash

      expect(hash1).not.toBe(hash2)
    })

    it('should compute same hash regardless of category (category not in hash)', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null)
      mockCategoriesService.findOrCreate.mockResolvedValue(mockCategory)
      mockPrismaService.transaction.create.mockResolvedValue(mockTransaction)

      await service.importTransactions(mockUserId, [
        createTransactionDto,
        { ...createTransactionDto, category: 'Transport' },
      ])

      const hash1 =
        mockPrismaService.transaction.findUnique.mock.calls[0]?.[0].where.hash
      const hash2 =
        mockPrismaService.transaction.findUnique.mock.calls[1]?.[0].where.hash

      // Category is NOT part of hash computation, so hashes should be same
      expect(hash1).toBe(hash2)
    })
  })
})
