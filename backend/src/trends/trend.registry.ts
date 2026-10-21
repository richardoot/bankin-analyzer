/**
 * Reads what the trend detection needs out of the ledger, with the
 * dashboard's own SQL fragments so the two agree to the cent: net of
 * reimbursements through `netAmountSql`, divided by the account's divisor,
 * stats-excluded accounts out, exceptional lines and recurrence lines marked
 * the way the dashboard's aggregation marks them, smoothed purchases read by
 * `AmortizedSlicesService`.
 *
 * Shared by `TrendsService` and the dry-run script, so the two can never
 * disagree about what a trend reads. Reads only.
 */

import { Prisma } from '../generated/prisma'
import type { PrismaClient } from '../generated/prisma'
import {
  EFFECTIVE_RHYTHM,
  IS_RECURRING,
  recurringTransactionsJoin,
} from '../recurrences/recurrence-rhythm.sql'
import {
  REIMBURSEMENT_CREDIT_JOINS,
  netAmountSql,
  reimbursementCreditCtes,
} from '../reimbursements/reimbursement-credit.sql'
import type { AmortizedSlicesService } from '../transactions/amortized-slices.service'
import type {
  TrendCategory,
  TrendLine,
  TrendNature,
  TrendRegistry,
  TrendRhythm,
  TrendSubcategory,
} from './trend.detection'
import { addMonths } from './trend.detection'

export interface RegistryQuery {
  userId: string
  /** `YYYY-MM`, both included. */
  firstMonth: string
  lastMonth: string
  deductReceived: boolean
  deductPending: boolean
}

interface LineRow {
  id: string
  date: string
  amount: number
  category_id: string | null
  subcategory_id: string | null
  nature: string | null
  rhythm: string | null
  is_recurring: boolean
  is_exceptional: boolean
  description: string
}

interface CategoryRow {
  id: string
  name: string
  icon: string | null
  nature: string | null
  rhythm: string | null
}

interface SubcategoryRow extends CategoryRow {
  category_id: string
}

const asNature = (v: string | null): TrendNature | null =>
  v === 'ESSENTIAL' || v === 'PLEASURE' ? v : null
const asRhythm = (v: string | null): TrendRhythm | null =>
  v === 'COMMITTED' || v === 'VARIABLE' ? v : null

/** `YYYY-MM-01` as the UTC midnight Prisma compares `t.date` with. */
const monthStart = (month: string): Date =>
  new Date(`${month}-01T00:00:00.000Z`)

/** Same scope as the dashboard: stats-excluded accounts are out. */
const IN_STATS = Prisma.sql`COALESCE(a.is_excluded_from_stats, false) = false`

export async function readTrendRegistry(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  amortizedSlices: Pick<AmortizedSlicesService, 'read'>,
  query: RegistryQuery
): Promise<TrendRegistry> {
  const { userId, firstMonth, lastMonth } = query
  const start = monthStart(firstMonth)
  // Bucketed by `TO_CHAR(t.date, 'YYYY-MM')` like the dashboard: a row
  // dated late on the last day still belongs to its month.
  const endExclusive = monthStart(addMonths(lastMonth, 1))
  const lastInstant = new Date(endExclusive.getTime() - 1)
  const netAmount = netAmountSql({
    deductReceived: query.deductReceived,
    deductPending: query.deductPending,
  })

  // One after the other: a caller may run them inside one transaction.
  const lines = await prisma.$queryRaw<LineRow[]>(Prisma.sql`
    WITH exceptional_tx AS (
      SELECT DISTINCT tt.transaction_id
      FROM app.transaction_tags tt
      JOIN app.tags tg ON tg.id = tt.tag_id
      WHERE tg.user_id = ${userId} AND tg.is_exceptional = true
    ),
    ${reimbursementCreditCtes(userId)}
    SELECT
      t.id,
      TO_CHAR(t.date, 'YYYY-MM-DD') AS date,
      (${netAmount})::float AS amount,
      t.category_id,
      t.subcategory_id,
      COALESCE(sc.nature, c.default_nature)::text AS nature,
      ${EFFECTIVE_RHYTHM} AS rhythm,
      ${IS_RECURRING} AS is_recurring,
      (et.transaction_id IS NOT NULL) AS is_exceptional,
      t.description
    FROM app.transactions t
    LEFT JOIN app.categories c ON c.id = t.category_id
    LEFT JOIN app.subcategories sc ON sc.id = t.subcategory_id
    LEFT JOIN app.accounts a ON a.id = t.account_id
    LEFT JOIN exceptional_tx et ON et.transaction_id = t.id
    ${recurringTransactionsJoin(userId)}
    ${REIMBURSEMENT_CREDIT_JOINS}
    WHERE t.user_id = ${userId}
      AND t.type = 'EXPENSE'
      AND t.date >= ${start}
      AND t.date < ${endExclusive}
      AND ${IN_STATS}
    ORDER BY t.date, t.id
  `)
  const categories = await prisma.$queryRaw<CategoryRow[]>(Prisma.sql`
    SELECT id, name, icon, default_nature::text AS nature, default_rhythm::text AS rhythm
    FROM app.categories
    WHERE user_id = ${userId}
    ORDER BY id
  `)
  const subcategories = await prisma.$queryRaw<SubcategoryRow[]>(Prisma.sql`
    SELECT id, category_id, name, icon, nature::text AS nature, rhythm::text AS rhythm
    FROM app.subcategories
    WHERE user_id = ${userId}
    ORDER BY id
  `)
  const history = await prisma.$queryRaw<Array<{ start: string | null }>>(
    Prisma.sql`
      SELECT TO_CHAR(MIN(t.date), 'YYYY-MM-DD') AS start
      FROM app.transactions t
      WHERE t.user_id = ${userId}
    `
  )
  const smoothed = await amortizedSlices.read({
    userId,
    netAmount,
    start,
    end: lastInstant,
    firstMonth: `${firstMonth}-01`,
    lastMonth: `${lastMonth}-01`,
    scope: IN_STATS,
  })

  return {
    lines: lines.map((row): TrendLine => ({
      id: row.id,
      date: row.date,
      amount: row.amount,
      categoryId: row.category_id,
      subcategoryId: row.subcategory_id,
      nature: asNature(row.nature),
      rhythm: asRhythm(row.rhythm),
      isRecurring: row.is_recurring,
      isExceptional: row.is_exceptional,
      description: row.description,
    })),
    smoothed: smoothed.map(p => ({
      transactionId: p.transaction_id,
      categoryId: p.category_id,
      subcategoryId: p.subcategory_id,
      nature: asNature(p.nature),
      slices: p.slices,
    })),
    categories: categories.map((c): TrendCategory => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      nature: asNature(c.nature),
      rhythm: asRhythm(c.rhythm),
    })),
    subcategories: subcategories.map((s): TrendSubcategory => ({
      id: s.id,
      categoryId: s.category_id,
      name: s.name,
      icon: s.icon,
      nature: asNature(s.nature),
      rhythm: asRhythm(s.rhythm),
    })),
    historyStart: history[0]?.start ?? null,
  }
}
