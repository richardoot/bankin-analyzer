/**
 * Dry run of the spending trends (lots 0 and 2 of
 * agent-os/product/spending-trends.md), and the anonymised ledgers their
 * snapshot test replays.
 *
 * ## What it prints
 *
 * For every user (or one), the trends of the last three closed months, for
 * each reference window (3, 6 and 12 months) in the everyday reading: every
 * trend that passes its thresholds, the five the card would show, and the
 * same detection on a mean instead of a median, to confirm the choice on real
 * data; and apart, every trend of lot 2 (merchants, recurrences). It also
 * checks each month's total against the dashboard's `getSummary`, the
 * golden master lot 1 pins down.
 *
 * ## What it writes
 *
 * With `--ledgers <dir>`: one anonymised ledger per real user (the demo
 * account is skipped), for `src/trends/trend.ledgers.spec.ts`. Dates and net
 * amounts are kept; labels go through the recurrence export's keyed
 * pseudonyms, and so do the recurrence cache's merchant keys and service
 * names; the names of categories and subcategories the user made up
 * too; ids are renumbered. The replay of the anonymised ledger must find the
 * same trends as the real one, or nothing is written.
 *
 * Read-only: the connection is opened with `default_transaction_read_only`,
 * and the recurrence cache is read as it stands (no refresh, which writes).
 *
 * ## Usage
 *
 *   # Local Docker database (what backend/.env points at):
 *   pnpm ts-node src/scripts/export-trends-ledger.ts \
 *     --out ../agent-os/local/trends-dry-run/dry-run.json \
 *     --ledgers src/trends/ledgers
 */
import { randomBytes } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { DashboardService } from '../dashboard/dashboard.service'
import { FilterPreferencesService } from '../filter-preferences/filter-preferences.service'
import { PrismaClient } from '../generated/prisma'
import type { PrismaService } from '../prisma/prisma.service'
import { RecurrencesService } from '../recurrences/recurrences.service'
import { AmortizedSlicesService } from '../transactions/amortized-slices.service'
import {
  TREND_RULES,
  addMonths,
  aggregateMonths,
  detectTrends,
  lastClosedMonth,
  type TrendInsight,
  type TrendRegistry,
  type TrendWindow,
} from '../trends/trend.detection'
import { readTrendRegistry } from '../trends/trend.registry'
import { anonymizeLabel, pseudonymizer } from './export-recurrence-ledger'

/** The closed months the dry run reads, the latest last. */
const MONTHS_READ = 3

export interface ScriptOptions {
  email: string | null
  out: string | null
  ledgers: string | null
}

