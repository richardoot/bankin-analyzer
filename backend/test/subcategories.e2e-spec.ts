import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

/**
 * The one level the user still writes to, over the real API: a subcategory
 * inside a catalogue category, the attributes it takes, and what deleting it
 * does to the transactions filed under it.
 */
describe('Subcategories (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string

  beforeAll(async () => {
    ctx = await createE2eApp([owner, stranger])
    prisma = ctx.prisma
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await prisma.user.deleteMany()
    const me = await request(ctx.server).get('/users/me').set(ctx.auth(owner))
    userId = (me.body as { id: string }).id
  })

  const http = () => request(ctx.server)

  async function catalogCategory(catalogKey: string): Promise<{ id: string }> {
    return prisma.category.findUniqueOrThrow({
      where: { userId_catalogKey: { userId, catalogKey } },
      select: { id: true },
    })
  }

  async function catalogSubcategory(
    catalogKey: string
  ): Promise<{ id: string; name: string }> {
    return prisma.subcategory.findUniqueOrThrow({
      where: { userId_catalogKey: { userId, catalogKey } },
      select: { id: true, name: true },
    })
  }

  interface SubcategoryBody {
    id: string
    categoryId: string
    name: string
    catalogKey: string | null
    isLocked: boolean
    nature: string | null
    rhythm: string | null
  }

  describe('POST /subcategories', () => {
    it("adds one inside an expense category, with the parent's defaults", async () => {
      const leisure = await catalogCategory('leisure')

      const response = await http()
        .post('/subcategories')
        .set(ctx.auth(owner))
        .send({ categoryId: leisure.id, name: 'Escalade' })

      expect(response.status).toBe(201)
      expect(response.body as SubcategoryBody).toMatchObject({
        categoryId: leisure.id,
        name: 'Escalade',
        catalogKey: null,
        isLocked: false,
        nature: 'PLEASURE',
        rhythm: 'VARIABLE',
      })
      expect(response.body).not.toHaveProperty('userId')
    })

    it('takes the attributes asked for', async () => {
      const leisure = await catalogCategory('leisure')

      const response = await http()
        .post('/subcategories')
        .set(ctx.auth(owner))
        .send({
          categoryId: leisure.id,
          name: 'Cotisation club',
          nature: 'ESSENTIAL',
          rhythm: 'COMMITTED',
        })

      expect(response.status).toBe(201)
      expect(response.body as SubcategoryBody).toMatchObject({
        nature: 'ESSENTIAL',
        rhythm: 'COMMITTED',
      })
    })

    it('hands back the existing one instead of duplicating it', async () => {
      const leisure = await catalogCategory('leisure')
      const streaming = await catalogSubcategory('leisure.streaming')

      const response = await http()
        .post('/subcategories')
        .set(ctx.auth(owner))
        .send({ categoryId: leisure.id, name: streaming.name })

      expect(response.status).toBe(201)
      expect((response.body as SubcategoryBody).id).toBe(streaming.id)
      expect((response.body as SubcategoryBody).isLocked).toBe(true)
    })

    it('refuses a nature under an income category', async () => {
      const refunds = await catalogCategory('refunds')

      const response = await http()
        .post('/subcategories')
        .set(ctx.auth(owner))
        .send({ categoryId: refunds.id, name: 'Cagnotte', nature: 'PLEASURE' })

      expect(response.status).toBe(400)
    })

    it('refuses anything under a transfer category', async () => {
      const transfer = await catalogCategory('internal-transfer')

      const response = await http()
        .post('/subcategories')
        .set(ctx.auth(owner))
        .send({ categoryId: transfer.id, name: 'Livret A' })

      expect(response.status).toBe(403)
    })

    it("refuses another user's category", async () => {
      const leisure = await catalogCategory('leisure')

      const response = await http()
        .post('/subcategories')
        .set(ctx.auth(stranger))
        .send({ categoryId: leisure.id, name: 'Escalade' })

      expect(response.status).toBe(404)
    })

    it('rejects an unknown attribute value through the validation pipe', async () => {
      const leisure = await catalogCategory('leisure')

      const response = await http()
        .post('/subcategories')
        .set(ctx.auth(owner))
        .send({ categoryId: leisure.id, name: 'Escalade', rhythm: 'SOMETIMES' })

      expect(response.status).toBe(400)
    })
  })

  describe('DELETE /subcategories/:id', () => {
    async function fileTransaction(
      categoryId: string,
      subcategory: { id: string; name: string }
    ): Promise<string> {
      const account = await prisma.account.upsert({
        where: { userId_name: { userId, name: 'Compte courant' } },
        create: { userId, name: 'Compte courant' },
        update: {},
      })
      const transaction = await prisma.transaction.create({
        data: {
          userId,
          accountId: account.id,
          categoryId,
          subcategoryId: subcategory.id,
          subcategory: subcategory.name,
          hash: `${userId}-${subcategory.id}-${Date.now()}`,
          date: new Date('2026-03-04'),
          description: 'Salle escalade',
          amount: -18,
          type: 'EXPENSE',
        },
      })
      return transaction.id
    }

    it('re-files the transactions to the category\'s "Autre"', async () => {
      const leisure = await catalogCategory('leisure')
      const created = await http()
        .post('/subcategories')
        .set(ctx.auth(owner))
        .send({ categoryId: leisure.id, name: 'Escalade' })
      const escalade = created.body as SubcategoryBody
      const transactionId = await fileTransaction(leisure.id, escalade)
      const other = await catalogSubcategory('leisure.other')

      const response = await http()
        .delete(`/subcategories/${escalade.id}`)
        .set(ctx.auth(owner))

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        refiledTransactions: 1,
        fallbackSubcategoryId: other.id,
        fallbackSubcategoryName: 'Autre',
      })
      const transaction = await prisma.transaction.findUniqueOrThrow({
        where: { id: transactionId },
      })
      expect(transaction).toMatchObject({
        categoryId: leisure.id,
        subcategoryId: other.id,
        subcategory: 'Autre',
      })
      expect(
        await prisma.subcategory.findUnique({ where: { id: escalade.id } })
      ).toBeNull()
    })

    it('falls back to the category alone under a legacy category', async () => {
      const legacy = await prisma.category.create({
        data: { userId, name: 'Loisirs & Sorties', type: 'EXPENSE' },
      })
      const sub = await prisma.subcategory.create({
        data: { userId, categoryId: legacy.id, name: 'Escalade' },
      })
      const transactionId = await fileTransaction(legacy.id, sub)

      const response = await http()
        .delete(`/subcategories/${sub.id}`)
        .set(ctx.auth(owner))

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        refiledTransactions: 1,
        fallbackSubcategoryId: null,
        fallbackSubcategoryName: null,
      })
      expect(
        await prisma.transaction.findUniqueOrThrow({
          where: { id: transactionId },
        })
      ).toMatchObject({
        categoryId: legacy.id,
        subcategoryId: null,
        subcategory: null,
      })
    })

    it('refuses to delete a catalogue subcategory', async () => {
      const streaming = await catalogSubcategory('leisure.streaming')

      const response = await http()
        .delete(`/subcategories/${streaming.id}`)
        .set(ctx.auth(owner))

      expect(response.status).toBe(403)
      expect(
        await prisma.subcategory.findUnique({ where: { id: streaming.id } })
      ).not.toBeNull()
    })

    it("refuses another user's subcategory as not found", async () => {
      const leisure = await catalogCategory('leisure')
      const created = await http()
        .post('/subcategories')
        .set(ctx.auth(owner))
        .send({ categoryId: leisure.id, name: 'Escalade' })

      const response = await http()
        .delete(`/subcategories/${(created.body as SubcategoryBody).id}`)
        .set(ctx.auth(stranger))

      expect(response.status).toBe(404)
    })
  })
})
