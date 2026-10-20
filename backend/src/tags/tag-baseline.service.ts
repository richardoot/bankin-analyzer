import { Injectable } from '@nestjs/common'
import {
  EFFECTIVE_RHYTHM,
  recurringTransactionsJoin,
} from '../recurrences/recurrence-rhythm.sql'
import { RecurrencesService } from '../recurrences/recurrences.service'
import { TagNettingService } from './tag-netting.service'
import type { TagNetting } from './tag-netting.service'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type { Tag } from '../generated/prisma'
import type { TagAnalysisBaselineDto } from './dto'
import {
  countDaysInWindow,
  daysBetweenInclusive,
  toEventIntervals,
} from '../common/exceptional-periods'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** What the baseline reads of a tag: its id and its event window. */
export type BaselineTag = Pick<Tag, 'id' | 'eventStartDate' | 'eventEndDate'>

/** An edition's everyday reference: the window, and a daily rate per category. */
export interface TagBaseline {
  baseline: TagAnalysisBaselineDto
  ratePerCategory: Map<string | null, number>
}

/** Raw row: everyday spending per category over the reference window. */
interface BaselineCategoryRow {
  category_id: string | null
  total_amount: number
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * What one expense category of an event cost on top of an ordinary stretch of
 * the same length. The tag analysis applies it per category and sums; the
 * family analysis sums the tags' sums, it never recomputes a baseline.
 */
export function categorySurplus(
  amount: number,
  categoryId: string | null,
  reference: TagBaseline
): { baselineAmount: number; surplusAmount: number } {
  const rate = reference.ratePerCategory.get(categoryId) ?? 0
  const baselineAmount = round(rate * reference.baseline.eventDays)
  return { baselineAmount, surplusAmount: round(amount - baselineAmount) }
}

/**
 * The everyday reference of a dated tag, shared by the tag analysis and the
 * family analysis. A provider of its own so that both modules import it
 * without importing each other (the tags module already imports the
 * families module, to check the family a tag is filed under).
 */
@Injectable()
export class TagBaselineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recurrences: RecurrencesService,
    private readonly netting: TagNettingService
  ) {}

  /** Refresh the recurrence cache once before several `skipRefresh` calls. */
  async refreshRecurrences(userId: string): Promise<void> {
    await this.recurrences.refreshQuietly(userId)
  }

  /**
   * Everyday spending rate per category, projected onto the event's duration.
   *
   * The reference is the 12 months preceding the event (clamped to the user's
   * actual history), stripped of every exceptional transaction and normalised
   * over the days actually spent living an everyday life. Only the *variable*
   * subcategories count: a trip suspends groceries and fuel, not rent or
   * insurance, so committed spending is never part of what gets deducted. Returns null when the
   * tag declares no period: such an event is *additive* (a party at home did
   * not stop the user buying groceries), so no baseline should be deducted.
   */
  async computeBaseline(
    tag: BaselineTag,
    userId: string,
    options: { skipRefresh?: boolean; netting?: TagNetting } = {}
  ): Promise<TagBaseline | null> {
    if (!tag.eventStartDate || !tag.eventEndDate) return null

    const eventDays = daysBetweenInclusive(tag.eventStartDate, tag.eventEndDate)
    if (eventDays <= 0) return null

    // The baseline leaves out what is committed, recurrences included. A
    // caller weighing several editions refreshes once, then skips it here.
    if (!options.skipRefresh) await this.recurrences.refreshQuietly(userId)

    // Reference window: the 12 months ending the day before the event starts.
    const refEnd = new Date(tag.eventStartDate.getTime() - MS_PER_DAY)
    let refStart = new Date(
      Date.UTC(
        refEnd.getUTCFullYear() - 1,
        refEnd.getUTCMonth(),
        refEnd.getUTCDate() + 1
      )
    )

    // Clamp to the user's history: dividing four months of data by a full year
    // would silently halve every baseline.
    const firstTransaction = await this.prisma.transaction.findFirst({
      where: { userId },
      orderBy: { date: 'asc' },
      select: { date: true },
    })
    if (!firstTransaction) return null
    if (firstTransaction.date > refStart) refStart = firstTransaction.date
    if (refEnd < refStart) return null

    // Days of the window swallowed by other events, removed from the divisor.
    const exceptionalTags = await this.prisma.tag.findMany({
      where: {
        userId,
        isExceptional: true,
        eventStartDate: { not: null, lte: refEnd },
        eventEndDate: { not: null, gte: refStart },
      },
      select: { eventStartDate: true, eventEndDate: true },
    })
    const exceptionalDays = countDaysInWindow(
      toEventIntervals(exceptionalTags),
      refStart,
      refEnd
    )

    const everydayDays =
      daysBetweenInclusive(refStart, refEnd) - exceptionalDays
    if (everydayDays <= 0) return null

    // Everyday expenses per category. Transactions carrying an exceptional tag
    // are excluded, and so are this tag's own — an event paid for in advance
    // (a deposit booked months earlier) would otherwise inflate its own
    // reference and hide the surplus it is meant to reveal.
    // Net of reimbursements, as the dashboard reads the same months: a
    // reference built on gross figures would overstate what a trip suspends.
    const net = options.netting ?? (await this.netting.forUser(userId))
    const rows = await this.prisma.$queryRaw<BaselineCategoryRow[]>(Prisma.sql`
      WITH ${net.ctes}
      SELECT
        c.id AS category_id,
        SUM(${net.amount})::float AS total_amount
      FROM app.transactions t
      LEFT JOIN app.categories c ON c.id = t.category_id
      LEFT JOIN app.subcategories sc ON sc.id = t.subcategory_id
      LEFT JOIN app.accounts a ON a.id = t.account_id
      ${net.joins}
      ${recurringTransactionsJoin(userId)}
      WHERE t.user_id = ${userId}
        AND t.type = 'EXPENSE'
        AND t.date >= ${refStart}
        AND t.date <= ${refEnd}
        AND COALESCE(a.is_excluded_from_stats, false) = false
        -- Only what the trip suspends. Rent, insurance, a subscription keep
        -- running while the user is away, so they are never deducted from an
        -- event's surplus. Unknown (legacy rows) counts as variable, which is
        -- what every row used to be. A line of a detected recurrence is
        -- committed whatever its subcategory says.
        AND ${EFFECTIVE_RHYTHM} IS DISTINCT FROM 'COMMITTED'
        -- A smoothed purchase is committed too: its slices keep falling
        -- while the user is away, like rent, so a trip suspends none of it.
        -- Left in, a phone bought in the reference year would inflate the
        -- daily rate and hide the trip's surplus.
        AND (t.amortization_months IS NULL OR t.amount >= 0)
        AND NOT EXISTS (
          SELECT 1
          FROM app.transaction_tags tt2
          JOIN app.tags tg2 ON tg2.id = tt2.tag_id
          WHERE tt2.transaction_id = t.id
            AND (tg2.is_exceptional = true OR tg2.id = ${tag.id})
        )
      GROUP BY c.id
    `)

    const ratePerCategory = new Map<string | null, number>()
    for (const row of rows) {
      ratePerCategory.set(
        row.category_id,
        (row.total_amount ?? 0) / everydayDays
      )
    }

    return {
      baseline: {
        startDate: refStart.toISOString().slice(0, 10),
        endDate: refEnd.toISOString().slice(0, 10),
        everydayDays,
        eventDays,
      },
      ratePerCategory,
    }
  }
}
