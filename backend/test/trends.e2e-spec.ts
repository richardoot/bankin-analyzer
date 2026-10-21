import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import type { DashboardSummaryDto, MonthlyDataDto } from '../src/dashboard/dto'
import type { TrendsResponseDto } from '../src/trends/dto'
import { AmortizedSlicesService } from '../src/transactions/amortized-slices.service'
import {
  addMonths,
  aggregateMonths,
  lastClosedMonth,
  type TrendReading,
} from '../src/trends/trend.detection'
import { readTrendRegistry } from '../src/trends/trend.registry'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

/** The month read by default, and the seven before it. */
const CLOSED = lastClosedMonth(new Date())
const MONTHS = Array.from({ length: 8 }, (_, i) => addMonths(CLOSED, i - 7))
const CURRENT = addMonths(CLOSED, 1)

/**
 * « Ce qui change » on real tables: the endpoint behind its guard and its
 * validation, and the golden master the plan asks for — a month's units
 * (every category, plus the lines filed nowhere) add up to the dashboard's
 * own figure for that month, `everydayNetExpenses` in the everyday reading
 * and `netExpenses` in the real one, whatever the reimbursement switches.
 *
 * The ledger carries everything that makes the two readings differ: a joint
 * account (divisor 2), an account out of the statistics, an exceptional
 * tag, a smoothed purchase, a debt still owed and one paid back.
 */
