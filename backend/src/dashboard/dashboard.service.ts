import { roundCents } from '../common/money'
import {
  EFFECTIVE_RHYTHM,
  IS_RECURRING,
  recurringTransactionsJoin,
} from '../recurrences/recurrence-rhythm.sql'
import { RecurrencesService } from '../recurrences/recurrences.service'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { FilterPreferencesService } from '../filter-preferences/filter-preferences.service'
import { Prisma } from '../generated/prisma'
import {
  PENDING_CREDIT_SCALED,
  RECEIVED_CREDIT_SCALED,
  REIMBURSEMENT_CREDIT_JOINS,
  netAmountSql,
  reimbursementCreditCtes,
  visibleRowSql,
} from '../reimbursements/reimbursement-credit.sql'
import {
  AmortizedSlicesService,
  type SmoothedPurchaseRow,
  everydayShift,
  everydayShiftByMonth,
  slicesTotal,
  utcMonthStart,
} from '../transactions/amortized-slices.service'
import { UNCATEGORIZED_CATEGORY_ID } from './dto'
import type {
  DashboardMonthDto,
  DashboardMonthQueryDto,
  DashboardUpcomingDto,
  DashboardFiltersDto,
  DashboardSummaryDto,
  MonthlyDataDto,
  CategoryDataDto,
  CategoryOptionDto,
  SpendingStructureDto,
  SubcategoryDataDto,
  ExceptionalEventDto,
  TagFamilyOfYearDto,
} from './dto'
import {
  FAMILY_EVENT_YEAR,
  familyTransactionsCte,
} from '../tag-families/family-transactions.sql'
import { calendarDayIn } from '../tags/tag-status'
import {
  TREND_RULES,
  addMonths,
  completeMonthsBefore,
  median,
} from '../trends/trend.detection'

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan',
  '02': 'Fév',
  '03': 'Mar',
  '04': 'Avr',
  '05': 'Mai',
  '06': 'Juin',
  '07': 'Juil',
  '08': 'Août',
  '09': 'Sep',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Déc',
}

/**
 * Id a row is filtered and listed under. Transactions with no category share
 * the sentinel bucket, which the filter panel can hide like any other.
 */
function categoryKeyOf(categoryId: string | null): string {
  return categoryId ?? UNCATEGORIZED_CATEGORY_ID
}

/** Category options for the filter panel, alphabetical as before. */
function toSortedOptions(byId: Map<string, string>): CategoryOptionDto[] {
  return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name, 'fr')
  )
}

interface DashboardAggregatedRow {
  month_key: string
  category_id: string | null
  category_name: string
  category_icon: string | null
  type: string
  /** The subcategory the row is filed under, or null for none. */
  subcategory_id: string | null
  /** Its name, read off `subcategories`; empty when there is none. */
  subcategory: string
  subcategory_icon: string | null
  is_exceptional: boolean
  /** The subcategory's, or the category's default; null on legacy rows. */
  nature: string | null
  /** COMMITTED for a line of a recurrence, whatever its subcategory says. */
  rhythm: string | null
  /** The line belongs to an active or stopped recurrence. */
  is_recurring: boolean
  /** The category's catalogue key, to tell a savings transfer from another. */
  category_catalog_key: string | null
  transaction_count: number
  /** Already net of whichever deductions the filters asked for. */
  total_amount: number
  /** Cash received against the expenses in this group, for reporting. */
  received_credit: number
  /** Still owed on them, for reporting. */
  pending_credit: number
}

/** One breakdown line being summed: a subcategory, or none. */
interface SubcategoryAccumulator {
  subcategoryId: string | null
  name: string
  icon: string | null
  total: number
  count: number
  /** Share of `total` carried by exceptional rows. */
  exceptional: number
  /** `total` month by month, so an average can leave a month out. */
  byMonth: Map<string, number>
  /** `exceptional` month by month. */
  exceptionalByMonth: Map<string, number>
}

/**
 * Which months a per-month average reads: `months` is its divisor, and
 * `outside` sums a month-by-month series over the months it leaves out
 * (the current one and any after it), to take them off the numerator.
 */
interface AverageWindow {
  months: number
  outside: (byMonth: Map<string, number> | undefined) => number
}

/**
 * What the everyday reading changes on a line once smoothed purchases are
 * spread: + their slices in the window, − the purchases the real reading
 * counted. See AmortizedSlicesService.
 */
interface EverydayShift {
  shift: number
  /** Slices falling in the window — the « dont X € lissés ». */
  slices: number
  /** `shift` month by month, so an average can leave a month out. */
  shiftByMonth?: Map<string, number>
}

/** The same per category, month by month and line by line. */
interface CategoryEverydayShift extends EverydayShift {
  shiftByMonth: Map<string, number>
  slicesByMonth: Map<string, number>
  subcategories: Map<string, EverydayShift>
}

/** The structure attributes of a slice: committed while the smoothing runs. */
const SLICE_RHYTHM = 'COMMITTED'

/** The key « sans sous-catégorie » takes in a breakdown map. */
const NO_SUBCATEGORY_KEY = ''

/**
 * Adds an aggregated row to its category's breakdown. Keyed by the
 * subcategory's id — the legacy text column used to name the line, and a
 * line named by text cannot open its rows.
 */
function addSubcategoryRow(
  target: Map<string, SubcategoryAccumulator>,
  row: Pick<
    DashboardAggregatedRow,
    'subcategory_id' | 'subcategory' | 'subcategory_icon' | 'transaction_count'
  > & { is_exceptional?: boolean; month_key?: string },
  amount: number
): void {
  const key = row.subcategory_id ?? NO_SUBCATEGORY_KEY
  const current = target.get(key) ?? {
    subcategoryId: row.subcategory_id,
    name: row.subcategory_id ? row.subcategory : '',
    icon: null,
    total: 0,
    count: 0,
    exceptional: 0,
    byMonth: new Map<string, number>(),
    exceptionalByMonth: new Map<string, number>(),
  }
  current.total += amount
  if (row.is_exceptional) current.exceptional += amount
  if (row.month_key !== undefined) {
    addTo(current.byMonth, row.month_key, amount)
    if (row.is_exceptional) {
      addTo(current.exceptionalByMonth, row.month_key, amount)
    }
  }
  current.count += row.transaction_count ?? 0
  current.icon = current.icon ?? row.subcategory_icon ?? null
  target.set(key, current)
}

function addTo(map: Map<string, number>, key: string, amount: number): void {
  map.set(key, (map.get(key) ?? 0) + amount)
}

