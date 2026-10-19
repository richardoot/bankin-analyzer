import { TagBaselineService, categorySurplus } from './tag-baseline.service'
import { TagFamiliesService } from '../tag-families/tag-families.service'
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
  TagAnalysisCategoryDto,
  TagAnalysisMonthDto,
  TagBudgetSummaryDto,
  TagBudgetSummaryItemDto,
} from './dto'
import { calendarDayIn, tagEventStatus } from './tag-status'
import {
  exceptionalOnSmoothedError,
  SMOOTHED_ROWS_NAMED,
} from '../transactions/amortization'

/** What a tag response reads besides the row: its count and its family. */
const TAG_INCLUDE = {
  _count: { select: { transactions: true } },
  family: { select: { id: true, name: true, color: true } },
} as const

type TagFamilySummary = { id: string; name: string; color: string | null }

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

/** Raw row: one exceptional tag weighed against its envelope. */
interface TagBudgetRow {
  id: string
  name: string
  color: string | null
  icon: string | null
  event_start_date: Date | null
  event_end_date: Date | null
  budget_amount: number | null
  family_id?: string | null
  spent: number
}

/** Raw row: what a family's tags spent in a window, each transaction once. */
interface FamilyBudgetRow {
  family_id: string
  spent: number
}

/**
 * Whole months between two days, both inclusive — the convention of a
 * budget plan's `monthCount`, so the prorata matches the plan's reserve.
 */
