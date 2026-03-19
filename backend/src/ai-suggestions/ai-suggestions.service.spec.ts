import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { AiSuggestionsService } from './ai-suggestions.service'
import { PrismaService } from '../prisma/prisma.service'

// Store mock invoke function for tests
const mockInvoke = vi.fn()

// Mock @langchain/anthropic
vi.mock('@langchain/anthropic', () => {
  return {
    ChatAnthropic: class MockChatAnthropic {
      withStructuredOutput() {
        return {
          invoke: mockInvoke,
        }
      }
    },
  }
})

describe('AiSuggestionsService', () => {
  let service: AiSuggestionsService

  const mockUserId = 'user-123'

  const mockExpenseCategories = [
    {
      id: 'cat-expense-1',
      name: 'Frais médicaux',
      userId: mockUserId,
      type: 'EXPENSE',
    },
    {
      id: 'cat-expense-2',
      name: 'Pharmacie',
      userId: mockUserId,
      type: 'EXPENSE',
    },
    {
      id: 'cat-expense-3',
      name: 'Transport',
      userId: mockUserId,
      type: 'EXPENSE',
    },
  ]

  const mockIncomeCategories = [
    {
      id: 'cat-income-1',
      name: 'Remboursement Sécurité Sociale',
      userId: mockUserId,
      type: 'INCOME',
    },
    {
      id: 'cat-income-2',
      name: 'Remboursement mutuelle',
      userId: mockUserId,
      type: 'INCOME',
    },
    {
      id: 'cat-income-3',
      name: 'Indemnités kilométriques',
      userId: mockUserId,
      type: 'INCOME',
    },
  ]

  const mockPrismaService = {
    category: {
      findMany: vi.fn(),
    },
    categoryAssociation: {
      findMany: vi.fn(),
    },
  }

  beforeEach(async () => {
    // Set API key for tests
    process.env.ANTHROPIC_API_KEY = 'test-api-key'

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiSuggestionsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile()

    service = module.get<AiSuggestionsService>(AiSuggestionsService)

    vi.clearAllMocks()
  })

  describe('suggestAssociations', () => {
    it('should return suggestions from LLM', async () => {
      mockPrismaService.category.findMany
        .mockResolvedValueOnce(mockExpenseCategories.slice(0, 2)) // expense categories
        .mockResolvedValueOnce(mockIncomeCategories) // income categories

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([])

      mockInvoke.mockResolvedValue({
        suggestions: [
          {
            expenseCategoryName: 'Frais médicaux',
            suggestedIncomeCategoryName: 'Remboursement Sécurité Sociale',
            confidence: 0.95,
            reasoning: 'Les frais médicaux sont remboursés par la Sécu',
          },
          {
            expenseCategoryName: 'Pharmacie',
            suggestedIncomeCategoryName: 'Remboursement mutuelle',
            confidence: 0.85,
            reasoning: 'Les médicaments sont remboursés par la mutuelle',
          },
        ],
      })

      const result = await service.suggestAssociations(mockUserId, [
        'cat-expense-1',
        'cat-expense-2',
      ])

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        expenseCategoryId: 'cat-expense-1',
        expenseCategoryName: 'Frais médicaux',
        suggestedIncomeCategoryId: 'cat-income-1',
        suggestedIncomeCategoryName: 'Remboursement Sécurité Sociale',
        confidence: 0.95,
        reasoning: 'Les frais médicaux sont remboursés par la Sécu',
      })
      expect(result[1]).toEqual({
        expenseCategoryId: 'cat-expense-2',
        expenseCategoryName: 'Pharmacie',
        suggestedIncomeCategoryId: 'cat-income-2',
        suggestedIncomeCategoryName: 'Remboursement mutuelle',
        confidence: 0.85,
        reasoning: 'Les médicaments sont remboursés par la mutuelle',
      })
    })

    it('should filter out suggestions with confidence below 0.7', async () => {
      mockPrismaService.category.findMany
        .mockResolvedValueOnce(mockExpenseCategories.slice(0, 2))
        .mockResolvedValueOnce(mockIncomeCategories)

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([])

      mockInvoke.mockResolvedValue({
        suggestions: [
          {
            expenseCategoryName: 'Frais médicaux',
            suggestedIncomeCategoryName: 'Remboursement Sécurité Sociale',
            confidence: 0.95,
            reasoning: 'Match évident',
          },
          {
            expenseCategoryName: 'Pharmacie',
            suggestedIncomeCategoryName: 'Remboursement mutuelle',
            confidence: 0.5, // Below threshold
            reasoning: 'Match incertain',
          },
        ],
      })

      const result = await service.suggestAssociations(mockUserId, [
        'cat-expense-1',
        'cat-expense-2',
      ])

      expect(result).toHaveLength(1)
      expect(result[0].expenseCategoryName).toBe('Frais médicaux')
    })

    it('should return empty array when no expense categories found', async () => {
      mockPrismaService.category.findMany.mockResolvedValueOnce([])

      const result = await service.suggestAssociations(mockUserId, [
        'non-existent-id',
      ])

      expect(result).toEqual([])
    })

    it('should return empty array when no income categories available', async () => {
      mockPrismaService.category.findMany
        .mockResolvedValueOnce(mockExpenseCategories.slice(0, 1))
        .mockResolvedValueOnce([]) // No income categories

      const result = await service.suggestAssociations(mockUserId, [
        'cat-expense-1',
      ])

      expect(result).toEqual([])
    })

    it('should exclude already associated expense categories', async () => {
      mockPrismaService.category.findMany
        .mockResolvedValueOnce(mockExpenseCategories.slice(0, 2))
        .mockResolvedValueOnce(mockIncomeCategories)

      // cat-expense-1 is already associated
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          expenseCategoryId: 'cat-expense-1',
          incomeCategoryId: 'cat-income-1',
        },
      ])

      mockInvoke.mockResolvedValue({
        suggestions: [
          {
            expenseCategoryName: 'Pharmacie',
            suggestedIncomeCategoryName: 'Remboursement mutuelle',
            confidence: 0.85,
            reasoning: 'Match',
          },
        ],
      })

      const result = await service.suggestAssociations(mockUserId, [
        'cat-expense-1',
        'cat-expense-2',
      ])

      // Only cat-expense-2 should be suggested since cat-expense-1 is already associated
      expect(result).toHaveLength(1)
      expect(result[0].expenseCategoryName).toBe('Pharmacie')
    })

    it('should exclude already associated income categories', async () => {
      mockPrismaService.category.findMany
        .mockResolvedValueOnce(mockExpenseCategories.slice(0, 2))
        .mockResolvedValueOnce(mockIncomeCategories)

      // cat-income-1 is already associated
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          expenseCategoryId: 'cat-expense-99',
          incomeCategoryId: 'cat-income-1',
        },
      ])

      mockInvoke.mockResolvedValue({
        suggestions: [
          {
            expenseCategoryName: 'Frais médicaux',
            suggestedIncomeCategoryName: 'Remboursement Sécurité Sociale', // cat-income-1, already associated
            confidence: 0.95,
            reasoning: 'Match',
          },
          {
            expenseCategoryName: 'Pharmacie',
            suggestedIncomeCategoryName: 'Remboursement mutuelle', // cat-income-2, available
            confidence: 0.85,
            reasoning: 'Match',
          },
        ],
      })

      const result = await service.suggestAssociations(mockUserId, [
        'cat-expense-1',
        'cat-expense-2',
      ])

      // Only cat-income-2 should be in results since cat-income-1 is already used
      expect(result).toHaveLength(1)
      expect(result[0].suggestedIncomeCategoryName).toBe(
        'Remboursement mutuelle'
      )
    })

    it('should return empty array when all categories are already associated', async () => {
      mockPrismaService.category.findMany
        .mockResolvedValueOnce(mockExpenseCategories.slice(0, 1))
        .mockResolvedValueOnce(mockIncomeCategories)

      // All expense categories are already associated
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          expenseCategoryId: 'cat-expense-1',
          incomeCategoryId: 'cat-income-1',
        },
      ])

      const result = await service.suggestAssociations(mockUserId, [
        'cat-expense-1',
      ])

      expect(result).toEqual([])
    })

    it('should handle case-insensitive category name matching', async () => {
      mockPrismaService.category.findMany
        .mockResolvedValueOnce(mockExpenseCategories.slice(0, 1))
        .mockResolvedValueOnce(mockIncomeCategories)

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([])

      mockInvoke.mockResolvedValue({
        suggestions: [
          {
            expenseCategoryName: 'FRAIS MÉDICAUX', // Different case
            suggestedIncomeCategoryName: 'remboursement sécurité sociale', // Different case
            confidence: 0.95,
            reasoning: 'Match',
          },
        ],
      })

      const result = await service.suggestAssociations(mockUserId, [
        'cat-expense-1',
      ])

      expect(result).toHaveLength(1)
      expect(result[0].expenseCategoryId).toBe('cat-expense-1')
      expect(result[0].suggestedIncomeCategoryId).toBe('cat-income-1')
    })

    it('should handle LLM returning empty suggestions', async () => {
      mockPrismaService.category.findMany
        .mockResolvedValueOnce(mockExpenseCategories.slice(0, 1))
        .mockResolvedValueOnce(mockIncomeCategories)

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([])

      mockInvoke.mockResolvedValue({
        suggestions: [],
      })

      const result = await service.suggestAssociations(mockUserId, [
        'cat-expense-1',
      ])

      expect(result).toEqual([])
    })

    it('should throw error when LLM call fails', async () => {
      mockPrismaService.category.findMany
        .mockResolvedValueOnce(mockExpenseCategories.slice(0, 1))
        .mockResolvedValueOnce(mockIncomeCategories)

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([])

      mockInvoke.mockRejectedValue(new Error('LLM API error'))

      await expect(
        service.suggestAssociations(mockUserId, ['cat-expense-1'])
      ).rejects.toThrow('LLM API error')
    })

    it('should filter out suggestions with unknown category names', async () => {
      mockPrismaService.category.findMany
        .mockResolvedValueOnce(mockExpenseCategories.slice(0, 1))
        .mockResolvedValueOnce(mockIncomeCategories)

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([])

      mockInvoke.mockResolvedValue({
        suggestions: [
          {
            expenseCategoryName: 'Catégorie inexistante',
            suggestedIncomeCategoryName: 'Remboursement Sécurité Sociale',
            confidence: 0.95,
            reasoning: 'Match',
          },
          {
            expenseCategoryName: 'Frais médicaux',
            suggestedIncomeCategoryName: 'Catégorie inexistante',
            confidence: 0.95,
            reasoning: 'Match',
          },
        ],
      })

      const result = await service.suggestAssociations(mockUserId, [
        'cat-expense-1',
      ])

      expect(result).toEqual([])
    })
  })
})
