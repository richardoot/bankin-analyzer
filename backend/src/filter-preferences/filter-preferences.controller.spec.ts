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
    isPanelExpanded: true,
    importCategoriesFromFile: true,
    deductPendingReimbursements: true,
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
        isPanelExpanded: mockFilterPreferences.isPanelExpanded,
        importCategoriesFromFile: true,
        deductPendingReimbursements: true,
      })
      expect(service.findByUser).toHaveBeenCalledWith(mockUser.id)
    })

    it('should return default values when user has no preferences', async () => {
      mockService.findByUser.mockResolvedValue(null)

      const result = await controller.get(mockUser)

      expect(result).toEqual({
        isPanelExpanded: true,
        importCategoriesFromFile: true,
        deductPendingReimbursements: true,
      })
      expect(service.findByUser).toHaveBeenCalledWith(mockUser.id)
    })
  })

  describe('update', () => {
    it('should update and return filter preferences', async () => {
      const dto = {
        isPanelExpanded: false,
        deductPendingReimbursements: false,
      }

      const updatedPreferences: FilterPreferences = {
        ...mockFilterPreferences,
        ...dto,
      }

      mockService.upsert.mockResolvedValue(updatedPreferences)

      const result = await controller.update(mockUser, dto)

      expect(result).toEqual({
        isPanelExpanded: false,
        importCategoriesFromFile: true,
        deductPendingReimbursements: false,
      })
      expect(service.upsert).toHaveBeenCalledWith(mockUser.id, dto)
    })

    it('should update only specific fields', async () => {
      const dto = {
        importCategoriesFromFile: false,
      }

      mockService.upsert.mockResolvedValue({
        ...mockFilterPreferences,
        importCategoriesFromFile: false,
      })

      const result = await controller.update(mockUser, dto)

      expect(result.importCategoriesFromFile).toBe(false)
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
