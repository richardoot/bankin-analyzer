import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { AiSuggestionsController } from './ai-suggestions.controller'
import { AiSuggestionsService } from './ai-suggestions.service'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import type { CategorySuggestionDto } from './dto/category-suggestion.dto'
import type { User } from '../generated/prisma'

describe('AiSuggestionsController', () => {
  let controller: AiSuggestionsController
  let service: AiSuggestionsService

  const mockUser: User = {
    id: 'user-123',
    supabaseId: 'supabase-123',
    email: 'test@test.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockSuggestions: CategorySuggestionDto[] = [
    {
      expenseCategoryId: 'cat-expense-1',
      expenseCategoryName: 'Frais médicaux',
      suggestedIncomeCategoryId: 'cat-income-1',
      suggestedIncomeCategoryName: 'Remboursement Sécurité Sociale',
      confidence: 0.95,
      reasoning: 'Les frais médicaux sont remboursés par la Sécu',
    },
    {
      expenseCategoryId: 'cat-expense-2',
      expenseCategoryName: 'Pharmacie',
      suggestedIncomeCategoryId: 'cat-income-2',
      suggestedIncomeCategoryName: 'Remboursement mutuelle',
      confidence: 0.85,
      reasoning: 'Les médicaments sont remboursés par la mutuelle',
    },
  ]

  const mockAiSuggestionsService = {
    suggestAssociations: vi.fn(),
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiSuggestionsController],
      providers: [
        {
          provide: AiSuggestionsService,
          useValue: mockAiSuggestionsService,
        },
      ],
    })
      .overrideGuard(SupabaseGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<AiSuggestionsController>(AiSuggestionsController)
    service = module.get<AiSuggestionsService>(AiSuggestionsService)
  })

  describe('suggestAssociations', () => {
    it('should return suggestions for given expense categories', async () => {
      mockAiSuggestionsService.suggestAssociations.mockResolvedValue(
        mockSuggestions
      )

      const result = await controller.suggestAssociations(mockUser, {
        expenseCategoryIds: ['cat-expense-1', 'cat-expense-2'],
      })

      expect(service.suggestAssociations).toHaveBeenCalledWith(mockUser.id, [
        'cat-expense-1',
        'cat-expense-2',
      ])
      expect(result).toEqual(mockSuggestions)
    })

    it('should return empty array when no suggestions available', async () => {
      mockAiSuggestionsService.suggestAssociations.mockResolvedValue([])

      const result = await controller.suggestAssociations(mockUser, {
        expenseCategoryIds: ['cat-expense-1'],
      })

      expect(service.suggestAssociations).toHaveBeenCalledWith(mockUser.id, [
        'cat-expense-1',
      ])
      expect(result).toEqual([])
    })

    it('should handle single expense category', async () => {
      const singleSuggestion = [mockSuggestions[0]]
      mockAiSuggestionsService.suggestAssociations.mockResolvedValue(
        singleSuggestion
      )

      const result = await controller.suggestAssociations(mockUser, {
        expenseCategoryIds: ['cat-expense-1'],
      })

      expect(service.suggestAssociations).toHaveBeenCalledWith(mockUser.id, [
        'cat-expense-1',
      ])
      expect(result).toEqual(singleSuggestion)
    })

    it('should handle empty expense category array', async () => {
      mockAiSuggestionsService.suggestAssociations.mockResolvedValue([])

      const result = await controller.suggestAssociations(mockUser, {
        expenseCategoryIds: [],
      })

      expect(service.suggestAssociations).toHaveBeenCalledWith(mockUser.id, [])
      expect(result).toEqual([])
    })

    it('should propagate service errors', async () => {
      mockAiSuggestionsService.suggestAssociations.mockRejectedValue(
        new Error('Service error')
      )

      await expect(
        controller.suggestAssociations(mockUser, {
          expenseCategoryIds: ['cat-expense-1'],
        })
      ).rejects.toThrow('Service error')
    })
  })
})
