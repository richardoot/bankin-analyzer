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
    hiddenExpenseCategories: ['Loisirs'],
    hiddenIncomeCategories: ['Revenus exceptionnels'],
    globalHiddenExpenseCategories: ['Épargne'],
    globalHiddenIncomeCategories: ['Cadeaux'],
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
        hiddenExpenseCategories: mockFilterPreferences.hiddenExpenseCategories,
        hiddenIncomeCategories: mockFilterPreferences.hiddenIncomeCategories,
        globalHiddenExpenseCategories:
          mockFilterPreferences.globalHiddenExpenseCategories,
        globalHiddenIncomeCategories:
          mockFilterPreferences.globalHiddenIncomeCategories,
        isPanelExpanded: mockFilterPreferences.isPanelExpanded,
      })
      expect(service.findByUser).toHaveBeenCalledWith(mockUser.id)
    })

    it('should return default values when user has no preferences', async () => {
      mockService.findByUser.mockResolvedValue(null)

      const result = await controller.get(mockUser)

      expect(result).toEqual({
        hiddenExpenseCategories: [],
        hiddenIncomeCategories: [],
        globalHiddenExpenseCategories: [],
        globalHiddenIncomeCategories: [],
        isPanelExpanded: true,
      })
      expect(service.findByUser).toHaveBeenCalledWith(mockUser.id)
    })

    it('should return empty arrays for preferences with no data', async () => {
      const emptyPreferences: FilterPreferences = {
        ...mockFilterPreferences,
        hiddenExpenseCategories: [],
        hiddenIncomeCategories: [],
        globalHiddenExpenseCategories: [],
        globalHiddenIncomeCategories: [],
      }
      mockService.findByUser.mockResolvedValue(emptyPreferences)

      const result = await controller.get(mockUser)

      expect(result.hiddenExpenseCategories).toEqual([])
      expect(result.hiddenIncomeCategories).toEqual([])
      expect(result.globalHiddenExpenseCategories).toEqual([])
      expect(result.globalHiddenIncomeCategories).toEqual([])
    })
  })

  describe('update', () => {
    it('should update and return filter preferences', async () => {
      const dto = {
        hiddenExpenseCategories: ['Shopping'],
        globalHiddenExpenseCategories: ['Investissement'],
        isPanelExpanded: false,
      }

      const updatedPreferences: FilterPreferences = {
        ...mockFilterPreferences,
        ...dto,
        hiddenIncomeCategories: [],
        globalHiddenIncomeCategories: [],
      }

      mockService.upsert.mockResolvedValue(updatedPreferences)

      const result = await controller.update(mockUser, dto)

      expect(result).toEqual({
        hiddenExpenseCategories: dto.hiddenExpenseCategories,
        hiddenIncomeCategories: [],
        globalHiddenExpenseCategories: dto.globalHiddenExpenseCategories,
        globalHiddenIncomeCategories: [],
        isPanelExpanded: dto.isPanelExpanded,
      })
      expect(service.upsert).toHaveBeenCalledWith(mockUser.id, dto)
    })

    it('should update only specific fields', async () => {
      const dto = {
        globalHiddenExpenseCategories: ['Épargne'],
      }

      mockService.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        globalHiddenExpenseCategories: dto.globalHiddenExpenseCategories,
      })

      const result = await controller.update(mockUser, dto)

      expect(result.globalHiddenExpenseCategories).toEqual(
        dto.globalHiddenExpenseCategories
      )
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
