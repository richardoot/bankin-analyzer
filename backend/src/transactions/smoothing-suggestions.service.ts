import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  findSmoothingSuggestions,
  SUGGESTION_HABIT_MONTHS,
  type SmoothingSuggestion,
  type SuggestionRow,
} from './smoothing-suggestions'

/** How far back the candidates are looked for, by default and at most. */
export const SUGGESTION_DEFAULT_MONTHS = 6
export const SUGGESTION_MAX_MONTHS = 24

/**
 * Reads the expenses the suggestion « Épisode ou achat à lisser ? » weighs,
 * and hands them to `findSmoothingSuggestions`. Read only.
 *
 * The scope is the budget's: expenses filed somewhere, on accounts not
 * excluded from the budget. Each amount is the user's share net of the
 * reimbursements requested on it — what a smoothing would spread.
 */
@Injectable()
export class SmoothingSuggestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    options: { months?: number; now?: Date } = {}
  ): Promise<SmoothingSuggestion[]> {
    const months = Math.min(
      Math.max(Math.trunc(options.months ?? SUGGESTION_DEFAULT_MONTHS), 1),
      SUGGESTION_MAX_MONTHS
    )
    const until = options.now ?? new Date()
    const since = new Date(until)
    since.setUTCMonth(since.getUTCMonth() - months)
    const historyStart = new Date(since)
    historyStart.setUTCMonth(
      historyStart.getUTCMonth() - SUGGESTION_HABIT_MONTHS
    )

    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        type: 'EXPENSE',
        amount: { lt: 0 },
        categoryId: { not: null },
        date: { gte: historyStart, lte: until },
        accountRef: { isExcludedFromBudget: false },
      },
      select: {
        id: true,
        date: true,
        description: true,
        amount: true,
        amortizationMonths: true,
        categoryId: true,
        subcategoryId: true,
        category: {
          select: { name: true, catalogKey: true, defaultRhythm: true },
        },
        subcategoryRef: {
          select: { name: true, catalogKey: true, rhythm: true },
        },
        accountRef: { select: { divisor: true } },
        reimbursementRequests: { select: { amount: true } },
        tags: {
          where: { tag: { isExceptional: true } },
          select: { tagId: true },
        },
      },
    })

    const suggestionRows: SuggestionRow[] = rows.map(row => {
      const requested = row.reimbursementRequests.reduce(
        (sum, r) => sum + Number(r.amount),
        0
      )
      const divisor = row.accountRef.divisor || 1
      return {
        id: row.id,
        date: row.date,
        description: row.description,
        net: Math.max(0, (Math.abs(Number(row.amount)) - requested) / divisor),
        groupId: row.subcategoryId ?? `category:${row.categoryId ?? ''}`,
        category: row.category?.name ?? null,
        categoryKey: row.category?.catalogKey ?? null,
        subcategory: row.subcategoryRef?.name ?? null,
        subcategoryKey: row.subcategoryRef?.catalogKey ?? null,
        rhythm:
          row.subcategoryRef?.rhythm ?? row.category?.defaultRhythm ?? null,
        smoothed: row.amortizationMonths !== null,
        exceptional: row.tags.length > 0,
      }
    })

    return findSmoothingSuggestions(suggestionRows, { since, until })
  }
}
