import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

describe('Categories (e2e)', () => {
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
    // The database starts empty and is dropped with the file; one deleteMany
    // between tests is enough, and it cascades to every fixture below.
    await prisma.user.deleteMany()
    // Provisions the owner row through the real guard.
    const me = await request(ctx.server).get('/users/me').set(ctx.auth(owner))
    userId = (me.body as { id: string }).id
  })

  const http = () => request(ctx.server)

  async function createCategory(
    name: string,
    type: 'EXPENSE' | 'INCOME' = 'EXPENSE'
  ): Promise<{ id: string; name: string }> {
    const response = await http()
      .post('/categories')
      .set(ctx.auth(owner))
      .send({ name, type })

    expect(response.status).toBe(201)
    return response.body as { id: string; name: string }
  }

  /**
   * A category with one of everything hanging off it. This is the shape that
   * broke: a transaction pointing at a subcategory of the doomed category.
   */
  async function attachEverything(categoryId: string): Promise<{
    incomeCategoryId: string
    transactionId: string
    planId: string
  }> {
    const account = await prisma.account.create({
      data: { userId, name: 'Compte courant' },
    })
    const subcategory = await prisma.subcategory.create({
      data: { userId, categoryId, name: 'Courses' },
    })
    await prisma.subcategory.create({
      data: { userId, categoryId, name: 'Restaurant' },
    })
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId,
        subcategoryId: subcategory.id,
        subcategory: 'Courses',
        hash: `${userId}-tx-1`,
        date: new Date('2024-03-04'),
        description: 'Monoprix',
        amount: -42.5,
        type: 'EXPENSE',
      },
    })
    const person = await prisma.person.create({
      data: { userId, name: 'Alice' },
    })
    // Attached through the expense, the only category a debt has since phase
    // 6 — and the transaction above already carries the one being deleted.
    await prisma.reimbursementRequest.create({
      data: {
        userId,
        transactionId: transaction.id,
        personId: person.id,
        amount: 20,
      },
    })
    const income = await prisma.category.create({
      data: { userId, name: 'Remboursement courses', type: 'INCOME' },
    })
    const plan = await prisma.budgetPlan.create({
      data: {
        userId,
        name: 'Budget 2024',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      },
    })
    await prisma.budgetPlanEntry.create({
      data: { budgetPlanId: plan.id, categoryId, amount: 450 },
    })
    await prisma.filterPreferences.create({
      data: { userId, globalHiddenExpenseCategoryIds: [categoryId] },
    })

    return {
      incomeCategoryId: income.id,
      transactionId: transaction.id,
      planId: plan.id,
    }
  }

  describe('authentication', () => {
    it('should reject an unauthenticated listing', async () => {
      const response = await http().get('/categories')

      expect(response.status).toBe(401)
    })
  })

  describe('POST /categories', () => {
    it('should create a category', async () => {
      const created = await createCategory('Alimentation')

      expect(created.name).toBe('Alimentation')
      expect(
        await prisma.category.findUnique({ where: { id: created.id } })
      ).not.toBeNull()
    })

    it('should reject an invalid payload through the validation pipe', async () => {
      const response = await http()
        .post('/categories')
        .set(ctx.auth(owner))
        .send({ name: '', type: 'NOT_A_TYPE' })

      expect(response.status).toBe(400)
    })

    it('should reject unknown properties', async () => {
      const response = await http()
        .post('/categories')
        .set(ctx.auth(owner))
        .send({ name: 'Alimentation', type: 'EXPENSE', isAdmin: true })

      expect(response.status).toBe(400)
    })

    it('should return the existing category instead of duplicating it', async () => {
      const first = await createCategory('Alimentation')
      const second = await createCategory('Alimentation')

      expect(second.id).toBe(first.id)
    })
  })

  describe('PATCH /categories/:id', () => {
    it('should rename a category', async () => {
      const category = await createCategory('Alimentation')

      const response = await http()
        .patch(`/categories/${category.id}`)
        .set(ctx.auth(owner))
        .send({ name: 'Courses' })

      expect(response.status).toBe(200)
      expect(response.body.name).toBe('Courses')
    })

    it('should reject a name already taken for that type', async () => {
      await createCategory('Alimentation')
      const other = await createCategory('Transport')

      const response = await http()
        .patch(`/categories/${other.id}`)
        .set(ctx.auth(owner))
        .send({ name: 'Alimentation' })

      expect(response.status).toBe(409)
    })

    it('should allow the same name across the two types', async () => {
      await createCategory('Remboursements', 'EXPENSE')
      const income = await createCategory('Autre', 'INCOME')

      const response = await http()
        .patch(`/categories/${income.id}`)
        .set(ctx.auth(owner))
        .send({ name: 'Remboursements' })

      expect(response.status).toBe(200)
    })
  })

  describe('GET /categories/:id/deletion-summary', () => {
    it('should report nothing attached for a fresh category', async () => {
      const category = await createCategory('Alimentation')

      const response = await http()
        .get(`/categories/${category.id}/deletion-summary`)
        .set(ctx.auth(owner))

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        transactionCount: 0,
        subcategoryNames: [],
        budgetPlanEntries: [],
        reimbursementCount: 0,
        isGloballyHidden: false,
      })
    })

    it('should describe every attached entity', async () => {
      const category = await createCategory('Alimentation')
      await attachEverything(category.id)

      const response = await http()
        .get(`/categories/${category.id}/deletion-summary`)
        .set(ctx.auth(owner))

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        transactionCount: 1,
        labelledTransactionCount: 1,
        subcategoryNames: ['Courses', 'Restaurant'],
        reimbursementCount: 1,
        isGloballyHidden: true,
      })
      expect(response.body.budgetPlanEntries).toEqual([
        expect.objectContaining({ planName: 'Budget 2024', amount: 450 }),
      ])
    })

    it("should 404 on another user's category", async () => {
      const category = await createCategory('Alimentation')

      const response = await http()
        .get(`/categories/${category.id}/deletion-summary`)
        .set(ctx.auth(stranger))

      expect(response.status).toBe(404)
    })
  })

  describe('DELETE /categories/:id', () => {
    it('should delete a category carrying a subcategorized transaction', async () => {
      // The regression this suite exists for: leaving subcategory_id to the
      // cascade, after having updated the same rows in the transaction, trips
      // transactions_subcategory_id_fkey and the delete fails outright.
      const category = await createCategory('Alimentation')
      await attachEverything(category.id)

      const response = await http()
        .delete(`/categories/${category.id}`)
        .set(ctx.auth(owner))

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        uncategorizedTransactions: 1,
        deletedSubcategories: 2,
        deletedBudgetPlanEntries: 1,
      })
    })

    it('should leave nothing pointing at the deleted category', async () => {
      const category = await createCategory('Alimentation')
      const { incomeCategoryId, transactionId, planId } =
        await attachEverything(category.id)

      await http()
        .delete(`/categories/${category.id}`)
        .set(ctx.auth(owner))
        .expect(200)

      const categoryId = category.id
      const [transaction, preferences, entries, counts] = await Promise.all([
        prisma.transaction.findUnique({ where: { id: transactionId } }),
        prisma.filterPreferences.findUnique({ where: { userId } }),
        prisma.budgetPlanEntry.findMany({ where: { budgetPlanId: planId } }),
        Promise.all([
          prisma.category.count({ where: { id: categoryId } }),
          prisma.transaction.count({ where: { categoryId } }),
          prisma.subcategory.count({ where: { categoryId } }),
          prisma.reimbursementRequest.count({
            where: { transaction: { categoryId } },
          }),
          prisma.budgetPlanEntry.count({ where: { categoryId } }),
        ]),
      ])

      // Nothing references the dead id anywhere.
      expect(counts).toEqual([0, 0, 0, 0, 0])

      // The transaction survives, detached, with no orphan subcategory label.
      expect(transaction).not.toBeNull()
      expect(transaction?.categoryId).toBeNull()
      expect(transaction?.subcategoryId).toBeNull()
      expect(transaction?.subcategory).toBeNull()

      // The paired income category and the plan itself are untouched.
      expect(
        await prisma.category.findUnique({ where: { id: incomeCategoryId } })
      ).not.toBeNull()
      expect(
        await prisma.budgetPlan.findUnique({ where: { id: planId } })
      ).not.toBeNull()
      expect(entries).toHaveLength(0)

      // And the id left the hidden list, which carries no FK to prune it.
      expect(preferences?.globalHiddenExpenseCategoryIds).toEqual([])
    })

    it('should keep the reimbursement request, detached', async () => {
      const category = await createCategory('Alimentation')
      await attachEverything(category.id)

      await http()
        .delete(`/categories/${category.id}`)
        .set(ctx.auth(owner))
        .expect(200)

      const reimbursements = await prisma.reimbursementRequest.findMany({
        where: { userId },
        include: { transaction: { select: { categoryId: true } } },
      })
      expect(reimbursements).toHaveLength(1)
      // Detached through the expense it hangs off, which is where a debt reads
      // its category from since phase 6. The debt itself is untouched — losing
      // the filing must not lose the money owed.
      expect(reimbursements[0]?.transaction.categoryId).toBeNull()
      expect(reimbursements[0]?.amount.toNumber()).toBe(20)
    })

    it("should 404 on another user's category and delete nothing", async () => {
      const category = await createCategory('Alimentation')

      const response = await http()
        .delete(`/categories/${category.id}`)
        .set(ctx.auth(stranger))

      expect(response.status).toBe(404)
      expect(
        await prisma.category.findUnique({ where: { id: category.id } })
      ).not.toBeNull()
    })
  })
})
