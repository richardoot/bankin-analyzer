import { Test } from '@nestjs/testing'
import { InternalServerErrorException } from '@nestjs/common'
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
          ],
        }).compile()
      ).rejects.toThrow(InternalServerErrorException)
    })
  })

  describe('categorizeTransactions — grounded with history', () => {
    async function buildService(): Promise<AiSuggestionsService> {
      const module = await Test.createTestingModule({
        providers: [
          AiSuggestionsService,
          { provide: PrismaService, useValue: mockPrismaService },
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
  })
})
