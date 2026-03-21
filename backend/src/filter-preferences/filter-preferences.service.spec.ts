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
    hiddenExpenseCategories: ['Loisirs'],
    hiddenIncomeCategories: ['Revenus exceptionnels'],
    globalHiddenExpenseCategories: ['Épargne'],
    globalHiddenIncomeCategories: ['Cadeaux'],
    isPanelExpanded: true,
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
        hiddenExpenseCategories: ['Shopping'],
        hiddenIncomeCategories: ['Primes'],
        globalHiddenExpenseCategories: ['Investissement'],
        globalHiddenIncomeCategories: ['Virement'],
        isPanelExpanded: false,
      }

      mockPrismaService.filterPreferences.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        ...dto,
      })

      const result = await service.upsert(mockUserId, dto)

      expect(result.hiddenExpenseCategories).toEqual(
        dto.hiddenExpenseCategories
      )
      expect(result.globalHiddenExpenseCategories).toEqual(
        dto.globalHiddenExpenseCategories
      )
      expect(result.isPanelExpanded).toBe(false)
      expect(prisma.filterPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          hiddenExpenseCategories: dto.hiddenExpenseCategories,
          hiddenIncomeCategories: dto.hiddenIncomeCategories,
          globalHiddenExpenseCategories: dto.globalHiddenExpenseCategories,
          globalHiddenIncomeCategories: dto.globalHiddenIncomeCategories,
          isPanelExpanded: dto.isPanelExpanded,
        },
        update: {
          hiddenExpenseCategories: dto.hiddenExpenseCategories,
          hiddenIncomeCategories: dto.hiddenIncomeCategories,
          globalHiddenExpenseCategories: dto.globalHiddenExpenseCategories,
          globalHiddenIncomeCategories: dto.globalHiddenIncomeCategories,
          isPanelExpanded: dto.isPanelExpanded,
        },
      })
    })

    it('should create preferences with default values when dto is empty', async () => {
      const dto = {}

      mockPrismaService.filterPreferences.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        hiddenExpenseCategories: [],
        hiddenIncomeCategories: [],
        globalHiddenExpenseCategories: [],
        globalHiddenIncomeCategories: [],
        isPanelExpanded: true,
      })

      await service.upsert(mockUserId, dto)

      expect(prisma.filterPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          hiddenExpenseCategories: [],
          hiddenIncomeCategories: [],
          globalHiddenExpenseCategories: [],
          globalHiddenIncomeCategories: [],
          isPanelExpanded: true,
        },
        update: {},
      })
    })

    it('should update only globalHiddenExpenseCategories when provided', async () => {
      const dto = {
        globalHiddenExpenseCategories: ['Épargne'],
      }

      mockPrismaService.filterPreferences.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        globalHiddenExpenseCategories: dto.globalHiddenExpenseCategories,
      })

      await service.upsert(mockUserId, dto)

      expect(prisma.filterPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          hiddenExpenseCategories: [],
          hiddenIncomeCategories: [],
          globalHiddenExpenseCategories: dto.globalHiddenExpenseCategories,
          globalHiddenIncomeCategories: [],
          isPanelExpanded: true,
        },
        update: {
          globalHiddenExpenseCategories: dto.globalHiddenExpenseCategories,
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
          hiddenExpenseCategories: [],
          hiddenIncomeCategories: [],
          globalHiddenExpenseCategories: [],
          globalHiddenIncomeCategories: [],
          isPanelExpanded: false,
        },
        update: {
          isPanelExpanded: false,
        },
      })
    })
  })
})
