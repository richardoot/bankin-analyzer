import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { MerchantMemoryService } from '../src/ai-suggestions/merchant-memory.service'
import { proposeFromMerchantMemory } from '../src/ai-suggestions/merchant-memory'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const alice = e2eIdentity('alice')
const bob = e2eIdentity('bob')

/**
 * The aggregate behind the shared merchant memory, on real rows: what two
 * users filed under a catalogue key is remembered, what one user filed
 * under a heading of their own is not, and nothing but a label, a key and
 * two counts ever comes out.
 */
describe('Merchant memory (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let memoryService: MerchantMemoryService

  beforeAll(async () => {
    ctx = await createE2eApp([alice, bob])
    prisma = ctx.prisma
    memoryService = ctx.app.get(MerchantMemoryService)
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await prisma.user.deleteMany()
    memoryService.forget()
  })

  async function userOf(identity: typeof alice): Promise<string> {
    const me = await request(ctx.server)
      .get('/users/me')
      .set(ctx.auth(identity))
    expect(me.status).toBe(200)
    return (me.body as { id: string }).id
  }

  let counter = 0
  async function file(
    userId: string,
    description: string,
    filing: { categoryKey: string; subcategoryKey: string | null },
    count: number
  ): Promise<void> {
    const account = await prisma.account.findFirst({ where: { userId } })
    const accountId =
      account?.id ??
      (await prisma.account.create({ data: { userId, name: 'Compte' } })).id
    const category = await prisma.category.findUniqueOrThrow({
      where: { userId_catalogKey: { userId, catalogKey: filing.categoryKey } },
    })
    const subcategory = filing.subcategoryKey
      ? await prisma.subcategory.findUniqueOrThrow({
          where: {
            userId_catalogKey: { userId, catalogKey: filing.subcategoryKey },
          },
        })
      : null
    for (let i = 0; i < count; i++) {
      counter++
      await prisma.transaction.create({
        data: {
          userId,
          accountId,
          categoryId: category.id,
          subcategoryId: subcategory?.id ?? null,
          subcategory: subcategory?.name ?? null,
          hash: `${userId}-${counter}`,
          date: new Date('2026-09-01'),
          description,
          amount: -20,
          type: 'EXPENSE',
        },
      })
    }
  }

  it('remembers a merchant two users filed the same way, by catalogue key', async () => {
    const a = await userOf(alice)
    const b = await userOf(bob)
    await file(
      a,
      'CARTE 01/09/26 CARREFOUR MARKET CB*1111',
      { categoryKey: 'food', subcategoryKey: 'food.supermarket' },
      4
    )
    await file(
      b,
      'CB Carrefour Market',
      { categoryKey: 'food', subcategoryKey: 'food.supermarket' },
      3
    )

    const memory = await memoryService.load()

    expect(
      proposeFromMerchantMemory('Carrefour Market Bordeaux', 'EXPENSE', memory)
    ).toMatchObject({
      categoryKey: 'food',
      subcategoryKey: 'food.supermarket',
      confidence: 1,
      count: 7,
      users: 2,
    })
  })

  it("does not turn one user's habit into everyone's rule", async () => {
    const a = await userOf(alice)
    await file(
      a,
      'CB Fitness Park',
      { categoryKey: 'leisure', subcategoryKey: 'leisure.gym' },
      10
    )

    const memory = await memoryService.load()

    expect(
      proposeFromMerchantMemory('CB Fitness Park', 'EXPENSE', memory)
    ).toBeNull()
  })

  it('carries nothing but labels, keys, counts and opaque user ids', async () => {
    const a = await userOf(alice)
    await file(
      a,
      'Prlv Sepa Free Mobile',
      { categoryKey: 'telecom', subcategoryKey: 'telecom.phone' },
      2
    )

    const memory = await memoryService.load()

    for (const [entryKey, filings] of memory) {
      expect(entryKey).toMatch(/^(EXPENSE|INCOME)\|/)
      for (const filing of filings) {
        expect(Object.keys(filing).sort()).toEqual([
          'categoryKey',
          'count',
          'subcategoryKey',
          'userIds',
        ])
      }
    }
  })
})
