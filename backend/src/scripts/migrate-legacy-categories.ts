/**
 * Replay a legacy-category mapping on one account, from a file.
 *
 * ## Why a script beside the assistant
 *
 * The assistant is where the migration is decided, one category at a time,
 * with the user in front of it. Deciding is done once; *running* it happens
 * every time production is restored locally to test the framework against
 * real data. A mapping file keeps the decisions, and this replays them.
 *
 * ## Usage
 *
 *   # Write a mapping file pre-filled with the dictionary's suggestions:
 *   pnpm ts-node src/scripts/migrate-legacy-categories.ts \
 *     --email me@example.com --suggest mapping.json
 *
 *   # Edit it, then see what it would do:
 *   pnpm ts-node src/scripts/migrate-legacy-categories.ts \
 *     --email me@example.com --apply mapping.json --dry-run
 *
 *   # Do it:
 *   pnpm ts-node src/scripts/migrate-legacy-categories.ts \
 *     --email me@example.com --apply mapping.json
 *
 * ## The file
 *
 * One entry per legacy category, named by name and type, with one line per
 * legacy subcategory (`"subcategory": null` for the rows filed at the
 * category alone). `target` is a catalogue key — `telecom` files at the
 * category, `telecom.phone` under its subcategory. `CUSTOM` needs `name`,
 * the user's own subcategory to file under. `tag` names a tag, created
 * (undated, not exceptional) when missing.
 *
 *   {
 *     "categories": [
 *       {
 *         "name": "Abonnements", "type": "EXPENSE",
 *         "lines": [
 *           { "subcategory": "Téléphonie mobile", "action": "CATALOG", "target": "telecom.phone" },
 *           { "subcategory": "Sport", "action": "CATALOG", "target": "leisure.gym" },
 *           { "subcategory": "AI", "action": "CUSTOM", "target": "telecom", "name": "IA", "tag": "Pro" },
 *           { "subcategory": null, "action": "UNFILE" }
 *         ]
 *       }
 *     ]
 *   }
 *
 * A category in the file that the account no longer has is skipped with a
 * note: the file outlives the run it was written for. A line the category
 * has and the file does not is an error: the migration refuses to guess.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma'
import type { TransactionType } from '../generated/prisma'
import { normalizeName } from '../categories/category-catalog.plan'
import { MigrationPlanError } from '../categories/category-migration.plan'
import {
  describeSideEffects,
  migrateLegacyCategory,
  readLegacyOverview,
  readLegacySource,
  readTargets,
} from '../categories/legacy-migration.apply'
import type { LegacyCategoryView } from '../categories/legacy-migration.apply'
import { planLegacyMigration } from '../categories/legacy-migration.plan'
import type {
  LegacyAction,
  LegacyDecision,
} from '../categories/legacy-migration.plan'

export interface ScriptOptions {
  email: string
  suggest: string | null
  apply: string | null
  dryRun: boolean
}

export function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = {
    email: '',
    suggest: null,
    apply: null,
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => {
      const v = argv[++i]
      if (!v) throw new Error(`${arg} needs a value`)
      return v
    }
    if (arg === '--email') options.email = value()
    else if (arg === '--suggest') options.suggest = value()
    else if (arg === '--apply') options.apply = value()
    else if (arg === '--dry-run') options.dryRun = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.email) throw new Error('--email is required')
  if (!options.suggest && !options.apply) {
    throw new Error('One of --suggest <file> or --apply <file> is required')
  }
  if (options.suggest && options.apply) {
    throw new Error('--suggest and --apply are exclusive')
  }
  return options
}

// ── The file ────────────────────────────────────────────────────────────────

export interface MappingLine {
  subcategory: string | null
  action: LegacyAction
  target?: string
  name?: string
  tag?: string
}

export interface MappingCategory {
  name: string
  type: TransactionType
  lines: MappingLine[]
}

export interface MappingFile {
  categories: MappingCategory[]
}

/** A mapping file pre-filled with the suggestions; a null suggestion leaves the line to KEEP. */
export function suggestMapping(overview: LegacyCategoryView[]): MappingFile {
  return {
    categories: overview.map(category => ({
      name: category.name,
      type: category.type,
      lines: category.lines.map(line => {
        const s = line.suggestion
        if (!s) return { subcategory: line.name, action: 'KEEP' as const }
        const base: MappingLine = { subcategory: line.name, action: s.action }
        const target = s.subcategoryKey ?? s.categoryKey
        if (s.action === 'CATALOG' && target) base.target = target
        if (s.tagName) base.tag = s.tagName
        return base
      }),
    })),
  }
}

