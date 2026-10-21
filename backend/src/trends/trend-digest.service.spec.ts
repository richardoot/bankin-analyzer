import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { AiSuggestionsService } from '../ai-suggestions/ai-suggestions.service'
import { PrismaService } from '../prisma/prisma.service'
import type { TrendInsight, TrendsResult } from './trend.detection'
import { TrendDigestService } from './trend-digest.service'
import { TrendsService } from './trends.service'

const now = new Date('2026-10-07T08:00:00.000Z')

const restaurants: TrendInsight = {
  kind: 'amount',
  unit: {
    type: 'category',
    id: 'restaurants',
    categoryId: 'restaurants',
    name: 'Restaurants et bars',
    icon: null,
  },
  direction: 'up',
  tone: 'neutral',
  current: 312,
  reference: 226,
  delta: 86,
  deltaPct: 38.1,
  sentence:
    "Restaurants et bars : 312 € en septembre, +38 % par rapport à l'habitude (226 €).",
  windows: {
    current: { start: '2026-09-01', end: '2026-09-30' },
    reference: { start: '2026-03-01', end: '2026-08-31' },
  },
  series: [226, 226, 226, 226, 226, 226, 312],
  score: 86,
}

function trends(overrides: Partial<TrendsResult> = {}): TrendsResult {
  return {
    month: '2026-09',
    reading: 'everyday',
    window: 6,
    completeMonths: 12,
    insights: [restaurants],
    quietSentence: null,
    availableMonths: ['2026-09'],
    horizons: [],
    digest: null,
    ...overrides,
  }
}

const totals = { everyday: 1834.5, real: 2240, income: 3200, savings: 576 }

const VERIFIED =
  'En septembre, les restaurants et bars montent à 312 €, soit 38 % de plus que les 226 € habituels. Le reste de votre vie courante est dans l’habitude.'

function storedRow(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'd1',
    userId: 'user-1',
    month: '2026-09',
    reading: 'everyday',
    window: 6,
    deductReimbursements: true,
    deductPendingReimbursements: true,
    insights: {},
    text: 'Paragraphe déjà écrit.',
    model: 'claude-haiku-5-5',
    inputTokens: 2400,
    outputTokens: 380,
    generatedAt: new Date('2026-10-01T09:00:00.000Z'),
    ...overrides,
  }
}