describe('Trends (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let ownerId: string

  beforeAll(async () => {
    ctx = await createE2eApp([owner, stranger])
    prisma = ctx.prisma
    ownerId = await userOf(owner)
    await userOf(stranger)
    await seedLedger(ownerId)
  })

  afterAll(async () => {
    await ctx.close()
  }, 30_000)

  async function userOf(identity: typeof owner): Promise<string> {
    const me = await request(ctx.server)
      .get('/users/me')
      .set(ctx.auth(identity))
    expect(me.status).toBe(200)
    return (me.body as { id: string }).id
  }

  async function seedLedger(userId: string): Promise<void> {
    const courant = await prisma.account.create({
      data: { userId, name: 'Compte courant' },
    })
    const joint = await prisma.account.create({
      data: { userId, name: 'Compte joint', type: 'JOINT', divisor: 2 },
    })
    const hidden = await prisma.account.create({
      data: { userId, name: 'Compte pro', isExcludedFromStats: true },
    })
    const sub = async (
      catalogKey: string
    ): Promise<{ id: string; categoryId: string }> =>
      prisma.subcategory.findUniqueOrThrow({
        where: { userId_catalogKey: { userId, catalogKey } },
      })
    const supermarket = await sub('food.supermarket')
    const restaurant = await sub('dining.restaurant')
    const rent = await sub('housing.rent')
    const pharmacy = await sub('health.pharmacy')
    const tech = await sub('shopping.tech')
    const refunds = await sub('refunds.person')
    const holiday = await prisma.tag.create({
      data: { userId, name: 'Vacances', isExceptional: true },
    })
    const person = await prisma.person.create({
      data: { userId, name: 'Marie' },
    })

    let sequence = 0
    const line = async (
      month: string,
      day: number,
      amount: number,
      options: {
        accountId?: string
        subcategory?: { id: string; categoryId: string } | null
        type?: 'EXPENSE' | 'INCOME'
        amortizationMonths?: number
        /** The bank label: what a merchant is read from. */
        label?: string
      } = {}
    ): Promise<string> => {
      sequence += 1
      const target = options.subcategory ?? null
      const row = await prisma.transaction.create({
        data: {
          userId,
          accountId: options.accountId ?? courant.id,
          categoryId: target?.categoryId ?? null,
          subcategoryId: target?.id ?? null,
          hash: `${userId}-trend-${sequence}`,
          date: new Date(`${month}-${String(day).padStart(2, '0')}T10:00:00Z`),
          description: options.label ?? `Ligne ${sequence}`,
          amount: options.type === 'INCOME' ? amount : -amount,
          type: options.type ?? 'EXPENSE',
          amortizationMonths: options.amortizationMonths ?? null,
        },
      })
      return row.id
    }

    for (const [index, month] of MONTHS.entries()) {
      const isRead = month === CLOSED
      await line(month, 1, 900, { subcategory: rent, label: 'VIR LOYER' })
      for (let i = 0; i < 3; i++) {
        await line(month, 3 + i, 40 + index + i, {
          subcategory: supermarket,
          label: 'CB CARREFOUR MARKET',
        })
      }
      // The habit: two restaurants a month on the joint account; six in the
      // month read.
      for (let i = 0; i < (isRead ? 6 : 2); i++) {
        await line(month, 10 + i, 60, {
          accountId: joint.id,
          subcategory: restaurant,
          label: 'CB LE BISTROT',
        })
      }
      // Lines filed nowhere: one a month, six in the month read.
      for (let i = 0; i < (isRead ? 6 : 1); i++) {
        await line(month, 20 + i, 25)
      }
      // Never read: an account out of the statistics.
      await line(month, 15, 500, {
        accountId: hidden.id,
        subcategory: supermarket,
      })
    }

    // An episode: out of the everyday reading, in the real one.
    const dinner = await line(MONTHS[5] ?? CLOSED, 18, 300, {
      subcategory: restaurant,
    })
    await prisma.transactionTag.create({
      data: { transactionId: dinner, tagId: holiday.id },
    })
    // A smoothed purchase: by its slices in the everyday reading.
    await line(MONTHS[4] ?? CLOSED, 12, 600, {
      subcategory: tech,
      amortizationMonths: 3,
    })
    // A debt still owed: off the spending when the preference says so.
    const pills = await line(MONTHS[6] ?? CLOSED, 9, 100, {
      subcategory: pharmacy,
    })
    await prisma.reimbursementRequest.create({
      data: { userId, transactionId: pills, personId: person.id, amount: 40 },
    })
    // A debt paid back: off the spending when received ones are deducted.
    const doctor = await line(MONTHS[3] ?? CLOSED, 9, 80, {
      subcategory: pharmacy,
    })
    const owed = await prisma.reimbursementRequest.create({
      data: { userId, transactionId: doctor, personId: person.id, amount: 50 },
    })
    const repaid = await line(MONTHS[3] ?? CLOSED, 25, 50, {
      subcategory: refunds,
      type: 'INCOME',
    })
    await prisma.reimbursementPayment.create({
      data: {
        userId,
        reimbursementId: owed.id,
        incomeTransactionId: repaid,
        amount: 50,
        kind: 'CASH',
        settledAt: new Date(),
      },
    })
    // A subscription that appeared over the last three closed months: its
    // lines are a recurrence's, trend 9 reads it out of the cache.
    for (const month of MONTHS.slice(-3)) {
      await line(month, 3, 29.99, {
        subcategory: tech,
        label: 'PRLV BASIC FIT',
      })
    }
    // The month under way: never read.
    await line(CURRENT, 2, 2000, { subcategory: restaurant })
  }

  async function trends(
    query: Record<string, string> = {},
    identity = owner
  ): Promise<request.Response> {
    return request(ctx.server)
      .get('/trends')
      .query(query)
      .set(ctx.auth(identity))
  }

  it('rejects an unauthenticated reading', async () => {
    const response = await request(ctx.server).get('/trends')
    expect(response.status).toBe(401)
  })

  it('reads the last closed month against its habit, lines to file first', async () => {
    const response = await trends()
    expect(response.status).toBe(200)
    const body = response.body as TrendsResponseDto

    expect(body).toMatchObject({
      month: CLOSED,
      reading: 'everyday',
      window: 6,
      completeMonths: 7,
      digest: null,
    })
    expect(body.availableMonths[0]).toBe(CLOSED)
    expect(body.insights[0]).toMatchObject({
      kind: 'uncategorized',
      current: 6,
    })
    // Six restaurants instead of two, at the joint account's half.
    const restaurant = body.insights.find(i => i.unit.name === 'Restaurant')
    expect(restaurant).toMatchObject({
      kind: 'frequency',
      direction: 'up',
      current: 6,
      reference: 2,
    })
    expect(restaurant?.series).toHaveLength(7)
    // The restaurant is one merchant, all of it: the subcategory speaks.
    expect(body.insights.some(i => i.unit.type === 'merchant')).toBe(false)
  })

  it('reads a subscription that appeared out of the recurrence cache it refreshed first', async () => {
    const body = (await trends()).body as TrendsResponseDto
    const gym = body.insights.find(i => i.kind === 'subscription')

    expect(gym).toMatchObject({
      unit: { type: 'recurrence', id: '30:basic fit', name: 'Basic Fit' },
      direction: 'up',
      tone: 'neutral',
      deltaPct: null,
    })
    expect(gym?.sentence).toMatch(
      /^Nouvel abonnement : Basic Fit, 29,99 € par mois depuis \S+/
    )
  })

  it('takes the window and the reading from the query', async () => {
    const response = await trends({
      window: '3',
      reading: 'real',
      month: MONTHS[6] ?? CLOSED,
      deductReimbursements: 'false',
    })
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      month: MONTHS[6],
      window: 3,
      reading: 'real',
    })
  })

  it.each([
    [{ window: '4' }],
    [{ month: '2026-13' }],
    [{ reading: 'tout' }],
    [{ month: CURRENT }],
  ])('refuses %j', async query => {
    const response = await trends(query)
    expect(response.status).toBe(400)
  })

  it("never reads another user's ledger", async () => {
    const response = await trends({}, stranger)
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      completeMonths: 0,
      insights: [],
      quietSentence: null,
      availableMonths: [],
    })
  })

  describe('golden master against the dashboard', () => {
    const cases: Array<{
      reading: TrendReading
      deductReceived: boolean
      deductPending: boolean
    }> = []
    for (const reading of ['everyday', 'real'] as const) {
      for (const deductReceived of [true, false]) {
        for (const deductPending of [true, false]) {
          cases.push({ reading, deductReceived, deductPending })
        }
      }
    }

    it.each(cases)(
      'adds every month up to the dashboard: %j',
      async ({ reading, deductReceived, deductPending }) => {
        const summary = await request(ctx.server)
          .post('/dashboard/summary')
          .set(ctx.auth(owner))
          .send({
            startDate: `${MONTHS[0]}-01`,
            endDate: `${CLOSED}-28`,
            deductReimbursements: deductReceived,
            deductPendingReimbursements: deductPending,
          })
        expect(summary.status).toBe(201)
        const byMonth = new Map(
          (summary.body as DashboardSummaryDto).monthlyData.map(
            (m): [string, MonthlyDataDto] => [m.month, m]
          )
        )

        const registry = await readTrendRegistry(
          prisma,
          ctx.app.get(AmortizedSlicesService),
          {
            userId: ownerId,
            firstMonth: MONTHS[0] ?? CLOSED,
            lastMonth: CLOSED,
            deductReceived,
            deductPending,
          }
        )
        const aggregates = aggregateMonths(registry, reading, MONTHS)

        const compared = MONTHS.map(month => {
          const aggregate = aggregates.get(month)
          const units = [...(aggregate?.units ?? [])]
            .filter(([key]) => key.startsWith('category:'))
            .reduce((sum, [, unit]) => sum + unit.amount, 0)
          const dashboard = byMonth.get(month)
          return {
            month,
            trends:
              Math.round((units + (aggregate?.uncategorized ?? 0)) * 100) / 100,
            dashboard:
              reading === 'everyday'
                ? dashboard?.everydayNetExpenses
                : dashboard?.netExpenses,
          }
        })
        expect(compared.map(c => c.trends)).toEqual(
          compared.map(c => c.dashboard)
        )
      }
    )

    it('reads the two readings apart, so the master proves something', async () => {
      const summary = await request(ctx.server)
        .post('/dashboard/summary')
        .set(ctx.auth(owner))
        .send({ startDate: `${MONTHS[0]}-01`, endDate: `${CLOSED}-28` })
      const months = (summary.body as DashboardSummaryDto).monthlyData
      const differ = months.filter(m => m.everydayNetExpenses !== m.netExpenses)
      // The episode, the purchase month and its two later slices.
      expect(differ.map(m => m.month)).toEqual(
        [MONTHS[4], MONTHS[5], MONTHS[6]].sort()
      )
    })
  })
})
