import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { CategoriesController } from './categories.controller'
import { CategoriesService } from './categories.service'
import { CategoryMigrationService } from './category-migration.service'
import { LegacyMigrationService } from './legacy-migration.service'
import { AiSuggestionsService } from '../ai-suggestions/ai-suggestions.service'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { ForbiddenException } from '@nestjs/common'
import { TransactionType } from '../generated/prisma'
import { toCategoryResponse } from './dto'

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  supabaseId: 'supabase-user-id',
  email: 'test@example.com',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockCategory = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: mockUser.id,
  name: 'Alimentation',
  type: TransactionType.EXPENSE,
  icon: '🛒',
  catalogKey: 'food',
  defaultNature: 'ESSENTIAL' as const,
  defaultRhythm: 'VARIABLE' as const,
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockCategory2 = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  userId: mockUser.id,
  name: 'Salaires',
  type: TransactionType.INCOME,
  icon: null,
  catalogKey: null,
  defaultNature: null,
  defaultRhythm: null,
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockCategoriesService = {
  findAllByUser: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  getDeletionSummary: vi.fn(),
  remove: vi.fn(),
  findWithoutIcons: vi.fn(),
  findSubcategoriesWithoutIcons: vi.fn(),
}

const mockCategoryMigrationService = {
  preview: vi.fn(),
  migrate: vi.fn(),
}

const mockAiSuggestionsService = {
  generateAndSaveIcons: vi.fn(),
}

describe('CategoriesController', () => {
  let controller: CategoriesController

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        {
          provide: CategoriesService,
          useValue: mockCategoriesService,
        },
        {
          provide: CategoryMigrationService,
          useValue: mockCategoryMigrationService,
        },
        {
          provide: LegacyMigrationService,
          useValue: { overview: vi.fn(), preview: vi.fn(), migrate: vi.fn() },
        },
        {
          provide: AiSuggestionsService,
          useValue: mockAiSuggestionsService,
        },
      ],
    })
      .overrideGuard(SupabaseGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<CategoriesController>(CategoriesController)
  })

  describe('findAll', () => {
    it('should return all categories for current user', async () => {
      mockCategoriesService.findAllByUser.mockResolvedValue([
        mockCategory,
        mockCategory2,
      ])

      const result = await controller.findAll(mockUser)

      // Stated as the API states it: no userId, and the lock spelled out.
      expect(result).toEqual([
        toCategoryResponse(mockCategory),
        toCategoryResponse(mockCategory2),
      ])
      expect(result[0]).toMatchObject({ isLocked: true, catalogKey: 'food' })
      expect(result[1]).toMatchObject({ isLocked: false })
      expect(result[0]).not.toHaveProperty('userId')
      expect(mockCategoriesService.findAllByUser).toHaveBeenCalledWith(
        mockUser.id
      )
    })

    it('should return empty array when no categories', async () => {
      mockCategoriesService.findAllByUser.mockResolvedValue([])

      const result = await controller.findAll(mockUser)

      expect(result).toEqual([])
    })
  })

  describe('create', () => {
    it('refuses: categories come from the catalogue', () => {
      const createDto = { name: 'Transport', type: TransactionType.EXPENSE }

      expect(() => controller.create(mockUser, createDto)).toThrow(
        ForbiddenException
      )
      expect(mockCategoriesService.create).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('should forward the update to the service', async () => {
      const dto = { name: 'Courses' }
      const updated = { ...mockCategory2, name: 'Courses' }
      mockCategoriesService.update.mockResolvedValue(updated)

      const result = await controller.update(mockUser, mockCategory2.id, dto)

      expect(result).toEqual(toCategoryResponse(updated))
      expect(mockCategoriesService.update).toHaveBeenCalledWith(
        mockUser.id,
        mockCategory2.id,
        dto
      )
    })
  })

  describe('deletionSummary', () => {
    it('should forward the summary lookup to the service', async () => {
      const summary = { categoryId: mockCategory.id, transactionCount: 12 }
      mockCategoriesService.getDeletionSummary.mockResolvedValue(summary)

      const result = await controller.deletionSummary(mockUser, mockCategory.id)

      expect(result).toEqual(summary)
      expect(mockCategoriesService.getDeletionSummary).toHaveBeenCalledWith(
        mockUser.id,
        mockCategory.id
      )
    })
  })

  describe('remove', () => {
    it('should forward the deletion to the service', async () => {
      const outcome = {
        uncategorizedTransactions: 12,
        deletedSubcategories: 1,
        deletedBudgetPlanEntries: 0,
      }
      mockCategoriesService.remove.mockResolvedValue(outcome)

      const result = await controller.remove(mockUser, mockCategory.id)

      expect(result).toEqual(outcome)
      expect(mockCategoriesService.remove).toHaveBeenCalledWith(
        mockUser.id,
        mockCategory.id
      )
    })
  })
})
