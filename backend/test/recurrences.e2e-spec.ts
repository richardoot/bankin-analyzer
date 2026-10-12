import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { RecurrencesService } from '../src/recurrences/recurrences.service'
import type { RecurrenceListDto } from '../src/recurrences/dto'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

/** The same day `months` months ago, at midnight UTC. */
function monthsAgo(months: number, day = 5): Date {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(day)
  date.setUTCMonth(date.getUTCMonth() - months)
  return date
}

/**
 * The recurrences on real tables: a recompute materialises what detection
 * finds, a decision changes it at once, a second recompute changes nothing,
 * and filing a line again is enough to bring the list up to date.
 */
describe('Recurrences (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let recurrences: RecurrencesService

  beforeAll(async () => {
    ctx = await createE2eApp([owner, stranger])
    prisma = ctx.prisma
    recurrences = ctx.app.get(RecurrencesService)
  })

  // The embedded database takes its time to shut down after a suite this
  // write-heavy (every test rebuilds the cache): ~10 s, measured with no
  // connection, statement or lock left open. Not a leak; more room.
  afterAll(async () => {
    await ctx.close()
  }, 30_000)

  beforeEach(async () => {
    await prisma.user.deleteMany()
  })

  async function userOf(identity: typeof owner): Promise<string> {
    const me = await request(ctx.server)
      .get('/users/me')
      .set(ctx.auth(identity))
    expect(me.status).toBe(200)
    return (me.body as { id: string }).id
  }

  let counter = 0
  async function expense(
    userId: string,
    description: string,
    amount: number,
    date: Date,
    subcategoryKey = 'leisure.streaming'
  ): Promise<string> {
    const account =
      (await prisma.account.findFirst({ where: { userId } })) ??
      (await prisma.account.create({ data: { userId, name: 'Compte' } }))
    const subcategory = await prisma.subcategory.findUniqueOrThrow({
      where: { userId_catalogKey: { userId, catalogKey: subcategoryKey } },
    })
    counter++
    const row = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: subcategory.categoryId,
        subcategoryId: subcategory.id,
        subcategory: subcategory.name,
        hash: `${userId}-${counter}`,
        date,
        description,
        amount,
        type: 'EXPENSE',
      },
    })
    return row.id
  }

  async function threeMonthsOfNetflix(userId: string): Promise<string[]> {
    return [
      await expense(userId, 'CB Netflix.com', -14.99, monthsAgo(2)),
      await expense(userId, 'CB Netflix.com', -14.99, monthsAgo(1)),
      await expense(userId, 'CB Netflix.com', -14.99, monthsAgo(0, 1)),
    ]
  }

  async function list(identity: typeof owner): Promise<RecurrenceListDto> {
    const response = await request(ctx.server)
      .get('/recurrences')
      .set(ctx.auth(identity))
    expect(response.status).toBe(200)
    return response.body as RecurrenceListDto
  }

  it('rejects an unauthenticated listing', async () => {
    const response = await request(ctx.server).get('/recurrences')
    expect(response.status).toBe(401)
  })

  it('shows three months of Netflix as soon as the list is read, with its filing', async () => {
    const userId = await userOf(owner)
    const ids = await threeMonthsOfNetflix(userId)
    await expense(
      userId,
      'CB Decathlon',
      -49,
      monthsAgo(1, 12),
      'leisure.sports'
    )

    // Nothing recomputes on write: the first read finds the cache stale.

    const body = await list(owner)
    expect(body.recurrences).toHaveLength(1)
    expect(body.recurrences[0]).toMatchObject({
      merchantKey: 'com netflix',
      amountBucket: 15,
      label: 'CB Netflix.com',
      period: 'MONTHLY',
      amount: 14.99,
      monthlyEquivalent: 14.99,
      occurrences: 3,
      status: 'ACTIVE',
      categoryName: 'Loisirs et culture',
      nature: 'PLEASURE',
      confirmed: false,
    })
    expect(body.monthlyTotal).toBe(14.99)
    expect(body.byNature.pleasure).toBe(14.99)
    expect(body.computedAt).not.toBeNull()

    const linked = await prisma.recurrenceTransaction.findMany({
      select: { transactionId: true },
    })
    expect(linked.map(l => l.transactionId).sort()).toEqual([...ids].sort())
  })

  it('writes the same rows on a second recompute', async () => {
    const userId = await userOf(owner)
    await threeMonthsOfNetflix(userId)

    await recurrences.recompute(userId)
    const first = await list(owner)
    await recurrences.recompute(userId)
    const second = await list(owner)

    const strip = (body: RecurrenceListDto): unknown =>
      body.recurrences.map(({ id: _id, ...rest }) => rest)
    expect(strip(second)).toEqual(strip(first))
    expect(await prisma.recurrence.count()).toBe(1)
    expect(await prisma.recurrenceTransaction.count()).toBe(3)
  })

  it('removes a dismissed recurrence, and brings it back when the dismissal is forgotten', async () => {
    const userId = await userOf(owner)
    await threeMonthsOfNetflix(userId)
    await recurrences.recompute(userId)

    const dismissed = await request(ctx.server)
      .put('/recurrences/decisions')
      .set(ctx.auth(owner))
      .send({
        merchantKey: 'com netflix',
        amountBucket: 15,
        decision: 'DISMISSED',
      })
    expect(dismissed.status).toBe(200)
    const afterDismissal = dismissed.body as RecurrenceListDto
    expect(afterDismissal.recurrences).toEqual([])
    expect(afterDismissal.dismissed).toMatchObject([
      { name: 'com netflix', state: 'DISMISSED' },
    ])
    expect(await prisma.recurrenceTransaction.count()).toBe(0)

    // A recompute brought by something else keeps the dismissal.
    await recurrences.recompute(userId)
    expect((await list(owner)).recurrences).toEqual([])

    const [setAside] = afterDismissal.dismissed
    const forgotten = await request(ctx.server)
      .delete(`/recurrences/subscriptions/${setAside?.id}`)
      .set(ctx.auth(owner))
    expect(forgotten.status).toBe(200)
    expect((forgotten.body as RecurrenceListDto).recurrences).toHaveLength(1)
  })

  it('promotes a confirmed candidate and says it was confirmed', async () => {
    const userId = await userOf(owner)
    await expense(userId, 'CB Spotify', -7.99, monthsAgo(1))
    await expense(userId, 'CB Spotify', -7.99, monthsAgo(0, 1))
    await recurrences.recompute(userId)
    expect((await list(owner)).recurrences[0]?.status).toBe('CANDIDATE')
    expect((await list(owner)).monthlyTotal).toBe(0)

    const confirmed = await request(ctx.server)
      .put('/recurrences/decisions')
      .set(ctx.auth(owner))
      .send({ merchantKey: 'spotify', amountBucket: 8, decision: 'CONFIRMED' })

    expect(confirmed.status).toBe(200)
    expect((confirmed.body as RecurrenceListDto).recurrences[0]).toMatchObject({
      status: 'ACTIVE',
      confirmed: true,
    })
  })

  it('keeps a single bucketless decision per merchant', async () => {
    await userOf(owner)
    for (const decision of ['DISMISSED', 'CONFIRMED', 'DISMISSED']) {
      const response = await request(ctx.server)
        .put('/recurrences/decisions')
        .set(ctx.auth(owner))
        .send({ merchantKey: 'spotify', decision })
      expect(response.status).toBe(200)
    }

    expect(await prisma.subscription.count()).toBe(1)
  })

  it('rejects a decision it does not know', async () => {
    await userOf(owner)
    const response = await request(ctx.server)
      .put('/recurrences/decisions')
      .set(ctx.auth(owner))
      .send({ merchantKey: 'spotify', decision: 'MAYBE' })

    expect(response.status).toBe(400)
  })

  it('recomputes when a line is filed again, and drops what became a transfer', async () => {
    const userId = await userOf(owner)
    const [first] = await threeMonthsOfNetflix(userId)
    await recurrences.recompute(userId)
    const transfer = await prisma.category.findUniqueOrThrow({
      where: { userId_catalogKey: { userId, catalogKey: 'internal-transfer' } },
    })

    const response = await request(ctx.server)
      .patch(`/transactions/${first}`)
      .set(ctx.auth(owner))
      .send({ categoryId: transfer.id })
    expect(response.status).toBe(200)

    // Two charges left: a candidate now, no longer an active recurrence.
    const body = await list(owner)
    expect(body.recurrences).toMatchObject([
      { status: 'CANDIDATE', occurrences: 2 },
    ])
  })

  it('lists the lines of a series on the transactions page', async () => {
    const userId = await userOf(owner)
    const ids = await threeMonthsOfNetflix(userId)
    await expense(
      userId,
      'CB Decathlon',
      -49,
      monthsAgo(1, 12),
      'leisure.sports'
    )
    await recurrences.recompute(userId)

    const response = await request(ctx.server)
      .get('/transactions')
      .query({ recurrence: '15:com netflix' })
      .set(ctx.auth(owner))

    expect(response.status).toBe(200)
    const body = response.body as { data: Array<{ id: string }> }
    expect(body.data).toHaveLength(3)
    expect(body.data.map(t => t.id).sort()).toEqual([...ids].sort())
  })

  it('keeps a subscription that ended long ago, with what it cost', async () => {
    const userId = await userOf(owner)
    for (const months of [28, 27, 26, 25]) {
      await expense(userId, 'Prlv Sepa Deezer', -10.99, monthsAgo(months))
    }
    await recurrences.recompute(userId)

    const body = await list(owner)
    expect(body.recurrences).toMatchObject([
      { status: 'STOPPED', occurrences: 4, totalPaid: 43.96 },
    ])
    expect(body.monthlyTotal).toBe(0)
  })

  describe('marking an expense by hand', () => {
    it('lists an annual plan paid once, on the rhythm the user gave', async () => {
      const userId = await userOf(owner)
      const id = await expense(userId, 'CB Strava Annual', -49.99, monthsAgo(2))

      const response = await request(ctx.server)
        .post('/recurrences/from-transaction')
        .set(ctx.auth(owner))
        .send({ transactionId: id, period: 'YEARLY' })

      expect(response.status).toBe(201)
      expect((response.body as RecurrenceListDto).recurrences).toMatchObject([
        {
          merchantKey: 'annual strava',
          amountBucket: 50,
          period: 'YEARLY',
          status: 'ACTIVE',
          occurrences: 1,
          monthlyEquivalent: 4.17,
          confirmed: true,
        },
      ])
      expect(await prisma.subscription.findFirst()).toMatchObject({
        state: 'CONFIRMED',
        period: 'YEARLY',
      })

      // A later recompute keeps it.
      await recurrences.recompute(userId)
      expect((await list(owner)).recurrences).toHaveLength(1)
    })

    it('refuses an income', async () => {
      const userId = await userOf(owner)
      const account = await prisma.account.create({
        data: { userId, name: 'Compte' },
      })
      const income = await prisma.transaction.create({
        data: {
          userId,
          accountId: account.id,
          hash: `${userId}-income`,
          date: monthsAgo(1),
          description: 'Vir Salaire',
          amount: 2000,
          type: 'INCOME',
        },
      })

      const response = await request(ctx.server)
        .post('/recurrences/from-transaction')
        .set(ctx.auth(owner))
        .send({ transactionId: income.id, period: 'MONTHLY' })

      expect(response.status).toBe(400)
    })

    it("does not reach another user's transaction", async () => {
      const ownerId = await userOf(owner)
      await userOf(stranger)
      const id = await expense(
        ownerId,
        'CB Strava Annual',
        -49.99,
        monthsAgo(2)
      )

      const response = await request(ctx.server)
        .post('/recurrences/from-transaction')
        .set(ctx.auth(stranger))
        .send({ transactionId: id, period: 'YEARLY' })

      expect(response.status).toBe(404)
      expect(await prisma.subscription.count()).toBe(0)
    })

    it('rejects a period it does not know', async () => {
      const userId = await userOf(owner)
      const id = await expense(userId, 'CB Strava Annual', -49.99, monthsAgo(2))

      const response = await request(ctx.server)
        .post('/recurrences/from-transaction')
        .set(ctx.auth(owner))
        .send({ transactionId: id, period: 'DAILY' })

      expect(response.status).toBe(400)
    })
  })

  describe('naming a series and attaching a payment by hand', () => {
    async function stravaMarkedAnnual(userId: string): Promise<{
      before: string
      renewal: string
    }> {
      const before = await expense(
        userId,
        'Vir Corner Strava Qwertys Billeterie Réf',
        -46.99,
        monthsAgo(13, 10)
      )
      const renewal = await expense(
        userId,
        'CB Strava Ireland Li',
        -59.99,
        monthsAgo(1, 11)
      )
      const marked = await request(ctx.server)
        .post('/recurrences/from-transaction')
        .set(ctx.auth(owner))
        .send({ transactionId: renewal, period: 'YEARLY' })
      expect(marked.status).toBe(201)
      return { before, renewal }
    }

    it('folds last year’s payment into the renewal and names the series Strava', async () => {
      const userId = await userOf(owner)
      const { before } = await stravaMarkedAnnual(userId)

      const linked = await request(ctx.server)
        .post('/recurrences/links')
        .set(ctx.auth(owner))
        .send({
          transactionId: before,
          merchantKey: 'ireland strava',
          amountBucket: 60,
        })

      expect(linked.status).toBe(201)
      expect((linked.body as RecurrenceListDto).recurrences).toMatchObject([
        {
          name: 'Strava',
          named: false,
          period: 'YEARLY',
          occurrences: 2,
          totalPaid: 106.98,
          amount: 59.99,
        },
      ])

      const lines = await request(ctx.server)
        .get('/transactions')
        .query({ recurrence: '60:ireland strava' })
        .set(ctx.auth(owner))
      const data = (
        lines.body as {
          data: Array<{
            id: string
            recurrence?: { name: string; linked: boolean }
          }>
        }
      ).data
      expect(data).toHaveLength(2)
      expect(data.find(t => t.id === before)?.recurrence).toMatchObject({
        name: 'Strava',
        linked: true,
      })
    })

    it('takes the name the user gives, and goes back to the labels when cleared', async () => {
      const userId = await userOf(owner)
      await stravaMarkedAnnual(userId)
      const key = { merchantKey: 'ireland strava', amountBucket: 60 }

      const renamed = await request(ctx.server)
        .put('/recurrences/name')
        .set(ctx.auth(owner))
        .send({ ...key, name: 'Strava Premium' })
      expect(renamed.status).toBe(200)
      expect((renamed.body as RecurrenceListDto).recurrences[0]).toMatchObject({
        name: 'Strava Premium',
        named: true,
        // Naming kept the rhythm the user gave when marking it.
        period: 'YEARLY',
      })

      const cleared = await request(ctx.server)
        .put('/recurrences/name')
        .set(ctx.auth(owner))
        .send({ ...key, name: null })
      expect((cleared.body as RecurrenceListDto).recurrences[0]).toMatchObject({
        name: 'Strava',
        named: false,
      })
    })

    it('detaches a payment the user attached', async () => {
      const userId = await userOf(owner)
      const { before } = await stravaMarkedAnnual(userId)
      await request(ctx.server)
        .post('/recurrences/links')
        .set(ctx.auth(owner))
        .send({
          transactionId: before,
          merchantKey: 'ireland strava',
          amountBucket: 60,
        })

      const detached = await request(ctx.server)
        .delete(`/recurrences/links/${before}`)
        .set(ctx.auth(owner))

      expect(detached.status).toBe(200)
      expect((detached.body as RecurrenceListDto).recurrences).toMatchObject([
        { name: 'Strava', occurrences: 1 },
      ])
    })

    it('refuses to attach to a series that does not exist, or a line that is not yours', async () => {
      const ownerId = await userOf(owner)
      await userOf(stranger)
      const { before } = await stravaMarkedAnnual(ownerId)

      const unknown = await request(ctx.server)
        .post('/recurrences/links')
        .set(ctx.auth(owner))
        .send({
          transactionId: before,
          merchantKey: 'spotify',
          amountBucket: 11,
        })
      expect(unknown.status).toBe(404)

      const foreign = await request(ctx.server)
        .post('/recurrences/links')
        .set(ctx.auth(stranger))
        .send({
          transactionId: before,
          merchantKey: 'ireland strava',
          amountBucket: 60,
        })
      expect(foreign.status).toBe(404)
      expect(await prisma.subscriptionLink.count()).toBe(0)
    })
  })

  describe('the cache follows every change to the ledger', () => {
    it('drops a series whose lines went with a deleted account', async () => {
      const userId = await userOf(owner)
      await threeMonthsOfNetflix(userId)
      expect((await list(owner)).recurrences).toHaveLength(1)

      // Through the database alone, as a cascade or a script would.
      await prisma.transaction.deleteMany({ where: { userId } })
      await prisma.account.deleteMany({ where: { userId } })

      expect((await list(owner)).recurrences).toEqual([])
    })

    it('marks the cache stale on a change detection reads, not on a pointed line', async () => {
      const userId = await userOf(owner)
      const [first] = await threeMonthsOfNetflix(userId)
      await list(owner)
      const version = async (): Promise<bigint | undefined> =>
        (await prisma.recurrenceState.findUnique({ where: { userId } }))
          ?.version

      const before = await version()
      await prisma.transaction.update({
        where: { id: first },
        data: { isPointed: true, note: 'vu' },
      })
      expect(await version()).toBe(before)

      await prisma.transaction.update({
        where: { id: first },
        data: { amount: -15.49 },
      })
      expect(await version()).toBe((before ?? 0n) + 1n)
    })

    it('rebuilds once a day even when nothing changed', async () => {
      const userId = await userOf(owner)
      await threeMonthsOfNetflix(userId)
      await list(owner)
      await prisma.recurrenceState.update({
        where: { userId },
        data: { computedAt: new Date(Date.now() - 25 * 3_600_000) },
      })

      await list(owner)

      const state = await prisma.recurrenceState.findUniqueOrThrow({
        where: { userId },
      })
      expect(Date.now() - (state.computedAt?.getTime() ?? 0)).toBeLessThan(
        60_000
      )
    })
  })

  describe('subscriptions keep their identity', () => {
    it('keeps its name when the series changes price', async () => {
      const userId = await userOf(owner)
      for (const months of [5, 4, 3]) {
        await expense(userId, 'CB Netflix.com', -14.99, monthsAgo(months))
      }
      await recurrences.recompute(userId)
      const renamed = await request(ctx.server)
        .put('/recurrences/name')
        .set(ctx.auth(owner))
        .send({ merchantKey: 'com netflix', amountBucket: 15, name: 'Netflix' })
      expect(renamed.status).toBe(200)

      // The plan changes: three months at 19.99.
      for (const months of [2, 1]) {
        await expense(userId, 'CB Netflix.com', -19.99, monthsAgo(months))
      }
      await expense(userId, 'CB Netflix.com', -19.99, monthsAgo(0, 1))
      await recurrences.recompute(userId)

      const body = await list(owner)
      expect(body.recurrences).toMatchObject([
        { name: 'Netflix', named: true, amount: 19.99, occurrences: 6 },
      ])
      expect(body.orphans).toEqual([])
      const subscription = await prisma.subscription.findFirstOrThrow()
      expect(subscription.amountBuckets).toEqual([15, 20])
      expect(body.recurrences[0]?.subscriptionId).toBe(subscription.id)
    })

    it('lists a followed subscription no series answers any more, and forgets it on request', async () => {
      const userId = await userOf(owner)
      const id = await expense(userId, 'CB Strava Annual', -49.99, monthsAgo(2))
      await request(ctx.server)
        .post('/recurrences/from-transaction')
        .set(ctx.auth(owner))
        .send({ transactionId: id, period: 'YEARLY' })
      await prisma.transaction.delete({ where: { id } })
      await recurrences.recompute(userId)

      const body = await list(owner)
      expect(body.recurrences).toEqual([])
      expect(body.orphans).toMatchObject([
        { name: 'annual strava', state: 'CONFIRMED' },
      ])

      const forgotten = await request(ctx.server)
        .delete(`/recurrences/subscriptions/${body.orphans[0]?.id}`)
        .set(ctx.auth(owner))
      expect(forgotten.status).toBe(200)
      expect((forgotten.body as RecurrenceListDto).orphans).toEqual([])
    })

    it("refuses to forget another user's subscription", async () => {
      const ownerId = await userOf(owner)
      await userOf(stranger)
      const subscription = await prisma.subscription.create({
        data: {
          userId: ownerId,
          state: 'DISMISSED',
          merchantKeys: ['spotify'],
          amountBuckets: [],
        },
      })

      const response = await request(ctx.server)
        .delete(`/recurrences/subscriptions/${subscription.id}`)
        .set(ctx.auth(stranger))

      expect(response.status).toBe(404)
      expect(await prisma.subscription.count()).toBe(1)
    })
  })

  it('never shows one user the recurrences of another', async () => {
    const userId = await userOf(owner)
    await userOf(stranger)
    await threeMonthsOfNetflix(userId)
    await recurrences.recompute(userId)

    expect((await list(stranger)).recurrences).toEqual([])
  })

  describe('the proof of commitment', () => {
    /** Simply Piano: a subscription filed under a variable subcategory. */
    async function pianoAndAnOuting(userId: string): Promise<void> {
      for (const months of [3, 2, 1]) {
        await expense(
          userId,
          'CB Simply Piano',
          -17.99,
          monthsAgo(months, 10),
          'leisure.lessons'
        )
      }
      await expense(
        userId,
        'CB Bowling',
        -40,
        monthsAgo(2, 15),
        'leisure.outings'
      )
    }

    async function structure(): Promise<{
      committed: number
      variable: number
      recurring: number
    }> {
      const response = await request(ctx.server)
        .post('/dashboard/summary')
        .set(ctx.auth(owner))
        .send({
          startDate: monthsAgo(5).toISOString().slice(0, 10),
          endDate: new Date().toISOString().slice(0, 10),
        })
      expect(response.status).toBe(201)
      return (
        response.body as {
          spendingStructure: {
            committed: number
            variable: number
            recurring: number
          }
        }
      ).spendingStructure
    }

    it('counts Simply Piano as committed on the dashboard, and variable once dismissed', async () => {
      const userId = await userOf(owner)
      await pianoAndAnOuting(userId)

      // Read straight away: the dashboard brings the cache up to date.
      expect(await structure()).toMatchObject({
        committed: 53.97,
        variable: 40,
        recurring: 53.97,
      })

      await request(ctx.server)
        .put('/recurrences/decisions')
        .set(ctx.auth(owner))
        .send({
          merchantKey: 'piano simply',
          amountBucket: 18,
          decision: 'DISMISSED',
        })

      expect(await structure()).toMatchObject({
        committed: 0,
        variable: 93.97,
        recurring: 0,
      })
    })

    it('stops deducting a subscription from an event baseline', async () => {
      const userId = await userOf(owner)
      await pianoAndAnOuting(userId)
      const eventDay = new Date()
      eventDay.setUTCHours(0, 0, 0, 0)
      eventDay.setUTCDate(eventDay.getUTCDate() - 2)
      const during = await expense(
        userId,
        'CB Escape Game',
        -60,
        eventDay,
        'leisure.outings'
      )
      const created = await request(ctx.server)
        .post('/tags')
        .set(ctx.auth(owner))
        .send({
          name: 'Week-end',
          isExceptional: true,
          eventStartDate: eventDay.toISOString().slice(0, 10),
          eventEndDate: eventDay.toISOString().slice(0, 10),
        })
      expect(created.status).toBe(201)
      const tagId = (created.body as { id: string }).id
      await prisma.transactionTag.create({
        data: { transactionId: during, tagId },
      })

      async function leisureBaseline(): Promise<number> {
        const response = await request(ctx.server)
          .get(`/tags/${tagId}/analysis`)
          .set(ctx.auth(owner))
        expect(response.status).toBe(200)
        const leisure = (
          response.body as {
            byCategory: Array<{ categoryName: string; baselineAmount?: number }>
          }
        ).byCategory.find(c => c.categoryName === 'Loisirs et culture')
        return leisure?.baselineAmount ?? NaN
      }

      // Dismissed, the subscription is everyday spending like the rest.
      const dismissed = await request(ctx.server)
        .put('/recurrences/decisions')
        .set(ctx.auth(owner))
        .send({
          merchantKey: 'piano simply',
          amountBucket: 18,
          decision: 'DISMISSED',
        })
      const before = await leisureBaseline()
      const [setAside] = (dismissed.body as RecurrenceListDto).dismissed
      await request(ctx.server)
        .delete(`/recurrences/subscriptions/${setAside?.id}`)
        .set(ctx.auth(owner))
      const after = await leisureBaseline()

      // Only the bowling stays in the everyday reference.
      expect(after).toBeGreaterThan(0)
      expect(after).toBeCloseTo((before * 40) / 93.97, 1)
    })
  })
})
