/**
 * Recompute every account's recurrences, or one account's.
 *
 * ## Why a script
 *
 * The recurrences are recomputed when transactions arrive or are
 * reclassified, and after every sync. Nothing recomputes them for an account
 * that does none of these — the first time after the tables ship, or after a
 * change to the detection rules. This does, through the same
 * `recomputeRecurrences` the service calls.
 *
 * ## Usage
 *
 *   # Local Docker database (what backend/.env points at):
 *   pnpm ts-node src/scripts/recompute-recurrences.ts --dry-run
 *   pnpm ts-node src/scripts/recompute-recurrences.ts --email me@example.com
 *
 *   # Production:
 *   DOTENV_CONFIG_PATH=.env.production.local \
 *     pnpm ts-node src/scripts/recompute-recurrences.ts --dry-run
 *
 * `--dry-run` prints what detection finds for each user and writes nothing.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma'
import type { DetectedRecurrence } from '../recurrences/recurrence.detection'
import { recomputeRecurrences } from '../recurrences/recurrence.recompute'

export interface ScriptOptions {
  dryRun: boolean
  email: string | null
}

export function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = { dryRun: false, email: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--email') {
      const value = argv[++i]
      if (!value) throw new Error('--email needs a value')
      options.email = value
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

/** One line per recurrence, the way the list screen will read it. */
export function describeRecurrence(recurrence: DetectedRecurrence): string {
  const amount = recurrence.amount.toFixed(2).padStart(9)
  const monthly = recurrence.monthlyEquivalent.toFixed(2).padStart(9)
  return [
    recurrence.status.padEnd(9),
    recurrence.period.padEnd(9),
    amount,
    `${monthly}/mois`,
    `x${recurrence.occurrences}`.padStart(4),
    recurrence.lastDate.toISOString().slice(0, 10),
    recurrence.label,
  ].join('  ')
}

export async function main(
  prisma: PrismaClient,
  options: ScriptOptions,
  log: (line: string) => void = console.log
): Promise<void> {
  const users = await prisma.user.findMany({
    where: options.email ? { email: options.email } : {},
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
  })
  if (options.email && users.length === 0) {
    throw new Error(`No user with email ${options.email}`)
  }

  for (const user of users) {
    const found = await recomputeRecurrences(prisma, user.id, {
      dryRun: options.dryRun,
    })
    const active = found.filter(r => r.status === 'ACTIVE')
    const monthly = active.reduce((sum, r) => sum + r.monthlyEquivalent, 0)
    log(
      `${user.email}: ${found.length} recurrences, ${active.length} active, ` +
        `${monthly.toFixed(2)} €/mois${options.dryRun ? ' (dry run)' : ''}`
    )
    for (const recurrence of found) log(`  ${describeRecurrence(recurrence)}`)
  }
}

function buildPrismaClient(): { prisma: PrismaClient; pool: Pool } {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL or DIRECT_URL must be set (load .env or export it).'
    )
  }
  const pool = new Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  return { prisma: new PrismaClient({ adapter }), pool }
}

if (require.main === module) {
  // Side-effect import: must come BEFORE buildPrismaClient() reads process.env.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config')

  const { prisma, pool } = buildPrismaClient()
  main(prisma, parseArgs(process.argv.slice(2)))
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
      await pool.end()
    })
}