function toSubcategoryDtos(
  subMap: Map<string, SubcategoryAccumulator>,
  average: AverageWindow,
  shifts?: Map<string, EverydayShift>
): SubcategoryDataDto[] {
  const round = (v: number): number => Math.round(v * 100) / 100
  return Array.from(subMap.entries())
    .map(([key, sd]) => {
      const dto: SubcategoryDataDto = {
        subcategoryId: sd.subcategoryId,
        subcategory: sd.name,
        amount: round(sd.total),
        transactionCount: sd.count,
        averagePerMonth: round(
          (sd.total - average.outside(sd.byMonth)) / average.months
        ),
      }
      if (sd.icon) dto.icon = sd.icon
      // Only on a line a smoothed purchase touches: every other line reads
      // exactly as before.
      const shift = shifts?.get(key)
      if (shift) {
        const everyday = sd.total - sd.exceptional + shift.shift
        const everydayOutside =
          average.outside(sd.byMonth) -
          average.outside(sd.exceptionalByMonth) +
          average.outside(shift.shiftByMonth)
        dto.everydayAmount = round(everyday)
        dto.everydayAveragePerMonth = round(
          (everyday - everydayOutside) / average.months
        )
        dto.amortizedAmount = round(shift.slices)
      }
      return dto
    })
    .sort((a, b) => b.amount - a.amount)
}

/** One row: what is still owed to the user across every open debt. */
interface ReceivableRow {
  pending: number
}

interface ExceptionalEventRow {
  id: string
  name: string
  color: string | null
  icon: string | null
  amount: number
}

interface AccountRow {
  account: string
}

/**
 * One family over one event year with expenses, and the current year's real
 * and exceptional expenses.
 */
interface FamilyOfYearRow {
  family_id: string
  event_year: number
  transaction_count: number
  spent: number
  tag_count: number
  /** The same on every row: the current year's real expenses. */
  real_expenses: number
  /** The same on every row: the current year's exceptional expenses. */
  exceptional_expenses: number
}

/** The families of the current year and what they are a share of. */
interface FamiliesOfYear {
  families: TagFamilyOfYearDto[]
  realExpenses: number | null
  exceptionalExpenses: number | null
}

/**
 * The transactions carrying at least one of the user's exceptional tags: the
 * one rule of « exceptional » across the summary's queries.
 */
function exceptionalTxCte(userId: string): Prisma.Sql {
  return Prisma.sql`exceptional_tx AS (
          SELECT DISTINCT tt.transaction_id
          FROM app.transaction_tags tt
          JOIN app.tags tg ON tg.id = tt.tag_id
          WHERE tg.user_id = ${userId} AND tg.is_exceptional = true
        )`
}

/**
 * Query 1 of the summary: the user's rows between two instants, aggregated
 * by month, category, subcategory and type, net as `netAmount` says, with
 * their exceptional, nature, rhythm and recurrence marks. Stats-excluded
 * accounts are out, joint accounts divided by `netAmount`. Shared by the
 * summary and the month band, so both read one ledger the same way.
 */
function aggregationSql(
  userId: string,
  start: Date,
  end: Date,
  netAmount: Prisma.Sql
): Prisma.Sql {
  return Prisma.sql`
    WITH ${exceptionalTxCte(userId)},
    ${reimbursementCreditCtes(userId)}
    SELECT
      TO_CHAR(t.date, 'YYYY-MM') AS month_key,
      c.id AS category_id,
      COALESCE(c.name, 'Autre') AS category_name,
      c.icon AS category_icon,
      t.type::text AS type,
      -- The real subcategory, not the legacy text column: a row's
      -- breakdown line is the one its link opens.
      t.subcategory_id,
      COALESCE(sc.name, '') AS subcategory,
      sc.icon AS subcategory_icon,
      (et.transaction_id IS NOT NULL) AS is_exceptional,
      COALESCE(sc.nature, c.default_nature)::text AS nature,
      ${EFFECTIVE_RHYTHM} AS rhythm,
      ${IS_RECURRING} AS is_recurring,
      c.catalog_key AS category_catalog_key,
      COUNT(*)::int AS transaction_count,
      -- Net of reimbursements, computed per transaction so the credit
      -- lands on the exact category, subcategory and account that carried
      -- the spending.
      SUM(${netAmount})::float AS total_amount,
      SUM(${RECEIVED_CREDIT_SCALED})::float AS received_credit,
      SUM(${PENDING_CREDIT_SCALED})::float AS pending_credit
    FROM app.transactions t
    LEFT JOIN app.categories c ON c.id = t.category_id
    LEFT JOIN app.subcategories sc ON sc.id = t.subcategory_id
    LEFT JOIN app.accounts a ON a.id = t.account_id
    LEFT JOIN exceptional_tx et ON et.transaction_id = t.id
    ${recurringTransactionsJoin(userId)}
    ${REIMBURSEMENT_CREDIT_JOINS}
    WHERE t.user_id = ${userId}
      AND t.date >= ${start}
      AND t.date <= ${end}
      AND COALESCE(a.is_excluded_from_stats, false) = false
    GROUP BY TO_CHAR(t.date, 'YYYY-MM'), c.id, COALESCE(c.name, 'Autre'), c.icon, c.catalog_key, t.type, t.subcategory_id, sc.name, sc.icon, sc.nature, sc.rhythm, c.default_nature, c.default_rhythm, (et.transaction_id IS NOT NULL), ${IS_RECURRING}
  `
}

/** One month being summed: what a `MonthlyDataDto` is made of. */
interface MonthAccumulator {
  /** Net expenses. */
  expenses: number
  income: number
  /** What was deducted from the expenses: the gross is their sum. */
  reimbursements: number
  exceptionalExpenses: number
  /** Everyday change from smoothed purchases; absent when none. */
  amortizedShift?: number
  /** Their slices this month. */
  amortizedSlices?: number
}

function emptyMonth(): MonthAccumulator {
  return { expenses: 0, income: 0, reimbursements: 0, exceptionalExpenses: 0 }
}

/**
 * Adds an aggregated row, an expense or an income, to its month. `amount`
 * is already net, so an income transfer that repaid a debt contributes only
 * the part that was not a refund; `deducted` is what came off an expense.
 */
function addRowToMonth(
  months: Map<string, MonthAccumulator>,
  row: Pick<DashboardAggregatedRow, 'month_key' | 'type' | 'is_exceptional'>,
  amount: number,
  deducted: number
): void {
  const month = months.get(row.month_key) ?? emptyMonth()
  if (row.type === 'EXPENSE') {
    month.expenses += amount
    month.reimbursements += deducted
    if (row.is_exceptional) month.exceptionalExpenses += amount
  } else {
    month.income += amount
  }
  months.set(row.month_key, month)
}

/**
 * A smoothed purchase, everyday reading only: it trades its own month for
 * its slices. A month only slices reach is added with nothing real in it.
 */
function addSmoothedToMonths(
  months: Map<string, MonthAccumulator>,
  purchase: SmoothedPurchaseRow
): void {
  for (const [key, amount] of everydayShiftByMonth(purchase)) {
    const month = months.get(key) ?? emptyMonth()
    month.amortizedShift = (month.amortizedShift ?? 0) + amount
    months.set(key, month)
  }
  for (const slice of purchase.slices) {
    const month = months.get(slice.month)
    if (month) {
      month.amortizedSlices = (month.amortizedSlices ?? 0) + slice.amount
    }
  }
}

/**
 * A month as the summary reports it. `expenses` is already net; the gross is
 * it plus what was deducted. Both shares are exact — the exceptional part is
 * the sum of the netted exceptional transactions, not a ratio taken on gross
 * amounts and re-applied to a net total.
 */
