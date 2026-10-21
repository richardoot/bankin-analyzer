import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { PrismaService } from '../src/prisma/prisma.service'
import { FilterPreferencesService } from '../src/filter-preferences/filter-preferences.service'
import { RecurrencesService } from '../src/recurrences/recurrences.service'
import { AmortizedSlicesService } from '../src/transactions/amortized-slices.service'
import { TrendsService } from '../src/trends/trends.service'
import { createE2eDatabase } from './e2e-database'
import type { E2eDatabase } from './e2e-database'

const run = promisify(execFile)
const BACKEND = path.join(__dirname, '..')

/**
 * The demo account is how « Ce qui change » is shown to anyone who is not
 * Richard: the plan asks that its last closed month say at least three
 * things, of different kinds, or the card is invisible in a demonstration.
 * The seed runs here as it runs on a laptop — its own process, its own
 * client — against a throwaway database.
 */
describe('Demo seed (e2e)', () => {
  let database: E2eDatabase

  beforeAll(async () => {
    database = await createE2eDatabase()
  })

  afterAll(async () => {
    await database.close()
  }, 30_000)

  it('gives the trends card at least three trends of different kinds', async () => {
    const user = await database.prisma.user.create({
      data: { supabaseId: 'demo-seed', email: 'demo@e2e.invalid' },
    })
    await run(process.execPath, ['prisma/seed.mjs'], {
      cwd: BACKEND,
      env: {
        ...process.env,
        SEED_DATABASE_URL: database.connectionString,
        SEED_USER_EMAIL: user.email,
      },
    })

    const prisma = database.prisma as unknown as PrismaService
    const trends = new TrendsService(
      prisma,
      new FilterPreferencesService(prisma),
      new RecurrencesService(prisma),
      new AmortizedSlicesService(prisma)
    )
    const result = await trends.getTrends(user.id)

    const kinds = new Set(result.insights.map(i => i.kind))
    expect(result.completeMonths).toBeGreaterThanOrEqual(6)
    expect(result.insights.length).toBeGreaterThanOrEqual(3)
    // The three the seed plants in that month, whatever else moves.
    expect([...kinds]).toEqual(
      expect.arrayContaining(['uncategorized', 'frequency', 'basket'])
    )
    expect(result.insights[0]?.sentence).toMatch(
      /^7 dépenses d(e |')\S+ sont à classer/
    )
  }, 180_000)
})
