import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type { Tag } from '../generated/prisma'
import { daysBetweenInclusive } from '../common/exceptional-periods'
import { calendarDayIn, tagEventStatus } from '../tags/tag-status'
import {
  TagBaselineService,
  categorySurplus,
} from '../tags/tag-baseline.service'
import type { TagAnalysisCategoryDto } from '../tags/dto/tag-analysis.dto'
import type {
  TagFamilyAnalysisBasis,
  TagFamilyAnalysisDto,
  TagFamilyAnalysisTagDto,
  TagFamilyAnalysisYearDto,
  TagFamilyEditionComparisonDto,
  TagFamilyEditionRefDto,
} from './dto'

/** Raw row: the family's transactions, each once, per year and category. */
interface FamilyRow {
  year: number
  category_id: string | null
  category_name: string
  category_icon: string | null
  type: string
  transaction_count: number
  total_amount: number
}

/** Raw row: one tag's transactions per category, with both of their years. */
interface TagRow {
  tag_id: string
  category_id: string | null
  type: string
  event_year: number
  cash_year: number
  transaction_count: number
  total_amount: number
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/** `@db.Date` columns come back as UTC midnights; keep only the calendar day. */
function toIsoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null
}

function isDated(
  tag: Pick<Tag, 'eventStartDate' | 'eventEndDate'>
): tag is Tag & { eventStartDate: Date; eventEndDate: Date } {
  return tag.eventStartDate !== null && tag.eventEndDate !== null
}

/**
 * The dated editions of a scope weighed against each other: those with at
 * least one transaction, the ones the scope only partly covers left out (half
 * an edition is not an edition). Null when none is left.
 */
export function compareEditions(
  tags: TagFamilyAnalysisTagDto[]
): TagFamilyEditionComparisonDto | null {
  const editions = tags.filter(
    t => t.days !== null && t.transactionCount > 0 && !t.isPartial
  )
  if (editions.length === 0) return null

  const spent = editions.map(e => e.spent).sort((a, b) => a - b)
  const middle = Math.floor(spent.length / 2)
  const median =
    spent.length % 2 === 1
      ? (spent[middle] ?? 0)
      : ((spent[middle - 1] ?? 0) + (spent[middle] ?? 0)) / 2
  const totalSpent = spent.reduce((sum, s) => sum + s, 0)
  const totalDays = editions.reduce((sum, e) => sum + (e.days ?? 0), 0)

  // reduce keeps the first of equals: the order of `tags` breaks a tie.
  const most = editions.reduce((a, b) => (b.spent > a.spent ? b : a))
  const least = editions.reduce((a, b) => (b.spent < a.spent ? b : a))
  const ref = (e: TagFamilyAnalysisTagDto): TagFamilyEditionRefDto => ({
    id: e.id,
    name: e.name,
    spent: e.spent,
  })

  return {
    editionCount: editions.length,
    averageSpent: round(totalSpent / editions.length),
    medianSpent: round(median),
    averagePerDay: totalDays > 0 ? round(totalSpent / totalDays) : 0,
    mostExpensive: ref(most),
    leastExpensive: ref(least),
  }
}

/**
 * The analysis of a family: the union of its tags, read with the conventions
 * of a tag's own analysis (expenses in ABS, divided by the account divisor,
 * stats-excluded accounts ignored).
 *
 * The family never recomputes what a tag computes: the surplus of each
 * edition comes from the shared baseline, the family sums it.
 */
