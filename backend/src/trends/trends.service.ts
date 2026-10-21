/**
 * Lot 0 of the spending trends (agent-os/product/spending-trends.md): read
 * the registry the way the dashboard does and hand it to the detection. No
 * endpoint yet; lot 1 wires the controller and the card.
 */
import { Injectable } from '@nestjs/common'
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
    // The committed reading joins the recurrence cache: bring it up to date.
    await this.recurrences.refreshQuietly(userId)

    const month = filters.month ?? lastClosedMonth(now)
    const deductPending =
      filters.deductPendingReimbursements ??
      (await this.filterPreferences.deductsPendingByDefault(userId))

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

    return detectTrends(registry, {
      now,
      month,
      window: filters.window ?? TREND_RULES.defaultWindow,
      reading: filters.reading ?? 'everyday',
    })
  }
}
