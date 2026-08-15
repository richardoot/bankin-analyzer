import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type { Tag } from '../generated/prisma'
import type {
  CreateTagDto,
  UpdateTagDto,
  TagResponseDto,
  TagAnalysisDto,
  TagAnalysisBaselineDto,
  TagAnalysisCategoryDto,
  TagAnalysisMonthDto,
  TagBudgetSummaryDto,
} from './dto'
import {
  countDaysInWindow,
  daysBetweenInclusive,
  toEventIntervals,
} from '../common/exceptional-periods'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Raw row: per-category aggregation for one tag. */
interface TagCategoryRow {
  category_id: string | null
  category_name: string
  category_icon: string | null
  type: string
  transaction_count: number
  total_amount: number
}

/** Raw row: per-month aggregation for one tag. */
interface TagMonthRow {
  month_key: string
  expenses: number
  income: number
}

/** Raw row: overall summary for one tag. */
interface TagSummaryRow {
  total_expenses: number
  total_income: number
  transaction_count: number
  first_date: Date | null
  last_date: Date | null
}

/** Raw row: everyday spending per category over the reference window. */
interface BaselineCategoryRow {
  category_id: string | null
  total_amount: number
}

/** Raw row: one exceptional tag weighed against its envelope. */
interface TagBudgetRow {
  id: string
  name: string
  color: string | null
  icon: string | null
  event_start_date: Date | null
  event_end_date: Date | null
  budget_amount: number | null
  spent: number
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/** `@db.Date` columns come back as UTC midnights; keep only the calendar day. */
function toIsoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null
}

