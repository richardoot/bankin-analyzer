import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { Mock } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import type { DashboardSummaryDto, MonthlyDataDto } from '../src/dashboard/dto'
import type {
  TrendDigestResponseDto,
  TrendsResponseDto,
} from '../src/trends/dto'
import { AiSuggestionsService } from '../src/ai-suggestions/ai-suggestions.service'
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

    // Trend 15: a salary every month, 200 € to the Livret A, and since the
    // quarter read another 800 € a month from the joint account (its half
    // counts). One withdrawal back, and an income the statistics never see.
    const category = async (catalogKey: string): Promise<string> =>
      (
        await prisma.category.findUniqueOrThrow({
          where: { userId_catalogKey: { userId, catalogKey } },
        })
      ).id
    const salary = await category('work-income')
    const livret = await category('emergency-savings')
    const row = async (
      month: string,
      day: number,
      amount: number,
      type: 'INCOME' | 'TRANSFER',
      categoryId: string,
      accountId = courant.id
    ): Promise<void> => {
      sequence += 1
      await prisma.transaction.create({
        data: {
          userId,
          accountId,
          categoryId,
          hash: `${userId}-trend-${sequence}`,
          date: new Date(`${month}-${String(day).padStart(2, '0')}T10:00:00Z`),
          description: `Flux ${sequence}`,
          amount,
          type,
        },
      })
    }
    for (const [index, month] of MONTHS.entries()) {
      await row(month, 2, 3000, 'INCOME', salary)
      await row(month, 4, -200, 'TRANSFER', livret)
      if (index >= MONTHS.length - 3) {
        await row(month, 5, -800, 'TRANSFER', livret, joint.id)
      }
      await row(month, 6, 1000, 'INCOME', salary, hidden.id)
    }
    await row(MONTHS[2] ?? CLOSED, 20, 100, 'TRANSFER', livret)
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

  describe('the written digest', () => {
    /**
     * The model is never called from a test: the client is replaced on the
     * app's own instance. By default it answers with the first trend's own
     * sentence, so every number it writes is one it was given.
     */
    let writeDigest: Mock<AiSuggestionsService['writeDigest']>

    const fenced = (prompt: string): { trends: { sentence: string }[] } =>
      JSON.parse(
        prompt.slice(
          prompt.indexOf('<user_financial_data>\n') +
            '<user_financial_data>\n'.length,
          prompt.indexOf('\n</user_financial_data>')
        )
      ) as { trends: { sentence: string }[] }

    beforeAll(() => {
      writeDigest = vi.fn((_system: string, user: string) =>
        Promise.resolve({
          text: `Voici le mois. ${fenced(user).trends[0]?.sentence ?? ''}`,
          model: 'claude-haiku-5-5',
          inputTokens: 2400,
          outputTokens: 350,
        })
      )
      vi.spyOn(ctx.app.get(AiSuggestionsService), 'writeDigest')

        .mockImplementation(writeDigest)
    })

    async function digest(
      query: Record<string, string> = {},
      identity = owner,
      method: 'get' | 'regenerate' = 'get'
    ): Promise<request.Response> {
      const call =
        method === 'get'
          ? request(ctx.server).get('/trends/digest')
          : request(ctx.server).post('/trends/digest/regenerate')
      return call.query(query).set(ctx.auth(identity))
    }

    it('rejects an unauthenticated reading', async () => {
      expect((await request(ctx.server).get('/trends/digest')).status).toBe(401)
      expect(
        (await request(ctx.server).post('/trends/digest/regenerate')).status
      ).toBe(401)
    })

    it('writes the paragraph at the first opening, remembers it, and never asks twice', async () => {
      writeDigest.mockClear()
      const first = await digest()
      expect(first.status).toBe(200)
      const body = first.body as TrendDigestResponseDto
      expect(body.digest).toMatchObject({
        month: CLOSED,
        reading: 'everyday',
        window: 6,
        model: 'claude-haiku-5-5',
      })
      expect(body.digest?.text).toMatch(/^Voici le mois\. /)

      const row = await prisma.monthlyDigest.findUniqueOrThrow({
        where: {
          userId_month_reading_window: {
            userId: ownerId,
            month: CLOSED,
            reading: 'everyday',
            window: 6,
          },
        },
      })
      expect(row).toMatchObject({ inputTokens: 2400, outputTokens: 350 })
      expect(row.insights).toMatchObject({ month: CLOSED, window: 6 })

      const second = await digest()
      expect(second.body).toEqual(body)
      expect(writeDigest).toHaveBeenCalledTimes(1)
    })

    it('reads the same trends as the card: the paragraph cites the first one', async () => {
      const list = (await trends()).body as TrendsResponseDto
      const body = (await digest()).body as TrendDigestResponseDto
      expect(body.digest?.text).toContain(list.insights[0]?.sentence ?? '—')
    })

    it('writes again on « Régénérer » and keeps the latest', async () => {
      writeDigest.mockClear()
      writeDigest.mockImplementationOnce((_system: string, user: string) =>
        Promise.resolve({
          text: `Nouveau bilan. ${fenced(user).trends[0]?.sentence ?? ''}`,
          model: 'claude-haiku-5-5',
          inputTokens: 2500,
          outputTokens: 360,
        })
      )
      const response = await digest({}, owner, 'regenerate')
      expect(response.status).toBe(200)
      expect((response.body as TrendDigestResponseDto).digest?.text).toMatch(
        /^Nouveau bilan\. /
      )
      expect(writeDigest).toHaveBeenCalledTimes(1)

      const again = (await digest()).body as TrendDigestResponseDto
      expect(again.digest?.text).toMatch(/^Nouveau bilan\. /)
      expect(await prisma.monthlyDigest.count()).toBe(1)
    })

    it('keeps one paragraph per window', async () => {
      const response = await digest({ window: '3' })
      expect((response.body as TrendDigestResponseDto).digest?.window).toBe(3)
      expect(await prisma.monthlyDigest.count()).toBe(2)
    })

    it('answers { digest: null }, never an error, for a number the trends do not carry', async () => {
      writeDigest.mockResolvedValueOnce({
        text: 'Vous avez dépensé 98 765 € ce mois-ci.',
        model: 'claude-haiku-5-5',
        inputTokens: 2400,
        outputTokens: 20,
      })
      const response = await digest({ window: '12' })
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ digest: null })
      expect(await prisma.monthlyDigest.count()).toBe(2)
    })

    it('answers { digest: null } when the model refuses', async () => {
      writeDigest.mockRejectedValueOnce(new Error('stop_reason: refusal'))
      const response = await digest({ reading: 'real' })
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ digest: null })
    })

    it('answers { digest: null } without an API key, and never asks', async () => {
      const key = process.env.ANTHROPIC_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      writeDigest.mockClear()
      try {
        const response = await digest({ month: MONTHS[6] ?? CLOSED })
        expect(response.body).toEqual({ digest: null })
        expect(writeDigest).not.toHaveBeenCalled()
      } finally {
        process.env.ANTHROPIC_API_KEY = key
      }
    })

    it('has nothing to tell on a history too short, and never asks', async () => {
      writeDigest.mockClear()
      const response = await digest({}, stranger)
      expect(response.body).toEqual({ digest: null })
      expect(writeDigest).not.toHaveBeenCalled()
    })

    it.each([[{ window: '4' }], [{ month: CURRENT }]])(
      'refuses %j',
      async query => {
        expect((await digest(query)).status).toBe(400)
      }
    )
  })

  describe('the MCP tool', () => {
    let rpcId = 0
    /** One tools/call, as an MCP client sends it; the SSE frame is unwrapped. */
    async function callTool(
      args: Record<string, unknown>
    ): Promise<{ isError: boolean; text: string; data: unknown }> {
      rpcId += 1
      const res = await request(ctx.server)
        .post('/mcp')
        .set(ctx.auth(owner))
        .set('Accept', 'application/json, text/event-stream')
        .set('Content-Type', 'application/json')
        .send({
          jsonrpc: '2.0',
          id: rpcId,
          method: 'tools/call',
          params: { name: 'get_spending_trends', arguments: args },
        })
      expect(res.status).toBe(200)
      const frame = res.text.includes('data: ')
        ? res.text
            .split('\n')
            .filter(line => line.startsWith('data: '))
            .map(line => line.slice('data: '.length))
            .join('')
        : res.text
      const message = JSON.parse(frame) as {
        result: { content: Array<{ text: string }>; isError?: boolean }
      }
      const text = message.result.content[0]?.text ?? ''
      const fenced =
        /^<user_financial_data>\n([\s\S]*)\n<\/user_financial_data>$/.exec(text)
      return {
        isError: message.result.isError === true,
        text,
        data: fenced ? JSON.parse(fenced[1] as string) : null,
      }
    }

    it('reads the very list the screen reads, with the same defaults', async () => {
      const [tool, screen] = await Promise.all([callTool({}), trends()])

      expect(tool.isError).toBe(false)
      expect(tool.data).toEqual(screen.body)
      expect((tool.data as TrendsResponseDto).insights.length).toBeGreaterThan(
        5
      )
    })

    it('takes the month, the window and the reading as the screen does', async () => {
      const month = MONTHS[6] ?? CLOSED
      const [tool, screen] = await Promise.all([
        callTool({ month, window: 3, reading: 'real' }),
        trends({ month, window: '3', reading: 'real' }),
      ])

      expect(tool.data).toEqual(screen.body)
      expect(tool.data).toMatchObject({ month, window: 3, reading: 'real' })
    })

    it("refuses a month not closed yet with the service's words", async () => {
      const answer = await callTool({ month: CURRENT })

      expect(answer.isError).toBe(true)
      expect(answer.text).toBe(
        `Refusé par le serveur : Le mois ${CURRENT} n'est pas encore clos : le dernier mois clos est ${CLOSED}.`
      )
    })

    it.each([[{ window: 4 }], [{ month: '2026-13' }], [{ reading: 'tout' }]])(
      'refuses %j at the schema',
      async args => {
        const answer = await callTool(args)

        expect(answer.isError).toBe(true)
        expect(answer.text).toMatch(
          /Invalid arguments for tool get_spending_trends/
        )
      }
    )
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

    it.each([
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ])(
      'reads income and savings as the dashboard does (received %s, pending %s)',
      async (deductReceived, deductPending) => {
        const summaryOf = async (
          startDate: string
        ): Promise<DashboardSummaryDto> => {
          const response = await request(ctx.server)
            .post('/dashboard/summary')
            .set(ctx.auth(owner))
            .send({
              startDate,
              endDate: `${CLOSED}-28`,
              deductReimbursements: deductReceived,
              deductPendingReimbursements: deductPending,
            })
          expect(response.status).toBe(201)
          return response.body as DashboardSummaryDto
        }
        const all = await summaryOf(`${MONTHS[0]}-01`)
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
        const flows = new Map((registry.flows ?? []).map(f => [f.month, f]))
        expect(
          MONTHS.map(m => Math.round((flows.get(m)?.income ?? 0) * 100) / 100)
        ).toEqual(
          MONTHS.map(m => all.monthlyData.find(d => d.month === m)?.income ?? 0)
        )
        const saved = [...flows.values()].reduce((sum, f) => sum + f.savings, 0)
        expect(Math.round(saved * 100) / 100).toBe(all.savingsTransfers)

        // The quarter read, against the dashboard over the same months.
        const quarter = await summaryOf(`${MONTHS[5]}-01`)
        const body = (
          await trends({
            deductReimbursements: String(deductReceived),
            deductPendingReimbursements: String(deductPending),
          })
        ).body as TrendsResponseDto
        const savings = body.insights.find(i => i.kind === 'savings')
        expect(savings).toMatchObject({
          // Emergency, project and investment: the dashboard's three.
          unit: {
            type: 'savings',
            categoryIds: [
              expect.any(String),
              expect.any(String),
              expect.any(String),
            ],
          },
          direction: 'up',
          current: Math.round((quarter.savingsRate ?? 0) * 1000) / 10,
        })
        expect((savings?.remainingToLive?.current ?? 0) * 3).toBeCloseTo(
          quarter.remainingToLive ?? 0,
          1
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
