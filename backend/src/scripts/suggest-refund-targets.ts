/**
 * Which expense each income transaction looks like it repays — read only.
 *
 * ## Why
 *
 * Dropping the category pairings took away the only thing that made a refund
 * reduce spending instead of counting as income. Rebuilding that link needs a
 * target per refund, and asking for 126 of them by hand would be absurd when
 * the answer is already written down: refunds are filed under subcategories
 * named after what they repay ("R Vacances" under "Remboursements"), so the
 * intent survives even though the pairing table does not.
 *
 * This script reads that intent back out and shows it. It writes nothing, and
 * has no flag that would let it: the point is to be checked before anything
 * acts on it.
 *
 * ## How a target is guessed
 *
 * The label carrying the intent is the transaction's subcategory when it has
 * one, otherwise its category. An optional "R " prefix is dropped, and the
 * rest is compared to the user's expense categories after normalising the
 * things people write two ways — "et" against "&", trailing dots, accents and
 * case. Nothing fuzzier than that: a near-miss is reported as unmatched rather
 * than guessed at, because a wrong target is worse than a missing one.
 *
 * Cash already drawn through a settlement is subtracted, so the remainder is
 * what a category-level credit would still have to cover. Counting it twice is
 * the one arithmetic mistake this whole exercise can make.
 *
 * ## Usage
 *
 *   # Local Docker database (what backend/.env points at):
 *   pnpm ts-node src/scripts/suggest-refund-targets.ts
 *
 *   # Production, one account:
 *   DOTENV_CONFIG_PATH=.env.production.local \
 *     pnpm ts-node src/scripts/suggest-refund-targets.ts --email=someone@example.com
 *
 * `--samples=N` caps how many individual lines each target prints (default 5).
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma'

/** An income transaction that might be repaying an expense. */
export interface RefundCandidate {
  id: string
  date: Date
  description: string
  amount: number
  /** Cash already drawn from it by a settlement. */
  alreadyDrawn: number
  categoryName: string | null
  subcategoryName: string | null
}

export interface ExpenseCategory {
  id: string
  name: string
}

export interface RefundSuggestion {
  /** The label the guess was read from, as the user wrote it. */
  label: string
  targetCategoryId: string
  targetCategoryName: string
  count: number
  total: number
  alreadyDrawn: number
  /** What a credit would still have to cover once settlements are honoured. */
  remaining: number
  lines: RefundCandidate[]
}

export interface UnmatchedGroup {
  label: string
  count: number
  total: number
  lines: RefundCandidate[]
}

/** Combining marks left behind by NFD, stripped so "Santé" matches "Sante". */
const COMBINING_MARKS = /[̀-ͯ]/g

/**
 * Fold the ways the same name gets written: an "R " prefix marking a refund,
 * "et" against "&", trailing dots, accents, case and repeated spaces.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/^r\s+/, '')
    .replace(/\s*&\s*/g, ' et ')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The label a candidate carries its intent in: subcategory first, then category. */
export function labelOf(candidate: RefundCandidate): string {
  return (
    candidate.subcategoryName ?? candidate.categoryName ?? '(sans categorie)'
  )
}

const round2 = (n: number): number => Math.round(n * 100) / 100

export function suggestRefundTargets(
  candidates: RefundCandidate[],
  expenseCategories: ExpenseCategory[]
): { suggestions: RefundSuggestion[]; unmatched: UnmatchedGroup[] } {
  const byNormalized = new Map<string, ExpenseCategory>()
  for (const category of expenseCategories) {
    // First writing wins, so a duplicate name cannot silently retarget a group.
    const key = normalizeName(category.name)
    if (!byNormalized.has(key)) byNormalized.set(key, category)
  }

  const suggestions = new Map<string, RefundSuggestion>()
  const unmatched = new Map<string, UnmatchedGroup>()

  for (const candidate of candidates) {
    const label = labelOf(candidate)
    const target = byNormalized.get(normalizeName(label))

    if (!target) {
      const group = unmatched.get(label) ?? {
        label,
        count: 0,
        total: 0,
        lines: [],
      }
      group.count++
      group.total = round2(group.total + candidate.amount)
      group.lines.push(candidate)
      unmatched.set(label, group)
      continue
    }

    const key = `${label} -> ${target.id}`
    const suggestion = suggestions.get(key) ?? {
      label,
      targetCategoryId: target.id,
      targetCategoryName: target.name,
      count: 0,
      total: 0,
      alreadyDrawn: 0,
      remaining: 0,
      lines: [],
    }
    suggestion.count++
    suggestion.total = round2(suggestion.total + candidate.amount)
    suggestion.alreadyDrawn = round2(
      suggestion.alreadyDrawn + candidate.alreadyDrawn
    )
    suggestion.remaining = round2(suggestion.total - suggestion.alreadyDrawn)
    suggestion.lines.push(candidate)
    suggestions.set(key, suggestion)
  }

  const byTotalDesc = <T extends { total: number }>(a: T, b: T): number =>
    b.total - a.total

  return {
    suggestions: [...suggestions.values()].sort(byTotalDesc),
    unmatched: [...unmatched.values()].sort(byTotalDesc),
  }
}