function optionalText(
  record: Record<string, unknown>,
  field: string,
  where: string
): string | undefined {
  const value = record[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Mapping file: ${where}: "${field}" must be a non-empty string`
    )
  }
  return value
}

export function parseMapping(raw: unknown): MappingFile {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !Array.isArray((raw as { categories?: unknown }).categories)
  ) {
    throw new Error('Mapping file: "categories" must be an array')
  }
  const categories = (raw as { categories: unknown[] }).categories.map(
    (entry, index) => {
      if (typeof entry !== 'object' || entry === null) {
        throw new Error(`Mapping file: category #${index} is not an object`)
      }
      const c = entry as Record<string, unknown>
      const name = c['name']
      if (typeof name !== 'string' || !name) {
        throw new Error(`Mapping file: category #${index} has no name`)
      }
      const rawType = c['type']
      if (rawType !== 'EXPENSE' && rawType !== 'INCOME') {
        throw new Error(`Mapping file: "${name}" has no type`)
      }
      const type: TransactionType = rawType
      if (!Array.isArray(c['lines'])) {
        throw new Error(`Mapping file: "${name}" has no lines`)
      }
      const lines = (c['lines'] as unknown[]).map((rawLine, j) => {
        const where = `"${name}" line #${j}`
        if (typeof rawLine !== 'object' || rawLine === null) {
          throw new Error(`Mapping file: ${where} is not an object`)
        }
        const l = rawLine as Record<string, unknown>
        const subcategory = l['subcategory']
        if (subcategory !== null && typeof subcategory !== 'string') {
          throw new Error(
            `Mapping file: ${where}: "subcategory" must be a string or null`
          )
        }
        const action = l['action']
        if (
          typeof action !== 'string' ||
          !['CATALOG', 'CUSTOM', 'UNFILE', 'KEEP'].includes(action)
        ) {
          throw new Error(
            `Mapping file: ${where}: unknown action "${String(action)}"`
          )
        }
        const line: MappingLine = {
          subcategory: subcategory,
          action: action as LegacyAction,
        }
        const target = optionalText(l, 'target', where)
        if (target !== undefined) line.target = target
        const customName = optionalText(l, 'name', where)
        if (customName !== undefined) line.name = customName
        const tag = optionalText(l, 'tag', where)
        if (tag !== undefined) line.tag = tag
        return line
      })
      const category: MappingCategory = { name, type, lines }
      return category
    }
  )
  return { categories }
}

/** Turn a file's lines into decisions against the category as it is now. */
export function decisionsFor(
  category: MappingCategory,
  source: { subcategories: { id: string; name: string }[] },
  tagIdByName: Map<string, string>
): LegacyDecision[] {
  return category.lines.map(line => {
    let sourceSubcategoryId: string | null = null
    if (line.subcategory !== null) {
      const wanted = normalizeName(line.subcategory)
      const sub = source.subcategories.find(
        s => normalizeName(s.name) === wanted
      )
      if (!sub) {
        throw new Error(
          `"${category.name}" has no subcategory "${line.subcategory}"`
        )
      }
      sourceSubcategoryId = sub.id
    }
    const decision: LegacyDecision = {
      sourceSubcategoryId,
      action: line.action,
    }
    if (line.target) {
      const dot = line.target.indexOf('.')
      decision.categoryKey =
        dot === -1 ? line.target : line.target.slice(0, dot)
      if (dot !== -1 && line.action === 'CATALOG') {
        decision.subcategoryKey = line.target
      }
    }
    if (line.name) decision.subcategoryName = line.name
    if (line.tag) {
      const tagId = tagIdByName.get(normalizeName(line.tag))
      if (!tagId) throw new Error(`Tag "${line.tag}" was not resolved`)
      decision.tagId = tagId
    }
    return decision
  })
}

// ── Running ─────────────────────────────────────────────────────────────────

async function resolveTags(
  prisma: PrismaClient,
  userId: string,
  mapping: MappingFile,
  dryRun: boolean
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  for (const category of mapping.categories) {
    for (const line of category.lines) {
      if (line.tag) names.set(normalizeName(line.tag), line.tag)
    }
  }
  const byName = new Map<string, string>()
  if (names.size === 0) return byName

  const existing = await prisma.tag.findMany({
    where: { userId },
    select: { id: true, name: true },
  })
  for (const tag of existing) byName.set(normalizeName(tag.name), tag.id)

  for (const [key, name] of names) {
    if (byName.has(key)) continue
    if (dryRun) {
      console.log(`  (tag "${name}" would be created)`)
      byName.set(key, `dry-run:${name}`)
      continue
    }
    const created = await prisma.tag.create({ data: { userId, name } })
    console.log(`  tag "${name}" created`)
    byName.set(key, created.id)
  }
  return byName
}

