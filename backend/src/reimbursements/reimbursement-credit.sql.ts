/**
 * The one rule for turning reimbursements into a deduction, shared by the
 * dashboard and the budget.
 *
 * ## Why it lives here
 *
 * The same mechanism used to be written three times — `DashboardService`,
 * `BudgetsService` and the `useDashboardData` composable — and the three had
 * already drifted apart: one read `ReimbursementRequest.categoryId` as an
 * expense category, another as an income one, and a toggle honoured in one was
 * ignored in the other. A single SQL fragment removes the possibility.
 *
 * ## What changed
 *
 * The deduction no longer travels through `CategoryAssociation`. It attaches to
 * the **expense transaction** the debt hangs off, which is what makes it exact:
 *
 *  - the category and subcategory are the transaction's own, so a
 *    reimbursement on the dentist stops being spread pro rata over the whole
 *    of Santé;
 *  - the account is the transaction's own, so the joint-account divisor
 *    applies to the netted figure rather than to a category aggregate;
 *  - an income transaction is excluded only for the cash actually drawn from
 *    it, so a transfer mixing salary and a refund is no longer all-or-nothing.
 *
 * ## Order of operations
 *
 * The credit is netted against the transaction **before** the divisor is
 * applied: `(100 - 50) / 2 = 25`. Dividing first and netting after would give
 * `50 - 50 = 0`. The former is what the previous code produced overall, and
 * what keeps joint accounts reading the same across the migration.
 */
import { Prisma } from '../generated/prisma'

/**
 * Two CTEs, meant to be spliced into a `WITH` clause:
 *
 *  - `expense_credit`, one row per expense transaction carrying debts, with
 *    what was claimed on it, what came back as cash, and what is still owed;
 *  - `income_credit`, one row per income transaction, with the cash drawn
 *    from it to repay something.
 *
 * The per-request totals are computed as scalar subqueries rather than a join,
 * because joining payments to requests multiplies the rows and would make
 * `SUM(r.amount)` count a debt once per payment it received.
 */
export function reimbursementCreditCtes(userId: string): Prisma.Sql {
  return Prisma.sql`
    expense_credit AS (
      SELECT
        claims.transaction_id,
        SUM(claims.claimed)::numeric  AS claimed,
        SUM(claims.cash)::numeric     AS received,
        SUM(claims.credited)::numeric AS credited
      FROM (
        SELECT
          r.transaction_id,
          r.amount AS claimed,
          COALESCE((
            SELECT SUM(p.amount) FROM app.reimbursement_payments p
            WHERE p.reimbursement_id = r.id AND p.kind = 'CASH'
          ), 0) AS cash,
          COALESCE((
            SELECT SUM(p.amount) FROM app.reimbursement_payments p
            WHERE p.reimbursement_id = r.id
          ), 0) AS credited
        FROM app.reimbursement_requests r
        WHERE r.user_id = ${userId}
      ) claims
      GROUP BY claims.transaction_id
    ),
    income_credit AS (
      SELECT
        p.income_transaction_id AS transaction_id,
        SUM(p.amount)::numeric  AS cash_drawn
      FROM app.reimbursement_payments p
      WHERE p.user_id = ${userId}
        AND p.kind = 'CASH'
        AND p.income_transaction_id IS NOT NULL
      GROUP BY p.income_transaction_id
    )
  `
}

/** The joins the expressions below expect, given the transactions alias `t`. */
export const REIMBURSEMENT_CREDIT_JOINS = Prisma.sql`
  LEFT JOIN expense_credit ec ON ec.transaction_id = t.id
  LEFT JOIN income_credit  ic ON ic.transaction_id = t.id
`

/** Cash already received against an expense transaction, 0 when none. */
export const RECEIVED_CREDIT = Prisma.sql`COALESCE(ec.received, 0)`

/**
 * What is still owed on an expense transaction: claimed minus everything
 * credited to it, forgiven remainders included — a written-off debt is not
 * coming back, so it must not read as pending.
 */
export const PENDING_CREDIT = Prisma.sql`GREATEST(COALESCE(ec.claimed, 0) - COALESCE(ec.credited, 0), 0)`

/** Cash drawn from an income transaction to repay a debt, 0 when none. */
export const INCOME_CASH_DRAWN = Prisma.sql`COALESCE(ic.cash_drawn, 0)`

/**
 * Signed amount a transaction contributes, net of reimbursements and divided
 * by the account divisor.
 *
 * No clamp: the netted expense is bounded by the debts recorded against it,
 * which are themselves capped at what the transaction cost. The old
 * `Math.max(0, …)` existed because a category-level deduction could exceed the
 * category, and it silently swallowed the excess.
 */
export function netAmountSql(options: {
  deductReceived: boolean
  deductPending: boolean
}): Prisma.Sql {
  // Built by nesting rather than `Prisma.join`, which rejects both an empty
  // list and a single element — and either can happen here, since the two
  // deductions are independent toggles.
  let expense = Prisma.sql`ABS(t.amount::numeric)`
  if (options.deductReceived) {
    expense = Prisma.sql`(${expense} - ${RECEIVED_CREDIT})`
  }
  if (options.deductPending) {
    expense = Prisma.sql`(${expense} - ${PENDING_CREDIT})`
  }

  const income = options.deductReceived
    ? Prisma.sql`(t.amount::numeric - ${INCOME_CASH_DRAWN})`
    : Prisma.sql`t.amount::numeric`

  return Prisma.sql`
    CASE WHEN t.type = 'EXPENSE'
      THEN ${expense} / COALESCE(a.divisor, 1)
      ELSE ${income} / COALESCE(a.divisor, 1)
    END
  `
}

/** Received credit on an expense, divided, for the per-category breakdown. */
export const RECEIVED_CREDIT_SCALED = Prisma.sql`
  CASE WHEN t.type = 'EXPENSE'
    THEN ${RECEIVED_CREDIT} / COALESCE(a.divisor, 1)
    ELSE 0
  END
`

/** Still-owed credit on an expense, divided, for the per-category breakdown. */
export const PENDING_CREDIT_SCALED = Prisma.sql`
  CASE WHEN t.type = 'EXPENSE'
    THEN ${PENDING_CREDIT} / COALESCE(a.divisor, 1)
    ELSE 0
  END
`
