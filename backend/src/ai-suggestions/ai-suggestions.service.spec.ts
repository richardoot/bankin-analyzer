import { Test } from '@nestjs/testing'
import { InternalServerErrorException } from '@nestjs/common'
import { AiSuggestionsService } from './ai-suggestions.service'
import { PrismaService } from '../prisma/prisma.service'
import { MerchantMemoryService } from './merchant-memory.service'
import { buildMerchantMemory } from './merchant-memory'

// Store mock invoke function for tests
const mockInvoke = vi.fn()

// Mock @langchain/anthropic
vi.mock('@langchain/anthropic', () => {
  return {
    ChatAnthropic: class MockChatAnthropic {
      // The service asks for the raw message too, for the token counts;
      // the mock answers the shape the real client returns then.
      withStructuredOutput(
        _schema: unknown,
        options?: { includeRaw?: boolean }
      ) {
        return {
          invoke: async (...args: unknown[]) => {
            const parsed: unknown = await mockInvoke(...args)
            return options?.includeRaw
              ? {
                  raw: {
                    usage_metadata: { input_tokens: 10, output_tokens: 5 },
                  },
                  parsed,
                }
              : parsed
          },
        }
      }
    },
  }
})

describe('AiSuggestionsService', () => {
  // Empty unless a test fills it: the memory only ever shortens the model's
  // list, so an empty one leaves every other test exactly as it was.
  const mockMerchantMemory = {
    load: vi.fn(),
  }

  const mockPrismaService = {
    category: {
      findMany: vi.fn(),
    },
  }

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should throw InternalServerErrorException if ANTHROPIC_API_KEY is not defined', async () => {
      delete process.env.ANTHROPIC_API_KEY

      await expect(
        Test.createTestingModule({
          providers: [
            AiSuggestionsService,
            { provide: PrismaService, useValue: mockPrismaService },
            { provide: MerchantMemoryService, useValue: mockMerchantMemory },
          ],
        }).compile()
      ).rejects.toThrow(InternalServerErrorException)
    })
  })

  describe('categorizeTransactions — grounded with history', () => {
    async function buildService(): Promise<AiSuggestionsService> {
      mockMerchantMemory.load.mockResolvedValue(new Map())
      const module = await Test.createTestingModule({
        providers: [
          AiSuggestionsService,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: MerchantMemoryService, useValue: mockMerchantMemory },
        ],
      }).compile()
      return module.get(AiSuggestionsService)
    }

    it("shows the model this user's own filing for a similar label", async () => {
      mockInvoke.mockResolvedValue({ assignments: [] })
      const service = await buildService()

      await service.categorizeTransactions(
        [
          {
            index: 0,
            description: 'CB Fitness Park',
            amount: -12,
            type: 'EXPENSE',
          },
        ],
        [{ id: 'cat-sport', name: 'Sport', type: 'EXPENSE' }],
        [],
        [
          {
            description: 'CARTE 06/08/26 FITNESS PARK CB*7962',
            type: 'EXPENSE',
            categoryId: 'cat-sport',
            categoryName: 'Sport',
            subcategoryId: null,
            subcategoryName: null,
          },
        ]
      )

      const [, userMessage] = mockInvoke.mock.calls[0][0] as {
        content: string
      }[]
      expect(userMessage.content).toContain('deja classe')
      expect(userMessage.content).toContain('FITNESS PARK')
      expect(userMessage.content).toContain('Sport')
    })

    it('says nothing extra for a merchant never seen before', async () => {
      mockInvoke.mockResolvedValue({ assignments: [] })
      const service = await buildService()

      await service.categorizeTransactions(
        [
          {
            index: 0,
            description: 'CB Fitness Park',
            amount: -12,
            type: 'EXPENSE',
          },
        ],
        [{ id: 'cat-sport', name: 'Sport', type: 'EXPENSE' }],
        [],
        [
          {
            description: 'CB Carrefour City',
            type: 'EXPENSE',
            categoryId: 'cat-food',
            categoryName: 'Alimentation',
            subcategoryId: null,
            subcategoryName: null,
          },
        ]
      )

      const [, userMessage] = mockInvoke.mock.calls[0][0] as {
        content: string
      }[]
      expect(userMessage.content).not.toContain('deja classe')
    })

    it('files what the merchant memory knows without asking the model', async () => {
      mockInvoke.mockResolvedValue({ assignments: [] })
      const service = await buildService()
      mockMerchantMemory.load.mockResolvedValue(
        buildMerchantMemory([
          {
            description: 'CB Carrefour Market',
            type: 'EXPENSE',
            categoryKey: 'food',
            subcategoryKey: 'food.supermarket',
            count: 12,
            userId: 'u1',
          },
          {
            description: 'Carrefour Market',
            type: 'EXPENSE',
            categoryKey: 'food',
            subcategoryKey: 'food.supermarket',
            count: 2,
            userId: 'u2',
          },
        ])
      )

      const assignments = await service.categorizeTransactions(
        [
          {
            index: 0,
            description: 'CARTE 01/10/26 CARREFOUR MARKET CB*1',
            amount: -40,
            type: 'EXPENSE',
          },
          {
            index: 1,
            description: 'Boulangerie Dupont',
            amount: -3,
            type: 'EXPENSE',
          },
        ],
        [
          {
            id: 'cat-food',
            name: 'Alimentation',
            type: 'EXPENSE',
            catalogKey: 'food',
          },
        ],
        [
          {
            id: 'sub-super',
            name: 'Supermarché',
            categoryId: 'cat-food',
            catalogKey: 'food.supermarket',
          },
        ]
      )

      expect(assignments).toEqual([
        {
          index: 0,
          categoryId: 'cat-food',
          subcategoryId: 'sub-super',
          subcategoryName: 'Supermarché',
        },
      ])
      // Only the bakery reached the model.
      const [, userMessage] = mockInvoke.mock.calls[0][0] as {
        content: string
      }[]
      expect(userMessage.content).toContain('Boulangerie Dupont')
      expect(userMessage.content).not.toContain('CARREFOUR')
    })

    it('asks the model when the user does not carry the remembered key', async () => {
      mockInvoke.mockResolvedValue({ assignments: [] })
      const service = await buildService()
      mockMerchantMemory.load.mockResolvedValue(
        buildMerchantMemory([
          {
            description: 'CB Carrefour Market',
            type: 'EXPENSE',
            categoryKey: 'food',
            subcategoryKey: null,
            count: 12,
            userId: 'u1',
          },
          {
            description: 'Carrefour Market',
            type: 'EXPENSE',
            categoryKey: 'food',
            subcategoryKey: 'food.supermarket',
            count: 2,
            userId: 'u2',
          },
        ])
      )

      const assignments = await service.categorizeTransactions(
        [
          {
            index: 0,
            description: 'CB Carrefour Market',
            amount: -40,
            type: 'EXPENSE',
          },
        ],
        // A ledger from before the catalogue: no key to resolve to.
        [
          {
            id: 'cat-courses',
            name: 'Courses',
            type: 'EXPENSE',
            catalogKey: null,
          },
        ],
        []
      )

      expect(assignments).toEqual([])
      expect(mockInvoke).toHaveBeenCalledTimes(1)
    })
  })
})
