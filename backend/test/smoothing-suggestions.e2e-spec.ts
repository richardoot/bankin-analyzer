/**
 * Lot 3 of the smoothed purchases (agent-os/product/amortization-framework.md):
 * the suggestion « Épisode ou achat à lisser ? », read against real Postgres.
 *
 * The decision itself is unit-tested (smoothing-suggestions.spec.ts); what is
 * worth proving here is the query: the budget's scope, the net of the
 * requests and of a joint account's divisor, the exceptional tag and the
 * smoothing read as « already answered », the catalogue key that picks the
 * duration.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { SmoothingSuggestionsService } from '../src/transactions/smoothing-suggestions.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const now = new Date('2026-07-01T12:00:00Z')

describe('Smoothing suggestions (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let service: SmoothingSuggestionsService
  let userId: string
  let accountId: string
  let techId: { categoryId: string; subcategoryId: string }

  beforeAll(async () => {
    ctx = await createE2eApp([owner])
    prisma = ctx.prisma
    service = ctx.app.get(SmoothingSuggestionsService)
  }, 60000)

  afterAll(async () => {
    await ctx.close()
  })

  /** The user's catalogue subcategory, provisioned at sign-up or made here. */
  async function catalogSub(
    categoryKey: string,
    subcategoryKey: string
  ): Promise<{ categoryId: string; subcategoryId: string }> {
    const existing = await prisma.subcategory.findFirst({
      where: { userId, catalogKey: subcategoryKey },
      select: { id: true, categoryId: true },
    })
    if (existing) {
      return { categoryId: existing.categoryId, subcategoryId: existing.id }
    }
    const category =
      (await prisma.category.findFirst({
        where: { userId, catalogKey: categoryKey },
        select: { id: true },
      })) ??
      (await prisma.category.create({
        data: {
          userId,
          name: categoryKey,
          type: 'EXPENSE',
          catalogKey: categoryKey,
        },
        select: { id: true },
      }))
    const sub = await prisma.subcategory.create({
      data: {
        userId,
        categoryId: category.id,
        name: subcategoryKey,
        catalogKey: subcategoryKey,
        nature: 'PLEASURE',
        rhythm: 'VARIABLE',
      },
      select: { id: true },
    })
    return { categoryId: category.id, subcategoryId: sub.id }
  }

  beforeEach(async () => {
    await prisma.user.deleteMany()
    const me = await request(ctx.server).get('/users/me').set(ctx.auth(owner))
    userId = (me.body as { id: string }).id
    accountId = (
      await prisma.account.create({ data: { userId, name: 'Compte courant' } })
    ).id
    techId = await catalogSub('shopping', 'shopping.tech')
  })

  let seq = 0
  async function expense(data: {
    amount: number
    date?: string
    filing?: { categoryId: string; subcategoryId: string }
    account?: string
    amortizationMonths?: number
  }): Promise<string> {
    seq += 1
    const created = await prisma.transaction.create({
      data: {
        userId,
        accountId: data.account ?? accountId,
        hash: `smoothing-suggestion-${seq}`,
        date: new Date(data.date ?? '2026-06-12'),
        description: `ACHAT ${seq}`,
        amount: data.amount,
        type: 'EXPENSE',
        categoryId: (data.filing ?? techId).categoryId,
        subcategoryId: (data.filing ?? techId).subcategoryId,
        amortizationMonths: data.amortizationMonths ?? null,
      },
      select: { id: true },
    })
    return created.id
  }

  it('asks to smoothe a phone over 24 months, on its net', async () => {
    const phone = await expense({ amount: -1300 })
    await expense({ amount: -30, date: '2026-02-03' })
    const person = await prisma.person.create({
      data: { userId, name: 'Chloé' },
    })
    await prisma.reimbursementRequest.create({
      data: { userId, transactionId: phone, personId: person.id, amount: 100 },
    })

    const suggestions = await service.list(userId, { now })

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      transactionId: phone,
      amount: 1200,
      subcategoryKey: 'shopping.tech',
      kind: 'DURABLE',
      habitMonthly: 2.5,
    })
    expect(suggestions[0]?.answers[0]).toMatchObject({
      answer: 'SMOOTH',
      months: 24,
      monthly: 50,
    })
  })

  it('leaves out what is already answered or outside the budget', async () => {
    await expense({ amount: -1300, amortizationMonths: 24 })
    const tagged = await expense({ amount: -900 })
    const trip = await prisma.tag.create({
      data: { userId, name: 'Japon', isExceptional: true },
    })
    await prisma.transactionTag.create({
      data: { transactionId: tagged, tagId: trip.id },
    })
    const excluded = await prisma.account.create({
      data: { userId, name: 'Pro', isExcludedFromBudget: true },
    })
    await expense({ amount: -2000, account: excluded.id })
    await expense({ amount: -1500, date: '2025-11-02' })

    expect(await service.list(userId, { now })).toEqual([])
    expect(await service.list(userId, { now, months: 12 })).toHaveLength(1)
  })

  it("spreads a joint account's share only", async () => {
    const joint = await prisma.account.create({
      data: { userId, name: 'Joint', divisor: 2 },
    })
    await expense({ amount: -1000, account: joint.id })

    const [suggestion] = await service.list(userId, { now })

    expect(suggestion?.amount).toBe(500)
  })
})