export async function main(
  prisma: PrismaClient,
  options: ScriptOptions
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: options.email } })
  if (!user) throw new Error(`No user with email ${options.email}`)

  if (options.suggest) {
    const overview = await readLegacyOverview(prisma, user.id)
    const mapping = suggestMapping(overview)
    writeFileSync(options.suggest, JSON.stringify(mapping, null, 2) + '\n')
    const lines = overview.reduce((sum, c) => sum + c.lines.length, 0)
    const guessed = overview.reduce(
      (sum, c) => sum + c.lines.filter(l => l.suggestion).length,
      0
    )
    console.log(
      `${overview.length} legacy categories, ${lines} lines, ` +
        `${guessed} with a suggestion → ${options.suggest}`
    )
    return
  }

  const mapping = parseMapping(
    JSON.parse(readFileSync(options.apply as string, 'utf8'))
  )
  console.log(
    `${mapping.categories.length} categories in the file` +
      (options.dryRun ? ' — dry run, nothing is written' : '')
  )
  const tagIdByName = await resolveTags(
    prisma,
    user.id,
    mapping,
    options.dryRun
  )

  for (const entry of mapping.categories) {
    const category = await prisma.category.findFirst({
      where: {
        userId: user.id,
        name: entry.name,
        type: entry.type,
        catalogKey: null,
      },
      select: { id: true },
    })
    console.log(`\n${entry.name} (${entry.type})`)
    if (!category) {
      console.log('  not a legacy category of this account any more, skipped')
      continue
    }

    const source = await readLegacySource(prisma, user.id, category.id)
    const decisions = decisionsFor(entry, source, tagIdByName)

    if (options.dryRun) {
      const targets = await readTargets(prisma, user.id)
      try {
        const plan = planLegacyMigration(source, targets, decisions)
        const effects = await describeSideEffects(
          prisma,
          user.id,
          source,
          plan,
          targets
        )
        for (const move of plan.moves) {
          console.log(
            `  ${(move.sourceSubcategoryName ?? '(category alone)').padEnd(32)} ` +
              `${String(move.transactionCount).padStart(5)} → ${move.filing.categoryName}` +
              (move.filing.subcategory
                ? ` / ${move.filing.subcategory.name}`
                : '') +
              (move.filing.subcategory?.kind === 'create' ? ' (new)' : '') +
              (move.filing.type !== source.type
                ? ` [${move.filing.type}]`
                : '') +
              (move.tagId ? ' +tag' : '')
          )
        }
        for (const unfile of plan.unfiles) {
          console.log(
            `  ${(unfile.sourceSubcategoryName ?? '(category alone)').padEnd(32)} ` +
              `${String(unfile.transactionCount).padStart(5)} → à classer` +
              (unfile.tagId ? ' +tag' : '')
          )
        }
        for (const keep of plan.keeps) {
          console.log(`  ${String(keep.transactionCount).padStart(38)} kept`)
        }
        for (const entryOutcome of effects.budgetEntries) {
          console.log(
            `  envelope ${entryOutcome.planName}: ${entryOutcome.amount} → ` +
              (entryOutcome.targetCategoryName ?? 'dropped') +
              (entryOutcome.mergesIntoExisting ? ' (summed)' : '')
          )
        }
        console.log(
          `  ${plan.deletesSourceCategory ? 'category deleted afterwards' : 'category kept (partial)'}` +
            (effects.dropsHiddenPreference ? ', hidden preference dropped' : '')
        )
      } catch (error) {
        if (error instanceof MigrationPlanError) {
          console.log(`  ✖ ${error.message}`)
          continue
        }
        throw error
      }
      continue
    }

    try {
      const outcome = await migrateLegacyCategory(
        prisma,
        user.id,
        category.id,
        decisions
      )
      console.log(
        `  → ${outcome.movedTransactions} moved, ${outcome.unfiledTransactions} unfiled, ` +
          `${outcome.keptTransactions} kept, ${outcome.typeChangedTransactions} changed type, ` +
          `${outcome.taggedTransactions} tagged; subcategories: ${outcome.createdSubcategories} created, ` +
          `${outcome.reparentedSubcategories} reparented, ${outcome.deletedSubcategories} deleted; ` +
          `envelopes: ${outcome.budgetEntriesMoved} moved, ${outcome.budgetEntriesMerged} summed, ` +
          `${outcome.budgetEntriesDropped} dropped` +
          (outcome.sourceDeleted ? '; category deleted' : '; category kept')
      )
    } catch (error) {
      if (error instanceof MigrationPlanError) {
        console.log(`  ✖ ${error.message}`)
        continue
      }
      throw error
    }
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
