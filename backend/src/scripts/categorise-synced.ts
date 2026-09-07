/**
 * Phase 6: file the transactions the bank sent unfiled.
 *
 * ## Why the ledger answers before the model does
 *
 * The bank sends a label and nothing else — `merchant_category_code` was zero
 * on all three banks — so phase 4 inserts synced rows without a category. That
 * is the right default and a poor resting place: an unfiled transaction is
 * counted nowhere.
 *
 * This project already has a language model wired in, and it would file them.
 * It should not be asked first. Most synced rows are the same handful of
 * merchants the user has filed by hand for years — a gym, a toll, a
 * supermarket — and for those the answer is a lookup rather than a judgement:
 * free, instant, identical every run, and truer to their habits than any model
 * because it *is* their habits. What the ledger cannot answer is what the
 * model is worth paying for, and this report says how much that is.
 *
 * ## Usage
 *
 *   pnpm ts-node src/scripts/categorise-synced.ts --email you@example.com
 *   … --apply          # write the filings
 *   … --samples 20     # how many examples to print
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma'
import {
  buildMerchantIndex,
  proposeFiling,
  summarise,
  type FiledExample,
  type FilingProposal,
} from '../bank-sync/categorisation'

const DEFAULT_SAMPLES = 10

function buildPrismaClient(): { prisma: PrismaClient; pool: Pool } {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL or DIRECT_URL must be set.')
  }
  const pool = new Pool({ connectionString })
  return { prisma: new PrismaClient({ adapter: new PrismaPg(pool) }), pool }
}

export async function main(
  prisma: PrismaClient,
  options: { email: string; apply: boolean; samples: number }
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: options.email } })
  if (!user) throw new Error(`No user with email ${options.email}`)

  // What the user has already filed, whatever it came from. A CSV row and a
  // synced row that name the same merchant teach the same lesson.
  const filed = await prisma.transaction.findMany({
    where: { userId: user.id, categoryId: { not: null } },
    select: {
      description: true,
      categoryId: true,
      subcategoryId: true,
      subcategory: true,
      type: true,
    },
  })
  const examples: FiledExample[] = filed.map(row => ({
    description: row.description,
    type: row.type,
    categoryId: row.categoryId as string,
    subcategoryId: row.subcategoryId,
    subcategoryName: row.subcategory,
  }))
  const index = buildMerchantIndex(examples)

  const unfiled = await prisma.transaction.findMany({
    where: { userId: user.id, source: 'BANK_API', categoryId: null },
    select: {
      id: true,
      description: true,
      amount: true,
      date: true,
      type: true,
    },
    orderBy: { date: 'asc' },
  })

  console.log(
    `\n${examples.length} filed transactions → ${index.size} known merchants`
  )
  console.log(`${unfiled.length} synced transactions waiting to be filed`)

  if (unfiled.length === 0) {
    console.log('\nNothing to do.\n')
    return
  }

  const proposals = unfiled.map(row =>
    proposeFiling(row.description, row.type, index)
  )
  const summary = summarise(proposals)
  const pct = (n: number): string => `${Math.round((n / summary.total) * 100)}%`

  console.log('\n=== What the ledger can answer ===')
  console.log(
    `  same merchant    : ${summary.sameMerchant} (${pct(summary.sameMerchant)})`
  )
  console.log(
    `  similar merchant : ${summary.similarMerchant} (${pct(summary.similarMerchant)})`
  )
  console.log(
    `  unresolved       : ${summary.unresolved} (${pct(summary.unresolved)})  ← what a model would be for`
  )

  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    select: { id: true, name: true },
  })
  const categoryName = new Map(categories.map(c => [c.id, c.name]))

  console.log('\n— proposed —')
  let shown = 0
  for (const [position, proposal] of proposals.entries()) {
    if (!proposal || shown >= options.samples) continue
    const row = unfiled[position]
    if (!row) continue
    console.log(
      `  [${proposal.confidence.toFixed(2)} ${proposal.basis === 'sameMerchant' ? 'name' : 'near'} ×${proposal.support}] ` +
        `"${row.description.slice(0, 40).padEnd(40)}" → ${categoryName.get(proposal.categoryId) ?? '?'}`
    )
    shown++
  }

  const unresolvedSamples = proposals
    .map((proposal, position) => ({ proposal, row: unfiled[position] }))
    .filter(entry => entry.proposal === null && entry.row)
    .slice(0, options.samples)

  if (unresolvedSamples.length > 0) {
    console.log('\n— left for a person, or a model —')
    for (const { row } of unresolvedSamples) {
      console.log(`  "${row?.description.slice(0, 60)}"`)
    }
  }

  if (!options.apply) {
    console.log('\nDry run — nothing was filed. Add --apply to commit this.\n')
    return
  }

  let filedCount = 0
  await prisma.$transaction(async tx => {
    for (const [position, proposal] of proposals.entries()) {
      const row = unfiled[position]
      if (!proposal || !row) continue
      await tx.transaction.update({
        where: { id: row.id },
        data: {
          categoryId: proposal.categoryId,
          subcategoryId: proposal.subcategoryId,
          // The denormalised label the dashboard groups on, kept in step with
          // the id it mirrors.
          subcategory: proposal.subcategoryName,
        },
      })
      filedCount++
    }
  })

  console.log(
    `\nFiled ${filedCount}. The remaining ${summary.unresolved} are still\n` +
      'unfiled, which is where they should stay until something knows better.\n'
  )
}

/** Exported for the report and the tests; not used by the writing path. */
export type { FilingProposal }

// Run only when executed directly (not when imported by tests).
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config')

  const args = process.argv.slice(2)
  const flag = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`)
    return index === -1 ? undefined : args[index + 1]
  }

  const email = flag('email')
  if (!email) {
    console.error(
      'Usage: pnpm ts-node src/scripts/categorise-synced.ts --email <address> [--apply] [--samples N]'
    )
    process.exit(1)
  }

  const { prisma, pool } = buildPrismaClient()
  main(prisma, {
    email,
    apply: args.includes('--apply'),
    samples: Number(flag('samples') ?? DEFAULT_SAMPLES),
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
