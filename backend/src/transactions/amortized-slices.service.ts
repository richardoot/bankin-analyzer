/**
 * Lot 1 of the smoothed purchases (agent-os/product/amortization-framework.md):
 * the everyday reading spreads a smoothed purchase over its months.
 *
 * ## What it reads
 *
 * One query per statistics call, built around the `amortized_slices` CTE:
 * every smoothed expense of the user becomes `months` monthly slices, from
 * `date_trunc('month', t.date)`, each worth `net / months` rounded to the
 * cent, the last absorbing the rounding gap so the slices sum to the net
 * exactly. Nothing is materialised: a reimbursement recorded later lowers the
 * net, so every slice, past ones included, follows.
 *
 * The rows come back per purchase, with the slices that fall in the window
 * and whether the purchase itself is dated inside it. The caller turns that
 * into an everyday shift: everyday = real − exceptional − source + slices,
 * where `source` is the purchase's own net when the real reading counted it.
 * The real reading is never touched: the shift is a separate query.
 *
 * ## Which rows are smoothed
 *
 * The service refuses the incoherent cases, but bank sync and the legacy
 * migration write rows past it. So the CTE re-checks what the framework says:
 *
 *  - an expense only: `type = 'EXPENSE'` and a negative amount. A smoothed
 *    income, transfer or refund counts whole at its date, as before;
 *  - never an episode: a smoothed row that still carries an exceptional tag is
 *    read as exceptional, exactly as before the feature — the tag wins, the
 *    smoothing is ignored. That keeps the row out of the everyday reading
 *    once, rather than removing it twice or spreading an episode;
 *  - the same scope as the real query (account exclusion, category), passed
 *    by the caller, so the source removed is exactly the one the real
 *    aggregation added.
 *
 * ## Window
 *
 * A slice belongs to a month. It counts when its month overlaps the window
 * (`firstMonth`..`lastMonth`), the way a budget plan reads whole months. The
 * source counts when its date falls in [start, end], the real query's own
 * bound. Future slices count too when the window reaches them: they are what a
 * plan to come is already committed to, like a subscription.
 *
 * Only the smoothed rows are expanded, and the scan is bounded by
 * `(user_id, date)` to the 59 months before the window, so the series never
 * runs over the whole history.
 */
import { Injectable } from '@nestjs/common'
import { Prisma } from '../generated/prisma'
import { PrismaService } from '../prisma/prisma.service'
import {
  PENDING_CREDIT_SCALED,
  REIMBURSEMENT_CREDIT_JOINS,
  reimbursementCreditCtes,
} from '../reimbursements/reimbursement-credit.sql'
import {
  EFFECTIVE_RHYTHM,
  IS_RECURRING,
  recurringTransactionsJoin,
} from '../recurrences/recurrence-rhythm.sql'
import { AMORTIZATION_MAX_MONTHS } from './amortization'

/** One slice of a smoothed purchase, inside the window. */
export interface AmortizedSlice {
  /** `YYYY-MM` */
  month: string
  amount: number
}

/** A smoothed purchase that touches the window, with its slices there. */
export interface SmoothedPurchaseRow {
  transaction_id: string
  description: string
  /** `YYYY-MM-DD` */
  date: string
  months: number
  /** Net of reimbursements and divided, as the real reading counts it. */
  net: number
  /** The regular slice, `net / months` to the cent; the last one may differ. */
  monthly: number
  /** `YYYY-MM` of the first and last slice. */
  first_month: string
  last_month: string
  category_id: string | null
  category_name: string
  category_icon: string | null
  subcategory_id: string | null
  subcategory: string
  subcategory_icon: string | null
  nature: string | null
  /** The source row's own effective rhythm, to take it off the structure. */
  rhythm: string | null
  is_recurring: boolean
  /** Debt still owed on it, divided — for the out-of-period pending pass. */
  pending: number
  /** `YYYY-MM` of the purchase itself. */
  source_month: string
  /** The purchase is dated inside the window: the real reading counted it. */
  source_in_window: boolean
  /** Slices whose month overlaps the window, chronological. */
  slices: AmortizedSlice[]
}

export interface AmortizedSlicesQuery {
  userId: string
  /** The same net expression as the real aggregation, so the two agree. */
  netAmount: Prisma.Sql
  /** The real reading's bounds on `t.date`. */
  start: Date
  end: Date
  /** First and last month whose slices count, as `YYYY-MM-01`. */
  firstMonth: string
  lastMonth: string
  /**
   * Predicate mirroring the real query's scope, given `t`, `c` and `a`
   * (account exclusion, category required...).
   */
  scope: Prisma.Sql
}

