/**
 * The spending trends (agent-os/product/spending-trends.md): read the
 * registry the way the dashboard does and hand it to the detection. Served
 * by `GET /trends`, the dashboard's « Ce qui change » card.
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { recordEvent, timed } from '../common/metrics'
import { FilterPreferencesService } from '../filter-preferences/filter-preferences.service'
import { PrismaService } from '../prisma/prisma.service'
import { RecurrencesService } from '../recurrences/recurrences.service'
import { AmortizedSlicesService } from '../transactions/amortized-slices.service'
import {
  TREND_RULES,
  addMonths,
  detectTrends,
  lastClosedMonth,
  type TrendReading,
  type TrendWindow,
  type TrendsResult,
} from './trend.detection'
import { readTrendRegistry } from './trend.registry'

export interface TrendsFilters {
  /** `YYYY-MM`; the last closed month by default. */
  month?: string
  window?: TrendWindow
  reading?: TrendReading
  deductReimbursements?: boolean
  deductPendingReimbursements?: boolean
}

/** What the longest reference reads: the month and the twelve before it. */
const SPAN_MONTHS = Math.max(
  ...TREND_RULES.windows,
  TREND_RULES.seriesMonths - 1
)

@Injectable()
export class TrendsService {
  private readonly logger = new Logger(TrendsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly filterPreferences: FilterPreferencesService,
    private readonly recurrences: RecurrencesService,
    private readonly amortizedSlices: AmortizedSlicesService
  ) {}

  async getTrends(
    userId: string,
    filters: TrendsFilters = {},
    now: Date = new Date()
  ): Promise<TrendsResult> {
    const closed = lastClosedMonth(now)
    const month = filters.month ?? closed
    // Two thirds of a month always read as a drop: only a closed one.
    if (month > closed) {
      throw new BadRequestException(
        `Le mois ${month} n'est pas encore clos : le dernier mois clos est ${closed}.`
      )
    }
    const window = filters.window ?? TREND_RULES.defaultWindow
    const reading = filters.reading ?? 'everyday'

    // The committed reading joins the recurrence cache: bring it up to date.
    await this.recurrences.refreshQuietly(userId)
    const deductPending =
      filters.deductPendingReimbursements ??
      (await this.filterPreferences.deductsPendingByDefault(userId))

    // Measured first: a cache (`trend_states`) is only worth building once
    // production says the read is slow. The event carries what it weighed.
    const { result, durationMs } = await timed(
      'trends',
      'trends read',
      async () => {
        const registry = await readTrendRegistry(
          this.prisma,
          this.amortizedSlices,
          {
            userId,
            firstMonth: addMonths(month, -SPAN_MONTHS),
            lastMonth: month,
            deductReceived: filters.deductReimbursements !== false,
            deductPending,
          }
        )
        return {
          lines: registry.lines.length,
          trends: detectTrends(registry, { now, month, window, reading }),
        }
      }
    )
    recordEvent(this.logger, 'trends_read', {
      userId,
      month,
      window,
      reading,
      lines: result.lines,
      insights: result.trends.insights.length,
      durationMs,
    })
    return result.trends
  }
}