export function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = { email: null, out: null, ledgers: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = (): string => {
      const v = argv[++i]
      if (!v) throw new Error(`${arg} needs a value`)
      return v
    }
    if (arg === '--email') options.email = value()
    else if (arg === '--out') options.out = value()
    else if (arg === '--ledgers') options.ledgers = value()
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

/** The anonymised ledger the snapshot test replays, recurrences included. */
export interface TrendLedger {
  /** `YYYY-MM-DD`: the moment of reading the replay pins. */
  readAt: string
  registry: TrendRegistry
}

/** What a trend says, names aside: what anonymisation must not change. */
function shape(insights: TrendInsight[]): string[] {
  return insights
    .map(i =>
      [
        i.kind,
        i.unit.type,
        i.direction,
        i.tone,
        i.current,
        i.reference,
        i.score,
      ].join(' ')
    )
    .sort()
}

/** The months read: the last three closed before `now`. */
export function monthsRead(now: Date): string[] {
  const last = lastClosedMonth(now)
  return Array.from({ length: MONTHS_READ }, (_, i) =>
    addMonths(last, i - (MONTHS_READ - 1))
  )
}

/** Every reading the dry run compares, as one replayable list. */
export function replayAll(
  registry: TrendRegistry,
  now: Date,
  reference: 'median' | 'mean' = 'median'
): Array<{ month: string; window: TrendWindow; insights: TrendInsight[] }> {
  return monthsRead(now).flatMap(month =>
    TREND_RULES.windows.map(window => ({
      month,
      window,
      insights: detectTrends(registry, { now, month, window, reference })
        .insights,
    }))
  )
}

/** A compact trend for the JSON a person reads. */
function brief(i: TrendInsight): Record<string, unknown> {
  return {
    kind: i.kind,
    unit: `${i.unit.type}:${i.unit.name}`,
    direction: i.direction,
    tone: i.tone,
    current: i.current,
    reference: i.reference,
    deltaPct: i.deltaPct,
    score: i.score,
    sentence: i.sentence,
    series: i.series,
  }
}

const isLot2 = (i: TrendInsight): boolean =>
  i.unit.type === 'merchant' ||
  i.unit.type === 'recurrence' ||
  i.kind === 'lostHabit'

const identity = (i: TrendInsight): string =>
  `${i.kind}|${i.unit.type}|${i.unit.id}`

function anonymize(
  registry: TrendRegistry,
  catalogIds: Set<string>,
  readAt: string
): TrendLedger {
  const pseudonym = pseudonymizer(randomBytes(32))
  const ids = new Map<string, string>()
  const renumber = (id: string, prefix: string): string => {
    const known = ids.get(id)
    if (known) return known
    const next = `${prefix}-${ids.size + 1}`
    ids.set(id, next)
    return next
  }
  const maybe = (id: string | null, prefix: string): string | null =>
    id === null ? null : renumber(id, prefix)
  // A catalogue name is the same for everyone; a name the user made up is not.
  const nameOf = (id: string, name: string): string =>
    catalogIds.has(id) ? name : anonymizeLabel(name, pseudonym)

  return {
    readAt,
    registry: {
      historyStart: registry.historyStart,
      categories: registry.categories.map(c => ({
        ...c,
        id: renumber(c.id, 'cat'),
        name: nameOf(c.id, c.name),
      })),
      subcategories: registry.subcategories.map(s => ({
        ...s,
        id: renumber(s.id, 'sub'),
        categoryId: renumber(s.categoryId, 'cat'),
        name: nameOf(s.id, s.name),
      })),
      lines: registry.lines.map(line => ({
        ...line,
        id: renumber(line.id, 't'),
        description: anonymizeLabel(line.description, pseudonym),
        categoryId: maybe(line.categoryId, 'cat'),
        subcategoryId: maybe(line.subcategoryId, 'sub'),
      })),
      // The same pseudonyms as the labels: a merchant key stays the words
      // of its labels, a service's name the words it was read from.
      recurrences: (registry.recurrences ?? []).map(r => ({
        ...r,
        id: renumber(r.id, 'rec'),
        merchantKey: anonymizeLabel(r.merchantKey, pseudonym),
        name: anonymizeLabel(r.name, pseudonym),
        categoryId: maybe(r.categoryId, 'cat'),
        subcategoryId: maybe(r.subcategoryId, 'sub'),
        charges: r.charges.map(c => ({
          ...c,
          transactionId: renumber(c.transactionId, 't'),
        })),
      })),
      smoothed: registry.smoothed.map(p => ({
        ...p,
        transactionId: renumber(p.transactionId, 't'),
        categoryId: maybe(p.categoryId, 'cat'),
        subcategoryId: maybe(p.subcategoryId, 'sub'),
      })),
    },
  }
}

const round = (v: number): number => Math.round(v * 100) / 100

export async function main(
  prisma: PrismaClient,
  options: ScriptOptions,
  now: Date = new Date(),
  log: (line: string) => void = console.log
): Promise<unknown> {
  const prismaService = prisma as unknown as PrismaService
  const amortizedSlices = new AmortizedSlicesService(prismaService)
  const filterPreferences = new FilterPreferencesService(prismaService)
  // Read-only: the dashboard and the trends read the recurrence cache as it
  // stands — a refresh writes.
  const recurrences = {
    refreshQuietly: () => Promise.resolve(),
  } as unknown as RecurrencesService
  const recurrenceCache = new RecurrencesService(prismaService)
  const dashboard = new DashboardService(
    prismaService,
    filterPreferences,
    recurrences,
    amortizedSlices
  )

  const users = await prisma.user.findMany({
    where: options.email ? { email: options.email } : {},
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
  })
  if (options.email && users.length === 0) {
    throw new Error(`No user with email ${options.email}`)
  }

  const months = monthsRead(now)
  const firstMonth = addMonths(months[0] ?? lastClosedMonth(now), -12)
  const lastMonth = months[months.length - 1] ?? lastClosedMonth(now)
  const readAt = now.toISOString().slice(0, 10)
  const report: Record<string, unknown>[] = []
  let ledgerIndex = 0

  for (const user of users) {
    const deductPending = await filterPreferences.deductsPendingByDefault(
      user.id
    )
    const registry: TrendRegistry = {
      ...(await readTrendRegistry(prisma, amortizedSlices, {
        userId: user.id,
        firstMonth,
        lastMonth,
        deductReceived: true,
        deductPending,
      })),
      recurrences: await recurrenceCache.readCache(user.id),
    }
    log(
      `${user.email}: ${registry.lines.length} expense lines ${firstMonth}..${lastMonth}, ` +
        `history from ${registry.historyStart ?? '—'}`
    )

    const byMedian = replayAll(registry, now)
    const byMean = replayAll(registry, now, 'mean')
    const perMonth = months.map(month => {
      const windows: Record<string, unknown> = {}
      const medianVsMean: Record<string, unknown> = {}
      for (const window of TREND_RULES.windows) {
        const result = detectTrends(registry, { now, month, window })
        const med = byMedian.find(r => r.month === month && r.window === window)
        const avg = byMean.find(r => r.month === month && r.window === window)
        const medIds = new Set((med?.insights ?? []).map(identity))
        const avgIds = new Set((avg?.insights ?? []).map(identity))
        windows[window] = {
          window: result.window,
          completeMonths: result.completeMonths,
          count: result.insights.length,
          shown: result.insights.slice(0, TREND_RULES.shown).map(brief),
          rest: result.insights.slice(TREND_RULES.shown).map(brief),
          // Lot 2: merchants (6 to 8) and recurrences (9, 10), shown or not.
          lot2: result.insights.filter(isLot2).map(brief),
        }
        medianVsMean[window] = {
          median: medIds.size,
          mean: avgIds.size,
          shownMedian: (med?.insights ?? [])
            .slice(0, TREND_RULES.shown)
            .map(i => i.sentence),
          shownMean: (avg?.insights ?? [])
            .slice(0, TREND_RULES.shown)
            .map(i => i.sentence),
          onlyMedian: (med?.insights ?? [])
            .filter(i => !avgIds.has(identity(i)))
            .map(i => i.sentence),
          onlyMean: (avg?.insights ?? [])
            .filter(i => !medIds.has(identity(i)))
            .map(i => i.sentence),
        }
        log(
          `  ${month} w${window}: ${result.insights.length} trends (mean: ${avgIds.size})`
        )
        for (const insight of result.insights.slice(0, TREND_RULES.shown)) {
          log(
            `    ${insight.score.toFixed(0).padStart(6)}  ${insight.sentence}`
          )
        }
      }
      return { month, windows, medianVsMean }
    })

    // Golden master, ahead of lot 1: each month's total against getSummary.
    const span = Array.from({ length: 13 + MONTHS_READ - 1 }, (_, i) =>
      addMonths(firstMonth, i)
    )
    const summary = await dashboard.getSummary(user.id, {
      startDate: `${firstMonth}-01`,
      endDate: new Date(
        new Date(`${addMonths(lastMonth, 1)}-01T00:00:00.000Z`).getTime() - 1
      ).toISOString(),
      deductPendingReimbursements: deductPending,
    })
    const everyday = aggregateMonths(registry, 'everyday', span)
    const real = aggregateMonths(registry, 'real', span)
    const goldenMaster = span.map(month => {
      const d = summary.monthlyData.find(m => m.month === month)
      const e = round(everyday.get(month)?.total ?? 0)
      const r = round(real.get(month)?.total ?? 0)
      return {
        month,
        everyday: { trends: e, dashboard: d?.everydayNetExpenses ?? 0 },
        real: { trends: r, dashboard: d?.netExpenses ?? 0 },
        agrees:
          Math.abs(e - (d?.everydayNetExpenses ?? 0)) < 0.011 &&
          Math.abs(r - (d?.netExpenses ?? 0)) < 0.011,
      }
    })
    const disagreements = goldenMaster.filter(g => !g.agrees)
    log(
      `  golden master: ${span.length - disagreements.length}/${span.length} months agree with getSummary`
    )

    report.push({
      email: user.email,
      historyStart: registry.historyStart,
      expenseLines: registry.lines.length,
      deductPending,
      months: perMonth,
      goldenMaster,
    })

    if (options.ledgers && !user.email.endsWith('.local')) {
      const catalog = new Set([
        ...(
          await prisma.category.findMany({
            where: { userId: user.id, catalogKey: { not: null } },
            select: { id: true },
          })
        ).map(c => c.id),
        ...(
          await prisma.subcategory.findMany({
            where: { userId: user.id, catalogKey: { not: null } },
            select: { id: true },
          })
        ).map(s => s.id),
      ])
      const ledger = anonymize(registry, catalog, readAt)
      const replayNow = new Date(`${readAt}T12:00:00.000Z`)
      const before = replayAll(registry, replayNow).flatMap(r =>
        shape(r.insights)
      )
      const after = replayAll(ledger.registry, replayNow).flatMap(r =>
        shape(r.insights)
      )
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        throw new Error(
          `Anonymisation changed what detection finds for ${user.email}`
        )
      }
      const name = `ledger-${String.fromCharCode(97 + ledgerIndex++)}.json`
      mkdirSync(options.ledgers, { recursive: true })
      writeFileSync(
        path.join(options.ledgers, name),
        `${JSON.stringify(ledger, null, 1)}\n`
      )
      log(`  ledger written to ${path.join(options.ledgers, name)}`)
    }
  }

  const output = {
    generatedAt: now.toISOString(),
    months,
    rules: TREND_RULES,
    users: report,
  }
  if (options.out) {
    mkdirSync(path.dirname(options.out), { recursive: true })
    writeFileSync(options.out, `${JSON.stringify(output, null, 2)}\n`)
    log(`dry run written to ${options.out}`)
  }
  return output
}

function buildPrismaClient(): { prisma: PrismaClient; pool: Pool } {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL or DIRECT_URL must be set (load .env or export it).'
    )
  }
  // Every transaction of this connection is read-only: a dry run cannot write.
  const pool = new Pool({
    connectionString,
    options: '-c default_transaction_read_only=on',
  })
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
