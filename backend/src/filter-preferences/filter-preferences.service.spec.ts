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
    hiddenExpenseCategoryIds: ['cat-loisirs'],
    hiddenIncomeCategoryIds: ['cat-revenus-exceptionnels'],
    globalHiddenExpenseCategoryIds: ['cat-epargne'],
    globalHiddenIncomeCategoryIds: ['cat-cadeaux'],
    isPanelExpanded: true,
    importCategoriesFromFile: true,
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

  describe('upsert', () => {
    it('should create new preferences with all fields', async () => {
      const dto = {
        hiddenExpenseCategoryIds: ['cat-shopping'],
        hiddenIncomeCategoryIds: ['cat-primes'],
        globalHiddenExpenseCategoryIds: ['cat-investissement'],
        globalHiddenIncomeCategoryIds: ['cat-virement'],
        isPanelExpanded: false,
      }

      mockPrismaService.filterPreferences.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        ...dto,
      })

      const result = await service.upsert(mockUserId, dto)

      expect(result.hiddenExpenseCategoryIds).toEqual(
        dto.hiddenExpenseCategoryIds
      )
      expect(result.globalHiddenExpenseCategoryIds).toEqual(
        dto.globalHiddenExpenseCategoryIds
      )
      expect(result.isPanelExpanded).toBe(false)
      expect(prisma.filterPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          hiddenExpenseCategoryIds: dto.hiddenExpenseCategoryIds,
          hiddenIncomeCategoryIds: dto.hiddenIncomeCategoryIds,
          globalHiddenExpenseCategoryIds: dto.globalHiddenExpenseCategoryIds,
          globalHiddenIncomeCategoryIds: dto.globalHiddenIncomeCategoryIds,
          isPanelExpanded: dto.isPanelExpanded,
          importCategoriesFromFile: true,
        },
        update: {
          hiddenExpenseCategoryIds: dto.hiddenExpenseCategoryIds,
          hiddenIncomeCategoryIds: dto.hiddenIncomeCategoryIds,
          globalHiddenExpenseCategoryIds: dto.globalHiddenExpenseCategoryIds,
          globalHiddenIncomeCategoryIds: dto.globalHiddenIncomeCategoryIds,
          isPanelExpanded: dto.isPanelExpanded,
        },
      })
    })

    it('should create preferences with default values when dto is empty', async () => {
      const dto = {}

      mockPrismaService.filterPreferences.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        hiddenExpenseCategoryIds: [],
        hiddenIncomeCategoryIds: [],
        globalHiddenExpenseCategoryIds: [],
        globalHiddenIncomeCategoryIds: [],
        isPanelExpanded: true,
      })

      await service.upsert(mockUserId, dto)

      expect(prisma.filterPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          hiddenExpenseCategoryIds: [],
          hiddenIncomeCategoryIds: [],
          globalHiddenExpenseCategoryIds: [],
          globalHiddenIncomeCategoryIds: [],
          isPanelExpanded: true,
          importCategoriesFromFile: true,
        },
        update: {},
      })
    })

    it('should update only globalHiddenExpenseCategoryIds when provided', async () => {
      const dto = {
        globalHiddenExpenseCategoryIds: ['cat-epargne'],
      }

      mockPrismaService.filterPreferences.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        globalHiddenExpenseCategoryIds: dto.globalHiddenExpenseCategoryIds,
      })

      await service.upsert(mockUserId, dto)

      expect(prisma.filterPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          hiddenExpenseCategoryIds: [],
          hiddenIncomeCategoryIds: [],
          globalHiddenExpenseCategoryIds: dto.globalHiddenExpenseCategoryIds,
          globalHiddenIncomeCategoryIds: [],
          isPanelExpanded: true,
          importCategoriesFromFile: true,
        },
        update: {
          globalHiddenExpenseCategoryIds: dto.globalHiddenExpenseCategoryIds,
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
          hiddenExpenseCategoryIds: [],
          hiddenIncomeCategoryIds: [],
          globalHiddenExpenseCategoryIds: [],
          globalHiddenIncomeCategoryIds: [],
          isPanelExpanded: false,
          importCategoriesFromFile: true,
        },
        update: {
          isPanelExpanded: false,
        },
      })
    })
  })
})
