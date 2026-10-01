/**
 * Give every existing account the category catalogue.
 *
 * ## Why a script
 *
 * A user created after the catalogue shipped gets it at creation
 * (`UsersService.create`). The accounts that predate it were never
 * provisioned, and nothing on the request path does it for them: the login
 * guard runs on every request, and reading two tables to find nothing to do
 * each time is a cost paid forever for a migration paid once.
 *
 * ## What it does
 *
 * For each user, exactly what the login path does for a new one — plan, then
 * apply, through `provisionCatalogForUser` — so a legacy "Logement" is
 * adopted rather than duplicated, its "Loyer" becomes `housing.rent`, and
 * everything else stays as it is for the migration assistant. Re-running it
 * is safe: a provisioned account plans to nothing.
 *
 * ## Usage
 *
 *   # Local Docker database (what backend/.env points at):
 *   pnpm ts-node src/scripts/provision-category-catalog.ts --dry-run
 *   pnpm ts-node src/scripts/provision-category-catalog.ts
 *
 *   # One account only:
 *   pnpm ts-node src/scripts/provision-category-catalog.ts --email me@example.com
 *
 *   # Production:
 *   DOTENV_CONFIG_PATH=.env.production.local \
 *     pnpm ts-node src/scripts/provision-category-catalog.ts --dry-run
 *
 * `--dry-run` prints the plan for each user and writes nothing.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma'
import { CATEGORY_CATALOG } from '../categories/catalog'
import { isEmptyPlan } from '../categories/category-catalog.plan'
import type { ProvisioningPlan } from '../categories/category-catalog.plan'
import {
  planForUser,
  provisionCatalogForUser,
} from '../categories/category-catalog.provisioning'

export interface ScriptOptions {
  dryRun: boolean
  email: string | null
}

export function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = { dryRun: false, email: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--email') {
      const value = argv[++i]
      if (!value) throw new Error('--email needs a value')
      options.email = value
    } else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

/** One line per decision, so a dry run reads like the change it describes. */
export function describePlan(plan: ProvisioningPlan): string[] {
  const lines: string[] = []
  for (const adoption of plan.adoptCategories) {
    lines.push(`  adopt category    ${adoption.catalogKey} ← ${adoption.id}`)
  }
  for (const adoption of plan.adoptSubcategories) {
    lines.push(`  adopt subcategory ${adoption.catalogKey} ← ${adoption.id}`)
  }
  for (const entry of plan.createCategories) {
    lines.push(
      `  create category   ${entry.key} (${entry.label}, ${entry.subcategories.length} subcategories)`
    )
  }
  for (const creation of plan.createSubcategories) {
    lines.push(
      `  create subcategory ${creation.subcategory.key} under ${creation.categoryId}`
    )
  }
  for (const retirement of [
    ...plan.retireCategories,
    ...plan.retireSubcategories,
  ]) {
    lines.push(
      `  retire ${retirement.action === 'delete' ? '(delete) ' : '(release)'} ${retirement.catalogKey} "${retirement.name}"`
    )
  }
  return lines
}

export async function main(
  prisma: PrismaClient,
  options: ScriptOptions
): Promise<void> {
  const users = await prisma.user.findMany({
    where: options.email ? { email: options.email } : {},
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
  })
  if (users.length === 0) {
    console.log('No matching user.')
    return
  }

  console.log(
    `${users.length} user(s), catalogue of ${CATEGORY_CATALOG.length} categories` +
      (options.dryRun ? ' — dry run, nothing is written' : '')
  )

  for (const user of users) {
    const plan = await planForUser(prisma, user.id)
    console.log(`\n${user.email}`)
    if (isEmptyPlan(plan)) {
      console.log('  already provisioned')
      continue
    }
    for (const line of describePlan(plan)) console.log(line)
    if (options.dryRun) continue

    const summary = await provisionCatalogForUser(prisma, user.id)
    console.log(
      `  → ${summary.createdCategories} categories created, ` +
        `${summary.adoptedCategories} adopted, ` +
        `${summary.createdSubcategories} subcategories created, ` +
        `${summary.adoptedSubcategories} adopted, ` +
        `${summary.retiredDeleted} retired rows deleted, ${summary.retiredReleased} released`
    )
  }
  console.log('')
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
