import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { FilterPreferencesService } from './filter-preferences.service'
import { PrismaService } from '../prisma/prisma.service'
import type { FilterPreferences } from '../generated/prisma'

describe('FilterPreferencesService', () => {
  let service: FilterPreferencesService
  let prisma: PrismaService

  const mockUserId = 'user-123'

  const mockFilterPreferences: FilterPreferences = {
    id: 'pref-1',
    userId: mockUserId,
    isPanelExpanded: true,
    importCategoriesFromFile: true,
    deductPendingReimbursements: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockPrismaService = {
    filterPreferences: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilterPreferencesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile()

    service = module.get<FilterPreferencesService>(FilterPreferencesService)
    prisma = module.get<PrismaService>(PrismaService)

    vi.clearAllMocks()
  })

  describe('findByUser', () => {
    it('should return filter preferences for a user', async () => {
      mockPrismaService.filterPreferences.findUnique.mockResolvedValue(
        mockFilterPreferences
      )

      const result = await service.findByUser(mockUserId)

      expect(result).toEqual(mockFilterPreferences)
      expect(prisma.filterPreferences.findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      })
    })

    it('should return null when user has no preferences', async () => {
      mockPrismaService.filterPreferences.findUnique.mockResolvedValue(null)

      const result = await service.findByUser(mockUserId)

      expect(result).toBeNull()
      expect(prisma.filterPreferences.findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      })
    })
  })

  describe('deductsPendingByDefault', () => {
    it('reads the preference', async () => {
      vi.mocked(prisma.filterPreferences.findUnique).mockResolvedValue({
        ...mockFilterPreferences,
        deductPendingReimbursements: false,
      })

      await expect(service.deductsPendingByDefault(mockUserId)).resolves.toBe(
        false
      )
      expect(prisma.filterPreferences.findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        select: { deductPendingReimbursements: true },
      })
    })

    it('is on for a user who never saved any preference', async () => {
      vi.mocked(prisma.filterPreferences.findUnique).mockResolvedValue(null)

      await expect(service.deductsPendingByDefault(mockUserId)).resolves.toBe(
        true
      )
    })
  })

  describe('upsert', () => {
    it('should create new preferences with all fields', async () => {
      const dto = {
        isPanelExpanded: false,
        importCategoriesFromFile: false,
        deductPendingReimbursements: false,
      }

      mockPrismaService.filterPreferences.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        ...dto,
      })

      const result = await service.upsert(mockUserId, dto)

      expect(result.isPanelExpanded).toBe(false)
      expect(result.deductPendingReimbursements).toBe(false)
      expect(prisma.filterPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          isPanelExpanded: false,
          importCategoriesFromFile: false,
          deductPendingReimbursements: false,
        },
        update: {
          isPanelExpanded: false,
          importCategoriesFromFile: false,
          deductPendingReimbursements: false,
        },
      })
    })

    it('should create preferences with default values when dto is empty', async () => {
      const dto = {}

      mockPrismaService.filterPreferences.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        isPanelExpanded: true,
      })

      await service.upsert(mockUserId, dto)

      expect(prisma.filterPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          isPanelExpanded: true,
          importCategoriesFromFile: true,
          deductPendingReimbursements: true,
        },
        update: {},
      })
    })

    it('should update only deductPendingReimbursements when provided', async () => {
      const dto = {
        deductPendingReimbursements: false,
      }

      mockPrismaService.filterPreferences.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        deductPendingReimbursements: false,
      })

      await service.upsert(mockUserId, dto)

      expect(prisma.filterPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          isPanelExpanded: true,
          importCategoriesFromFile: true,
          deductPendingReimbursements: false,
        },
        update: {
          deductPendingReimbursements: false,
        },
      })
    })

    it('should update only isPanelExpanded when provided', async () => {
      const dto = {
        isPanelExpanded: false,
      }

      mockPrismaService.filterPreferences.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        isPanelExpanded: false,
      })

      await service.upsert(mockUserId, dto)

      expect(prisma.filterPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          isPanelExpanded: false,
          importCategoriesFromFile: true,
          deductPendingReimbursements: true,
        },
        update: {
          isPanelExpanded: false,
        },
      })
    })
  })
})
