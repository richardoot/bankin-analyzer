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

interface FindManyArgs {
  where?: { hash?: { in?: string[] }; userId?: string }
}

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
  subcategoryId: null,
  hash: 'abc123hash',
  date: new Date('2024-01-15T10:30:00.000Z'),
  description: 'Restaurant',
  amount: new Decimal(-45.5),
  type: TransactionType.EXPENSE,
  account: 'Compte Courant',
  subcategory: 'Restaurant - Autres',
  note: null,
  isPointed: false,
  importHistoryId: null,
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
  category: mockCategory,
  subcategoryRef: null,
}

const mockTransaction2 = {
  ...mockTransaction,
  id: '550e8400-e29b-41d4-a716-446655440002',
  hash: 'def456hash',
  description: 'Supermarche',
  amount: new Decimal(-85.0),
}

const mockPrismaService = {
  transaction: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  subcategory: {
    findUnique: vi.fn(),
  },
}

const mockCategoriesService = {
  findOrCreateMany: vi.fn(),
}

const mockSubcategoriesService = {
  findOrCreateMany: vi.fn(),
}

const mockAccountsService = {
  upsertByName: vi.fn(),
}

describe('TransactionsService', () => {
  let service: TransactionsService

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CategoriesService, useValue: mockCategoriesService },
        { provide: SubcategoriesService, useValue: mockSubcategoriesService },
        { provide: AccountsService, useValue: mockAccountsService },
      ],
    }).compile()

    service = module.get<TransactionsService>(TransactionsService)
  })

  // -------------------------------------------------------------------
  // findOne
  // -------------------------------------------------------------------
  describe('findOne', () => {
    it('should return a transaction when found', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction)

      const result = await service.findOne(mockTransaction.id, mockUserId)

      expect(result).toEqual(mockTransaction)
      expect(mockPrismaService.transaction.findFirst).toHaveBeenCalledWith({
        where: { id: mockTransaction.id, userId: mockUserId },
        include: { category: true, subcategoryRef: true },
      })
    })

    it('should throw NotFoundException when not found', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(null)

      await expect(
        service.findOne('non-existent-id', mockUserId)
      ).rejects.toThrow(NotFoundException)
    })
  })

  // -------------------------------------------------------------------
  // findAllByUser
  // -------------------------------------------------------------------
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

    it('should apply type filter', async () => {
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

    it('should apply date range filter', async () => {
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

    it('should apply categoryId filter', async () => {
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

  // -------------------------------------------------------------------
  // findAllByUserPaginated
  // -------------------------------------------------------------------
  describe('findAllByUserPaginated', () => {
    it('should return data and total count', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([
        mockTransaction,
      ])
      mockPrismaService.transaction.count.mockResolvedValue(25)

      const result = await service.findAllByUserPaginated(mockUserId, {
        page: 1,
        limit: 10,
      })

      expect(result).toEqual({ data: [mockTransaction], total: 25 })
    })

    it('should apply pagination skip and take', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockPrismaService.transaction.count.mockResolvedValue(0)

      await service.findAllByUserPaginated(mockUserId, { page: 3, limit: 20 })

      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40, // (3 - 1) * 20
          take: 20,
        })
      )
    })

    it('should apply type filter', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockPrismaService.transaction.count.mockResolvedValue(0)

      await service.findAllByUserPaginated(
        mockUserId,
        { page: 1, limit: 10 },
        { type: TransactionType.INCOME }
      )

      const expectedWhere = {
        userId: mockUserId,
        type: TransactionType.INCOME,
      }
      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere })
      )
      expect(mockPrismaService.transaction.count).toHaveBeenCalledWith({
        where: expectedWhere,
      })
    })

    it('should apply isPointed filter', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockPrismaService.transaction.count.mockResolvedValue(0)

      await service.findAllByUserPaginated(
        mockUserId,
        { page: 1, limit: 10 },
        { isPointed: true }
      )

      const expectedWhere = {
        userId: mockUserId,
        isPointed: true,
      }
      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere })
      )
    })

    it('should apply date range filter', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockPrismaService.transaction.count.mockResolvedValue(0)
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')

      await service.findAllByUserPaginated(
        mockUserId,
        { page: 1, limit: 10 },
        { startDate, endDate }
      )

      const expectedWhere = {
        userId: mockUserId,
        date: { gte: startDate, lte: endDate },
      }
      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere })
      )
    })
  })

  // -------------------------------------------------------------------
  // previewImport
  // -------------------------------------------------------------------
  describe('previewImport', () => {
    const createTransactionDto = {
      date: '2024-01-15T10:30:00.000Z',
      description: 'Restaurant',
      amount: -45.5,
      category: 'Alimentation',
      account: 'Compte Courant',
      type: TransactionType.EXPENSE,
    }

    it('should return empty result for empty array', async () => {
      const result = await service.previewImport(mockUserId, [])

      expect(result).toEqual({
        newCount: 0,
        internalDuplicateCount: 0,
        externalDuplicateCount: 0,
        total: 0,
        internalDuplicates: [],
        externalDuplicates: [],
      })
      expect(mockPrismaService.transaction.findMany).not.toHaveBeenCalled()
    })

    it('should detect new unique transactions', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])

      const result = await service.previewImport(mockUserId, [
        createTransactionDto,
        { ...createTransactionDto, description: 'Supermarche' },
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

    it('should detect internal duplicates (same hash in batch)', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])

      const result = await service.previewImport(mockUserId, [
        createTransactionDto,
        createTransactionDto, // same data = same hash
      ])

      expect(result.newCount).toBe(0)
      expect(result.internalDuplicateCount).toBe(1)
      expect(result.internalDuplicates).toHaveLength(1)
      expect(result.internalDuplicates[0]?.indices).toEqual([0, 1])
      expect(result.internalDuplicates[0]?.transactions).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('should detect external duplicates (hash exists in DB)', async () => {
      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }: FindManyArgs) => {
          if (where?.hash?.in) {
            const hash = where.hash.in[0]
            return [{ ...mockTransaction, hash, category: mockCategory }]
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
      expect(result.total).toBe(1)
    })

    it('should handle mix of new, internal and external duplicates', async () => {
      const newTx = { ...createTransactionDto, description: 'New Restaurant' }
      const duplicateInDb = createTransactionDto
      const internalDup1 = {
        ...createTransactionDto,
        description: 'Supermarche',
      }
      const internalDup2 = {
        ...createTransactionDto,
        description: 'Supermarche',
      }

      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }: FindManyArgs) => {
          if (where?.hash?.in && where.hash.in.length > 0) {
            const hashes = where.hash.in
            // Return the second unique hash as existing (duplicateInDb's hash)
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

      expect(result.newCount).toBe(1) // newTx
      expect(result.externalDuplicateCount).toBe(1) // duplicateInDb
      expect(result.internalDuplicateCount).toBe(1) // internalDup1 + internalDup2
      expect(result.total).toBe(4)
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
      const tx2 = { ...createTransactionDto, description: 'Supermarche' }

      mockPrismaService.transaction.findMany.mockResolvedValue([])

      const result = await service.previewImport(mockUserId, [
        tx1,
        tx1, // group 1
        tx2,
        tx2, // group 2
      ])

      expect(result.newCount).toBe(0)
      expect(result.internalDuplicateCount).toBe(2)
      expect(result.internalDuplicates).toHaveLength(2)
    })

    it('should include optional fields in uploaded transaction dto', async () => {
      const txWithOptionals = {
        ...createTransactionDto,
        subcategory: 'Restaurant - Italien',
        note: 'Business lunch',
      }
      mockPrismaService.transaction.findMany.mockResolvedValue([])

      const result = await service.previewImport(mockUserId, [txWithOptionals])

      expect(result.newCount).toBe(1)
      expect(result.internalDuplicates).toHaveLength(0)
      expect(result.externalDuplicates).toHaveLength(0)
    })

    it('should include optional fields in existing transaction dto', async () => {
      const existingWithOptionals = {
        ...mockTransaction,
        subcategory: 'Restaurant - Italien',
        note: 'Old note',
        category: mockCategory,
      }
      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }: FindManyArgs) => {
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
      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }: FindManyArgs) => {
          if (where?.hash?.in) {
            return [{ ...existingNoOptionals, hash: where.hash.in[0] }]
          }
          return []
        }
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

      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }: FindManyArgs) => {
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

      const indices = result.externalDuplicates.map(
        (d: { uploaded: { index: number } }) => d.uploaded.index
      )
      expect(indices).toContain(0)
      expect(indices).toContain(1)
      expect(indices).toContain(2)
    })

    it('should perform only one DB query for batch hash lookup', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])

      await service.previewImport(mockUserId, [
        createTransactionDto,
        createTransactionDto,
      ])

      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------
  // importTransactions
  // -------------------------------------------------------------------
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

    const setupImportMocks = (): void => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockSubcategoriesService.findOrCreateMany.mockResolvedValue({
        subcategories: [],
        newCount: 0,
      })
      mockAccountsService.upsertByName.mockResolvedValue({
        id: 'account-id',
        name: 'Compte Courant',
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 })
    }

    it('should return empty result for empty array', async () => {
      const result = await service.importTransactions(mockUserId, [])

      expect(result).toEqual({ imported: 0, duplicates: 0, total: 0 })
      expect(mockPrismaService.transaction.createMany).not.toHaveBeenCalled()
    })

    it('should import new transactions (calls createMany)', async () => {
      setupImportMocks()

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
      expect(mockPrismaService.transaction.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: mockUserId,
            description: 'Restaurant',
            amount: -45.5,
            account: 'Compte Courant',
            categoryId: mockCategory.id,
            type: TransactionType.EXPENSE,
          }),
        ]),
        skipDuplicates: true,
      })
    })

    it('should skip duplicates found in DB', async () => {
      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }: FindManyArgs) => {
          if (where?.hash?.in) {
            return where.hash.in.map((hash: string) => ({ hash }))
          }
          return []
        }
      )

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

    it('should handle forceImport flag (generates unique key)', async () => {
      setupImportMocks()

      const result = await service.importTransactions(mockUserId, [
        { ...createTransactionDto, forceImport: true },
      ])

      expect(result.imported).toBe(1)
      expect(result.total).toBe(1)
      expect(mockPrismaService.transaction.createMany).toHaveBeenCalled()

      // Verify the hash is a valid SHA-256 format
      const createdData =
        mockPrismaService.transaction.createMany.mock.calls[0]?.[0].data
      expect(createdData[0].hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should generate different hashes for multiple forceImport transactions', async () => {
      setupImportMocks()
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 2 })

      await service.importTransactions(mockUserId, [
        { ...createTransactionDto, forceImport: true },
        { ...createTransactionDto, forceImport: true },
      ])

      const createdData =
        mockPrismaService.transaction.createMany.mock.calls[0]?.[0].data
      expect(createdData.length).toBe(2)
      expect(createdData[0].hash).not.toBe(createdData[1].hash)
    })

    it('should create categories and subcategories during import', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 })
      mockAccountsService.upsertByName.mockResolvedValue({
        id: 'account-id',
        name: 'Compte Courant',
      })
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockSubcategoriesService.findOrCreateMany.mockResolvedValue({
        subcategories: [
          { id: 'sub-1', categoryId: mockCategory.id, name: 'Vegetables' },
        ],
        newCount: 1,
      })

      const dto = {
        ...createTransactionDto,
        subcategory: 'Vegetables',
      }
      await service.importTransactions(mockUserId, [dto])

      expect(mockCategoriesService.findOrCreateMany).toHaveBeenCalledWith(
        mockUserId,
        [{ name: 'Alimentation', type: TransactionType.EXPENSE }]
      )
      expect(mockSubcategoriesService.findOrCreateMany).toHaveBeenCalledWith(
        mockUserId,
        [{ categoryId: mockCategory.id, name: 'Vegetables' }]
      )
    })

    it('should create accounts during import', async () => {
      setupImportMocks()

      const dto = { ...createTransactionDto, account: 'Savings' }
      mockAccountsService.upsertByName.mockResolvedValue({
        id: 'acc-2',
        name: 'Savings',
      })

      await service.importTransactions(mockUserId, [dto])

      expect(mockAccountsService.upsertByName).toHaveBeenCalledWith(
        mockUserId,
        'Savings'
      )
    })

    it('should create multiple unique accounts during import', async () => {
      setupImportMocks()
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 2 })
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })

      const dto1 = { ...createTransactionDto, account: 'Account A' }
      const dto2 = {
        ...createTransactionDto,
        account: 'Account B',
        description: 'Different',
      }

      await service.importTransactions(mockUserId, [dto1, dto2])

      expect(mockAccountsService.upsertByName).toHaveBeenCalledWith(
        mockUserId,
        'Account A'
      )
      expect(mockAccountsService.upsertByName).toHaveBeenCalledWith(
        mockUserId,
        'Account B'
      )
    })

    it('should handle mixed new and duplicate transactions', async () => {
      const newTransaction = {
        ...createTransactionDto,
        date: '2024-01-16T10:30:00.000Z',
        amount: -30.0,
      }

      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }: FindManyArgs) => {
          if (where?.hash?.in && where.hash.in.length === 2) {
            return [{ hash: where.hash.in[0] }]
          }
          return []
        }
      )
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockSubcategoriesService.findOrCreateMany.mockResolvedValue({
        subcategories: [],
        newCount: 0,
      })
      mockAccountsService.upsertByName.mockResolvedValue({
        id: 'account-id',
        name: 'Compte Courant',
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

    it('should mix forceImport and normal transactions in same import', async () => {
      mockPrismaService.transaction.findMany.mockImplementation(
        async ({ where }: FindManyArgs) => {
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
      mockSubcategoriesService.findOrCreateMany.mockResolvedValue({
        subcategories: [],
        newCount: 0,
      })
      mockAccountsService.upsertByName.mockResolvedValue({
        id: 'account-id',
        name: 'Compte Courant',
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 })

      const result = await service.importTransactions(mockUserId, [
        createTransactionDto, // duplicate, will be skipped
        { ...createTransactionDto, forceImport: true }, // forced, will be imported
      ])

      expect(result.imported).toBe(1)
      expect(result.duplicates).toBe(1)
      expect(mockPrismaService.transaction.createMany).toHaveBeenCalledTimes(1)
    })

    it('should link transactions to importHistoryId when provided', async () => {
      setupImportMocks()
      const importHistoryId = 'import-history-1'

      await service.importTransactions(
        mockUserId,
        [createTransactionDto],
        importHistoryId
      )

      const createdData =
        mockPrismaService.transaction.createMany.mock.calls[0]?.[0].data
      expect(createdData[0].importHistoryId).toBe(importHistoryId)
    })

    it('should set importHistoryId to null when not provided', async () => {
      setupImportMocks()

      await service.importTransactions(mockUserId, [createTransactionDto])

      const createdData =
        mockPrismaService.transaction.createMany.mock.calls[0]?.[0].data
      expect(createdData[0].importHistoryId).toBeNull()
    })

    it('should compute consistent hash for same transaction data', async () => {
      setupImportMocks()

      await service.importTransactions(mockUserId, [createTransactionDto])
      const firstCallHashes =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash.in

      vi.clearAllMocks()
      setupImportMocks()

      await service.importTransactions(mockUserId, [createTransactionDto])
      const secondCallHashes =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash.in

      expect(firstCallHashes[0]).toBe(secondCallHashes[0])
    })
  })

  // -------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------
  describe('update', () => {
    it('should update transaction fields', async () => {
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

    it('should verify ownership (calls findOne first)', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(null)

      await expect(
        service.update(mockTransaction.id, mockUserId, { note: 'test' })
      ).rejects.toThrow(NotFoundException)

      expect(mockPrismaService.transaction.update).not.toHaveBeenCalled()
    })

    it('should update categoryId', async () => {
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
      expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
        where: { id: mockTransaction.id },
        data: { categoryId: newCategoryId },
        include: { category: true, subcategoryRef: true },
      })
    })

    it('should update isPointed', async () => {
      const updatedTransaction = { ...mockTransaction, isPointed: true }
      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction)
      mockPrismaService.transaction.update.mockResolvedValue(updatedTransaction)

      const result = await service.update(mockTransaction.id, mockUserId, {
        isPointed: true,
      })

      expect(result.isPointed).toBe(true)
      expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
        where: { id: mockTransaction.id },
        data: { isPointed: true },
        include: { category: true, subcategoryRef: true },
      })
    })

    it('should update subcategory string when subcategoryId is set', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction)
      mockPrismaService.subcategory.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'Vegetables',
      })
      const updatedTransaction = {
        ...mockTransaction,
        subcategoryId: 'sub-1',
        subcategory: 'Vegetables',
      }
      mockPrismaService.transaction.update.mockResolvedValue(updatedTransaction)

      const result = await service.update(mockTransaction.id, mockUserId, {
        subcategoryId: 'sub-1',
      })

      expect(result).toEqual(updatedTransaction)
      expect(mockPrismaService.subcategory.findUnique).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
      })
      expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
        where: { id: mockTransaction.id },
        data: {
          subcategoryId: 'sub-1',
          subcategory: 'Vegetables',
        },
        include: { category: true, subcategoryRef: true },
      })
    })

    it('should set subcategory to null when subcategoryId is null', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction)
      const updatedTransaction = {
        ...mockTransaction,
        subcategoryId: null,
        subcategory: null,
      }
      mockPrismaService.transaction.update.mockResolvedValue(updatedTransaction)

      await service.update(mockTransaction.id, mockUserId, {
        subcategoryId: null,
      })

      expect(mockPrismaService.subcategory.findUnique).not.toHaveBeenCalled()
      expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
        where: { id: mockTransaction.id },
        data: {
          subcategoryId: null,
          subcategory: null,
        },
        include: { category: true, subcategoryRef: true },
      })
    })
  })

  // -------------------------------------------------------------------
  // bulkUpdate
  // -------------------------------------------------------------------
  describe('bulkUpdate', () => {
    it('should bulk update transactions for the user', async () => {
      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 3 })

      const result = await service.bulkUpdate(
        mockUserId,
        ['tx-1', 'tx-2', 'tx-3'],
        { categoryId: 'cat-2' }
      )

      expect(result).toEqual({ updated: 3 })
      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['tx-1', 'tx-2', 'tx-3'] },
          userId: mockUserId,
        },
        data: { categoryId: 'cat-2' },
      })
    })

    it('should bulk update isPointed', async () => {
      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 2 })

      const result = await service.bulkUpdate(mockUserId, ['tx-1', 'tx-2'], {
        isPointed: true,
      })

      expect(result).toEqual({ updated: 2 })
      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['tx-1', 'tx-2'] },
          userId: mockUserId,
        },
        data: { isPointed: true },
      })
    })

    it('should return zero when no transactions match', async () => {
      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 0 })

      const result = await service.bulkUpdate(mockUserId, ['nonexistent'], {
        categoryId: 'cat-1',
      })

      expect(result).toEqual({ updated: 0 })
    })
  })

  // -------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------
  describe('delete', () => {
    it('should delete transaction after ownership check', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction)
      mockPrismaService.transaction.delete.mockResolvedValue(mockTransaction)

      const result = await service.delete(mockTransaction.id, mockUserId)

      expect(result).toEqual(mockTransaction)
      expect(mockPrismaService.transaction.findFirst).toHaveBeenCalledWith({
        where: { id: mockTransaction.id, userId: mockUserId },
        include: { category: true, subcategoryRef: true },
      })
      expect(mockPrismaService.transaction.delete).toHaveBeenCalledWith({
        where: { id: mockTransaction.id },
      })
    })

    it('should throw NotFoundException when deleting non-existent transaction', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(null)

      await expect(
        service.delete('non-existent-id', mockUserId)
      ).rejects.toThrow(NotFoundException)

      expect(mockPrismaService.transaction.delete).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------
  // hash computation
  // -------------------------------------------------------------------
  describe('hash computation', () => {
    const createTransactionDto = {
      date: '2024-01-15T10:30:00.000Z',
      description: 'Restaurant',
      amount: -45.5,
      category: 'Alimentation',
      account: 'Compte Courant',
      type: TransactionType.EXPENSE,
    }

    const setupHashMocks = (): void => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory],
        newCount: 0,
      })
      mockSubcategoriesService.findOrCreateMany.mockResolvedValue({
        subcategories: [],
        newCount: 0,
      })
      mockAccountsService.upsertByName.mockResolvedValue({
        id: 'account-id',
        name: 'Compte Courant',
      })
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 1 })
    }

    it('should compute different hash for different users', async () => {
      const otherUserId = '550e8400-e29b-41d4-a716-446655440099'
      setupHashMocks()

      await service.importTransactions(mockUserId, [createTransactionDto])
      const hash1 =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash
          .in[0]

      vi.clearAllMocks()
      setupHashMocks()

      await service.importTransactions(otherUserId, [createTransactionDto])
      const hash2 =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash
          .in[0]

      expect(hash1).not.toBe(hash2)
    })

    it('should compute different hash for different descriptions', async () => {
      setupHashMocks()
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 2 })

      await service.importTransactions(mockUserId, [
        createTransactionDto,
        { ...createTransactionDto, description: 'Restaurant B' },
      ])

      const hashes =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash.in

      expect(hashes.length).toBe(2)
      expect(hashes[0]).not.toBe(hashes[1])
    })

    it('should compute different hash for different amounts', async () => {
      setupHashMocks()
      mockPrismaService.transaction.createMany.mockResolvedValue({ count: 2 })

      await service.importTransactions(mockUserId, [
        createTransactionDto,
        { ...createTransactionDto, amount: -50.0 },
      ])

      const hashes =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash.in

      expect(hashes[0]).not.toBe(hashes[1])
    })

    it('should compute same hash regardless of category (category not in hash)', async () => {
      setupHashMocks()
      mockCategoriesService.findOrCreateMany.mockResolvedValue({
        categories: [mockCategory, { ...mockCategory, name: 'Transport' }],
        newCount: 0,
      })

      await service.importTransactions(mockUserId, [
        createTransactionDto,
        { ...createTransactionDto, category: 'Transport' },
      ])

      const hashes =
        mockPrismaService.transaction.findMany.mock.calls[0]?.[0].where.hash.in

      // Category is NOT part of hash computation, so only 1 unique hash
      expect(hashes.length).toBe(1)
    })
  })
})
