/**
 * The one rule for reading a line's rhythm once recurrences exist, shared by
 * the dashboard and the tag baseline.
 *
 * A subcategory says whether its spending usually runs on its own; a
 * recurrence says this particular line does. Simply Piano filed under
 * "Cours, coaching et formation" — a variable subcategory — is still a
 * subscription, and a line of a detected recurrence counts as committed
 * whatever its subcategory says. Everything else keeps the subcategory's
 * rhythm, or its category's default.
 *
 * ACTIVE and STOPPED both prove it: a gym membership cancelled in June was a
 * commitment every month it ran, and its past months must not turn variable
 * the day it stops. A CANDIDATE proves nothing yet, and a DISMISSED series
 * is not in the table at all.
 *
 * Both fragments expect the transaction aliased `t`, its subcategory `sc`
 * and its category `c`.
 */
import { Prisma } from '../generated/prisma'

/** Joins `rtx`, non-null when the line belongs to a recurrence that proves a commitment. */
export function recurringTransactionsJoin(userId: string): Prisma.Sql {
  return Prisma.sql`
    LEFT JOIN (
      SELECT DISTINCT rt.transaction_id
      FROM app.recurrence_transactions rt
      JOIN app.recurrences r ON r.id = rt.recurrence_id
      WHERE r.user_id = ${userId}
        AND r.status IN ('ACTIVE', 'STOPPED')
    ) rtx ON rtx.transaction_id = t.id
  `
}

/** Whether the line belongs to such a recurrence; groupable. */
export const IS_RECURRING = Prisma.sql`(rtx.transaction_id IS NOT NULL)`

/** The line's rhythm as text: COMMITTED for a recurring line, else the subcategory's. */
export const EFFECTIVE_RHYTHM = Prisma.sql`
  CASE
    WHEN rtx.transaction_id IS NOT NULL THEN 'COMMITTED'
    ELSE COALESCE(sc.rhythm, c.default_rhythm)::text
  END
`