/** `YYYY-MM-01` of the UTC month `date` falls in. */
export function utcMonthStart(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

@Injectable()
export class AmortizedSlicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The smoothed purchases touching the window, slices included. */
  async read(query: AmortizedSlicesQuery): Promise<SmoothedPurchaseRow[]> {
    const { userId, netAmount, start, end, firstMonth, lastMonth, scope } =
      query
    if (firstMonth > lastMonth) return []

    return this.prisma.$queryRaw<SmoothedPurchaseRow[]>(Prisma.sql`
      WITH exceptional_tx AS (
        SELECT DISTINCT tt.transaction_id
        FROM app.transaction_tags tt
        JOIN app.tags tg ON tg.id = tt.tag_id
        WHERE tg.user_id = ${userId} AND tg.is_exceptional = true
      ),
      ${reimbursementCreditCtes(userId)},
      amortized_source AS (
        SELECT
          t.id AS transaction_id,
          t.description,
          t.date,
          t.amortization_months::int AS months,
          (${netAmount})::numeric AS net,
          (${PENDING_CREDIT_SCALED})::numeric AS pending,
          t.category_id,
          COALESCE(c.name, 'Autre') AS category_name,
          c.icon AS category_icon,
          t.subcategory_id,
          COALESCE(sc.name, '') AS subcategory,
          sc.icon AS subcategory_icon,
          COALESCE(sc.nature, c.default_nature)::text AS nature,
          ${EFFECTIVE_RHYTHM} AS rhythm,
          ${IS_RECURRING} AS is_recurring,
          (t.date >= ${start} AND t.date <= ${end}) AS source_in_window
        FROM app.transactions t
        LEFT JOIN app.categories c ON c.id = t.category_id
        LEFT JOIN app.subcategories sc ON sc.id = t.subcategory_id
        LEFT JOIN app.accounts a ON a.id = t.account_id
        ${recurringTransactionsJoin(userId)}
        ${REIMBURSEMENT_CREDIT_JOINS}
        WHERE t.user_id = ${userId}
          AND t.amortization_months IS NOT NULL
          -- An expense only: sync and the legacy migration bypass the service.
          AND t.type = 'EXPENSE'
          AND t.amount < 0
          -- The window's slices start at most 59 months after the purchase.
          AND t.date >= (${firstMonth}::date - make_interval(months => ${AMORTIZATION_MAX_MONTHS - 1}::int))
          AND t.date <= ${end}
          -- An episode stays an episode: the tag wins over the smoothing.
          AND NOT EXISTS (
            SELECT 1 FROM exceptional_tx et WHERE et.transaction_id = t.id
          )
          AND ${scope}
      ),
      amortized_slices AS (
        SELECT
          s.transaction_id,
          (date_trunc('month', s.date::timestamp) + make_interval(months => gs.k))::date AS slice_month,
          CASE
            WHEN gs.k < s.months - 1 THEN ROUND(s.net / s.months, 2)
            -- The last slice absorbs the rounding gap: the sum is the net.
            ELSE s.net - ROUND(s.net / s.months, 2) * (s.months - 1)
          END AS amount
        FROM amortized_source s
        CROSS JOIN LATERAL generate_series(0, s.months - 1) AS gs(k)
      ),
      slices_in_window AS (
        SELECT
          sl.transaction_id,
          json_agg(
            json_build_object(
              'month', TO_CHAR(sl.slice_month, 'YYYY-MM'),
              'amount', sl.amount::float
            )
            ORDER BY sl.slice_month
          ) AS slices
        FROM amortized_slices sl
        WHERE sl.slice_month >= ${firstMonth}::date
          AND sl.slice_month <= ${lastMonth}::date
        GROUP BY sl.transaction_id
      )
      SELECT
        s.transaction_id,
        s.description,
        TO_CHAR(s.date, 'YYYY-MM-DD') AS date,
        s.months,
        s.net::float AS net,
        ROUND(s.net / s.months, 2)::float AS monthly,
        TO_CHAR(s.date, 'YYYY-MM') AS first_month,
        TO_CHAR(date_trunc('month', s.date::timestamp) + make_interval(months => s.months - 1), 'YYYY-MM') AS last_month,
        s.category_id,
        s.category_name,
        s.category_icon,
        s.subcategory_id,
        s.subcategory,
        s.subcategory_icon,
        s.nature,
        s.rhythm,
        s.is_recurring,
        s.pending::float AS pending,
        TO_CHAR(s.date, 'YYYY-MM') AS source_month,
        s.source_in_window,
        COALESCE(w.slices, '[]'::json) AS slices
      FROM amortized_source s
      LEFT JOIN slices_in_window w ON w.transaction_id = s.transaction_id
      WHERE s.source_in_window OR w.transaction_id IS NOT NULL
      ORDER BY s.date, s.transaction_id
    `)
  }
}

/** Sum of a purchase's slices inside the window. */
export function slicesTotal(row: SmoothedPurchaseRow): number {
  return row.slices.reduce((sum, slice) => sum + slice.amount, 0)
}

/**
 * What the everyday reading changes for this purchase, month by month:
 * + each slice in the window, − the purchase itself when the real reading
 * counted it.
 */
export function everydayShiftByMonth(
  row: SmoothedPurchaseRow
): Map<string, number> {
  const shift = new Map<string, number>()
  for (const slice of row.slices) {
    shift.set(slice.month, (shift.get(slice.month) ?? 0) + slice.amount)
  }
  if (row.source_in_window) {
    shift.set(row.source_month, (shift.get(row.source_month) ?? 0) - row.net)
  }
  return shift
}

/** The whole shift over the window: slices in it, minus the counted source. */
export function everydayShift(row: SmoothedPurchaseRow): number {
  return slicesTotal(row) - (row.source_in_window ? row.net : 0)
}
