/**
 * The spending trends (agent-os/product/spending-trends.md): read the
 * registry the way the dashboard does and hand it to the detection. Served
 * by `GET /trends`, the dashboard's « Ce qui change » card.
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { recordEvent, timed } from '../common/metrics'
import { roundCents } from '../common/money'
import { FilterPreferencesService } from '../filter-preferences/filter-preferences.service'
import { PrismaService } from '../prisma/prisma.service'
import { RecurrencesService } from '../recurrences/recurrences.service'
import { AmortizedSlicesService } from '../transactions/amortized-slices.service'
import {
  TREND_RULES,
  addMonths,
  aggregateMonths,
  detectTrends,
  lastClosedMonth,
  type TrendReading,
  type TrendRegistry,
  type TrendWindow,
  type TrendsResult,
} from './trend.detection'
import type { DigestTotals } from './trend.digest'
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
    return (await this.read(userId, filters, now)).trends
  }

  /**
   * The trends, and the month's totals the written digest reads beside
   * them (lot 5): the everyday and the real expenses, the income and the
   * savings, out of the very registry the trends were read from — so the
   * paragraph and the list can never disagree about a month. The savings
   * are the dashboard's: income less real expenses, unrounded, rounded once
   * with `roundCents`, so the two agree to the cent even on a half-cent.
   */
  async getTrendsAndTotals(
    userId: string,
    filters: TrendsFilters = {},
    now: Date = new Date()
  ): Promise<{ trends: TrendsResult; totals: DigestTotals }> {
    const { trends, registry } = await this.read(userId, filters, now)
    const month = trends.month
    const totalOf = (reading: TrendReading): number =>
      aggregateMonths(registry, reading, [month]).get(month)?.total ?? 0
    const income =
      (registry.flows ?? []).find(f => f.month === month)?.income ?? 0
    const real = totalOf('real')
    return {
      trends,
      totals: {
        everyday: totalOf('everyday'),
        real,
        income,
        savings: roundCents(income - real),
      },
    }
  }

  /**
   * Whether a debt still owed is taken off: as asked, else the user's
   * preference, as on the dashboard. Public for the digest, whose key holds
   * the value the trends were read with, never an omission.
   */
  async deductsPending(
    userId: string,
    filters: Pick<TrendsFilters, 'deductPendingReimbursements'>
  ): Promise<boolean> {
    return (
      filters.deductPendingReimbursements ??
      (await this.filterPreferences.deductsPendingByDefault(userId))
    )
  }

  private async read(
    userId: string,
    filters: TrendsFilters,
    now: Date
  ): Promise<{ trends: TrendsResult; registry: TrendRegistry }> {
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

    // The committed reading joins the recurrence cache, and trends 9 and 10
    // read it: bring it up to date.
    await this.recurrences.refreshQuietly(userId)
    const deductPending = await this.deductsPending(userId, filters)

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
        // Trends 9 and 10 read the series the refresh above just rebuilt.
        const recurrences = await this.recurrences.readCache(userId)
        return {
          registry,
          lines: registry.lines.length,
          trends: detectTrends(
            { ...registry, recurrences },
            { now, month, window, reading }
          ),
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
    return { trends: result.trends, registry: result.registry }
  }
}