/** Parse a `YYYY-MM-DD` payload into the UTC midnight Postgres expects. */
function parseEventDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  return new Date(value)
}

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(
    tag: Tag & { _count?: { transactions: number } }
  ): TagResponseDto {
    return {
      id: tag.id,
      name: tag.name,
      color: tag.color,
      icon: tag.icon,
      transactionCount: tag._count?.transactions ?? 0,
      isExceptional: tag.isExceptional,
      eventStartDate: toIsoDate(tag.eventStartDate),
      eventEndDate: toIsoDate(tag.eventEndDate),
      budgetAmount: tag.budgetAmount === null ? null : Number(tag.budgetAmount),
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    }
  }

  async findAllByUser(userId: string): Promise<TagResponseDto[]> {
    const tags = await this.prisma.tag.findMany({
      where: { userId },
      include: { _count: { select: { transactions: true } } },
      orderBy: { name: 'asc' },
    })
    return tags.map(t => this.toResponse(t))
  }

  /**
   * Every exceptional tag overlapping a window, with what it has cost so far.
   *
   * A tag is in scope when its declared event period overlaps the window, or —
   * for an additive event that declares none — when it carries a transaction
   * inside it. Both are charged against the plan's project reserve.
   */
  async getBudgetSummary(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<TagBudgetSummaryDto> {
    const start = new Date(startDate)
    const end = new Date(endDate)

    const rows = await this.prisma.$queryRaw<TagBudgetRow[]>(Prisma.sql`
      SELECT
        tg.id,
        tg.name,
        tg.color,
        tg.icon,
        tg.event_start_date,
        tg.event_end_date,
        tg.budget_amount::float AS budget_amount,
        COALESCE(SUM(
          CASE WHEN t.type = 'EXPENSE'
            THEN ABS(t.amount::numeric) / COALESCE(a.divisor, 1)
            ELSE -t.amount::numeric / COALESCE(a.divisor, 1)
          END
        ), 0)::float AS spent
      FROM app.tags tg
      LEFT JOIN app.transaction_tags tt ON tt.tag_id = tg.id
      LEFT JOIN app.transactions t
        ON t.id = tt.transaction_id
       AND t.date >= ${start}
       AND t.date <= ${end}
      LEFT JOIN app.accounts a ON a.id = t.account_id
      WHERE tg.user_id = ${userId}
        AND tg.is_exceptional = true
        AND COALESCE(a.is_excluded_from_stats, false) = false
      GROUP BY tg.id, tg.name, tg.color, tg.icon,
               tg.event_start_date, tg.event_end_date, tg.budget_amount
      HAVING
        (
          tg.event_start_date IS NOT NULL
          AND tg.event_end_date IS NOT NULL
          AND tg.event_start_date <= ${end}
          AND tg.event_end_date >= ${start}
        )
        OR COUNT(t.id) > 0
      ORDER BY tg.event_start_date ASC NULLS LAST, tg.name ASC
    `)

    const items = rows.map(r => ({
      id: r.id,
      name: r.name,
      color: r.color,
      icon: r.icon,
      eventStartDate: toIsoDate(r.event_start_date),
      eventEndDate: toIsoDate(r.event_end_date),
      budgetAmount: r.budget_amount === null ? null : round(r.budget_amount),
      spent: round(r.spent ?? 0),
    }))

    return {
      items,
      totalBudget: round(items.reduce((s, i) => s + (i.budgetAmount ?? 0), 0)),
      totalSpent: round(items.reduce((s, i) => s + i.spent, 0)),
    }
  }

  /** Fetch a tag ensuring it belongs to the user. */
  private async getOwned(id: string, userId: string): Promise<Tag> {
    const tag = await this.prisma.tag.findFirst({ where: { id, userId } })
    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`)
    }
    return tag
  }

  async findOne(id: string, userId: string): Promise<TagResponseDto> {
    const tag = await this.prisma.tag.findFirst({
      where: { id, userId },
      include: { _count: { select: { transactions: true } } },
    })
    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`)
    }
    return this.toResponse(tag)
  }

  async create(userId: string, dto: CreateTagDto): Promise<TagResponseDto> {
    try {
      const tag = await this.prisma.tag.create({
        data: {
          userId,
          name: dto.name,
          color: dto.color ?? null,
          icon: dto.icon ?? null,
          isExceptional: dto.isExceptional ?? false,
          eventStartDate: parseEventDate(dto.eventStartDate),
          eventEndDate: parseEventDate(dto.eventEndDate),
          budgetAmount: dto.budgetAmount ?? null,
        },
        include: { _count: { select: { transactions: true } } },
      })
      return this.toResponse(tag)
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(`A tag named "${dto.name}" already exists`)
      }
      throw e
    }
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateTagDto
  ): Promise<TagResponseDto> {
    await this.getOwned(id, userId)
    try {
      const tag = await this.prisma.tag.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.color !== undefined && { color: dto.color }),
          ...(dto.icon !== undefined && { icon: dto.icon }),
          ...(dto.isExceptional !== undefined && {
            isExceptional: dto.isExceptional,
          }),
          ...(dto.eventStartDate !== undefined && {
            eventStartDate: parseEventDate(dto.eventStartDate),
          }),
          ...(dto.eventEndDate !== undefined && {
            eventEndDate: parseEventDate(dto.eventEndDate),
          }),
          ...(dto.budgetAmount !== undefined && {
            budgetAmount: dto.budgetAmount,
          }),
        },
        include: { _count: { select: { transactions: true } } },
      })
      return this.toResponse(tag)
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(`A tag named "${dto.name}" already exists`)
      }
      throw e
    }
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.getOwned(id, userId)
    await this.prisma.tag.delete({ where: { id } })
  }

  /**
   * Attach a tag to several transactions. Only transactions owned by the user
   * are linked; unknown or foreign ids are silently ignored. Existing links are
   * left untouched (skipDuplicates). Returns how many links now exist for the
   * requested ids.
   */
  async attachTransactions(
    tagId: string,
    userId: string,
    transactionIds: string[]
  ): Promise<{ attached: number }> {
    await this.getOwned(tagId, userId)

    // Keep only transactions that actually belong to the user.
    const owned = await this.prisma.transaction.findMany({
      where: { id: { in: transactionIds }, userId },
      select: { id: true },
    })

    if (owned.length === 0) return { attached: 0 }

    const result = await this.prisma.transactionTag.createMany({
      data: owned.map(t => ({ tagId, transactionId: t.id })),
      skipDuplicates: true,
    })

    return { attached: result.count }
  }

  /** Remove the link between a tag and a single transaction. */
  async detachTransaction(
    tagId: string,
    userId: string,
    transactionId: string
  ): Promise<void> {
    await this.getOwned(tagId, userId)
    await this.prisma.transactionTag.deleteMany({
      where: { tagId, transactionId },
    })
  }

  /**
   * Everyday spending rate per category, projected onto the event's duration.
   *
   * The reference is the 12 months preceding the event (clamped to the user's
   * actual history), stripped of every exceptional transaction and normalised
   * over the days actually spent living an everyday life. Returns null when the
   * tag declares no period: such an event is *additive* (a party at home did
   * not stop the user buying groceries), so no baseline should be deducted.
   */
  private async computeBaseline(
    tag: Tag,
    userId: string
  ): Promise<{
    baseline: TagAnalysisBaselineDto
    ratePerCategory: Map<string | null, number>
  } | null> {
    if (!tag.eventStartDate || !tag.eventEndDate) return null

    const eventDays = daysBetweenInclusive(tag.eventStartDate, tag.eventEndDate)
    if (eventDays <= 0) return null

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
    const rows = await this.prisma.$queryRaw<BaselineCategoryRow[]>(Prisma.sql`
      SELECT
        c.id AS category_id,
        SUM(ABS(t.amount::numeric) / COALESCE(a.divisor, 1))::float AS total_amount
      FROM app.transactions t
      LEFT JOIN app.categories c ON c.id = t.category_id
      LEFT JOIN app.accounts a ON a.id = t.account_id
      WHERE t.user_id = ${userId}
        AND t.type = 'EXPENSE'
        AND t.date >= ${refStart}
        AND t.date <= ${refEnd}
        AND COALESCE(a.is_excluded_from_stats, false) = false
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

  /**
   * Aggregate every transaction carrying the tag: totals, per-category and
   * per-month breakdowns. Mirrors the dashboard conventions — expenses use
   * ABS, amounts are divided by the account divisor (joint accounts) and
   * stats-excluded accounts are ignored.
   */
  async getAnalysis(tagId: string, userId: string): Promise<TagAnalysisDto> {
    const tag = await this.getOwned(tagId, userId)

    const [categoryRows, monthRows, summaryRows] = await Promise.all([
      this.prisma.$queryRaw<TagCategoryRow[]>(Prisma.sql`
        SELECT
          c.id AS category_id,
          COALESCE(c.name, 'Autre') AS category_name,
          c.icon AS category_icon,
          t.type::text AS type,
          COUNT(*)::int AS transaction_count,
          SUM(
            CASE WHEN t.type = 'EXPENSE'
              THEN ABS(t.amount::numeric) / COALESCE(a.divisor, 1)
              ELSE t.amount::numeric / COALESCE(a.divisor, 1)
            END
          )::float AS total_amount
        FROM app.transaction_tags tt
        JOIN app.transactions t ON t.id = tt.transaction_id
        LEFT JOIN app.categories c ON c.id = t.category_id
        LEFT JOIN app.accounts a ON a.id = t.account_id
        WHERE tt.tag_id = ${tagId}
          AND t.user_id = ${userId}
          AND COALESCE(a.is_excluded_from_stats, false) = false
        GROUP BY c.id, COALESCE(c.name, 'Autre'), c.icon, t.type
      `),
      this.prisma.$queryRaw<TagMonthRow[]>(Prisma.sql`
        SELECT
          TO_CHAR(t.date, 'YYYY-MM') AS month_key,
          SUM(
            CASE WHEN t.type = 'EXPENSE'
              THEN ABS(t.amount::numeric) / COALESCE(a.divisor, 1)
              ELSE 0 END
          )::float AS expenses,
          SUM(
            CASE WHEN t.type = 'INCOME'
              THEN t.amount::numeric / COALESCE(a.divisor, 1)
              ELSE 0 END
          )::float AS income
        FROM app.transaction_tags tt
        JOIN app.transactions t ON t.id = tt.transaction_id
        LEFT JOIN app.accounts a ON a.id = t.account_id
        WHERE tt.tag_id = ${tagId}
          AND t.user_id = ${userId}
          AND COALESCE(a.is_excluded_from_stats, false) = false
        GROUP BY TO_CHAR(t.date, 'YYYY-MM')
        ORDER BY month_key ASC
      `),
      this.prisma.$queryRaw<TagSummaryRow[]>(Prisma.sql`
        SELECT
          SUM(
            CASE WHEN t.type = 'EXPENSE'
              THEN ABS(t.amount::numeric) / COALESCE(a.divisor, 1)
              ELSE 0 END
          )::float AS total_expenses,
          SUM(
            CASE WHEN t.type = 'INCOME'
              THEN t.amount::numeric / COALESCE(a.divisor, 1)
              ELSE 0 END
          )::float AS total_income,
          COUNT(*)::int AS transaction_count,
          MIN(t.date) AS first_date,
          MAX(t.date) AS last_date
        FROM app.transaction_tags tt
        JOIN app.transactions t ON t.id = tt.transaction_id
        LEFT JOIN app.accounts a ON a.id = t.account_id
        WHERE tt.tag_id = ${tagId}
          AND t.user_id = ${userId}
          AND COALESCE(a.is_excluded_from_stats, false) = false
      `),
    ])

    const reference = await this.computeBaseline(tag, userId)

    let totalSurplus: number | null = reference ? 0 : null

    const byCategory: TagAnalysisCategoryDto[] = categoryRows
      .map(r => {
        const type =
          r.type === 'INCOME' ? ('INCOME' as const) : ('EXPENSE' as const)
        const amount = round(r.total_amount ?? 0)

        const dto: TagAnalysisCategoryDto = {
          categoryId: r.category_id,
          categoryName: r.category_name,
          categoryIcon: r.category_icon,
          type,
          amount,
          transactionCount: r.transaction_count,
        }

        if (reference && type === 'EXPENSE') {
          const rate = reference.ratePerCategory.get(r.category_id) ?? 0
          const baselineAmount = round(rate * reference.baseline.eventDays)
          dto.baselineAmount = baselineAmount
          dto.surplusAmount = round(amount - baselineAmount)
          totalSurplus = round((totalSurplus ?? 0) + dto.surplusAmount)
        }

        return dto
      })
      .sort((a, b) => b.amount - a.amount)

    const byMonth: TagAnalysisMonthDto[] = monthRows.map(r => ({
      month: r.month_key,
      expenses: round(r.expenses ?? 0),
      income: round(r.income ?? 0),
    }))

    const summary = summaryRows[0]
    const totalExpenses = round(summary?.total_expenses ?? 0)
    const totalIncome = round(summary?.total_income ?? 0)

    return {
      tag: {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        icon: tag.icon,
        isExceptional: tag.isExceptional,
        eventStartDate: toIsoDate(tag.eventStartDate),
        eventEndDate: toIsoDate(tag.eventEndDate),
        budgetAmount:
          tag.budgetAmount === null ? null : Number(tag.budgetAmount),
      },
      totalExpenses,
      totalIncome,
      net: round(totalIncome - totalExpenses),
      transactionCount: summary?.transaction_count ?? 0,
      firstDate: summary?.first_date ? summary.first_date.toISOString() : null,
      lastDate: summary?.last_date ? summary.last_date.toISOString() : null,
      byCategory,
      byMonth,
      baseline: reference?.baseline ?? null,
      totalSurplus,
    }
  }
}
