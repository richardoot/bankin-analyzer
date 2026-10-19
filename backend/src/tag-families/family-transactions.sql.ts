import { Prisma } from '../generated/prisma'

/**
 * `family_tx`, a CTE to splice into a `WITH` clause: the transactions of the
 * user's families, each once per family whatever number of the family's tags
 * it carries (`family_id`, `transaction_id`, `event_start`, `tag_ids`).
 *
 * `event_start` is the earliest window start among the family's dated tags on
 * the line, null without one: a line carrying an edition and the next one's
 * deposit goes to the earliest, so that it is counted in one year only.
 *
 * Scoped to one family when `familyId` is given, to all of them otherwise.
 */
export function familyTransactionsCte(
  userId: string,
  familyId?: string
): Prisma.Sql {
  const scope = familyId
    ? Prisma.sql`tg.family_id = ${familyId}`
    : Prisma.sql`tg.family_id IS NOT NULL`
  return Prisma.sql`
    family_tx AS (
      SELECT
        tg.family_id,
        tt.transaction_id,
        MIN(
          CASE WHEN tg.event_start_date IS NOT NULL
                AND tg.event_end_date IS NOT NULL
            THEN tg.event_start_date END
        ) AS event_start,
        ARRAY_AGG(tg.id) AS tag_ids
      FROM app.transaction_tags tt
      JOIN app.tags tg ON tg.id = tt.tag_id
      WHERE ${scope}
        AND tg.user_id = ${userId}
      GROUP BY tt.transaction_id, tg.family_id
    )
  `
}

/**
 * The event-basis year of a `family_tx` line (`ft`) joined to its transaction
 * (`t`): the year its dated tag starts in, its own year without one.
 */
export const FAMILY_EVENT_YEAR = Prisma.sql`EXTRACT(YEAR FROM COALESCE(ft.event_start, t.date))::int`
