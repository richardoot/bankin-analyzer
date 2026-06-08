import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { ImportHistoriesService } from './import-histories.service'
import { PrismaService } from '../prisma/prisma.service'
import { ImportStatus } from '../generated/prisma'

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
    const setupDeleteMocks = (): void => {
      mockPrismaService.importHistory.findFirst.mockResolvedValue(
        mockImportHistory
      )
      mockPrismaService.transaction.deleteMany.mockResolvedValue({ count: 10 })
      mockPrismaService.importHistory.delete.mockResolvedValue(
        mockImportHistory
      )
    }

    it('should throw NotFoundException if import not found', async () => {
      mockPrismaService.importHistory.findFirst.mockResolvedValue(null)

      await expect(
        service.deleteImport(mockImportId, mockUserId)
      ).rejects.toThrow(NotFoundException)
    })

    it('should delete transactions linked to the import', async () => {
      setupDeleteMocks()

      await service.deleteImport(mockImportId, mockUserId)

      expect(mockPrismaService.transaction.deleteMany).toHaveBeenCalledWith({
        where: { importHistoryId: mockImportId, userId: mockUserId },
      })
    })

    it('should delete the import history record', async () => {
      setupDeleteMocks()

      await service.deleteImport(mockImportId, mockUserId)

      expect(mockPrismaService.importHistory.delete).toHaveBeenCalledWith({
        where: { id: mockImportId },
      })
    })

    it('should never delete categories on import deletion (preserved as user-configured entities)', async () => {
      setupDeleteMocks()

      await service.deleteImport(mockImportId, mockUserId)

      // Category deletion was the source of cascading data loss: deleting a
      // Category cascades to its Subcategories, CategoryAssociations and
      // BudgetPlanEntries. These carry user-configured state (icons,
      // associations between reimbursement categories, budget plans) and must
      // never be deleted as a side effect of removing an import.
      expect(mockPrismaService.category.findMany).not.toHaveBeenCalled()
      expect(mockPrismaService.category.deleteMany).not.toHaveBeenCalled()
    })

    it('should never touch FilterPreferences on import deletion', async () => {
      setupDeleteMocks()

      await service.deleteImport(mockImportId, mockUserId)

      expect(
        mockPrismaService.filterPreferences.findUnique
      ).not.toHaveBeenCalled()
      expect(mockPrismaService.filterPreferences.update).not.toHaveBeenCalled()
    })

    it('should never delete accounts on import deletion (preserved as user-configured entities)', async () => {
      setupDeleteMocks()

      await service.deleteImport(mockImportId, mockUserId)

      // Same rationale as categories — Accounts carry user-configured state
      // (JOINT/STANDARD, divisor, exclusion flags) and must never disappear
      // as a side effect.
      expect(mockPrismaService.account.findMany).not.toHaveBeenCalled()
      expect(mockPrismaService.account.deleteMany).not.toHaveBeenCalled()
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
