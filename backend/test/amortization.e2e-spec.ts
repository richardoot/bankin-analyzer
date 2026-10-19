/**
 * Lot 0 of the smoothed purchases (agent-os/product/amortization-framework.md):
 * a transaction can be smoothed over 2 to 60 months, and is never smoothed and
 * exceptional at once.
 *
 * Nothing reads the column yet, so what is worth proving against real
 * Postgres and the real HTTP stack is:
 *
 *   - the CHECK constraint holds the bounds even past the service,
 *   - PATCH /transactions/:id sets, returns and clears the smoothing,
 *   - the refusal goes both ways, with its explanation, whichever side the
 *     user starts from: smoothing a tagged row, tagging a smoothed row,
 *     turning a tag carrying smoothed rows exceptional.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

describe('Smoothed purchases (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  let accountId: string

  beforeAll(async () => {
    ctx = await createE2eApp([owner])
    prisma = ctx.prisma
  }, 60000)

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await prisma.user.deleteMany()
    const me = await request(ctx.server).get('/users/me').set(ctx.auth(owner))
    userId = (me.body as { id: string }).id
    const account = await prisma.account.create({
      data: { userId, name: 'Compte courant' },
    })
    accountId = account.id
  })

  async function transaction(
    hash: string,
    amount = -1299,
    type: 'EXPENSE' | 'INCOME' = 'EXPENSE'
  ): Promise<string> {
    const created = await prisma.transaction.create({
      data: {
        userId,
        accountId,
        hash,
        date: new Date('2026-06-12'),
        description: hash.toUpperCase(),
        amount,
        type,
      },
      select: { id: true },
    })
    return created.id
  }

  async function tag(name: string, isExceptional: boolean): Promise<string> {
    const created = await prisma.tag.create({
      data: { userId, name, isExceptional },
      select: { id: true },
    })
    return created.id
  }

  function patch(id: string, body: object): request.Test {
    return request(ctx.server)
      .patch(`/transactions/${id}`)
      .set(ctx.auth(owner))
      .send(body)
  }

  it('holds the bounds in the database itself', async () => {
    const id = await transaction('iphone')

    for (const months of [1, 61]) {
      await expect(
        prisma.transaction.update({
          where: { id },
          data: { amortizationMonths: months },
        })
      ).rejects.toThrow()
    }
    await expect(
      prisma.transaction.update({
        where: { id },
        data: { amortizationMonths: 60 },
      })
    ).resolves.toBeDefined()
  })

  it('sets, returns and clears the smoothing', async () => {
    const id = await transaction('iphone')

    const set = await patch(id, { amortizationMonths: 24 }).expect(200)
    expect(
      (set.body as { amortizationMonths: number }).amortizationMonths
    ).toBe(24)

    const read = await request(ctx.server)
      .get(`/transactions/${id}`)
      .set(ctx.auth(owner))
      .expect(200)
    expect(
      (read.body as { amortizationMonths: number | null }).amortizationMonths
    ).toBe(24)

    const cleared = await patch(id, { amortizationMonths: null }).expect(200)
    expect(
      (cleared.body as { amortizationMonths: number | null }).amortizationMonths
    ).toBeNull()
  })

  it('refuses a duration out of bounds, with the bounds', async () => {
    const id = await transaction('iphone')

    const res = await patch(id, { amortizationMonths: 72 }).expect(400)
    expect((res.body as { message: string }).message).toMatch(/de 2 à 60/)
  })

  it('refuses to smooth an income', async () => {
    const id = await transaction('prime', 1500, 'INCOME')

    const res = await patch(id, { amortizationMonths: 12 }).expect(400)
    expect((res.body as { message: string }).message).toMatch(
      /Seule une dépense/
    )
  })

  it('refuses to smooth a row carrying an exceptional tag', async () => {
    const id = await transaction('alliances')
    const wedding = await tag('Mariage', true)
    await prisma.transactionTag.create({
      data: { tagId: wedding, transactionId: id },
    })

    const res = await patch(id, { amortizationMonths: 24 }).expect(400)
    expect((res.body as { message: string }).message).toMatch(/« Mariage »/)
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id } })
    expect(row.amortizationMonths).toBeNull()
  })

  it('smooths a row carrying an ordinary tag', async () => {
    const id = await transaction('iphone')
    const apple = await tag('Apple', false)
    await prisma.transactionTag.create({
      data: { tagId: apple, transactionId: id },
    })

    await patch(id, { amortizationMonths: 24 }).expect(200)
  })

  it('refuses an exceptional tag on a smoothed row, and attaches nothing', async () => {
    const smoothed = await transaction('iphone')
    const plain = await transaction('hotel')
    await patch(smoothed, { amortizationMonths: 24 }).expect(200)
    const trip = await tag('Italie', true)

    const res = await request(ctx.server)
      .post(`/tags/${trip}/transactions`)
      .set(ctx.auth(owner))
      .send({ transactionIds: [smoothed, plain] })
      .expect(400)

    expect((res.body as { message: string }).message).toMatch(/« IPHONE »/)
    expect(await prisma.transactionTag.count({ where: { tagId: trip } })).toBe(
      0
    )
  })

  it('refuses to turn a tag exceptional while it carries a smoothed row', async () => {
    const id = await transaction('iphone')
    await patch(id, { amortizationMonths: 24 }).expect(200)
    const apple = await tag('Apple', false)
    await request(ctx.server)
      .post(`/tags/${apple}/transactions`)
      .set(ctx.auth(owner))
      .send({ transactionIds: [id] })
      .expect(201)

    const res = await request(ctx.server)
      .patch(`/tags/${apple}`)
      .set(ctx.auth(owner))
      .send({ isExceptional: true })
      .expect(400)

    expect((res.body as { message: string }).message).toMatch(/étalée/)
    const row = await prisma.tag.findUniqueOrThrow({ where: { id: apple } })
    expect(row.isExceptional).toBe(false)
  })
})
