/**
 * Pairing an expense category with the income category its refunds land on.
 *
 * The foreign keys accept any existing category id, so the checks that keep one
 * user's categories out of another's associations live in the service — which
 * makes them exactly the kind of rule a mocked-Prisma unit test cannot prove.
 * These specs go through the real guard, the real validation pipe and real SQL.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

describe('Category associations (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let ownerId: string
  let strangerId: string

  beforeAll(async () => {
    ctx = await createE2eApp([owner, stranger])
    prisma = ctx.prisma
  }, 60000)

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await prisma.user.deleteMany()
    ownerId = await provision(owner)
    strangerId = await provision(stranger)
  })

  const http = (): request.Agent => request(ctx.server)

  async function provision(identity: typeof owner): Promise<string> {
    const response = await http().get('/users/me').set(ctx.auth(identity))
    return (response.body as { id: string }).id
  }

  async function category(
    userId: string,
    name: string,
    type: 'EXPENSE' | 'INCOME'
  ): Promise<string> {
    const row = await prisma.category.create({ data: { userId, name, type } })
    return row.id
  }

  it('pairs an expense category with an income one', async () => {
    const expenseId = await category(ownerId, 'Sante', 'EXPENSE')
    const incomeId = await category(ownerId, 'Remboursement sante', 'INCOME')

    const response = await http()
      .post('/category-associations')
      .set(ctx.auth(owner))
      .send({ expenseCategoryId: expenseId, incomeCategoryId: incomeId })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      expenseCategoryId: expenseId,
      expenseCategoryName: 'Sante',
      incomeCategoryId: incomeId,
      incomeCategoryName: 'Remboursement sante',
    })
  })

  it('refuses a category belonging to someone else', async () => {
    const mine = await category(ownerId, 'Sante', 'EXPENSE')
    const theirs = await category(strangerId, 'Leur remboursement', 'INCOME')

    const response = await http()
      .post('/category-associations')
      .set(ctx.auth(owner))
      .send({ expenseCategoryId: mine, incomeCategoryId: theirs })

    expect(response.status).toBe(404)
    // The point of the check: the stranger's category name must not come back
    // in the error either.
    expect(JSON.stringify(response.body)).not.toContain('Leur remboursement')
    await expect(prisma.categoryAssociation.count()).resolves.toBe(0)
  })

  it('refuses to put an expense category on the income side', async () => {
    const expenseId = await category(ownerId, 'Sante', 'EXPENSE')
    const alsoExpense = await category(ownerId, 'Courses', 'EXPENSE')

    const response = await http()
      .post('/category-associations')
      .set(ctx.auth(owner))
      .send({ expenseCategoryId: expenseId, incomeCategoryId: alsoExpense })

    expect(response.status).toBe(400)
    await expect(prisma.categoryAssociation.count()).resolves.toBe(0)
  })

  it('refuses to put an income category on the expense side', async () => {
    const incomeId = await category(ownerId, 'Salaire', 'INCOME')
    const otherIncome = await category(ownerId, 'Remboursement', 'INCOME')

    const response = await http()
      .post('/category-associations')
      .set(ctx.auth(owner))
      .send({ expenseCategoryId: incomeId, incomeCategoryId: otherIncome })

    expect(response.status).toBe(400)
    await expect(prisma.categoryAssociation.count()).resolves.toBe(0)
  })

  it('refuses a category that does not exist', async () => {
    const expenseId = await category(ownerId, 'Sante', 'EXPENSE')

    const response = await http()
      .post('/category-associations')
      .set(ctx.auth(owner))
      .send({
        expenseCategoryId: expenseId,
        incomeCategoryId: '00000000-0000-4000-8000-000000000000',
      })

    expect(response.status).toBe(404)
  })

  it('lets one income category feed several expense categories', async () => {
    const sante = await category(ownerId, 'Sante', 'EXPENSE')
    const pharmacie = await category(ownerId, 'Pharmacie', 'EXPENSE')
    const incomeId = await category(ownerId, 'Remboursement sante', 'INCOME')

    const first = await http()
      .post('/category-associations')
      .set(ctx.auth(owner))
      .send({ expenseCategoryId: sante, incomeCategoryId: incomeId })
    const second = await http()
      .post('/category-associations')
      .set(ctx.auth(owner))
      .send({ expenseCategoryId: pharmacie, incomeCategoryId: incomeId })

    // The bijection forced a dummy income category per expense category.
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    await expect(prisma.categoryAssociation.count()).resolves.toBe(2)
  })

  it('lets one expense category be repaid from several sources', async () => {
    const sante = await category(ownerId, 'Sante', 'EXPENSE')
    const secu = await category(ownerId, 'Remboursement Secu', 'INCOME')
    const mutuelle = await category(ownerId, 'Remboursement mutuelle', 'INCOME')

    await http()
      .post('/category-associations')
      .set(ctx.auth(owner))
      .send({ expenseCategoryId: sante, incomeCategoryId: secu })
    const second = await http()
      .post('/category-associations')
      .set(ctx.auth(owner))
      .send({ expenseCategoryId: sante, incomeCategoryId: mutuelle })

    expect(second.status).toBe(201)
    await expect(prisma.categoryAssociation.count()).resolves.toBe(2)
  })

  it('still refuses the very same pairing twice', async () => {
    const expenseId = await category(ownerId, 'Sante', 'EXPENSE')
    const incomeId = await category(ownerId, 'Remboursement sante', 'INCOME')
    const payload = {
      expenseCategoryId: expenseId,
      incomeCategoryId: incomeId,
    }

    await http()
      .post('/category-associations')
      .set(ctx.auth(owner))
      .send(payload)
    const duplicate = await http()
      .post('/category-associations')
      .set(ctx.auth(owner))
      .send(payload)

    // Recording it twice says nothing new and would show the hint twice.
    expect(duplicate.status).toBe(409)
    await expect(prisma.categoryAssociation.count()).resolves.toBe(1)
  })

  it('never lists another user associations', async () => {
    const theirExpense = await category(strangerId, 'Leur sante', 'EXPENSE')
    const theirIncome = await category(strangerId, 'Leur remb', 'INCOME')
    await prisma.categoryAssociation.create({
      data: {
        userId: strangerId,
        expenseCategoryId: theirExpense,
        incomeCategoryId: theirIncome,
      },
    })

    const response = await http()
      .get('/category-associations')
      .set(ctx.auth(owner))

    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })
})
