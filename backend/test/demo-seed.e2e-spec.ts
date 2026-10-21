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

  it('gives the trends card at least three trends of different kinds, a merchant, a subscription, a drift and the savings among them', async () => {
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
    // What the seed plants in that month, whatever else moves: lot 1's
    // three, lot 2's subscription and new shop, lot 3's drift and savings.
    expect([...kinds]).toEqual(
      expect.arrayContaining([
        'uncategorized',
        'frequency',
        'basket',
        'subscription',
        'newHabit',
        'drift',
        'savings',
      ])
    )
    expect(result.insights.find(i => i.kind === 'drift')).toMatchObject({
      unit: { type: 'category', name: 'Famille et amis' },
      direction: 'up',
    })
    expect(result.insights.find(i => i.kind === 'drift')?.sentence).toMatch(
      /^Famille et amis : en hausse régulière depuis 6 mois, \+\d+ % par mois \(59 € en /
    )
    // The freelance mission of the last quarter: income less expenses rises
    // by more than the 3-point threshold, whatever the Livret A transfers.
    const savings = result.insights.find(i => i.kind === 'savings')
    expect(savings).toMatchObject({
      direction: 'up',
      unit: { type: 'savings' },
    })
    expect(
      (savings?.current ?? 0) - (savings?.reference ?? 0)
    ).toBeGreaterThanOrEqual(3)
    // The history covers every horizon: nothing said missing.
    expect(result.horizons).toEqual([])
    expect(
      result.insights.find(i => i.kind === 'subscription')?.sentence
    ).toMatch(/^Nouvel abonnement : Disney Plus, 8,99 € par mois depuis /)
    expect(result.insights.find(i => i.kind === 'newHabit')).toMatchObject({
      unit: { type: 'merchant', name: 'Primeur du Marche' },
    })
    expect(result.insights[0]?.sentence).toMatch(
      /^7 dépenses d(e |')\S+ sont à classer/
    )
  }, 180_000)
})