export function windowMonthCount(start: Date, end: Date): number {
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1
  return Math.max(1, months)
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly baselines: TagBaselineService,
    private readonly families: TagFamiliesService
  ) {}

  /**
   * `today` is the Paris calendar day the status is read against; a list
   * computes it once so every tag of the response agrees.
   */
  private toResponse(
    tag: Tag & {
      _count?: { transactions: number }
      family?: TagFamilySummary | null
    },
    today: string = calendarDayIn(new Date())
  ): TagResponseDto {
    const eventStartDate = toIsoDate(tag.eventStartDate)
    const eventEndDate = toIsoDate(tag.eventEndDate)
    return {
      id: tag.id,
      name: tag.name,
      color: tag.color,
      icon: tag.icon,
      transactionCount: tag._count?.transactions ?? 0,
      isExceptional: tag.isExceptional,
      eventStartDate,
      eventEndDate,
      budgetAmount: tag.budgetAmount === null ? null : Number(tag.budgetAmount),
      status: tagEventStatus(eventStartDate, eventEndDate, today),
      familyId: tag.familyId,
      family: tag.family
        ? { id: tag.family.id, name: tag.family.name, color: tag.family.color }
        : null,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    }
  }

  async findAllByUser(userId: string): Promise<TagResponseDto[]> {
    const tags = await this.prisma.tag.findMany({
      where: { userId },
      include: TAG_INCLUDE,
      orderBy: { name: 'asc' },
    })
    const today = calendarDayIn(new Date())
    return tags.map(t => this.toResponse(t, today))
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
        tg.family_id,
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
               tg.event_start_date, tg.event_end_date, tg.budget_amount,
               tg.family_id
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

    const toItem = (r: TagBudgetRow): TagBudgetSummaryItemDto => ({
      id: r.id,
      name: r.name,
      color: r.color,
      icon: r.icon,
      eventStartDate: toIsoDate(r.event_start_date),
      eventEndDate: toIsoDate(r.event_end_date),
      budgetAmount: r.budget_amount === null ? null : round(r.budget_amount),
      spent: round(r.spent ?? 0),
    })

    // A family with an annual envelope is charged as a whole, prorated to
    // the window, in place of its tags' envelopes. It is listed even with no
    // tag in the window: "4 000 € a year" commits the reserve by itself.
    const enveloped = await this.prisma.tagFamily.findMany({
      where: { userId, annualBudget: { not: null } },
      orderBy: { name: 'asc' },
    })
    const familySpent = new Map<string, number>()
    if (enveloped.length > 0) {
      const spentRows = await this.prisma.$queryRaw<FamilyBudgetRow[]>(
        Prisma.sql`
          WITH family_tx AS (
            SELECT DISTINCT tg.family_id, tt.transaction_id
            FROM app.transaction_tags tt
            JOIN app.tags tg ON tg.id = tt.tag_id
            WHERE tg.user_id = ${userId}
              AND tg.is_exceptional = true
              AND tg.family_id IN (${Prisma.join(enveloped.map(f => f.id))})
          )
          SELECT
            ft.family_id,
            COALESCE(SUM(
              CASE WHEN t.type = 'EXPENSE'
                THEN ABS(t.amount::numeric) / COALESCE(a.divisor, 1)
                ELSE -t.amount::numeric / COALESCE(a.divisor, 1)
              END
            ), 0)::float AS spent
          FROM family_tx ft
          JOIN app.transactions t
            ON t.id = ft.transaction_id
           AND t.date >= ${start}
           AND t.date <= ${end}
          LEFT JOIN app.accounts a ON a.id = t.account_id
          WHERE COALESCE(a.is_excluded_from_stats, false) = false
          GROUP BY ft.family_id
        `
      )
      for (const r of spentRows) familySpent.set(r.family_id, r.spent ?? 0)
    }

    const months = windowMonthCount(start, end)
    const envelopedIds = new Set(enveloped.map(f => f.id))
    const families = enveloped.map(f => {
      const annualBudget = Number(f.annualBudget)
      return {
        id: f.id,
        name: f.name,
        color: f.color,
        icon: f.icon,
        annualBudget,
        proratedBudget: round((annualBudget * months) / 12),
        spent: round(familySpent.get(f.id) ?? 0),
        items: rows.filter(r => r.family_id === f.id).map(toItem),
      }
    })
    const items = rows
      .filter(r => !r.family_id || !envelopedIds.has(r.family_id))
      .map(toItem)

    return {
      items,
      families,
      totalBudget: round(
        items.reduce((s, i) => s + (i.budgetAmount ?? 0), 0) +
          families.reduce((s, f) => s + f.proratedBudget, 0)
      ),
      totalSpent: round(
        items.reduce((s, i) => s + i.spent, 0) +
          families.reduce((s, f) => s + f.spent, 0)
      ),
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
      include: TAG_INCLUDE,
    })
    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`)
    }
    return this.toResponse(tag)
  }

  async create(userId: string, dto: CreateTagDto): Promise<TagResponseDto> {
    // Someone else's family is a 404, as it would be on its own route.
    if (dto.familyId) await this.families.assertOwned(dto.familyId, userId)
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
          familyId: dto.familyId ?? null,
        },
        include: TAG_INCLUDE,
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
    const current = await this.getOwned(id, userId)
    // Turning a tag exceptional turns every row it carries into an episode,
    // which a smoothed purchase cannot be.
    if (dto.isExceptional === true && !current.isExceptional) {
      await this.assertNoneSmoothed({ tags: { some: { tagId: id } } }, userId)
    }
    if (dto.familyId) await this.families.assertOwned(dto.familyId, userId)
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
          ...(dto.familyId !== undefined && { familyId: dto.familyId }),
        },
        include: TAG_INCLUDE,
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
    const tag = await this.getOwned(tagId, userId)

    // An exceptional tag makes each row an episode; a smoothed purchase stays
    // in everyday life. Refused as a whole rather than skipping those rows,
    // so the user is told instead of finding some rows silently untagged.
    if (tag.isExceptional) {
      await this.assertNoneSmoothed({ id: { in: transactionIds } }, userId)
    }

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

  /**
   * Refuse when any of the user's transactions matching `where` is smoothed,
   * naming a few of them so the user knows which to look at.
   */
  private async assertNoneSmoothed(
    where: Prisma.TransactionWhereInput,
    userId: string
  ): Promise<void> {
    const smoothedWhere: Prisma.TransactionWhereInput = {
      AND: [where, { userId, amortizationMonths: { not: null } }],
    }
    const [total, named] = await Promise.all([
      this.prisma.transaction.count({ where: smoothedWhere }),
      this.prisma.transaction.findMany({
        where: smoothedWhere,
        select: { description: true },
        orderBy: { date: 'desc' },
        take: SMOOTHED_ROWS_NAMED,
      }),
    ])
    if (total > 0) {
      throw exceptionalOnSmoothedError(
        named.map(t => t.description),
        total
      )
    }
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
   * Aggregate every transaction carrying the tag: totals, per-category and
   * per-month breakdowns. Mirrors the dashboard conventions — expenses use
   * ABS, amounts are divided by the account divisor (joint accounts) and
   * stats-excluded accounts are ignored.
   */
  async getAnalysis(tagId: string, userId: string): Promise<TagAnalysisDto> {
    // The family rides along: the page links to it.
    const tag = await this.prisma.tag.findFirst({
      where: { id: tagId, userId },
      include: { family: TAG_INCLUDE.family },
    })
    if (!tag) throw new NotFoundException(`Tag with ID ${tagId} not found`)

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
          AND t.type IN ('EXPENSE', 'INCOME')
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
          AND t.type IN ('EXPENSE', 'INCOME')
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
          AND t.type IN ('EXPENSE', 'INCOME')
          AND COALESCE(a.is_excluded_from_stats, false) = false
      `),
    ])

    const reference = await this.baselines.computeBaseline(tag, userId)

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
          const { baselineAmount, surplusAmount } = categorySurplus(
            amount,
            r.category_id,
            reference
          )
          dto.baselineAmount = baselineAmount
          dto.surplusAmount = surplusAmount
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
        family: tag.family
          ? {
              id: tag.family.id,
              name: tag.family.name,
              color: tag.family.color,
            }
          : null,
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
