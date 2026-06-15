import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { ImportHistoriesService } from './import-histories.service'
import { PrismaService } from '../prisma/prisma.service'
import { ImportStatus } from '../generated/prisma'

const mockUserId = '550e8400-e29b-41d4-a716-446655440001'
const mockImportId = '550e8400-e29b-41d4-a716-446655440100'

const mockImportHistoryBase = {
  id: mockImportId,
  userId: mockUserId,
  status: ImportStatus.COMPLETED,
  transactionsImported: 10,
  categoriesCreated: 2,
  duplicatesSkipped: 1,
  totalInFile: 11,
  dateRangeStart: new Date('2024-01-01'),
  dateRangeEnd: new Date('2024-01-31'),
  fileName: 'export.csv',
  createdAt: new Date('2024-02-01'),
}

const mockImportHistoryRow = {
  ...mockImportHistoryBase,
  accounts: ['Compte Courant'],
}

const mockPrismaService = {
  $queryRaw: vi.fn(),
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
    it('returns rows computed via $queryRaw with accounts joined from transactions', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([mockImportHistoryRow])

      const result = await service.findAllByUser(mockUserId)

      expect(result).toEqual([mockImportHistoryRow])
      // The legacy ORM read must no longer be used.
      expect(mockPrismaService.importHistory.findMany).not.toHaveBeenCalled()
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(1)
    })

    it('returns empty array when the user has no imports', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([])

      const result = await service.findAllByUser(mockUserId)

      expect(result).toEqual([])
    })
  })

  describe('findById', () => {
    it('returns the row with computed accounts when found', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([mockImportHistoryRow])

      const result = await service.findById(mockImportId, mockUserId)

      expect(result).toEqual(mockImportHistoryRow)
    })

    it('returns null when no row matches', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([])

      const result = await service.findById('non-existent', mockUserId)

      expect(result).toBeNull()
    })
  })

  describe('getLatestImportDate', () => {
    it('returns the latest import date', async () => {
      const latestDate = new Date('2024-01-31')
      mockPrismaService.importHistory.findFirst.mockResolvedValue({
        dateRangeEnd: latestDate,
      })

      const result = await service.getLatestImportDate(mockUserId)

      expect(result).toEqual(latestDate)
    })

    it('returns null when the user has no imports', async () => {
      mockPrismaService.importHistory.findFirst.mockResolvedValue(null)

      const result = await service.getLatestImportDate(mockUserId)

      expect(result).toBeNull()
    })
  })

  describe('startImport', () => {
    it('creates an IN_PROGRESS row and returns it with an empty accounts array', async () => {
      const newImport = {
        ...mockImportHistoryBase,
        status: ImportStatus.IN_PROGRESS,
        transactionsImported: 0,
      }
      mockPrismaService.importHistory.create.mockResolvedValue(newImport)

      const result = await service.startImport(mockUserId, {
        totalInFile: 11,
        fileName: 'export.csv',
      })

      expect(result.id).toBe(newImport.id)
      expect(result.status).toBe(ImportStatus.IN_PROGRESS)
      // No transactions are linked yet, so accounts is empty by construction.
      expect(result.accounts).toEqual([])
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
    it('updates the row and re-reads the computed accounts', async () => {
      // First call: existence check (findById). Second call: re-read after update.
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([mockImportHistoryRow])
        .mockResolvedValueOnce([
          { ...mockImportHistoryRow, accounts: ['Compte Joint'] },
        ])
      mockPrismaService.importHistory.update.mockResolvedValue(
        mockImportHistoryBase
      )

      const result = await service.finalizeImport(mockImportId, mockUserId, {
        transactionsImported: 10,
        categoriesCreated: 2,
        duplicatesSkipped: 1,
        dateRangeStart: new Date('2024-01-01'),
        dateRangeEnd: new Date('2024-01-31'),
      })

      expect(result.accounts).toEqual(['Compte Joint'])
      expect(mockPrismaService.importHistory.update).toHaveBeenCalledWith({
        where: { id: mockImportId },
        data: expect.objectContaining({
          status: ImportStatus.COMPLETED,
          transactionsImported: 10,
        }),
      })
      // The `accounts` payload field must NOT be written anymore.
      const updatePayload = mockPrismaService.importHistory.update.mock
        .calls[0]?.[0] as { data: Record<string, unknown> }
      expect(updatePayload.data).not.toHaveProperty('accounts')
    })

    it('throws NotFoundException when the import does not exist', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([])

      await expect(
        service.finalizeImport(mockImportId, mockUserId, {
          transactionsImported: 10,
          categoriesCreated: 2,
          duplicatesSkipped: 1,
          dateRangeStart: new Date('2024-01-01'),
          dateRangeEnd: new Date('2024-01-31'),
        })
      ).rejects.toThrow(NotFoundException)
      expect(mockPrismaService.importHistory.update).not.toHaveBeenCalled()
    })
  })

  describe('markAsFailed', () => {
    it('flips the status to FAILED and preserves the existing accounts list', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        { ...mockImportHistoryRow, accounts: ['A', 'B'] },
      ])
      mockPrismaService.importHistory.update.mockResolvedValue({
        ...mockImportHistoryBase,
        status: ImportStatus.FAILED,
      })

      const result = await service.markAsFailed(mockImportId, mockUserId)

      expect(result.status).toBe(ImportStatus.FAILED)
      expect(result.accounts).toEqual(['A', 'B'])
    })

    it('throws NotFoundException when the import does not exist', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([])

      await expect(
        service.markAsFailed(mockImportId, mockUserId)
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('deleteImport', () => {
    const setupDeleteMocks = (): void => {
      mockPrismaService.$queryRaw.mockResolvedValue([mockImportHistoryRow])
      mockPrismaService.transaction.deleteMany.mockResolvedValue({ count: 10 })
      mockPrismaService.importHistory.delete.mockResolvedValue(
        mockImportHistoryBase
      )
    }

    it('throws NotFoundException when the import does not exist', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([])

      await expect(
        service.deleteImport(mockImportId, mockUserId)
      ).rejects.toThrow(NotFoundException)
    })

    it('deletes the transactions linked to the import', async () => {
      setupDeleteMocks()

      await service.deleteImport(mockImportId, mockUserId)

      expect(mockPrismaService.transaction.deleteMany).toHaveBeenCalledWith({
        where: { importHistoryId: mockImportId, userId: mockUserId },
      })
    })

    it('deletes the import history record', async () => {
      setupDeleteMocks()

      await service.deleteImport(mockImportId, mockUserId)

      expect(mockPrismaService.importHistory.delete).toHaveBeenCalledWith({
        where: { id: mockImportId },
      })
    })

    it('never deletes categories on import deletion (preserved as user-configured entities)', async () => {
      setupDeleteMocks()

      await service.deleteImport(mockImportId, mockUserId)

      expect(mockPrismaService.category.findMany).not.toHaveBeenCalled()
      expect(mockPrismaService.category.deleteMany).not.toHaveBeenCalled()
    })

    it('never touches FilterPreferences on import deletion', async () => {
      setupDeleteMocks()

      await service.deleteImport(mockImportId, mockUserId)

      expect(
        mockPrismaService.filterPreferences.findUnique
      ).not.toHaveBeenCalled()
      expect(mockPrismaService.filterPreferences.update).not.toHaveBeenCalled()
    })

    it('never deletes accounts on import deletion (preserved as user-configured entities)', async () => {
      setupDeleteMocks()

      await service.deleteImport(mockImportId, mockUserId)

      expect(mockPrismaService.account.findMany).not.toHaveBeenCalled()
      expect(mockPrismaService.account.deleteMany).not.toHaveBeenCalled()
    })
  })

  describe('create', () => {
    it('creates a COMPLETED row and re-reads it with computed accounts', async () => {
      mockPrismaService.importHistory.create.mockResolvedValue(
        mockImportHistoryBase
      )
      mockPrismaService.$queryRaw.mockResolvedValue([mockImportHistoryRow])

      const result = await service.create(mockUserId, {
        transactionsImported: 10,
        categoriesCreated: 2,
        duplicatesSkipped: 1,
        totalInFile: 11,
        dateRangeStart: new Date('2024-01-01'),
        dateRangeEnd: new Date('2024-01-31'),
        fileName: 'export.csv',
      })

      expect(result).toEqual(mockImportHistoryRow)
      const createPayload = mockPrismaService.importHistory.create.mock
        .calls[0]?.[0] as { data: Record<string, unknown> }
      expect(createPayload.data).toMatchObject({
        userId: mockUserId,
        status: ImportStatus.COMPLETED,
        transactionsImported: 10,
      })
      // The legacy `accounts` write is gone.
      expect(createPayload.data).not.toHaveProperty('accounts')
    })
  })
})