function toMonthlyDto(month: string, data: MonthAccumulator): MonthlyDataDto {
  // Rounded as the months always were, so the series do not move by a cent.
  const toCents = (v: number): number => Math.round(v * 100) / 100
  const parts = month.split('-')
  const year = parts[0] ?? ''
  const monthNum = parts[1] ?? '01'
  const netExpenses = data.expenses
  const grossExpenses = data.expenses + data.reimbursements
  const dto: MonthlyDataDto = {
    month,
    label: `${MONTH_LABELS[monthNum] ?? monthNum} ${year}`,
    expenses: toCents(grossExpenses),
    netExpenses: toCents(netExpenses),
    income: toCents(data.income),
    exceptionalExpenses: toCents(data.exceptionalExpenses),
    everydayNetExpenses: toCents(
      netExpenses - data.exceptionalExpenses + (data.amortizedShift ?? 0)
    ),
  }
  // Only on a month a smoothed purchase touches.
  if (data.amortizedShift !== undefined) {
    dto.amortizedExpenses = toCents(data.amortizedSlices ?? 0)
  }
  return dto
}

/** A recurrence as the band reads it, before it is kept or not. */
export interface RecurrenceOfMonthRow {
  id: string
  name: string
  status: string
  amount: number
  next_expected: string
  category_id: string | null
  /** A charge of it already fell in the month read. */
  charged_this_month: boolean
  /** Its latest charge was on a stats-excluded account. */
  excluded: boolean
}

/**
 * What is still to come this month, by date then name: the ACTIVE
 * recurrences due from `asOf` to the month's end, and those due earlier
 * this month with no charge of theirs this month yet — late, they still
 * count until the month ends. A STOPPED or CANDIDATE series proves no
 * charge to come; one paid from a stats-excluded account is out, as its
 * lines are.
 */
export function upcomingOf(
  rows: readonly RecurrenceOfMonthRow[],
  asOf: string
): DashboardUpcomingDto[] {
  const month = asOf.slice(0, 7)
  return rows
    .filter(
      r =>
        r.status === 'ACTIVE' &&
        !r.excluded &&
        r.next_expected.slice(0, 7) === month &&
        (r.next_expected >= asOf || !r.charged_this_month)
    )
    .map(r => ({
      id: r.id,
      name: r.name,
      amount: roundCents(Number(r.amount)),
      nextExpected: r.next_expected,
      categoryId: r.category_id,
    }))
    .sort(
      (a, b) =>
        a.nextExpected.localeCompare(b.nextExpected) ||
        a.name.localeCompare(b.name, 'fr')
    )
}

/** `YYYY-MM-01` as the UTC midnight `t.date` is compared with. */
const monthStartUtc = (month: string): Date =>
  new Date(`${month}-01T00:00:00.000Z`)

/** The number of days of a `YYYY-MM` month. */
function daysIn(month: string): number {
  const [year, mon] = month.split('-').map(Number)
  return new Date(Date.UTC(year ?? 0, mon ?? 1, 0)).getUTCDate()
}

/**
 * The transfer categories whose rows mean money set aside: what
 * `savingsTransfers` adds up. Informational only — the savings of a period,
 * and its rate, are what the income leaves once the expenses are paid.
 */
export const SAVINGS_CATALOG_KEYS = new Set([
  'emergency-savings',
  'project-savings',
  'investment',
])

function emptyStructure(): SpendingStructureDto {
  return {
    essential: 0,
    pleasure: 0,
    unknownNature: 0,
    committed: 0,
    variable: 0,
    unknownRhythm: 0,
    recurring: 0,
    total: 0,
  }
}

function addToStructure(
  target: SpendingStructureDto,
  row: { nature: string | null; rhythm: string | null; is_recurring: boolean },
  amount: number
): void {
  target.total += amount
  if (row.is_recurring) target.recurring += amount
  if (row.nature === 'ESSENTIAL') target.essential += amount
  else if (row.nature === 'PLEASURE') target.pleasure += amount
  else target.unknownNature += amount
  if (row.rhythm === 'COMMITTED') target.committed += amount
  else if (row.rhythm === 'VARIABLE') target.variable += amount
  else target.unknownRhythm += amount
}

