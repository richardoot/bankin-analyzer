import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { TransactionsService } from './transactions.service'
import { PrismaService } from '../prisma/prisma.service'
import { CategoriesService } from '../categories/categories.service'
import { SubcategoriesService } from '../subcategories/subcategories.service'
import { AccountsService } from '../accounts/accounts.service'
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
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}

const mockCategoriesService = {
  findOrCreate: vi.fn(),
  findOrCreateMany: vi.fn(),
}

const mockSubcategoriesService = {
  findOrCreate: vi.fn(),
  findOrCreateMany: vi
    .fn()
    .mockResolvedValue({ subcategories: [], newCount: 0 }),
}

const mockAccountsService = {
  upsertByName: vi.fn().mockResolvedValue({
    id: 'account-id',
    name: 'Compte Courant',
    type: 'STANDARD',
    divisor: 1,
  }),
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
        {
          provide: SubcategoriesService,
          useValue: mockSubcategoriesService,
        },
        {
          provide: AccountsService,
          useValue: mockAccountsService,
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
        include: { category: true, subcategoryRef: true },
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
        include: { category: true, subcategoryRef: true },
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
        include: { category: true, subcategoryRef: true },
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
        include: { category: true, subcategoryRef: true },
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
        include: { category: true, subcategoryRef: true },
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
      // Batch lookup returns no existing hashes
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 })

      const result = await service.importTransactions(mockUserId, [
        createTransactionDto,
      ])

      expect(result).toEqual({
        imported: 1,
        duplicates: 0,
        total: 1,
      })
      expect(mockCategoriesService.findOrCreateMany).toHaveBeenCalledWith(
        mockUserId,
        [{ name: 'Alimentation', type: TransactionType.EXPENSE }]
      )
      expect(mockPrismaService.transaction.createMany).toHaveBeenCalled()
    })

    it('should skip duplicate transactions based on hash', async () => {
      // Batch lookup returns the same hash that was queried
      mockPrismaService.transaction.findMany.mockImplementation(({ where }) => {
        if (where?.hash?.in) {
          return Promise.resolve(
            where.hash.in.map((hash: string) => ({ hash }))
          )
        }
        return Promise.resolve([])
      })

      const result = await service.importTransactions(mockUserId, [
        createTransactionDto,
      ])

      expect(result).toEqual({
        imported: 0,
        duplicates: 1,
        total: 1,
      })
      expect(mockPrismaService.transaction.createMany).not.toHaveBeenCalled()
    })

    it('should handle mixed new and duplicate transactions', async () => {
      const newTransaction = {
        ...createTransactionDto,
        date: '2024-01-16T10:30:00.000Z',
        amount: -30.0,
      }

      // First findMany call returns one existing hash (for first transaction)
      // We need to compute the hash that would be computed for createTransactionDto
      mockPrismaService.transaction.findMany.mockImplementation(({ where }) => {
        // Return one hash (simulating first transaction is a duplicate)
        if (where?.hash?.in && where.hash.in.length === 2) {
          return Promise.resolve([{ hash: where.hash.in[0] }])
        }
        return Promise.resolve([])
      })

      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 })

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
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 })

      // Import same transaction twice (simulating two imports)
      await service.importTransactions(mockUserId, [createTransactionDto])

      // Get the hashes from the first findMany call
      const firstCallHashes =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash.in

      vi.clearAllMocks()
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 })

      await service.importTransactions(mockUserId, [createTransactionDto])

      const secondCallHashes =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash.in

      expect(firstCallHashes[0]).toBe(secondCallHashes[0])
    })

    it('should compute different hash for transactions with different descriptions', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 2 })

      const transactionA = {
        ...createTransactionDto,
        description: 'Restaurant A',
      }
      const transactionB = {
        ...createTransactionDto,
        description: 'Restaurant B',
      }

      await service.importTransactions(mockUserId, [transactionA, transactionB])

      // Get the hashes from findMany call
      const hashes =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash.in

      // Two different descriptions should produce two different hashes
      expect(hashes.length).toBe(2)
      expect(hashes[0]).not.toBe(hashes[1])
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
        include: { category: true, subcategoryRef: true },
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
      // Batch findMany returns the existing transaction with matching hash
      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }) => {
          if (where?.hash?.in) {
            return [
              {
                ...mockTransaction,
                hash: where.hash.in[0],
                category: mockCategory,
              },
            ]
          }
          return []
        }
      )

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
      // No existing transactions in DB
      mockPrismaService.transaction.findMany.mockResolvedValue([])

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

      // findMany returns the existing transaction that matches duplicateInDb's hash
      // We need to identify which hash corresponds to duplicateInDb
      // duplicateInDb has same fields as createTransactionDto, so it will have the same hash
      // newTx has description 'New Restaurant' - different hash
      // internalDup1/2 have description 'Supermarché' - same hash (different from duplicateInDb)
      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }) => {
          if (where?.hash?.in && where.hash.in.length > 0) {
            // Return the second hash (index 1) as existing - this is duplicateInDb
            // (order in batch: newTx first, then duplicateInDb, then internalDup1/2)
            // But since we use Map, unique hashes: newTx, duplicateInDb, internalDup1 (3 unique)
            // Return the hash for duplicateInDb
            const hashes: string[] = where.hash.in as string[]
            // We'll return the second unique hash as existing (duplicateInDb's hash)
            if (hashes.length >= 2) {
              return [
                { ...mockTransaction, hash: hashes[1], category: mockCategory },
              ]
            }
          }
          return []
        }
      )

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
      mockPrismaService.transaction.findMany.mockResolvedValue([])

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

      mockPrismaService.transaction.findMany.mockResolvedValue([])

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
      mockPrismaService.transaction.findMany.mockResolvedValue([])

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
      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }) => {
          if (where?.hash?.in) {
            return [{ ...existingWithOptionals, hash: where.hash.in[0] }]
          }
          return []
        }
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
      mockPrismaService.transaction.findMany.mockResolvedValue([
        existingNoOptionals,
      ])

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

      // All three are external duplicates - return all hashes as existing
      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }) => {
          if (where?.hash?.in) {
            return where.hash.in.map((hash: string) => ({
              ...mockTransaction,
              hash,
              category: mockCategory,
            }))
          }
          return []
        }
      )

      const result = await service.previewImport(mockUserId, [tx1, tx2, tx3])

      // Check that indices are correctly assigned
      const indices = result.externalDuplicates.map(d => d.uploaded.index)
      expect(indices).toContain(0)
      expect(indices).toContain(1)
      expect(indices).toContain(2)
    })

    it('should handle internal duplicate not counting as external when first seen', async () => {
      // Internal duplicates should not trigger external duplicate check after first occurrence
      mockPrismaService.transaction.findMany.mockResolvedValue([])

      const result = await service.previewImport(mockUserId, [
        createTransactionDto,
        createTransactionDto,
      ])

      // findMany should be called once with the unique hash
      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledTimes(1)
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
      // First import without forceImport - transaction exists (return matching hash)
      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }) => {
          if (where?.hash?.in) {
            return where.hash.in.map((hash: string) => ({ hash }))
          }
          return []
        }
      )

      const resultWithoutForce = await service.importTransactions(mockUserId, [
        createTransactionDto,
      ])
      expect(resultWithoutForce.duplicates).toBe(1)
      expect(resultWithoutForce.imported).toBe(0)

      vi.clearAllMocks()

      // Second import with forceImport - forced transactions bypass normal duplicate check
      // findMany is only called for normal transactions, not for forceImport ones
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 })

      const resultWithForce = await service.importTransactions(mockUserId, [
        { ...createTransactionDto, forceImport: true },
      ])

      expect(resultWithForce.imported).toBe(1)
      expect(resultWithForce.duplicates).toBe(0)
    })

    it('should generate different hashes with forceImport', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 2 })

      // Import same transaction twice with forceImport
      await service.importTransactions(mockUserId, [
        { ...createTransactionDto, forceImport: true },
        { ...createTransactionDto, forceImport: true },
      ])

      // Check that createMany was called with different hashes
      const createdData =
        mockPrismaService.transaction.createMany.mock.calls[0]?.[0].data
      expect(createdData.length).toBe(2)
      expect(createdData[0].hash).not.toBe(createdData[1].hash)
    })

    it('should mix forceImport and normal transactions in same import', async () => {
      // Normal tx is a duplicate - return matching hash for normal tx
      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }) => {
          if (where?.hash?.in) {
            return where.hash.in.map((hash: string) => ({ hash }))
          }
          return []
        }
      )
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 })

      const result = await service.importTransactions(mockUserId, [
        createTransactionDto, // Will be skipped as duplicate
        { ...createTransactionDto, forceImport: true }, // Will be imported
      ])

      expect(result.imported).toBe(1)
      expect(result.duplicates).toBe(1)
      expect(mockPrismaService.transaction.createMany).toHaveBeenCalledTimes(1)
    })

    it('should not use forceImport when flag is false', async () => {
      // Return matching hash - this is a duplicate
      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }) => {
          if (where?.hash?.in) {
            return where.hash.in.map((hash: string) => ({ hash }))
          }
          return []
        }
      )

      const result = await service.importTransactions(mockUserId, [
        { ...createTransactionDto, forceImport: false },
      ])

      expect(result.duplicates).toBe(1)
      expect(result.imported).toBe(0)
    })

    it('should not use forceImport when flag is undefined', async () => {
      // Return matching hash - this is a duplicate
      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }) => {
          if (where?.hash?.in) {
            return where.hash.in.map((hash: string) => ({ hash }))
          }
          return []
        }
      )

      const result = await service.importTransactions(mockUserId, [
        { ...createTransactionDto, forceImport: undefined },
      ])

      expect(result.duplicates).toBe(1)
      expect(result.imported).toBe(0)
    })

    it('should create transaction with correct hash when forceImport is true', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 })

      await service.importTransactions(mockUserId, [
        { ...createTransactionDto, forceImport: true },
      ])

      // Check that createMany was called with a SHA-256 hash
      const createdData =
        mockPrismaService.transaction.createMany.mock.calls[0]?.[0].data
      expect(createdData[0].hash).toMatch(/^[a-f0-9]{64}$/) // SHA-256 hash format
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
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 })

      await service.importTransactions(mockUserId, [createTransactionDto])
      const hash1 =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash
          .in[0]

      vi.clearAllMocks()
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 })

      await service.importTransactions(otherUserId, [createTransactionDto])
      const hash2 =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash
          .in[0]

      expect(hash1).not.toBe(hash2)
    })

    it('should compute different hash for different dates', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 2 })

      await service.importTransactions(mockUserId, [
        createTransactionDto,
        { ...createTransactionDto, date: '2024-01-16T10:30:00.000Z' },
      ])

      const hashes =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash.in

      expect(hashes[0]).not.toBe(hashes[1])
    })

    it('should compute different hash for different amounts', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 2 })

      await service.importTransactions(mockUserId, [
        createTransactionDto,
        { ...createTransactionDto, amount: -50.0 },
      ])

      const hashes =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash.in

      expect(hashes[0]).not.toBe(hashes[1])
    })

    it('should compute different hash for different accounts', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 2 })

      await service.importTransactions(mockUserId, [
        createTransactionDto,
        { ...createTransactionDto, account: 'Autre Compte' },
      ])

      const hashes =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash.in

      expect(hashes[0]).not.toBe(hashes[1])
    })

    it('should compute same hash regardless of category (category not in hash)', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory, { ...mockCategory, name: 'Transport' }],
        newCount: 0,
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 })

      await service.importTransactions(mockUserId, [
        createTransactionDto,
        { ...createTransactionDto, category: 'Transport' },
      ])

      // With batch, only unique hashes are passed to findMany
      // Since category is not part of hash, both transactions have same hash
      const hashes =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash.in

      // Category is NOT part of hash computation, so only 1 unique hash
      expect(hashes.length).toBe(1)
    })
  })
})
