/**
 * The paragraph under « Ce qui change » (agent-os/product/spending-trends.md,
 * lot 5): written by Claude from the trends of a closed month, checked
 * number by number, then remembered in `monthly_digests` under a
 * fingerprint of what the model read (user, month, `input_hash`).
 *
 * The fingerprint is the key, not the view: two views that read the same
 * figures share one paragraph, and a line reclassified after the paragraph
 * was written moves a figure, hence the hash, and asks for a new one.
 *
 * Optional by design. Whatever goes wrong — no API key, the model down or
 * refusing, a number the data does not carry — the answer is no paragraph,
 * never an error: the card shows the list alone, as it did before lot 5;
 * or the last paragraph of the same view, marked `stale`, when there is
 * one. The reason goes to the log, as a `trend_digest` event.
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
  digestInputHash,
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
   * The month's paragraph. The trends and totals are read first (cheap),
   * the model's input built and hashed, then looked up on (user, month,
   * hash): a hit is handed back without a call to the model. A miss is
   * written, checked and remembered under the hash, and the other
   * paragraphs of the same view (same reading, window and switches) are
   * dropped, so a month never piles up stale paragraphs.
   *
   * With `force` (« Régénérer »), written again even on a hit, and the row
   * of the current hash rewritten.
   *
   * When no paragraph can be written for the current figures — no API key,
   * the model failing or refusing, a number it may not write, an empty
   * answer — the one of the current hash stays when there is one (a failed
   * regeneration never takes away a paragraph that was fine), else the
   * latest of the same view comes back marked `stale`: written from
   * figures that have changed since. A history too short or a month where
   * nothing moved answer nothing: the list says it, and an older paragraph
   * would contradict it.
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
    // The view the paragraph is asked for, with the switches as the trends
    // are read with them (the preference standing in for an omission):
    // information on the row, and the scope of the stale ones to drop.
    const deductReimbursements = filters.deductReimbursements !== false
    const deductPendingReimbursements = await this.trends.deductsPending(
      userId,
      filters
    )
    const view = {
      userId,
      month,
      reading,
      window,
      deductReimbursements,
      deductPendingReimbursements,
    }

    const { trends, totals } = await this.trends.getTrendsAndTotals(
      userId,
      {
        ...filters,
        month,
        reading,
        window,
        deductReimbursements,
        deductPendingReimbursements,
      },
      now
    )
    const input = buildDigestInput(trends, totals)
    const inputHash = digestInputHash(input)
    const where = { userId_month_inputHash: { userId, month, inputHash } }

    const current = await this.prisma.monthlyDigest.findUnique({ where })
    if (current && !options.force) return toDto(current, false)

    const skip = async (
      reason: DigestSkipReason,
      extra: Record<string, number | null> = {}
    ): Promise<MonthlyDigestDto | null> => {
      // The figures said there is nothing to tell: no older paragraph.
      const fallsBack =
        reason !== 'short_history' && reason !== 'nothing_to_say'
      const previous =
        current ??
        (fallsBack
          ? await this.prisma.monthlyDigest.findFirst({
              where: { ...view, inputHash: { not: inputHash } },
              orderBy: { generatedAt: 'desc' },
            })
          : null)
      const stale = current === null && previous !== null
      recordEvent(this.logger, 'trend_digest', {
        userId,
        month,
        reading,
        window,
        outcome: 'skipped',
        reason,
        kept: previous !== null,
        stale,
        ...extra,
      })
      return previous ? toDto(previous, stale) : null
    }

    // The application does not boot without it today (AiSuggestionsService
    // refuses to); checked anyway, so a paragraph never costs a crash.
    if (!process.env.ANTHROPIC_API_KEY) return skip('no_api_key')

    if (trends.completeMonths < MIN_HISTORY) return skip('short_history')
    // « Rien de notable » already says it in one sentence.
    if (trends.insights.length === 0) return skip('nothing_to_say')

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
      ...view,
      insights: input as unknown as object,
      text: written.text,
      model: written.model,
      inputTokens: written.inputTokens,
      outputTokens: written.outputTokens,
      generatedAt: now,
    }
    const saved = await this.prisma.monthlyDigest.upsert({
      where,
      create: { ...data, inputHash },
      update: data,
    })
    // The paragraphs this view held for figures it no longer shows.
    const { count: replaced } = await this.prisma.monthlyDigest.deleteMany({
      where: { ...view, inputHash: { not: inputHash } },
    })
    recordEvent(this.logger, 'trend_digest', {
      userId,
      month,
      reading,
      window,
      outcome: current ? 'regenerated' : 'generated',
      replaced,
      insights: trends.insights.length,
      inputTokens: written.inputTokens,
      outputTokens: written.outputTokens,
    })
    return toDto(saved, false)
  }
}

function toDto(row: MonthlyDigest, stale: boolean): MonthlyDigestDto {
  return {
    month: row.month,
    reading: row.reading === 'real' ? 'real' : 'everyday',
    window: row.window,
    text: row.text,
    model: row.model,
    generatedAt: row.generatedAt.toISOString(),
    stale,
  }
}
