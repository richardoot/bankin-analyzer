import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { ImportHistoriesService } from './import-histories.service'
import { PrismaService } from '../prisma/prisma.service'
import { ImportStatus, TransactionType } from '../generated/prisma'

const mockUserId = '550e8400-e29b-41d4-a716-446655440001'
const mockImportId = '550e8400-e29b-41d4-a716-446655440100'

const mockImportHistory = {
  id: mockImportId,
  userId: mockUserId,
  status: ImportStatus.COMPLETED,
  transactionsImported: 10,
  categoriesCreated: 2,
  duplicatesSkipped: 1,
  totalInFile: 11,
  dateRangeStart: new Date('2024-01-01'),
  dateRangeEnd: new Date('2024-01-31'),
  accounts: ['Compte Courant'],
  fileName: 'export.csv',
  createdAt: new Date('2024-02-01'),
}

const mockPrismaService = {
  importHistory: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  transaction: {
    deleteMany: vi.fn(),
  },
  category: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  account: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  filterPreferences: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}

describe('ImportHistoriesService', () => {
  let service: ImportHistoriesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportHistoriesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile()

    service = module.get<ImportHistoriesService>(ImportHistoriesService)

    vi.clearAllMocks()
  })

  describe('findAllByUser', () => {
    it('should return all imports for a user', async () => {
      mockPrismaService.importHistory.findMany.mockResolvedValue([
        mockImportHistory,
      ])

      const result = await service.findAllByUser(mockUserId)

      expect(result).toEqual([mockImportHistory])
      expect(mockPrismaService.importHistory.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        orderBy: { createdAt: 'desc' },
      })
    })
  })

  describe('findById', () => {
    it('should return an import by id', async () => {
      mockPrismaService.importHistory.findFirst.mockResolvedValue(
        mockImportHistory
      )

      const result = await service.findById(mockImportId, mockUserId)

      expect(result).toEqual(mockImportHistory)
      expect(mockPrismaService.importHistory.findFirst).toHaveBeenCalledWith({
        where: { id: mockImportId, userId: mockUserId },
      })
    })

    it('should return null if not found', async () => {
      mockPrismaService.importHistory.findFirst.mockResolvedValue(null)

      const result = await service.findById('non-existent', mockUserId)

      expect(result).toBeNull()
    })
  })

  describe('getLatestImportDate', () => {
    it('should return the latest import date', async () => {
      const latestDate = new Date('2024-01-31')
      mockPrismaService.importHistory.findFirst.mockResolvedValue({
        dateRangeEnd: latestDate,
      })

      const result = await service.getLatestImportDate(mockUserId)

      expect(result).toEqual(latestDate)
    })

    it('should return null if no imports', async () => {
      mockPrismaService.importHistory.findFirst.mockResolvedValue(null)

      const result = await service.getLatestImportDate(mockUserId)

      expect(result).toBeNull()
    })
  })

  describe('startImport', () => {
    it('should create an import with IN_PROGRESS status', async () => {
      const newImport = {
        ...mockImportHistory,
        status: ImportStatus.IN_PROGRESS,
        transactionsImported: 0,
      }
      mockPrismaService.importHistory.create.mockResolvedValue(newImport)

      const result = await service.startImport(mockUserId, {
        totalInFile: 11,
        fileName: 'export.csv',
      })

      expect(result).toEqual(newImport)
      expect(mockPrismaService.importHistory.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          totalInFile: 11,
          fileName: 'export.csv',
          status: ImportStatus.IN_PROGRESS,
        },
      })
    })
  })

  describe('finalizeImport', () => {
    it('should update import with final statistics', async () => {
      mockPrismaService.importHistory.findFirst.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.importHistory.update.mockResolvedValue(
        mockImportHistory
      )

      const result = await service.finalizeImport(mockImportId, mockUserId, {
        transactionsImported: 10,
        categoriesCreated: 2,
        duplicatesSkipped: 1,
        dateRangeStart: new Date('2024-01-01'),
        dateRangeEnd: new Date('2024-01-31'),
        accounts: ['Compte Courant'],
      })

      expect(result).toEqual(mockImportHistory)
      expect(mockPrismaService.importHistory.update).toHaveBeenCalledWith({
        where: { id: mockImportId },
        data: expect.objectContaining({
          status: ImportStatus.COMPLETED,
          transactionsImported: 10,
        }),
      })
    })

    it('should throw NotFoundException if import not found', async () => {
      mockPrismaService.importHistory.findFirst.mockResolvedValue(null)

      await expect(
        service.finalizeImport(mockImportId, mockUserId, {
          transactionsImported: 10,
          categoriesCreated: 2,
          duplicatesSkipped: 1,
          dateRangeStart: new Date('2024-01-01'),
          dateRangeEnd: new Date('2024-01-31'),
          accounts: ['Compte Courant'],
        })
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('markAsFailed', () => {
    it('should mark import as failed', async () => {
      const failedImport = { ...mockImportHistory, status: ImportStatus.FAILED }
      mockPrismaService.importHistory.findFirst.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.importHistory.update.mockResolvedValue(failedImport)

      const result = await service.markAsFailed(mockImportId, mockUserId)

      expect(result.status).toBe(ImportStatus.FAILED)
    })

    it('should throw NotFoundException if import not found', async () => {
      mockPrismaService.importHistory.findFirst.mockResolvedValue(null)

      await expect(
        service.markAsFailed(mockImportId, mockUserId)
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('deleteImport', () => {
    it('should throw NotFoundException if import not found', async () => {
      mockPrismaService.importHistory.findFirst.mockResolvedValue(null)

      await expect(
        service.deleteImport(mockImportId, mockUserId)
      ).rejects.toThrow(NotFoundException)
    })

    it('should delete transactions linked to the import', async () => {
      mockPrismaService.importHistory.findFirst.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.transaction.deleteMany.mockResolvedValue({ count: 10 })
      mockPrismaService.importHistory.delete.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.category.findMany.mockResolvedValue([])
      mockPrismaService.account.findMany.mockResolvedValue([])

      await service.deleteImport(mockImportId, mockUserId)

      expect(mockPrismaService.transaction.deleteMany).toHaveBeenCalledWith({
        where: { importHistoryId: mockImportId, userId: mockUserId },
      })
    })

    it('should delete the import history record', async () => {
      mockPrismaService.importHistory.findFirst.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.transaction.deleteMany.mockResolvedValue({ count: 10 })
      mockPrismaService.importHistory.delete.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.category.findMany.mockResolvedValue([])
      mockPrismaService.account.findMany.mockResolvedValue([])

      await service.deleteImport(mockImportId, mockUserId)

      expect(mockPrismaService.importHistory.delete).toHaveBeenCalledWith({
        where: { id: mockImportId },
      })
    })

    it('should delete orphan categories (categories with no transactions)', async () => {
      const orphanCategory = {
        id: 'cat-1',
        name: 'Alimentation',
        userId: mockUserId,
        type: TransactionType.EXPENSE,
        _count: { transactions: 0 },
      }
      const categoryWithTx = {
        id: 'cat-2',
        name: 'Transport',
        userId: mockUserId,
        type: TransactionType.EXPENSE,
        _count: { transactions: 5 },
      }

      mockPrismaService.importHistory.findFirst.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.transaction.deleteMany.mockResolvedValue({ count: 10 })
      mockPrismaService.importHistory.delete.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.category.findMany.mockResolvedValue([
        orphanCategory,
        categoryWithTx,
      ])
      mockPrismaService.filterPreferences.findUnique.mockResolvedValue(null)
      mockPrismaService.category.deleteMany.mockResolvedValue({ count: 1 })
      mockPrismaService.account.findMany.mockResolvedValue([])

      await service.deleteImport(mockImportId, mockUserId)

      expect(mockPrismaService.category.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['cat-1'] } },
      })
    })

    it('should delete orphan accounts (accounts with no transactions)', async () => {
      const orphanAccount = {
        id: 'acc-1',
        name: 'Compte Epargne',
        userId: mockUserId,
        _count: { transactions: 0 },
      }
      const accountWithTx = {
        id: 'acc-2',
        name: 'Compte Courant',
        userId: mockUserId,
        _count: { transactions: 5 },
      }

      mockPrismaService.importHistory.findFirst.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.transaction.deleteMany.mockResolvedValue({ count: 10 })
      mockPrismaService.importHistory.delete.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.category.findMany.mockResolvedValue([])
      mockPrismaService.account.findMany.mockResolvedValue([
        orphanAccount,
        accountWithTx,
      ])
      mockPrismaService.account.deleteMany.mockResolvedValue({ count: 1 })

      await service.deleteImport(mockImportId, mockUserId)

      expect(mockPrismaService.account.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['acc-1'] } },
      })
    })

    it('should clean up FilterPreferences when deleting orphan categories', async () => {
      const orphanCategory = {
        id: 'cat-1',
        name: 'Alimentation',
        userId: mockUserId,
        type: TransactionType.EXPENSE,
        _count: { transactions: 0 },
      }

      const filterPrefs = {
        userId: mockUserId,
        hiddenExpenseCategories: ['Alimentation', 'Transport'],
        hiddenIncomeCategories: ['Salaire'],
        globalHiddenExpenseCategories: ['Alimentation'],
        globalHiddenIncomeCategories: [],
      }

      mockPrismaService.importHistory.findFirst.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.transaction.deleteMany.mockResolvedValue({ count: 10 })
      mockPrismaService.importHistory.delete.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.category.findMany.mockResolvedValue([orphanCategory])
      mockPrismaService.filterPreferences.findUnique.mockResolvedValue(
        filterPrefs
      )
      mockPrismaService.filterPreferences.update.mockResolvedValue({
        ...filterPrefs,
        hiddenExpenseCategories: ['Transport'],
        globalHiddenExpenseCategories: [],
      })
      mockPrismaService.category.deleteMany.mockResolvedValue({ count: 1 })
      mockPrismaService.account.findMany.mockResolvedValue([])

      await service.deleteImport(mockImportId, mockUserId)

      expect(mockPrismaService.filterPreferences.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          hiddenExpenseCategories: ['Transport'],
          hiddenIncomeCategories: ['Salaire'],
          globalHiddenExpenseCategories: [],
          globalHiddenIncomeCategories: [],
        },
      })
    })

    it('should not update FilterPreferences if no categories to remove', async () => {
      const filterPrefs = {
        userId: mockUserId,
        hiddenExpenseCategories: ['Transport'],
        hiddenIncomeCategories: [],
        globalHiddenExpenseCategories: [],
        globalHiddenIncomeCategories: [],
      }

      const orphanCategory = {
        id: 'cat-1',
        name: 'Alimentation', // Not in filter prefs
        userId: mockUserId,
        type: TransactionType.EXPENSE,
        _count: { transactions: 0 },
      }

      mockPrismaService.importHistory.findFirst.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.transaction.deleteMany.mockResolvedValue({ count: 10 })
      mockPrismaService.importHistory.delete.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.category.findMany.mockResolvedValue([orphanCategory])
      mockPrismaService.filterPreferences.findUnique.mockResolvedValue(
        filterPrefs
      )
      mockPrismaService.category.deleteMany.mockResolvedValue({ count: 1 })
      mockPrismaService.account.findMany.mockResolvedValue([])

      await service.deleteImport(mockImportId, mockUserId)

      // Should not call update since 'Alimentation' is not in the filter prefs
      expect(mockPrismaService.filterPreferences.update).not.toHaveBeenCalled()
    })

    it('should handle case when user has no FilterPreferences', async () => {
      const orphanCategory = {
        id: 'cat-1',
        name: 'Alimentation',
        userId: mockUserId,
        type: TransactionType.EXPENSE,
        _count: { transactions: 0 },
      }

      mockPrismaService.importHistory.findFirst.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.transaction.deleteMany.mockResolvedValue({ count: 10 })
      mockPrismaService.importHistory.delete.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.category.findMany.mockResolvedValue([orphanCategory])
      mockPrismaService.filterPreferences.findUnique.mockResolvedValue(null)
      mockPrismaService.category.deleteMany.mockResolvedValue({ count: 1 })
      mockPrismaService.account.findMany.mockResolvedValue([])

      // Should not throw
      await service.deleteImport(mockImportId, mockUserId)

      expect(mockPrismaService.filterPreferences.update).not.toHaveBeenCalled()
    })

    it('should not delete categories or accounts if none are orphans', async () => {
      const categoryWithTx = {
        id: 'cat-1',
        name: 'Alimentation',
        userId: mockUserId,
        type: TransactionType.EXPENSE,
        _count: { transactions: 5 },
      }
      const accountWithTx = {
        id: 'acc-1',
        name: 'Compte Courant',
        userId: mockUserId,
        _count: { transactions: 5 },
      }

      mockPrismaService.importHistory.findFirst.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.transaction.deleteMany.mockResolvedValue({ count: 10 })
      mockPrismaService.importHistory.delete.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.category.findMany.mockResolvedValue([categoryWithTx])
      mockPrismaService.account.findMany.mockResolvedValue([accountWithTx])

      await service.deleteImport(mockImportId, mockUserId)

      expect(mockPrismaService.category.deleteMany).not.toHaveBeenCalled()
      expect(mockPrismaService.account.deleteMany).not.toHaveBeenCalled()
    })

    it('should delete multiple orphan categories and accounts', async () => {
      const orphanCategories = [
        {
          id: 'cat-1',
          name: 'Alimentation',
          userId: mockUserId,
          type: TransactionType.EXPENSE,
          _count: { transactions: 0 },
        },
        {
          id: 'cat-2',
          name: 'Loisirs',
          userId: mockUserId,
          type: TransactionType.EXPENSE,
          _count: { transactions: 0 },
        },
      ]
      const orphanAccounts = [
        {
          id: 'acc-1',
          name: 'Compte Epargne',
          userId: mockUserId,
          _count: { transactions: 0 },
        },
        {
          id: 'acc-2',
          name: 'Livret A',
          userId: mockUserId,
          _count: { transactions: 0 },
        },
      ]

      mockPrismaService.importHistory.findFirst.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.transaction.deleteMany.mockResolvedValue({ count: 10 })
      mockPrismaService.importHistory.delete.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.category.findMany.mockResolvedValue(orphanCategories)
      mockPrismaService.filterPreferences.findUnique.mockResolvedValue(null)
      mockPrismaService.category.deleteMany.mockResolvedValue({ count: 2 })
      mockPrismaService.account.findMany.mockResolvedValue(orphanAccounts)
      mockPrismaService.account.deleteMany.mockResolvedValue({ count: 2 })

      await service.deleteImport(mockImportId, mockUserId)

      expect(mockPrismaService.category.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['cat-1', 'cat-2'] } },
      })
      expect(mockPrismaService.account.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['acc-1', 'acc-2'] } },
      })
    })
  })

  describe('create', () => {
    it('should create a completed import history', async () => {
      mockPrismaService.importHistory.create.mockResolvedValue(
        mockImportHistory
      )

      const result = await service.create(mockUserId, {
        transactionsImported: 10,
        categoriesCreated: 2,
        duplicatesSkipped: 1,
        totalInFile: 11,
        dateRangeStart: new Date('2024-01-01'),
        dateRangeEnd: new Date('2024-01-31'),
        accounts: ['Compte Courant'],
        fileName: 'export.csv',
      })

      expect(result).toEqual(mockImportHistory)
      expect(mockPrismaService.importHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUserId,
          status: ImportStatus.COMPLETED,
          transactionsImported: 10,
        }),
      })
    })
  })
})