const euro = (n: number): string => `${n.toFixed(2).padStart(10)} EUR`

function printLine(candidate: RefundCandidate): void {
  const date = candidate.date.toISOString().slice(0, 10)
  const description =
    candidate.description.length > 42
      ? `${candidate.description.slice(0, 39)}...`
      : candidate.description
  const drawn =
    candidate.alreadyDrawn > 0
      ? `  (deja tire: ${candidate.alreadyDrawn.toFixed(2)})`
      : ''
  console.log(
    `      ${date}  ${description.padEnd(42)} ${euro(candidate.amount)}${drawn}`
  )
}

export async function main(
  prisma: PrismaClient,
  options: { email?: string; samples: number }
): Promise<void> {
  const users = await prisma.user.findMany({
    where: options.email ? { email: options.email } : {},
    select: { id: true, email: true },
  })

  if (users.length === 0) {
    console.log(
      options.email
        ? `No user with email ${options.email}.`
        : 'No users in this database.'
    )
    return
  }

  for (const user of users) {
    console.log(`\n=== ${user.email} ===\n`)

    const [incomes, expenseCategories, payments] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: user.id, type: 'INCOME' },
        select: {
          id: true,
          date: true,
          description: true,
          amount: true,
          category: { select: { name: true } },
          subcategoryRef: { select: { name: true } },
        },
        orderBy: { date: 'asc' },
      }),
      prisma.category.findMany({
        where: { userId: user.id, type: 'EXPENSE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.reimbursementPayment.groupBy({
        by: ['incomeTransactionId'],
        where: { userId: user.id, kind: 'CASH' },
        _sum: { amount: true },
      }),
    ])

    const drawnById = new Map(
      payments
        .filter(p => p.incomeTransactionId !== null)
        .map(p => [p.incomeTransactionId as string, Number(p._sum.amount ?? 0)])
    )

    const candidates: RefundCandidate[] = incomes.map(t => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: Number(t.amount),
      alreadyDrawn: drawnById.get(t.id) ?? 0,
      categoryName: t.category?.name ?? null,
      subcategoryName: t.subcategoryRef?.name ?? null,
    }))

    const { suggestions, unmatched } = suggestRefundTargets(
      candidates,
      expenseCategories
    )

    if (suggestions.length === 0) {
      console.log('  No income transaction looks like it repays an expense.')
    }

    let totalRemaining = 0
    for (const suggestion of suggestions) {
      totalRemaining = round2(totalRemaining + suggestion.remaining)
      console.log(
        `  "${suggestion.label}" -> ${suggestion.targetCategoryName}` +
          `  [${suggestion.count} tx]`
      )
      console.log(
        `      total ${suggestion.total.toFixed(2)}` +
          `   deja deduit ${suggestion.alreadyDrawn.toFixed(2)}` +
          `   a deduire ${suggestion.remaining.toFixed(2)}`
      )
      for (const line of suggestion.lines
        .slice()
        .sort((a, b) => b.amount - a.amount)
        .slice(0, options.samples)) {
        printLine(line)
      }
      if (suggestion.lines.length > options.samples) {
        console.log(
          `      ... and ${suggestion.lines.length - options.samples} more`
        )
      }
      console.log('')
    }

    // Never hidden: an income the script cannot place is exactly the case a
    // human has to look at, and burying it would defeat the purpose.
    const unplaced = unmatched.filter(g => g.total > 0)
    if (unplaced.length > 0) {
      console.log('  --- no target found ---')
      for (const group of unplaced) {
        console.log(
          `  "${group.label}"  [${group.count} tx]  ${group.total.toFixed(2)}`
        )
      }
      console.log('')
    }

    console.log(
      `  SUMMARY: ${suggestions.length} target(s), ` +
        `${totalRemaining.toFixed(2)} EUR would move from income to a deduction.`
    )
    console.log('  Nothing was written.')
  }
}

/**
 * Build a PrismaClient wired to the same Postgres adapter the app uses.
 * Prefers DIRECT_URL (Supabase session mode) because long-running
 * transactions break under the pooler in transaction mode.
 */
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

  const emailArg = process.argv.find(a => a.startsWith('--email='))
  const samplesArg = process.argv.find(a => a.startsWith('--samples='))

  const { prisma, pool } = buildPrismaClient()
  main(prisma, {
    ...(emailArg ? { email: emailArg.slice('--email='.length) } : {}),
    samples: samplesArg ? Number(samplesArg.slice('--samples='.length)) : 5,
  })
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
      await pool.end()
    })
}
