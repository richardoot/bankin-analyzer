import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { ValidationPipe } from '@nestjs/common'
import type { ArgumentMetadata } from '@nestjs/common'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import type { User } from '../generated/prisma'
import { TrendsQueryDto } from './dto'
import type { TrendsResponseDto } from './dto'
import { TrendDigestService } from './trend-digest.service'
import { TrendsController } from './trends.controller'
import { TrendsService } from './trends.service'

describe('TrendsController', () => {
  let controller: TrendsController

  const user: User = {
    id: 'user-123',
    supabaseId: 'supabase-123',
    email: 'test@test.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const response: TrendsResponseDto = {
    month: '2026-09',
    reading: 'everyday',
    window: 6,
    completeMonths: 12,
    insights: [],
    quietSentence:
      "Rien de notable en septembre : la vie courante est dans l'habitude.",
    headline: null,
    availableMonths: ['2026-09'],
    digest: null,
  }

  const trendsService = { getTrends: vi.fn() }
  const digestService = { getDigest: vi.fn() }

  beforeEach(async () => {
    vi.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrendsController],
      providers: [
        { provide: TrendsService, useValue: trendsService },
        { provide: TrendDigestService, useValue: digestService },
      ],
    })
      .overrideGuard(SupabaseGuard)
      .useValue({ canActivate: () => true })
      .compile()
    controller = module.get(TrendsController)
  })

  it('reads the trends of the current user with the filters given', async () => {
    trendsService.getTrends.mockResolvedValue(response)
    const query = { month: '2026-08', window: 3 as const }

    await expect(controller.getTrends(user, query)).resolves.toEqual(response)
    expect(trendsService.getTrends).toHaveBeenCalledWith('user-123', query)
  })

  describe('the written digest', () => {
    const digest = {
      month: '2026-09',
      reading: 'everyday' as const,
      window: 6,
      text: 'Un paragraphe.',
      model: 'claude-haiku-5-5',
      generatedAt: '2026-10-01T09:00:00.000Z',
    }

    it('serves the remembered or freshly written paragraph of the current user', async () => {
      digestService.getDigest.mockResolvedValue(digest)
      const query = { month: '2026-09', window: 6 as const }

      await expect(controller.getDigest(user, query)).resolves.toEqual({
        digest,
      })
      expect(digestService.getDigest).toHaveBeenCalledWith('user-123', query)
    })

    it('answers { digest: null } rather than an error when there is none', async () => {
      digestService.getDigest.mockResolvedValue(null)

      await expect(controller.getDigest(user, {})).resolves.toEqual({
        digest: null,
      })
    })

    it('forces a new paragraph on « Régénérer »', async () => {
      digestService.getDigest.mockResolvedValue(digest)
      const query = { reading: 'real' as const }

      await expect(controller.regenerateDigest(user, query)).resolves.toEqual({
        digest,
      })
      expect(digestService.getDigest).toHaveBeenCalledWith('user-123', query, {
        force: true,
      })
    })
  })

  describe('query validation', () => {
    // The global pipe, as main.ts configures it.
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
    const metadata: ArgumentMetadata = {
      type: 'query',
      metatype: TrendsQueryDto,
    }
    const validate = (query: Record<string, string>): Promise<unknown> =>
      pipe.transform(query, metadata)

    it('reads a query string into typed filters', async () => {
      await expect(
        validate({
          month: '2026-09',
          window: '12',
          reading: 'real',
          deductReimbursements: 'false',
          deductPendingReimbursements: 'true',
        })
      ).resolves.toEqual({
        month: '2026-09',
        window: 12,
        reading: 'real',
        deductReimbursements: false,
        deductPendingReimbursements: true,
      })
    })

    it('accepts no filter at all', async () => {
      await expect(validate({})).resolves.toEqual({})
    })

    const refused: Array<Record<string, string>> = [
      { month: '2026-9' },
      { month: '2026-13' },
      { window: '4' },
      { reading: 'weekly' },
      { deductReimbursements: 'yes' },
      { startDate: '2026-01-01' },
    ]
    for (const query of refused) {
      it(`refuses ${JSON.stringify(query)}`, async () => {
        await expect(validate(query)).rejects.toThrow()
      })
    }
  })
})
