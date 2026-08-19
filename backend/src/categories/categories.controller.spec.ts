import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { CategoriesController } from './categories.controller'
import { CategoriesService } from './categories.service'
import { AiSuggestionsService } from '../ai-suggestions/ai-suggestions.service'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { TransactionType } from '../generated/prisma'

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
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockCategory2 = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  userId: mockUser.id,
  name: 'Salaires',
  type: TransactionType.INCOME,
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

      expect(result).toEqual([mockCategory, mockCategory2])
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
    it('should create a new category', async () => {
      const createDto = {
        name: 'Transport',
        type: TransactionType.EXPENSE,
      }
      const newCategory = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        userId: mockUser.id,
        ...createDto,
        createdAt: new Date(),
      }
      mockCategoriesService.create.mockResolvedValue(newCategory)

      const result = await controller.create(mockUser, createDto)

      expect(result).toEqual(newCategory)
      expect(mockCategoriesService.create).toHaveBeenCalledWith(
        mockUser.id,
        createDto
      )
    })
  })

  describe('update', () => {
    it('should forward the update to the service', async () => {
      const dto = { isExcludedFromBudget: true }
      const updated = { ...mockCategory, isExcludedFromBudget: true }
      mockCategoriesService.update.mockResolvedValue(updated)

      const result = await controller.update(mockUser, mockCategory.id, dto)

      expect(result).toEqual(updated)
      expect(mockCategoriesService.update).toHaveBeenCalledWith(
        mockUser.id,
        mockCategory.id,
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
