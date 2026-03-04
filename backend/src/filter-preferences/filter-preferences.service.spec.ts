import { Test, TestingModule } from '@nestjs/testing'
import { FilterPreferencesService } from './filter-preferences.service'
import { PrismaService } from '../prisma/prisma.service'
import { FilterPreferences } from '../generated/prisma'

describe('FilterPreferencesService', () => {
  let service: FilterPreferencesService
  let prisma: PrismaService

  const mockUserId = 'user-123'

  const mockFilterPreferences: FilterPreferences = {
    id: 'pref-1',
    userId: mockUserId,
    jointAccounts: ['Compte Courant'],
    hiddenExpenseCategories: ['Loisirs'],
    hiddenIncomeCategories: ['Revenus exceptionnels'],
    categoryAssociations: [
      { expenseCategory: 'Santé', incomeCategory: 'Remboursement santé' },
    ],
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
        jointAccounts: ['Compte Joint'],
        hiddenExpenseCategories: ['Shopping'],
        hiddenIncomeCategories: ['Primes'],
        categoryAssociations: [
          {
            expenseCategory: 'Transport',
            incomeCategory: 'Remboursement transport',
          },
        ],
        isPanelExpanded: false,
      }

      mockPrismaService.filterPreferences.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        ...dto,
      })

      const result = await service.upsert(mockUserId, dto)

      expect(result.jointAccounts).toEqual(dto.jointAccounts)
      expect(result.hiddenExpenseCategories).toEqual(
        dto.hiddenExpenseCategories
      )
      expect(result.isPanelExpanded).toBe(false)
      expect(prisma.filterPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          jointAccounts: dto.jointAccounts,
          hiddenExpenseCategories: dto.hiddenExpenseCategories,
          hiddenIncomeCategories: dto.hiddenIncomeCategories,
          categoryAssociations: dto.categoryAssociations,
          isPanelExpanded: dto.isPanelExpanded,
        },
        update: {
          jointAccounts: dto.jointAccounts,
          hiddenExpenseCategories: dto.hiddenExpenseCategories,
          hiddenIncomeCategories: dto.hiddenIncomeCategories,
          categoryAssociations: dto.categoryAssociations,
          isPanelExpanded: dto.isPanelExpanded,
        },
      })
    })

    it('should create preferences with default values when dto is empty', async () => {
      const dto = {}

      mockPrismaService.filterPreferences.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        jointAccounts: [],
        hiddenExpenseCategories: [],
        hiddenIncomeCategories: [],
        categoryAssociations: [],
        isPanelExpanded: true,
      })

      await service.upsert(mockUserId, dto)

      expect(prisma.filterPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          jointAccounts: [],
          hiddenExpenseCategories: [],
          hiddenIncomeCategories: [],
          categoryAssociations: [],
          isPanelExpanded: true,
        },
        update: {},
      })
    })

    it('should update only jointAccounts when provided', async () => {
      const dto = {
        jointAccounts: ['Compte épargne'],
      }

      mockPrismaService.filterPreferences.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        jointAccounts: dto.jointAccounts,
      })

      await service.upsert(mockUserId, dto)

      expect(prisma.filterPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          jointAccounts: dto.jointAccounts,
          hiddenExpenseCategories: [],
          hiddenIncomeCategories: [],
          categoryAssociations: [],
          isPanelExpanded: true,
        },
        update: {
          jointAccounts: dto.jointAccounts,
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
          jointAccounts: [],
          hiddenExpenseCategories: [],
          hiddenIncomeCategories: [],
          categoryAssociations: [],
          isPanelExpanded: false,
        },
        update: {
          isPanelExpanded: false,
        },
      })
    })

    it('should update categoryAssociations when provided', async () => {
      const dto = {
        categoryAssociations: [
          { expenseCategory: 'Santé', incomeCategory: 'Mutuelle' },
          { expenseCategory: 'Transport', incomeCategory: 'Remboursement km' },
        ],
      }

      mockPrismaService.filterPreferences.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        categoryAssociations: dto.categoryAssociations,
      })

      await service.upsert(mockUserId, dto)

      expect(prisma.filterPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          jointAccounts: [],
          hiddenExpenseCategories: [],
          hiddenIncomeCategories: [],
          categoryAssociations: dto.categoryAssociations,
          isPanelExpanded: true,
        },
        update: {
          categoryAssociations: dto.categoryAssociations,
        },
      })
    })
  })
})