describe('TrendDigestService', () => {
  let service: TrendDigestService
  const prisma = {
    monthlyDigest: { findUnique: vi.fn(), upsert: vi.fn() },
  }
  const trendsService = {
    getTrendsAndTotals: vi.fn(),
    // Omitted, the pending switch follows the preference: on here.
    deductsPending: vi.fn(
      (_userId: string, f: { deductPendingReimbursements?: boolean }) =>
        Promise.resolve(f.deductPendingReimbursements ?? true)
    ),
  }
  const ai = { writeDigest: vi.fn() }
  let logged: unknown[]

  beforeEach(async () => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    prisma.monthlyDigest.findUnique.mockResolvedValue(null)
    prisma.monthlyDigest.upsert.mockImplementation(
      ({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve(storedRow({ ...create }))
    )
    trendsService.getTrendsAndTotals.mockResolvedValue({
      trends: trends(),
      totals,
    })
    ai.writeDigest.mockResolvedValue({
      text: VERIFIED,
      model: 'claude-haiku-5-5',
      inputTokens: 2510,
      outputTokens: 402,
    })
    logged = []
    vi.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
      logged.push(message)
    })
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendDigestService,
        { provide: PrismaService, useValue: prisma },
        { provide: TrendsService, useValue: trendsService },
        { provide: AiSuggestionsService, useValue: ai },
      ],
    }).compile()
    service = module.get(TrendDigestService)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** The `trend_digest` event lines, readable format. */
  const digestEvents = (): string[] =>
    logged.filter(
      (m): m is string => typeof m === 'string' && m.startsWith('trend_digest')
    )

  it('hands back the remembered paragraph without asking the model', async () => {
    prisma.monthlyDigest.findUnique.mockResolvedValue(storedRow())

    const digest = await service.getDigest(
      'user-1',
      { month: '2026-09' },
      { now }
    )

    expect(digest).toEqual({
      month: '2026-09',
      reading: 'everyday',
      window: 6,
      text: 'Paragraphe déjà écrit.',
      model: 'claude-haiku-5-5',
      generatedAt: '2026-10-01T09:00:00.000Z',
    })
    expect(prisma.monthlyDigest.findUnique).toHaveBeenCalledWith({
      where: {
        userId_month_reading_window_deductReimbursements_deductPendingReimbursements:
          {
            userId: 'user-1',
            month: '2026-09',
            reading: 'everyday',
            window: 6,
            deductReimbursements: true,
            deductPendingReimbursements: true,
          },
      },
    })
    expect(trendsService.getTrendsAndTotals).not.toHaveBeenCalled()
    expect(ai.writeDigest).not.toHaveBeenCalled()
  })

  it('reads the last closed month, six months, everyday, when nothing is asked', async () => {
    await service.getDigest('user-1', {}, { now })

    expect(trendsService.getTrendsAndTotals).toHaveBeenCalledWith(
      'user-1',
      {
        month: '2026-09',
        reading: 'everyday',
        window: 6,
        deductReimbursements: true,
        deductPendingReimbursements: true,
      },
      now
    )
  })

  it('keys the paragraph on the switches as the trends read them, the preference standing in for an omission', async () => {
    trendsService.deductsPending.mockResolvedValueOnce(false)

    await service.getDigest(
      'user-1',
      { month: '2026-09', deductReimbursements: false },
      { now }
    )

    expect(trendsService.deductsPending).toHaveBeenCalledWith('user-1', {
      month: '2026-09',
      deductReimbursements: false,
    })
    expect(prisma.monthlyDigest.findUnique).toHaveBeenCalledWith({
      where: {
        userId_month_reading_window_deductReimbursements_deductPendingReimbursements:
          expect.objectContaining({
            deductReimbursements: false,
            deductPendingReimbursements: false,
          }),
      },
    })
    expect(trendsService.getTrendsAndTotals).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        deductReimbursements: false,
        deductPendingReimbursements: false,
      }),
      now
    )
  })

  it('writes, checks and remembers a paragraph at the first opening', async () => {
    const digest = await service.getDigest(
      'user-1',
      { month: '2026-09', window: 3, deductReimbursements: false },
      { now }
    )

    expect(digest?.text).toBe(VERIFIED)
    expect(digest?.window).toBe(3)
    // The reimbursement switches reach the trends the paragraph reads.
    expect(trendsService.getTrendsAndTotals).toHaveBeenCalledWith(
      'user-1',
      {
        month: '2026-09',
        reading: 'everyday',
        window: 3,
        deductReimbursements: false,
        deductPendingReimbursements: true,
      },
      now
    )
    const [system, user] = ai.writeDigest.mock.calls[0] as [string, string]
    expect(system).toContain('Trois à cinq phrases')
    expect(user).toContain('<user_financial_data>')
    expect(user).toContain('Restaurants et bars')

    const upsert = prisma.monthlyDigest.upsert.mock.calls[0]?.[0] as {
      where: unknown
      create: Record<string, unknown>
    }
    expect(upsert.where).toEqual({
      userId_month_reading_window_deductReimbursements_deductPendingReimbursements:
        {
          userId: 'user-1',
          month: '2026-09',
          reading: 'everyday',
          window: 3,
          deductReimbursements: false,
          deductPendingReimbursements: true,
        },
    })
    expect(upsert.create).toMatchObject({
      text: VERIFIED,
      model: 'claude-haiku-5-5',
      inputTokens: 2510,
      outputTokens: 402,
      generatedAt: now,
    })
    // The trends as the model read them, not the response.
    expect(upsert.create.insights).toMatchObject({
      month: '2026-09',
      trends: [{ unit: 'Restaurants et bars', current: 312 }],
    })
    expect(digestEvents()).toEqual([
      expect.stringContaining('outcome=generated'),
    ])
    expect(digestEvents()[0]).toContain('inputTokens=2510')
  })

  it('answers nothing without an API key, and never asks', async () => {
    delete process.env.ANTHROPIC_API_KEY

    await expect(service.getDigest('user-1', {}, { now })).resolves.toBeNull()
    expect(ai.writeDigest).not.toHaveBeenCalled()
    expect(digestEvents()[0]).toContain('reason=no_api_key')
  })

  it('answers nothing on a history too short for habits', async () => {
    trendsService.getTrendsAndTotals.mockResolvedValue({
      trends: trends({ completeMonths: 2, insights: [] }),
      totals,
    })

    await expect(service.getDigest('user-1', {}, { now })).resolves.toBeNull()
    expect(ai.writeDigest).not.toHaveBeenCalled()
    expect(digestEvents()[0]).toContain('reason=short_history')
  })

  it('answers nothing when nothing moved: the quiet sentence says it', async () => {
    trendsService.getTrendsAndTotals.mockResolvedValue({
      trends: trends({ insights: [], quietSentence: 'Rien de notable.' }),
      totals,
    })

    await expect(service.getDigest('user-1', {}, { now })).resolves.toBeNull()
    expect(ai.writeDigest).not.toHaveBeenCalled()
    expect(digestEvents()[0]).toContain('reason=nothing_to_say')
  })

  it('answers nothing when the model fails or refuses, and remembers nothing', async () => {
    ai.writeDigest.mockRejectedValue(
      new Error('Anthropic stop_reason: refusal, no tool call')
    )

    await expect(service.getDigest('user-1', {}, { now })).resolves.toBeNull()
    expect(prisma.monthlyDigest.upsert).not.toHaveBeenCalled()
    expect(digestEvents()[0]).toContain('reason=model_failed')
  })

  it('rejects a paragraph with a number the trends do not carry', async () => {
    ai.writeDigest.mockResolvedValue({
      text: 'Les restaurants coûtent 86 € de plus, soit 4 074 € sur le mois.',
      model: 'claude-haiku-5-5',
      inputTokens: 2510,
      outputTokens: 402,
    })

    await expect(service.getDigest('user-1', {}, { now })).resolves.toBeNull()
    expect(prisma.monthlyDigest.upsert).not.toHaveBeenCalled()
    const [event] = digestEvents()
    expect(event).toContain('reason=unverified')
    // How many, never which: the numbers are amounts.
    expect(event).toContain('unverified=1')
    expect(event).not.toContain('4074')
  })

  it('rejects an empty paragraph', async () => {
    ai.writeDigest.mockResolvedValue({
      text: '',
      model: 'claude-haiku-5-5',
      inputTokens: 1,
      outputTokens: 1,
    })

    await expect(service.getDigest('user-1', {}, { now })).resolves.toBeNull()
    expect(digestEvents()[0]).toContain('reason=empty')
  })

  it('writes again on « Régénérer », whatever is remembered', async () => {
    prisma.monthlyDigest.findUnique.mockResolvedValue(storedRow())

    const digest = await service.getDigest('user-1', {}, { now, force: true })

    expect(ai.writeDigest).toHaveBeenCalledTimes(1)
    expect(digest?.text).toBe(VERIFIED)
    expect(digestEvents()[0]).toContain('outcome=regenerated')
  })

  it('keeps the remembered paragraph when a regeneration fails', async () => {
    prisma.monthlyDigest.findUnique.mockResolvedValue(storedRow())
    ai.writeDigest.mockRejectedValue(new Error('overloaded'))

    const digest = await service.getDigest('user-1', {}, { now, force: true })

    expect(digest?.text).toBe('Paragraphe déjà écrit.')
    expect(prisma.monthlyDigest.upsert).not.toHaveBeenCalled()
    expect(digestEvents()[0]).toContain('kept=true')
  })
})
