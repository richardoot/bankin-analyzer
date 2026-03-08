import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { FilterPreferencesController } from './filter-preferences.controller'
import { FilterPreferencesService } from './filter-preferences.service'
import { SupabaseGuard } from '../auth'
import type { FilterPreferences, User } from '../generated/prisma'

describe('FilterPreferencesController', () => {
  let controller: FilterPreferencesController
  let service: FilterPreferencesService

  const mockUser: User = {
    id: 'user-123',
    supabaseId: 'supabase-123',
    email: 'test@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockFilterPreferences: FilterPreferences = {
    id: 'pref-1',
    userId: mockUser.id,
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

  const mockService = {
    findByUser: vi.fn(),
    upsert: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilterPreferencesController],
      providers: [
        {
          provide: FilterPreferencesService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(SupabaseGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<FilterPreferencesController>(
      FilterPreferencesController
    )
    service = module.get<FilterPreferencesService>(FilterPreferencesService)

    vi.clearAllMocks()
  })

  describe('get', () => {
    it('should return user filter preferences', async () => {
      mockService.findByUser.mockResolvedValue(mockFilterPreferences)

      const result = await controller.get(mockUser)

      expect(result).toEqual({
        jointAccounts: mockFilterPreferences.jointAccounts,
        hiddenExpenseCategories: mockFilterPreferences.hiddenExpenseCategories,
        hiddenIncomeCategories: mockFilterPreferences.hiddenIncomeCategories,
        categoryAssociations: mockFilterPreferences.categoryAssociations,
        isPanelExpanded: mockFilterPreferences.isPanelExpanded,
      })
      expect(service.findByUser).toHaveBeenCalledWith(mockUser.id)
    })

    it('should return default values when user has no preferences', async () => {
      mockService.findByUser.mockResolvedValue(null)

      const result = await controller.get(mockUser)

      expect(result).toEqual({
        jointAccounts: [],
        hiddenExpenseCategories: [],
        hiddenIncomeCategories: [],
        categoryAssociations: [],
        isPanelExpanded: true,
      })
      expect(service.findByUser).toHaveBeenCalledWith(mockUser.id)
    })

    it('should return empty arrays for preferences with no data', async () => {
      const emptyPreferences: FilterPreferences = {
        ...mockFilterPreferences,
        jointAccounts: [],
        hiddenExpenseCategories: [],
        hiddenIncomeCategories: [],
        categoryAssociations: [],
      }
      mockService.findByUser.mockResolvedValue(emptyPreferences)

      const result = await controller.get(mockUser)

      expect(result.jointAccounts).toEqual([])
      expect(result.hiddenExpenseCategories).toEqual([])
      expect(result.hiddenIncomeCategories).toEqual([])
      expect(result.categoryAssociations).toEqual([])
    })
  })

  describe('update', () => {
    it('should update and return filter preferences', async () => {
      const dto = {
        jointAccounts: ['Compte Joint'],
        hiddenExpenseCategories: ['Shopping'],
        isPanelExpanded: false,
      }

      const updatedPreferences: FilterPreferences = {
        ...mockFilterPreferences,
        ...dto,
        hiddenIncomeCategories: [],
        categoryAssociations: [],
      }

      mockService.upsert.mockResolvedValue(updatedPreferences)

      const result = await controller.update(mockUser, dto)

      expect(result).toEqual({
        jointAccounts: dto.jointAccounts,
        hiddenExpenseCategories: dto.hiddenExpenseCategories,
        hiddenIncomeCategories: [],
        categoryAssociations: [],
        isPanelExpanded: dto.isPanelExpanded,
      })
      expect(service.upsert).toHaveBeenCalledWith(mockUser.id, dto)
    })

    it('should update only specific fields', async () => {
      const dto = {
        jointAccounts: ['Compte épargne'],
      }

      mockService.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        jointAccounts: dto.jointAccounts,
      })

      const result = await controller.update(mockUser, dto)

      expect(result.jointAccounts).toEqual(dto.jointAccounts)
      expect(service.upsert).toHaveBeenCalledWith(mockUser.id, dto)
    })

    it('should update categoryAssociations', async () => {
      const dto = {
        categoryAssociations: [
          { expenseCategory: 'Transport', incomeCategory: 'Remboursement km' },
          { expenseCategory: 'Santé', incomeCategory: 'Mutuelle' },
        ],
      }

      mockService.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        categoryAssociations: dto.categoryAssociations,
      })

      const result = await controller.update(mockUser, dto)

      expect(result.categoryAssociations).toEqual(dto.categoryAssociations)
      expect(service.upsert).toHaveBeenCalledWith(mockUser.id, dto)
    })

    it('should handle empty update dto', async () => {
      const dto = {}

      mockService.upsert.mockResolvedValue(mockFilterPreferences)

      const result = await controller.update(mockUser, dto)

      expect(result).toBeDefined()
      expect(service.upsert).toHaveBeenCalledWith(mockUser.id, dto)
    })

    it('should update isPanelExpanded to false', async () => {
      const dto = {
        isPanelExpanded: false,
      }

      mockService.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        isPanelExpanded: false,
      })

      const result = await controller.update(mockUser, dto)

      expect(result.isPanelExpanded).toBe(false)
      expect(service.upsert).toHaveBeenCalledWith(mockUser.id, dto)
    })
  })
})