@Injectable()
export class TagFamilyAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly baselines: TagBaselineService
  ) {}

  async getAnalysis(
    familyId: string,
    userId: string,
    options: { year?: number; basis?: TagFamilyAnalysisBasis } = {}
  ): Promise<TagFamilyAnalysisDto> {
    const basis = options.basis ?? 'event'
    const year = options.year ?? null

    const family = await this.prisma.tagFamily.findFirst({
      where: { id: familyId, userId },
    })
    if (!family) throw new NotFoundException(`Tag family ${familyId} not found`)

    // Event basis: a transaction belongs to the year its dated tag starts in.
    // Carrying two dated tags of the family that start in different years
    // (rare: an edition and the next one's deposit on a single line), it
    // goes to the earliest start, so that it is counted in one year only.
    // Without a dated tag of the family, it keeps its own year.
    const yearOf =
      basis === 'event'
        ? Prisma.sql`EXTRACT(YEAR FROM COALESCE(ft.event_start, t.date))::int`
        : Prisma.sql`EXTRACT(YEAR FROM t.date)::int`

    const [tags, familyRows, tagRows] = await Promise.all([
      this.prisma.tag.findMany({ where: { familyId, userId } }),
      // Each transaction once: grouped by transaction first, whatever number
      // of the family's tags it carries.
      this.prisma.$queryRaw<FamilyRow[]>(Prisma.sql`
        WITH family_tx AS (
          SELECT
            tt.transaction_id,
            MIN(
              CASE WHEN tg.event_start_date IS NOT NULL
                    AND tg.event_end_date IS NOT NULL
                THEN tg.event_start_date END
            ) AS event_start
          FROM app.transaction_tags tt
          JOIN app.tags tg ON tg.id = tt.tag_id
          WHERE tg.family_id = ${familyId}
            AND tg.user_id = ${userId}
          GROUP BY tt.transaction_id
        )
        SELECT
          ${yearOf} AS year,
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
        FROM family_tx ft
        JOIN app.transactions t ON t.id = ft.transaction_id
        LEFT JOIN app.categories c ON c.id = t.category_id
        LEFT JOIN app.accounts a ON a.id = t.account_id
        WHERE t.user_id = ${userId}
          AND t.type IN ('EXPENSE', 'INCOME')
          AND COALESCE(a.is_excluded_from_stats, false) = false
        GROUP BY 1, c.id, COALESCE(c.name, 'Autre'), c.icon, t.type
      `),
      // Per tag, not deduplicated: a line shared by two tags is in both.
      // The year of a tag's line is the tag's own start, which differs from
      // the family's only for a line carrying two dated editions.
      this.prisma.$queryRaw<TagRow[]>(Prisma.sql`
        SELECT
          tg.id AS tag_id,
          t.category_id AS category_id,
          t.type::text AS type,
          EXTRACT(YEAR FROM COALESCE(
            CASE WHEN tg.event_end_date IS NOT NULL
              THEN tg.event_start_date END,
            t.date
          ))::int AS event_year,
          EXTRACT(YEAR FROM t.date)::int AS cash_year,
          COUNT(*)::int AS transaction_count,
          SUM(
            CASE WHEN t.type = 'EXPENSE'
              THEN ABS(t.amount::numeric) / COALESCE(a.divisor, 1)
              ELSE t.amount::numeric / COALESCE(a.divisor, 1)
            END
          )::float AS total_amount
        FROM app.tags tg
        JOIN app.transaction_tags tt ON tt.tag_id = tg.id
        JOIN app.transactions t ON t.id = tt.transaction_id
        LEFT JOIN app.accounts a ON a.id = t.account_id
        WHERE tg.family_id = ${familyId}
          AND tg.user_id = ${userId}
          AND t.user_id = ${userId}
          AND t.type IN ('EXPENSE', 'INCOME')
          AND COALESCE(a.is_excluded_from_stats, false) = false
        GROUP BY tg.id, t.category_id, t.type, event_year, cash_year
      `),
    ])

    const inScope = (y: number): boolean => year === null || y === year

    // Family: totals, years and categories, from the deduplicated rows.
    const availableYears = [...new Set(familyRows.map(r => r.year))].sort(
      (a, b) => a - b
    )
    const scopedRows = familyRows.filter(r => inScope(r.year))

    const years = new Map<number, TagFamilyAnalysisYearDto>()
    const categories = new Map<string, TagAnalysisCategoryDto>()
    let totalExpenses = 0
    let totalIncome = 0
    let transactionCount = 0
    for (const r of scopedRows) {
      const amount = r.total_amount ?? 0
      const isIncome = r.type === 'INCOME'
      const y = years.get(r.year) ?? {
        year: r.year,
        expenses: 0,
        income: 0,
        transactionCount: 0,
      }
      if (isIncome) y.income += amount
      else y.expenses += amount
      y.transactionCount += r.transaction_count
      years.set(r.year, y)

      const key = `${r.category_id ?? ''}|${r.type}`
      const c = categories.get(key) ?? {
        categoryId: r.category_id,
        categoryName: r.category_name,
        categoryIcon: r.category_icon,
        type: isIncome ? ('INCOME' as const) : ('EXPENSE' as const),
        amount: 0,
        transactionCount: 0,
      }
      c.amount += amount
      c.transactionCount += r.transaction_count
      categories.set(key, c)

      if (isIncome) totalIncome += amount
      else totalExpenses += amount
      transactionCount += r.transaction_count
    }

    const byYear = [...years.values()]
      .map(y => ({
        ...y,
        expenses: round(y.expenses),
        income: round(y.income),
      }))
      .sort((a, b) => a.year - b.year)
    const byCategory = [...categories.values()]
      .map(c => ({ ...c, amount: round(c.amount) }))
      .sort((a, b) => b.amount - a.amount)

    // Tags: one line each, over its own transactions in scope.
    interface TagScope {
      wholeCount: number
      count: number
      spent: number
      expensesByCategory: Map<string | null, number>
    }
    const scopes = new Map<string, TagScope>()
    for (const r of tagRows) {
      const s = scopes.get(r.tag_id) ?? {
        wholeCount: 0,
        count: 0,
        spent: 0,
        expensesByCategory: new Map<string | null, number>(),
      }
      s.wholeCount += r.transaction_count
      const y = basis === 'event' ? r.event_year : r.cash_year
      if (inScope(y)) {
        s.count += r.transaction_count
        if (r.type === 'EXPENSE') {
          const amount = r.total_amount ?? 0
          s.spent += amount
          s.expensesByCategory.set(
            r.category_id,
            (s.expensesByCategory.get(r.category_id) ?? 0) + amount
          )
        }
      }
      scopes.set(r.tag_id, s)
    }

    const shown = tags.filter(tag => {
      if (year === null) return true
      if ((scopes.get(tag.id)?.count ?? 0) > 0) return true
      // An edition of the year with nothing paid yet still belongs to it.
      return (
        basis === 'event' &&
        isDated(tag) &&
        tag.eventStartDate.getUTCFullYear() === year
      )
    })

    // The surplus of an edition is its tag's: the same baseline, the same
    // per-category deduction. Only for an edition the scope covers whole.
    const editionsToWeigh = shown.filter(tag => {
      const s = scopes.get(tag.id)
      return isDated(tag) && (s?.count ?? 0) === (s?.wholeCount ?? 0)
    })
    if (editionsToWeigh.length > 0) {
      await this.baselines.refreshRecurrences(userId)
    }
    const references = new Map(
      await Promise.all(
        editionsToWeigh.map(
          async tag =>
            [
              tag.id,
              await this.baselines.computeBaseline(tag, userId, {
                skipRefresh: true,
              }),
            ] as const
        )
      )
    )

    const today = calendarDayIn(new Date())
    const tagLines: TagFamilyAnalysisTagDto[] = shown
      .map(tag => {
        const s = scopes.get(tag.id)
        const count = s?.count ?? 0
        const spent = round(s?.spent ?? 0)
        const days = isDated(tag)
          ? daysBetweenInclusive(tag.eventStartDate, tag.eventEndDate)
          : null
        const reference = references.get(tag.id) ?? null
        let surplus: number | null = null
        if (reference) {
          surplus = 0
          for (const [categoryId, amount] of s?.expensesByCategory ?? []) {
            surplus = round(
              surplus +
                categorySurplus(round(amount), categoryId, reference)
                  .surplusAmount
            )
          }
        }
        const eventStartDate = toIsoDate(tag.eventStartDate)
        const eventEndDate = toIsoDate(tag.eventEndDate)
        return {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          icon: tag.icon,
          isExceptional: tag.isExceptional,
          status: tagEventStatus(eventStartDate, eventEndDate, today),
          eventStartDate,
          eventEndDate,
          days,
          spent,
          spentPerDay: days && days > 0 ? round(spent / days) : null,
          surplus,
          budgetAmount:
            tag.budgetAmount === null ? null : Number(tag.budgetAmount),
          transactionCount: count,
          isPartial: count < (s?.wholeCount ?? 0),
        }
      })
      .sort((a, b) => {
        // Dated editions first, the latest on top; the others by name.
        if (a.eventStartDate && b.eventStartDate) {
          return b.eventStartDate.localeCompare(a.eventStartDate)
        }
        if (a.eventStartDate) return -1
        if (b.eventStartDate) return 1
        return a.name.localeCompare(b.name, 'fr')
      })

    const surpluses = tagLines
      .map(t => t.surplus)
      .filter((s): s is number => s !== null)

    return {
      family: {
        id: family.id,
        name: family.name,
        color: family.color,
        icon: family.icon,
        annualBudget:
          family.annualBudget === null ? null : Number(family.annualBudget),
      },
      basis,
      year,
      availableYears,
      totalExpenses: round(totalExpenses),
      totalIncome: round(totalIncome),
      net: round(totalIncome - totalExpenses),
      transactionCount,
      totalSurplus:
        surpluses.length > 0
          ? round(surpluses.reduce((sum, s) => sum + s, 0))
          : null,
      byCategory,
      byYear,
      tags: tagLines,
      comparison: compareEditions(tagLines),
    }
  }
}
