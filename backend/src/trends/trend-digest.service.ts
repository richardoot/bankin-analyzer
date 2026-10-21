/**
 * The paragraph under « Ce qui change » (agent-os/product/spending-trends.md,
 * lot 5): written by Claude from the trends of a closed month, checked
 * number by number, then remembered in `monthly_digests`.
 *
 * Optional by design. Whatever goes wrong — no API key, the model down or
 * refusing, a number the data does not carry — the answer is no paragraph,
 * never an error: the card shows the list alone, as it did before lot 5.
 * The reason goes to the log, as a `trend_digest` event.
 */
import { Injectable, Logger } from '@nestjs/common'
import { AiSuggestionsService } from '../ai-suggestions/ai-suggestions.service'
import { recordEvent } from '../common/metrics'
import type { MonthlyDigest } from '../generated/prisma'
import { PrismaService } from '../prisma/prisma.service'
import type { MonthlyDigestDto } from './dto'
import {
  DIGEST_SYSTEM_PROMPT,
  buildDigestInput,
  digestUserPrompt,
  unverifiedNumbers,
} from './trend.digest'
import {
  TREND_RULES,
  lastClosedMonth,
  type TrendReading,
  type TrendWindow,
} from './trend.detection'
import { TrendsService, type TrendsFilters } from './trends.service'

/** Why no paragraph: logged, never shown. */
export type DigestSkipReason =
  | 'no_api_key'
  | 'short_history'
  | 'nothing_to_say'
  | 'model_failed'
  | 'unverified'
  | 'empty'

/** Under this many complete months the habits are silent: nothing to tell. */
const MIN_HISTORY = 3

@Injectable()
export class TrendDigestService {
  private readonly logger = new Logger(TrendDigestService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly trends: TrendsService,
    private readonly ai: AiSuggestionsService
  ) {}

  /**
   * The month's paragraph: the remembered one when there is one (no call to
   * the model), else written, checked, remembered and returned. With
   * `force` (« Régénérer »), written again whatever is remembered — and when
   * that fails, the remembered paragraph stays: a failed regeneration never
   * takes away a paragraph that was fine.
   *
   * A month not closed yet is refused as `GET /trends` refuses it.
   */
  async getDigest(
    userId: string,
    filters: TrendsFilters = {},
    options: { force?: boolean; now?: Date } = {}
  ): Promise<MonthlyDigestDto | null> {
    const now = options.now ?? new Date()
    const month = filters.month ?? lastClosedMonth(now)
    const reading: TrendReading = filters.reading ?? 'everyday'
    const window: TrendWindow = filters.window ?? TREND_RULES.defaultWindow
    const key = { userId, month, reading, window }

    const stored = await this.prisma.monthlyDigest.findUnique({
      where: { userId_month_reading_window: key },
    })
    if (stored && !options.force) return toDto(stored)

    const skip = (
      reason: DigestSkipReason,
      extra: Record<string, number | null> = {}
    ): MonthlyDigestDto | null => {
      recordEvent(this.logger, 'trend_digest', {
        userId,
        month,
        reading,
        window,
        outcome: 'skipped',
        reason,
        kept: stored !== null,
        ...extra,
      })
      return stored ? toDto(stored) : null
    }

    // The application does not boot without it today (AiSuggestionsService
    // refuses to); checked anyway, so a paragraph never costs a crash.
    if (!process.env.ANTHROPIC_API_KEY) return skip('no_api_key')

    const { trends, totals } = await this.trends.getTrendsAndTotals(
      userId,
      { ...filters, month, reading, window },
      now
    )
    if (trends.completeMonths < MIN_HISTORY) return skip('short_history')
    // « Rien de notable » already says it in one sentence.
    if (trends.insights.length === 0) return skip('nothing_to_say')

    const input = buildDigestInput(trends, totals)
    let written: Awaited<ReturnType<AiSuggestionsService['writeDigest']>>
    try {
      written = await this.ai.writeDigest(
        DIGEST_SYSTEM_PROMPT,
        digestUserPrompt(input)
      )
    } catch (error) {
      // A refusal (`stop_reason: refusal`) lands here too: no tool call,
      // nothing to parse.
      this.logger.warn(
        `Digest of ${month} could not be written: ${error instanceof Error ? error.message : String(error)}`
      )
      return skip('model_failed')
    }
    if (written.text === '') return skip('empty')

    const unverified = unverifiedNumbers(written.text, input)
    if (unverified.length > 0) {
      // How many, never which: a number of this paragraph is an amount.
      return skip('unverified', {
        unverified: unverified.length,
        inputTokens: written.inputTokens,
        outputTokens: written.outputTokens,
      })
    }

    const data = {
      insights: input as unknown as object,
      text: written.text,
      model: written.model,
      inputTokens: written.inputTokens,
      outputTokens: written.outputTokens,
      generatedAt: now,
    }
    const saved = await this.prisma.monthlyDigest.upsert({
      where: { userId_month_reading_window: key },
      create: { ...key, ...data },
      update: data,
    })
    recordEvent(this.logger, 'trend_digest', {
      userId,
      month,
      reading,
      window,
      outcome: stored ? 'regenerated' : 'generated',
      insights: trends.insights.length,
      inputTokens: written.inputTokens,
      outputTokens: written.outputTokens,
    })
    return toDto(saved)
  }
}

function toDto(row: MonthlyDigest): MonthlyDigestDto {
  return {
    month: row.month,
    reading: row.reading === 'real' ? 'real' : 'everyday',
    window: row.window,
    text: row.text,
    model: row.model,
    generatedAt: row.generatedAt.toISOString(),
  }
}
