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
})
