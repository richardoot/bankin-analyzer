/**
 * Phase 5: what each bank connection is allowed to do right now, and which of
 * them need the user.
 *
 * ## Why a report rather than a schedule
 *
 * The bank sets the limits. Most ASPSPs allow four background fetches a day
 * and refuse the fifth; consent runs out after at most 180 days and can only
 * be renewed by a person, in a browser, at their bank. A schedule that ignores
 * either fails the same two ways forever — quota errors during the day, and a
 * silence after six months indistinguishable from "nothing was spent".
 *
 * So the schedule asks this, and this answers from what the connections have
 * actually done. Whatever ends up pulling the trigger — a timer inside the
 * process, a cron calling an endpoint, or a person running this — asks the
 * same question and gets the same answer.
 *
 * The day's fetch count is read from `bank_sync_runs` rather than stored: a
 * counter drifts the first time a run dies halfway, and the runs are already
 * the record of what happened.
 *
 * ## Usage
 *
 *   pnpm ts-node src/scripts/bank-sync-status.ts --email you@example.com
 *
 * Reads only. It changes nothing, ever — including the connections it reports
 * as expired, because deciding that from a clock rather than from the bank's
 * own answer is how a working connection gets marked broken.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma'
import {
  decideAll,
  expiringConnections,
  type ConnectionState,
} from '../bank-sync/sync-policy'

function buildPrismaClient(): { prisma: PrismaClient; pool: Pool } {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL or DIRECT_URL must be set.')
  }
  const pool = new Pool({ connectionString })
  return { prisma: new PrismaClient({ adapter: new PrismaPg(pool) }), pool }
}

/** Midnight UTC — the boundary the quota is counted against. */
export function startOfDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
}

export async function main(
  prisma: PrismaClient,
  options: { email: string; now?: Date }
): Promise<void> {
  const now = options.now ?? new Date()

  const user = await prisma.user.findUnique({ where: { email: options.email } })
  if (!user) throw new Error(`No user with email ${options.email}`)

  const connections = await prisma.bankConnection.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      aspspName: true,
      status: true,
      consentValidUntil: true,
      lastSyncAt: true,
      retryAfter: true,
      accountLinks: {
        select: { isIngested: true, accountId: true },
      },
    },
    orderBy: { aspspName: 'asc' },
  })

  if (connections.length === 0) {
    console.log('\nNo bank connection recorded for this user.\n')
    return
  }

  // Counted, not stored: a run that died halfway still consumed a request at
  // the bank, and a counter updated on success would not know that.
  const runsToday = await prisma.bankSyncRun.groupBy({
    by: ['aspspName'],
    where: { userId: user.id, fetchedAt: { gte: startOfDay(now) } },
    _count: { _all: true },
  })
  const fetchesByAspsp = new Map(
    runsToday.map(row => [row.aspspName, row._count._all])
  )

  const states: ConnectionState[] = connections.map(connection => ({
    id: connection.id,
    aspspName: connection.aspspName,
    status: connection.status,
    consentValidUntil: connection.consentValidUntil,
    lastSyncAt: connection.lastSyncAt,
    fetchesToday: fetchesByAspsp.get(connection.aspspName) ?? 0,
    retryAfter: connection.retryAfter,
  }))

  const decisions = decideAll(states, now)
  const byId = new Map(decisions.map(d => [d.connectionId, d]))

  console.log('\n=== Connections ===')
  for (const connection of connections) {
    const state = states.find(s => s.id === connection.id)
    const decision = byId.get(connection.id)
    const ingested = connection.accountLinks.filter(
      link => link.isIngested && link.accountId
    ).length

    console.log(`\n  ${connection.aspspName}`)
    console.log(`    status       : ${connection.status}`)
    console.log(
      `    consent until: ${connection.consentValidUntil?.toISOString().slice(0, 10) ?? 'unstated'}`
    )
    console.log(
      `    last sync    : ${connection.lastSyncAt?.toISOString().slice(0, 16).replace('T', ' ') ?? 'never'}`
    )
    console.log(
      `    fetches today: ${state?.fetchesToday ?? 0}   accounts ingested: ${ingested}/${connection.accountLinks.length}`
    )
    console.log(`    → ${decision?.action.toUpperCase()} — ${decision?.reason}`)
  }

  const warnings = expiringConnections(states, now)
  if (warnings.length > 0) {
    console.log('\n=== Consent running out ===')
    for (const warning of warnings) {
      console.log(
        warning.expired
          ? `  ${warning.aspspName}: expired ${-warning.daysLeft} days ago`
          : `  ${warning.aspspName}: ${warning.daysLeft} days left`
      )
    }
    console.log(
      '\n  Renewing needs the user at their bank, so this is worth saying\n' +
        '  well before the figures stop moving.\n'
    )
  }

  const due = decisions.filter(d => d.action === 'fetch')
  console.log(
    `\n${due.length} connection(s) due, ` +
      `${decisions.filter(d => d.action === 'reconnect').length} needing the user.\n`
  )
}

// Run only when executed directly (not when imported by tests).
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config')

  const args = process.argv.slice(2)
  const index = args.indexOf('--email')
  const email = index === -1 ? undefined : args[index + 1]
  if (!email) {
    console.error(
      'Usage: pnpm ts-node src/scripts/bank-sync-status.ts --email <address>'
    )
    process.exit(1)
  }

  const { prisma, pool } = buildPrismaClient()
  main(prisma, { email })
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
      await pool.end()
    })
}