function roundStructure(s: SpendingStructureDto): SpendingStructureDto {
  const r = (v: number) => Math.round(v * 100) / 100
  return {
    essential: r(s.essential),
    pleasure: r(s.pleasure),
    unknownNature: r(s.unknownNature),
    committed: r(s.committed),
    variable: r(s.variable),
    unknownRhythm: r(s.unknownRhythm),
    recurring: r(s.recurring),
    total: r(s.total),
  }
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filterPreferences: FilterPreferencesService,
    private readonly recurrences: RecurrencesService,
    private readonly amortizedSlices: AmortizedSlicesService
  ) {}

  async getSummary(
    userId: string,
    filters: DashboardFiltersDto
  ): Promise<DashboardSummaryDto> {
    // The committed reading joins the recurrence cache: bring it up to date.
    await this.recurrences.refreshQuietly(userId)

    // Use sentinel dates when no filter is provided
    const startDate = filters.startDate
      ? new Date(filters.startDate)
      : new Date('1970-01-01')
    const endDate = filters.endDate
      ? new Date(filters.endDate)
      : new Date('2099-12-31')

    const shouldDeductReimbursements = filters.deductReimbursements !== false
    // A debt still owed is money that comes back: a request says so. Whether
    // it is taken off the spending now or only once settled is the user's
    // preference, on by default; a request that says it explicitly wins.
    const shouldDeductPending =
      filters.deductPendingReimbursements ??
      (await this.filterPreferences.deductsPendingByDefault(userId))
    const shouldIncludeBreakdown = filters.includeCategoryBreakdown === true

    // The deduction is applied inside the aggregation, per transaction, so the
    // rows come back already net. There is nothing left to subtract afterwards
    // and, in particular, nothing left to clamp at zero.
    const netAmount = netAmountSql({
      deductReceived: shouldDeductReimbursements,
      deductPending: shouldDeductPending,
    })

    // Fetch aggregated data, the accounts list and the exceptional events.
    // `CategoryAssociation` no longer takes part: it was the only thing
    // linking a refund to a category, and the link is now the transaction.
    const [
      rows,
      accountRows,
      eventRows,
      receivableRows,
      smoothedRows,
      familiesOfYear,
    ] = await Promise.all([
      // Query 1: Aggregation by month + category + subcategory + type
      // (excludes stats-excluded accounts).
      this.prisma.$queryRaw<DashboardAggregatedRow[]>(
        aggregationSql(userId, startDate, endDate, netAmount)
      ),
      // Query 2: Distinct account names (including excluded from stats, for
      // filter panel). Sourced from the Account relation since the legacy
      // string column on transactions has been dropped.
      this.prisma.$queryRaw<AccountRow[]>(Prisma.sql`
        SELECT DISTINCT a.name AS account
        FROM app.transactions t
        JOIN app.accounts a ON a.id = t.account_id
        WHERE t.user_id = ${userId}
          AND t.date >= ${startDate}
          AND t.date <= ${endDate}
        ORDER BY a.name
      `),
      // Query 3: exceptional events overlapping the period, so the dashboard
      // can name what the exceptional share is made of.
      // Net as the share they explain: an event's figure is read off the
      // same rule as the period's totals.
      this.prisma.$queryRaw<ExceptionalEventRow[]>(Prisma.sql`
        WITH ${reimbursementCreditCtes(userId)}
        SELECT
          tg.id,
          tg.name,
          tg.color,
          tg.icon,
          SUM(${netAmount})::float AS amount
        FROM app.tags tg
        JOIN app.transaction_tags tt ON tt.tag_id = tg.id
        JOIN app.transactions t ON t.id = tt.transaction_id
        LEFT JOIN app.accounts a ON a.id = t.account_id
        ${REIMBURSEMENT_CREDIT_JOINS}
        WHERE tg.user_id = ${userId}
          AND tg.is_exceptional = true
          AND t.type = 'EXPENSE'
          AND t.date >= ${startDate}
          AND t.date <= ${endDate}
          AND COALESCE(a.is_excluded_from_stats, false) = false
        GROUP BY tg.id, tg.name, tg.color, tg.icon
        ORDER BY amount DESC
      `),
      // Query 4: what is still owed to the user, all debts together. A
      // stock, not a flow: it ignores the period, because a loan made last
      // year and not yet repaid is owed today. In full euros, never divided:
      // the person owes what was claimed, whichever account paid.
      this.prisma.$queryRaw<ReceivableRow[]>(Prisma.sql`
        SELECT COALESCE(SUM(GREATEST(r.amount - COALESCE(p.credited, 0), 0)), 0)::float AS pending
        FROM app.reimbursement_requests r
        LEFT JOIN (
          SELECT reimbursement_id, SUM(amount) AS credited
          FROM app.reimbursement_payments
          GROUP BY reimbursement_id
        ) p ON p.reimbursement_id = r.id
        WHERE r.user_id = ${userId}
      `),
      // Query 5, the everyday reading only: smoothed purchases spread over
      // their months, in the aggregation's scope. Without an end date the
      // slices stop at the current month — an open-ended period is « to
      // date », and the slices still to come are not spent yet.
      this.amortizedSlices.read({
        userId,
        netAmount,
        start: startDate,
        end: endDate,
        firstMonth: utcMonthStart(startDate),
        lastMonth: utcMonthStart(filters.endDate ? endDate : new Date()),
        scope: Prisma.sql`COALESCE(a.is_excluded_from_stats, false) = false`,
      }),
      // Query 6: the tag families over the current calendar year, whatever
      // the period — the card reads « the year so far ».
      this.tagFamiliesOfYear(
        userId,
        netAmount,
        visibleRowSql({ deductReceived: shouldDeductReimbursements })
      ),
    ])

    // Extract all categories from aggregated rows, keyed by category id.
    const allExpenseCategories = new Map<string, string>()
    const allIncomeCategories = new Map<string, string>()

    // Display name for every id the response may mention. Every id now comes
    // from a transaction the aggregation already returned — a deduction can no
    // longer name a category that carries no spending of its own, because it
    // travels with the expense it repays.
    const categoryNameById = new Map<string, string>([
      [UNCATEGORIZED_CATEGORY_ID, 'Autre'],
    ])

    for (const row of rows) {
      // A transfer is neither spending nor earning: it names no filter option.
      if (row.type === 'TRANSFER') continue
      const target =
        row.type === 'EXPENSE' ? allExpenseCategories : allIncomeCategories
      target.set(categoryKeyOf(row.category_id), row.category_name)
      categoryNameById.set(categoryKeyOf(row.category_id), row.category_name)
    }

    // The structure of spending, on both readings. Accumulated on the rows
    // the totals keep, so the two agree.
    const structure = emptyStructure()
    const everydayStructure = emptyStructure()
    // Money leaving the everyday accounts towards savings, net of withdrawals.
    let savingsTransfers = 0
    // The period's income and real net expenses, unrounded: what it kept is
    // their difference, rounded once — the months' `income − netExpenses`,
    // not the sum of categories each rounded to the cent.
    let periodIncome = 0
    let periodExpenses = 0

    // Build aggregation data structures
    const monthlyMap = new Map<string, MonthAccumulator>()
    /**
     * Net exceptional expenses per category. Net, not gross: the credit is
     * attached to the very transaction that carries the tag, so a holiday
     * refunded by friends reduces the exceptional share exactly instead of
     * being spread over the category by a ratio.
     */
    const exceptionalExpenseByCategory = new Map<string, number>()
    const expenseByCategoryMap = new Map<
      string,
      { amount: number; icon: string | null }
    >()
    const incomeByCategoryMap = new Map<
      string,
      { amount: number; icon: string | null }
    >()
    /** Cash actually deducted per expense category, for reporting only. */
    const reimbursementsByExpenseCategory = new Map<string, number>()
    /** Still-owed amount deducted per expense category, for reporting only. */
    const pendingByExpenseCategory = new Map<string, number>()

    // Breakdown structures (only populated when shouldIncludeBreakdown is true)
    const expenseMonthlyByCategory = new Map<string, Map<string, number>>()
    const incomeMonthlyByCategory = new Map<string, Map<string, number>>()
    const expenseSubcatByCategory = new Map<
      string,
      Map<string, SubcategoryAccumulator>
    >()
    const incomeSubcatByCategory = new Map<
      string,
      Map<string, SubcategoryAccumulator>
    >()
    /** Gross exceptional expenses per category and per month. */
    const expenseExceptionalMonthlyByCategory = new Map<
      string,
      Map<string, number>
    >()

    for (const row of rows) {
      const categoryKey = categoryKeyOf(row.category_id)
      const amount = row.total_amount
      const received = shouldDeductReimbursements ? row.received_credit : 0
      const pending = shouldDeductPending ? row.pending_credit : 0

      // Neither expense nor income. What it says is where money went to
      // sleep: a transfer into a savings category is read as money sent
      // there, a transfer back out (positive) as money brought back — for
      // information, the savings themselves are income less expenses.
      // Everything else — internal moves, joint-account top-ups,
      // corrections — is neutral by nature.
      if (row.type === 'TRANSFER') {
        if (SAVINGS_CATALOG_KEYS.has(row.category_catalog_key ?? '')) {
          savingsTransfers -= amount
        }
        continue
      }

      // Monthly aggregation. `amount` is already net, so an income transfer
      // that repaid a debt contributes only the part that was not a refund —
      // a 550 EUR transfer covering 50 EUR of expenses counts 500 as income
      // instead of vanishing from the income side altogether.
      addRowToMonth(monthlyMap, row, amount, received + pending)
      if (row.type === 'EXPENSE') {
        periodExpenses += amount
        addToStructure(structure, row, amount)
        if (!row.is_exceptional) addToStructure(everydayStructure, row, amount)
      } else {
        periodIncome += amount
      }

      // Category aggregation
      if (row.type === 'EXPENSE') {
        const current = expenseByCategoryMap.get(categoryKey)
        expenseByCategoryMap.set(categoryKey, {
          amount: (current?.amount ?? 0) + amount,
          icon: current?.icon ?? row.category_icon,
        })
        reimbursementsByExpenseCategory.set(
          categoryKey,
          (reimbursementsByExpenseCategory.get(categoryKey) ?? 0) + received
        )
        pendingByExpenseCategory.set(
          categoryKey,
          (pendingByExpenseCategory.get(categoryKey) ?? 0) + pending
        )
        if (row.is_exceptional) {
          exceptionalExpenseByCategory.set(
            categoryKey,
            (exceptionalExpenseByCategory.get(categoryKey) ?? 0) + amount
          )
        }
      } else {
        const current = incomeByCategoryMap.get(categoryKey)
        incomeByCategoryMap.set(categoryKey, {
          amount: (current?.amount ?? 0) + amount,
          icon: current?.icon ?? row.category_icon,
        })
      }

      // Breakdown aggregation (per-month + per-subcategory by category)
      if (shouldIncludeBreakdown) {
        const monthlyTarget =
          row.type === 'EXPENSE'
            ? expenseMonthlyByCategory
            : incomeMonthlyByCategory
        let monthMap = monthlyTarget.get(categoryKey)
        if (!monthMap) {
          monthMap = new Map<string, number>()
          monthlyTarget.set(categoryKey, monthMap)
        }
        monthMap.set(row.month_key, (monthMap.get(row.month_key) ?? 0) + amount)

        if (row.type === 'EXPENSE' && row.is_exceptional) {
          let excMonthMap = expenseExceptionalMonthlyByCategory.get(categoryKey)
          if (!excMonthMap) {
            excMonthMap = new Map<string, number>()
            expenseExceptionalMonthlyByCategory.set(categoryKey, excMonthMap)
          }
          excMonthMap.set(
            row.month_key,
            (excMonthMap.get(row.month_key) ?? 0) + amount
          )
        }

        const subcatTarget =
          row.type === 'EXPENSE'
            ? expenseSubcatByCategory
            : incomeSubcatByCategory
        let subMap = subcatTarget.get(categoryKey)
        if (!subMap) {
          subMap = new Map<string, SubcategoryAccumulator>()
          subcatTarget.set(categoryKey, subMap)
        }
        addSubcategoryRow(subMap, row, amount)
      }
    }

    // Smoothed purchases, everyday reading only: each one trades its own
    // month for its slices. A month, category or line only slices reach is
    // added with nothing real in it, so the everyday reading can show it.
    const shiftByCategory = new Map<string, CategoryEverydayShift>()
    for (const p of smoothedRows) {
      const categoryKey = categoryKeyOf(p.category_id)
      allExpenseCategories.set(categoryKey, p.category_name)
      if (!categoryNameById.has(categoryKey)) {
        categoryNameById.set(categoryKey, p.category_name)
      }
      if (!expenseByCategoryMap.has(categoryKey)) {
        expenseByCategoryMap.set(categoryKey, {
          amount: 0,
          icon: p.category_icon,
        })
      }

      addSmoothedToMonths(monthlyMap, p)
      for (const slice of p.slices) {
        // A slice falls every month without a new decision: committed while
        // the smoothing runs, whatever the subcategory's own rhythm.
        addToStructure(
          everydayStructure,
          { nature: p.nature, rhythm: SLICE_RHYTHM, is_recurring: false },
          slice.amount
        )
      }
      if (p.source_in_window) {
        addToStructure(everydayStructure, p, -p.net)
      }

      let entry = shiftByCategory.get(categoryKey)
      if (!entry) {
        entry = {
          shift: 0,
          slices: 0,
          shiftByMonth: new Map(),
          slicesByMonth: new Map(),
          subcategories: new Map(),
        }
        shiftByCategory.set(categoryKey, entry)
      }
      const shift = everydayShift(p)
      const slices = slicesTotal(p)
      entry.shift += shift
      entry.slices += slices
      for (const [month, amount] of everydayShiftByMonth(p)) {
        entry.shiftByMonth.set(
          month,
          (entry.shiftByMonth.get(month) ?? 0) + amount
        )
      }
      for (const slice of p.slices) {
        entry.slicesByMonth.set(
          slice.month,
          (entry.slicesByMonth.get(slice.month) ?? 0) + slice.amount
        )
      }
      const lineKey = p.subcategory_id ?? NO_SUBCATEGORY_KEY
      const line = entry.subcategories.get(lineKey) ?? { shift: 0, slices: 0 }
      const lineByMonth = line.shiftByMonth ?? new Map<string, number>()
      line.shift += shift
      line.slices += slices
      for (const [month, amount] of everydayShiftByMonth(p)) {
        addTo(lineByMonth, month, amount)
      }
      line.shiftByMonth = lineByMonth
      entry.subcategories.set(lineKey, line)

      if (shouldIncludeBreakdown) {
        let subMap = expenseSubcatByCategory.get(categoryKey)
        if (!subMap) {
          subMap = new Map<string, SubcategoryAccumulator>()
          expenseSubcatByCategory.set(categoryKey, subMap)
        }
        addSubcategoryRow(
          subMap,
          {
            subcategory_id: p.subcategory_id,
            subcategory: p.subcategory,
            subcategory_icon: p.subcategory_icon,
            transaction_count: 0,
          },
          0
        )
      }
    }

    // No deduction pass here any more. The rows arrived net, category by
    // category and subcategory by subcategory, so there is nothing to subtract
    // and — crucially — nothing to clamp: the credit is bounded by the debts
    // recorded against each transaction, themselves capped at what it cost.
    // The `Math.max(0, …)` that used to guard these loops silently swallowed
    // whatever a category-level deduction overshot by.

    // Sort months and build monthly data with reimbursement deductions
    const sortedMonths = Array.from(monthlyMap.keys()).sort()

    const monthlyData: MonthlyDataDto[] = sortedMonths.map(month =>
      toMonthlyDto(month, monthlyMap.get(month) ?? emptyMonth())
    )

    // Build breakdown month labels (full range when start/end are explicit,
    // otherwise the union of months actually present in the rows)
    let breakdownMonthLabels: string[] = []
    if (shouldIncludeBreakdown) {
      if (filters.startDate && filters.endDate) {
        const cursor = new Date(
          startDate.getFullYear(),
          startDate.getMonth(),
          1
        )
        while (cursor <= endDate) {
          const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
          breakdownMonthLabels.push(ym)
          cursor.setMonth(cursor.getMonth() + 1)
        }
      } else {
        breakdownMonthLabels = sortedMonths.slice()
      }
    }

    // The averages read the closed months only: those of the period before
    // the current month (in Paris, as « today » reads everywhere else). The
    // current month is still drawn, in `monthlyData` and `monthlyAmounts`,
    // but a month counted whole on the 23rd pulled every average down: the
    // income of October 2026 read 2 289 € a month instead of 2 497 €. A
    // period with no closed month — only the current one — averages what it
    // has, over 1. The months after the current one, which a custom period
    // may reach, are left out with it.
    const currentMonth = calendarDayIn(new Date()).slice(0, 7)
    const closedMonths = breakdownMonthLabels.filter(m => m < currentMonth)
    const leftOutMonths =
      closedMonths.length > 0
        ? breakdownMonthLabels.filter(m => m >= currentMonth)
        : []
    const average: AverageWindow = {
      months: Math.max(1, closedMonths.length),
      outside: byMonth =>
        leftOutMonths.reduce((sum, m) => sum + (byMonth?.get(m) ?? 0), 0),
    }

    const round = (v: number) => Math.round(v * 100) / 100

    function buildExpenseCategoryDto(
      categoryId: string,
      data: { amount: number; icon: string | null }
    ): CategoryDataDto {
      const dto: CategoryDataDto = {
        categoryId,
        category: categoryNameById.get(categoryId) ?? 'Autre',
        amount: round(data.amount),
        icon: data.icon,
      }
      if (!shouldIncludeBreakdown) return dto

      // Already net, month by month: the credit travelled with the expense it
      // repays, so a month can legitimately come out negative when a delayed
      // refund lands where nothing was spent.
      const monthMap =
        expenseMonthlyByCategory.get(categoryId) ?? new Map<string, number>()
      dto.monthlyAmounts = breakdownMonthLabels.map(m =>
        round(monthMap.get(m) ?? 0)
      )

      const recvDeduction = shouldDeductReimbursements
        ? (reimbursementsByExpenseCategory.get(categoryId) ?? 0)
        : 0
      const pendDeduction = shouldDeductPending
        ? (pendingByExpenseCategory.get(categoryId) ?? 0)
        : 0

      // Subcategory totals are exact, not shared out. The deduction used to be
      // spread pro rata over every subcategory of the category, because a
      // category-level credit could not say which one it repaid: 600 EUR back
      // on the dentist took 120 EUR off the pharmacy, which had been refunded
      // nothing.
      const subMap =
        expenseSubcatByCategory.get(categoryId) ??
        new Map<string, SubcategoryAccumulator>()
      const shift = shiftByCategory.get(categoryId)
      const subcategories = toSubcategoryDtos(
        subMap,
        average,
        shift?.subcategories
      )

      const totalCount = Array.from(subMap.values()).reduce(
        (s, sd) => s + sd.count,
        0
      )

      dto.transactionCount = totalCount
      dto.averagePerMonth = round(
        (data.amount - average.outside(monthMap)) / average.months
      )

      // Everyday / exceptional split, exact. Both shares are sums of netted
      // transactions, so a refunded holiday reduces the exceptional side and
      // nothing else — no ratio, no leakage into the everyday baseline. A
      // smoothed purchase then trades its own month for its slices.
      const exceptionalAmount =
        exceptionalExpenseByCategory.get(categoryId) ?? 0
      const everydayAmount =
        data.amount - exceptionalAmount + (shift?.shift ?? 0)

      dto.exceptionalAmount = round(exceptionalAmount)
      dto.everydayAmount = round(everydayAmount)
      // Divided by the plain period, exactly like averagePerMonth: a category
      // untouched by any event must read identically in both modes. Shrinking
      // the divisor by the event days would move *every* category, and would be
      // plainly wrong for the fixed ones — rent, insurance and subscriptions are
      // still debited while their owner is away.
      const excMonthMap = expenseExceptionalMonthlyByCategory.get(categoryId)
      const everydayOutside =
        average.outside(monthMap) -
        average.outside(excMonthMap) +
        average.outside(shift?.shiftByMonth)
      dto.everydayAveragePerMonth = round(
        (everydayAmount - everydayOutside) / average.months
      )

      dto.everydayMonthlyAmounts = breakdownMonthLabels.map((m, i) => {
        const net = dto.monthlyAmounts?.[i] ?? 0
        return round(
          net - (excMonthMap?.get(m) ?? 0) + (shift?.shiftByMonth.get(m) ?? 0)
        )
      })
      // The events' own share per month, read straight from the event
      // transactions: not monthlyAmounts minus everydayMonthlyAmounts, which
      // the smoothed slices would skew.
      dto.exceptionalMonthlyAmounts = breakdownMonthLabels.map(m =>
        round(excMonthMap?.get(m) ?? 0)
      )
      if (shift) {
        dto.amortizedAmount = round(shift.slices)
        dto.amortizedMonthlyAmounts = breakdownMonthLabels.map(m =>
          round(shift.slicesByMonth.get(m) ?? 0)
        )
      }

      if (subcategories.length > 0) dto.subcategories = subcategories
      if (recvDeduction > 0) dto.reimbursement = round(recvDeduction)
      if (pendDeduction > 0) dto.pendingReimbursement = round(pendDeduction)

      return dto
    }

    function buildIncomeCategoryDto(
      categoryId: string,
      data: { amount: number; icon: string | null }
    ): CategoryDataDto {
      const dto: CategoryDataDto = {
        categoryId,
        category: categoryNameById.get(categoryId) ?? 'Autre',
        amount: round(data.amount),
        icon: data.icon,
      }
      if (!shouldIncludeBreakdown) return dto

      const monthMap =
        incomeMonthlyByCategory.get(categoryId) ?? new Map<string, number>()
      dto.monthlyAmounts = breakdownMonthLabels.map(m =>
        round(monthMap.get(m) ?? 0)
      )

      const subMap =
        incomeSubcatByCategory.get(categoryId) ??
        new Map<string, SubcategoryAccumulator>()
      const subcategories = toSubcategoryDtos(subMap, average)

      const totalCount = Array.from(subMap.values()).reduce(
        (s, sd) => s + sd.count,
        0
      )

      dto.transactionCount = totalCount
      dto.averagePerMonth = round(
        (data.amount - average.outside(monthMap)) / average.months
      )
      if (subcategories.length > 0) dto.subcategories = subcategories

      return dto
    }

    // Sort categories by amount descending
    const expensesByCategory: CategoryDataDto[] = Array.from(
      expenseByCategoryMap.entries()
    )
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([categoryId, data]) => buildExpenseCategoryDto(categoryId, data))

    const incomeByCategory: CategoryDataDto[] = Array.from(
      incomeByCategoryMap.entries()
    )
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([categoryId, data]) => buildIncomeCategoryDto(categoryId, data))

    // Calculate totals from category data
    const totalExpenses =
      Math.round(
        expensesByCategory.reduce((sum, cat) => sum + cat.amount, 0) * 100
      ) / 100
    const totalIncome =
      Math.round(
        incomeByCategory.reduce((sum, cat) => sum + cat.amount, 0) * 100
      ) / 100

    const totalExceptionalExpenses =
      Math.round(
        expensesByCategory.reduce(
          (sum, cat) => sum + (cat.exceptionalAmount ?? 0),
          0
        ) * 100
      ) / 100

    const exceptionalEvents: ExceptionalEventDto[] = (eventRows ?? []).map(
      r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        icon: r.icon,
        amount: Math.round((r.amount ?? 0) * 100) / 100,
      })
    )

    const roundedSavingsTransfers = Math.round(savingsTransfers * 100) / 100
    // What the period kept: the income less every expense, exceptional ones
    // included, net as the months read them (`income − netExpenses`, which
    // the trends' golden master pins). Negative on a month in deficit. A
    // transfer to a savings account is where some of it went, not what was
    // saved: lumps of it would read a quarter at 122 %.
    const savings = roundCents(periodIncome - periodExpenses)
    const pendingReceivables =
      Math.round((receivableRows[0]?.pending ?? 0) * 100) / 100
    const everydayCommitted =
      Math.round(everydayStructure.committed * 100) / 100
    const response: DashboardSummaryDto = {
      monthlyData,
      expensesByCategory,
      incomeByCategory,
      totalExpenses,
      totalIncome,
      allExpenseCategories: toSortedOptions(allExpenseCategories),
      allIncomeCategories: toSortedOptions(allIncomeCategories),
      availableAccounts: accountRows.map(r => r.account),
      totalExceptionalExpenses,
      exceptionalEvents,
      tagFamiliesOfYear: familiesOfYear.families,
      realExpensesOfYear: familiesOfYear.realExpenses,
      exceptionalExpensesOfYear: familiesOfYear.exceptionalExpenses,
      spendingStructure: roundStructure(structure),
      everydaySpendingStructure: roundStructure(everydayStructure),
      savingsTransfers: roundedSavingsTransfers,
      pendingReceivables,
      savings,
      savingsRate:
        totalIncome > 0
          ? Math.round((savings / totalIncome) * 10000) / 10000
          : null,
      remainingToLive:
        totalIncome > 0
          ? Math.round((totalIncome - everydayCommitted) * 100) / 100
          : null,
    }

    if (shouldIncludeBreakdown) {
      response.periodMonths = average.months
      response.monthLabels = breakdownMonthLabels
    }

    return response
  }

  /**
   * « Ce mois-ci » (agent-os/product/dashboard-refonte.md, lot 1): the
   * current month to date against the habit, the median of the six closed
   * months before it — the window « Ce qui change » reads by default, with
   * its rule for a short history. The months are read with the summary's
   * own aggregation (query 1) and smoothed slices, so a month here is the
   * month of `monthlyData`, to the cent.
   *
   * The habit is prorated linearly over the days (« à ce stade du mois »):
   * a rent paid on the 1st reads as ahead of it early in the month. In
   * « Tout » the habit is the median of the real expenses, events included,
   * as the reading says.
   */
  async getMonth(
    userId: string,
    query: DashboardMonthQueryDto
  ): Promise<DashboardMonthDto> {
    // « À venir » reads the recurrence cache: bring it up to date.
    await this.recurrences.refreshQuietly(userId)

    const asOf = query.asOf ?? calendarDayIn(new Date())
    const month = asOf.slice(0, 7)
    const asOfDay = Number(asOf.slice(8, 10))
    const daysInMonth = daysIn(month)
    const window = TREND_RULES.defaultWindow
    const firstMonth = addMonths(month, -window)

    const start = monthStartUtc(firstMonth)
    // The whole `asOf` day, as a summary ending on it reads it.
    const asOfStart = new Date(`${asOf}T00:00:00.000Z`)
    const end = new Date(asOfStart.getTime() + 24 * 3600 * 1000 - 1)
    const monthStart = monthStartUtc(month)
    const nextMonthStart = monthStartUtc(addMonths(month, 1))

    const netAmount = netAmountSql({
      deductReceived: query.deductReimbursements !== false,
      deductPending:
        query.deductPendingReimbursements ??
        (await this.filterPreferences.deductsPendingByDefault(userId)),
    })

    const [rows, smoothedRows, history, recurrenceRows] = await Promise.all([
      this.prisma.$queryRaw<DashboardAggregatedRow[]>(
        aggregationSql(userId, start, end, netAmount)
      ),
      // Slices up to the current month, whole: a slice falls on the month,
      // not on a day of it.
      this.amortizedSlices.read({
        userId,
        netAmount,
        start,
        end,
        firstMonth: `${firstMonth}-01`,
        lastMonth: `${month}-01`,
        scope: Prisma.sql`COALESCE(a.is_excluded_from_stats, false) = false`,
      }),
      // Where the history starts, as the trends read it: the habit needs
      // whole months.
      this.prisma.$queryRaw<Array<{ start: string | null }>>(Prisma.sql`
        SELECT TO_CHAR(MIN(t.date), 'YYYY-MM-DD') AS start
        FROM app.transactions t
        WHERE t.user_id = ${userId}
      `),
      // The user's recurrences, each with whether a charge of it already
      // fell this month and whether its latest charge was on a
      // stats-excluded account; `upcomingOf` keeps those still to come.
      this.prisma.$queryRaw<RecurrenceOfMonthRow[]>(Prisma.sql`
        SELECT
          r.id,
          COALESCE(NULLIF(r.name, ''), r.label) AS name,
          r.status::text AS status,
          r.amount::float AS amount,
          TO_CHAR(r.next_expected, 'YYYY-MM-DD') AS next_expected,
          r.category_id,
          EXISTS (
            SELECT 1
            FROM app.recurrence_transactions rt
            JOIN app.transactions t ON t.id = rt.transaction_id
            WHERE rt.recurrence_id = r.id
              AND t.date >= ${monthStart}
              AND t.date < ${nextMonthStart}
          ) AS charged_this_month,
          COALESCE(latest.excluded, false) AS excluded
        FROM app.recurrences r
        LEFT JOIN LATERAL (
          SELECT COALESCE(a.is_excluded_from_stats, false) AS excluded
          FROM app.recurrence_transactions rt
          JOIN app.transactions t ON t.id = rt.transaction_id
          LEFT JOIN app.accounts a ON a.id = t.account_id
          WHERE rt.recurrence_id = r.id
          ORDER BY t.date DESC, t.id DESC
          LIMIT 1
        ) latest ON true
        WHERE r.user_id = ${userId}
      `),
    ])

    const months = new Map<string, MonthAccumulator>()
    for (const row of rows) {
      // A transfer is neither spending nor earning.
      if (row.type === 'TRANSFER') continue
      addRowToMonth(months, row, row.total_amount, 0)
    }
    for (const purchase of smoothedRows) addSmoothedToMonths(months, purchase)
    const monthOf = (key: string): MonthlyDataDto =>
      toMonthlyDto(key, months.get(key) ?? emptyMonth())
    const spentOf = (m: MonthlyDataDto): number =>
      query.reading === 'real' ? m.netExpenses : m.everydayNetExpenses

    // The closed months the habit reads: the six before the current one,
    // those the history covers whole.
    const habitMonths = Math.min(
      window,
      completeMonthsBefore(history[0]?.start ?? null, month)
    )
    const closed = Array.from({ length: habitMonths }, (_, i) =>
      monthOf(addMonths(month, i - habitMonths))
    )
    const current = monthOf(month)
    const hasHabit = habitMonths >= TREND_RULES.minHistoryMonths

    const spent = spentOf(current)
    const habit = hasHabit ? roundCents(median(closed.map(spentOf))) : null
    const incomeSeries = closed.map(m => m.income)
    const incomeExpected = hasHabit ? roundCents(median(incomeSeries)) : null

    const upcoming = upcomingOf(recurrenceRows, asOf)
    const upcomingTotal = roundCents(
      upcoming.reduce((sum, u) => sum + u.amount, 0)
    )
    const remainingToLive =
      incomeExpected === null
        ? null
        : roundCents(incomeExpected - spent - upcomingTotal)

    return {
      month,
      asOfDay,
      daysInMonth,
      spent,
      spentSeries: [...closed.map(spentOf), spent],
      habit,
      habitToDate:
        habit === null ? null : roundCents((habit * asOfDay) / daysInMonth),
      habitMonths,
      incomeReceived: current.income,
      incomeExpected,
      incomeSeries,
      upcoming,
      upcomingTotal,
      remainingToLive,
      remainingShare:
        remainingToLive !== null &&
        incomeExpected !== null &&
        incomeExpected > 0
          ? Math.round((remainingToLive / incomeExpected) * 10000) / 10000
          : null,
    }
  }

  /**
   * The user's tag families over the current calendar year (in Paris, as the
   * status of a tag reads « today »), in event basis: a line belongs to the
   * year its dated tag starts in, so a deposit paid in December for a
   * January trip counts in January's year. Each line once per family, with
   * the family analysis's conventions (expenses in ABS, divided by the
   * account divisor, stats-excluded accounts ignored).
   *
   * The same read over every past event year gives `spentByYear`; the
   * figures of a line (`spent`, `transactionCount`, `tagCount`) stay the
   * current year's. A family without expenses this year is left out.
   *
   * Alongside, the year's real expenses, read as `totalExpenses` reads a
   * period (every expense, net as `netAmount` says), and its exceptional
   * expenses (the same read over the lines carrying an exceptional tag), so
   * that the share of a family is a single division on screen.
   *
   * One cheap read of the families first: without one, nothing else runs.
   */
  private async tagFamiliesOfYear(
    userId: string,
    netAmount: Prisma.Sql,
    visible: Prisma.Sql
  ): Promise<FamiliesOfYear> {
    const none: FamiliesOfYear = {
      families: [],
      realExpenses: null,
      exceptionalExpenses: null,
    }
    const families = await this.prisma.tagFamily.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        color: true,
        icon: true,
        annualBudget: true,
      },
    })
    if (families.length === 0) return none

    const year = Number(calendarDayIn(new Date()).slice(0, 4))
    const yearStart = new Date(Date.UTC(year, 0, 1))
    const nextYearStart = new Date(Date.UTC(year + 1, 0, 1))

    const rows = await this.prisma.$queryRaw<FamilyOfYearRow[]>(Prisma.sql`
      WITH ${familyTransactionsCte(userId)},
      ${reimbursementCreditCtes(userId)},
      ${exceptionalTxCte(userId)},
      year_tx AS (
        SELECT
          ft.family_id,
          ft.tag_ids,
          t.type,
          ${FAMILY_EVENT_YEAR} AS event_year,
          ${netAmount} AS amount
        FROM family_tx ft
        JOIN app.transactions t ON t.id = ft.transaction_id
        LEFT JOIN app.accounts a ON a.id = t.account_id
        ${REIMBURSEMENT_CREDIT_JOINS}
        WHERE t.user_id = ${userId}
          AND t.type IN ('EXPENSE', 'INCOME')
          AND COALESCE(a.is_excluded_from_stats, false) = false
          AND ${visible}
          AND ${FAMILY_EVENT_YEAR} <= ${year}
      ),
      real_year AS (
        SELECT COALESCE(SUM(${netAmount}), 0)::float AS expenses
        FROM app.transactions t
        LEFT JOIN app.accounts a ON a.id = t.account_id
        ${REIMBURSEMENT_CREDIT_JOINS}
        WHERE t.user_id = ${userId}
          AND t.type = 'EXPENSE'
          AND t.date >= ${yearStart}
          AND t.date < ${nextYearStart}
          AND COALESCE(a.is_excluded_from_stats, false) = false
      ),
      exceptional_year AS (
        SELECT COALESCE(SUM(${netAmount}), 0)::float AS expenses
        FROM app.transactions t
        JOIN exceptional_tx et ON et.transaction_id = t.id
        LEFT JOIN app.accounts a ON a.id = t.account_id
        ${REIMBURSEMENT_CREDIT_JOINS}
        WHERE t.user_id = ${userId}
          AND t.type = 'EXPENSE'
          AND t.date >= ${yearStart}
          AND t.date < ${nextYearStart}
          AND COALESCE(a.is_excluded_from_stats, false) = false
      )
      SELECT
        y.family_id,
        y.event_year,
        COUNT(*)::int AS transaction_count,
        SUM(y.amount) FILTER (WHERE y.type = 'EXPENSE')::float AS spent,
        (
          SELECT COUNT(DISTINCT tag_id)
          FROM year_tx y2
          CROSS JOIN LATERAL UNNEST(y2.tag_ids) AS tag_id
          WHERE y2.family_id = y.family_id
            AND y2.event_year = y.event_year
        )::int AS tag_count,
        (SELECT expenses FROM real_year) AS real_expenses,
        (SELECT expenses FROM exceptional_year) AS exceptional_expenses
      FROM year_tx y
      GROUP BY y.family_id, y.event_year
      HAVING SUM(y.amount) FILTER (WHERE y.type = 'EXPENSE') > 0
    `)
    if (rows.length === 0) return none

    const round = (v: number): number => Math.round(v * 100) / 100
    const byFamily = new Map<string, FamilyOfYearRow[]>()
    for (const r of rows) {
      const own = byFamily.get(r.family_id)
      if (own) own.push(r)
      else byFamily.set(r.family_id, [r])
    }
    const lines = families.flatMap((family): TagFamilyOfYearDto[] => {
      const own = byFamily.get(family.id) ?? []
      const current = own.find(r => Number(r.event_year) === year)
      if (!current) return []
      const spent = round(current.spent ?? 0)
      const spentByYear = own
        .map(r => ({ year: Number(r.event_year), spent: round(r.spent ?? 0) }))
        .sort((a, b) => a.year - b.year)
      const annualBudget =
        family.annualBudget === null ? null : Number(family.annualBudget)
      return [
        {
          id: family.id,
          name: family.name,
          color: family.color,
          icon: family.icon,
          year,
          spent,
          spentByYear,
          annualBudget,
          remaining: annualBudget === null ? null : round(annualBudget - spent),
          transactionCount: current.transaction_count,
          tagCount: current.tag_count,
        },
      ]
    })
    if (lines.length === 0) return none
    lines.sort(
      (a, b) => b.spent - a.spent || a.name.localeCompare(b.name, 'fr')
    )

    return {
      families: lines,
      realExpenses: round(rows[0]?.real_expenses ?? 0),
      exceptionalExpenses: round(rows[0]?.exceptional_expenses ?? 0),
    }
  }
}
