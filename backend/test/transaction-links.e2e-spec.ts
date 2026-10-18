/**
 * The filters a « voir les transactions » link can carry, against the real
 * endpoint and the real SQL.
 *
 * Each one names rows the list's own controls cannot: a person's debts and
 * whether they are still open (read off the payment ledger), the rows a
 * settlement closed, the rows an import or a sync run wrote, an exact list
 * of ids, the rows filed nowhere. The unit specs pin the parsing and the
 * where clause; this is where the ledger arithmetic, the relations and the
 * user scoping are exercised for real.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

describe('GET /transactions link filters (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  let accountId: string

  beforeAll(async () => {
    ctx = await createE2eApp([owner, stranger])
    prisma = ctx.prisma
  })

  afterAll(async () => {
    await ctx.close()
  })

  const http = (): request.Agent => request(ctx.server)

  let sequence = 0
  const nextHash = (): string => `e2e-link-${(sequence += 1)}`

  beforeEach(async () => {
    await prisma.user.deleteMany()
    const me = await http().get('/users/me').set(ctx.auth(owner))
    userId = (me.body as { id: string }).id
    await http().get('/users/me').set(ctx.auth(stranger))
    accountId = (
      await prisma.account.create({ data: { userId, name: 'Courant' } })
    ).id
  })

  async function expense(
    description: string,
    amount: number,
    extra: {
      categoryId?: string | null
      subcategoryId?: string | null
      importHistoryId?: string
      syncRunId?: string
      userId?: string
      accountId?: string
    } = {}
  ): Promise<string> {
    const row = await prisma.transaction.create({
      data: {
        userId: extra.userId ?? userId,
        accountId: extra.accountId ?? accountId,
        hash: nextHash(),
        date: new Date('2026-08-12'),
        description,
        amount: -amount,
        type: 'EXPENSE',
        categoryId: extra.categoryId ?? null,
        subcategoryId: extra.subcategoryId ?? null,
        importHistoryId: extra.importHistoryId ?? null,
        syncRunId: extra.syncRunId ?? null,
      },
    })
    return row.id
  }

  async function income(amount: number): Promise<string> {
    const row = await prisma.transaction.create({
      data: {
        userId,
        accountId,
        hash: nextHash(),
        date: new Date('2026-08-14'),
        description: 'VIR',
        amount,
        type: 'INCOME',
      },
    })
    return row.id
  }

  async function person(name: string): Promise<string> {
    const created = await http()
      .post('/persons')
      .set(ctx.auth(owner))
      .send({ name })
    return (created.body as { id: string }).id
  }

  async function debt(
    transactionId: string,
    personId: string,
    amount: number
  ): Promise<string> {
    const created = await http()
      .post('/reimbursements')
      .set(ctx.auth(owner))
      .send({ transactionId, personId, amount })
    expect(created.status).toBe(201)
    return (created.body as { id: string }).id
  }

  async function listIds(query: Record<string, string>): Promise<string[]> {
    const response = await http()
      .get('/transactions')
      .query(query)
      .set(ctx.auth(owner))
    expect(response.status).toBe(200)
    return (response.body as { data: Array<{ id: string }> }).data
      .map(t => t.id)
      .sort()
  }

  describe('ids', () => {
    it('returns exactly the rows named, and none of a stranger', async () => {
      const mine = await expense('Mine', 10)
      const alsoMine = await expense('Also mine', 20)
      await expense('Not asked', 30)
      const strangerUser = await prisma.user.findFirstOrThrow({
        where: { supabaseId: stranger.supabaseId },
      })
      const strangerAccount = await prisma.account.create({
        data: { userId: strangerUser.id, name: 'Theirs' },
      })
      const theirs = await expense('Theirs', 40, {
        userId: strangerUser.id,
        accountId: strangerAccount.id,
      })

      expect(
        await listIds({ ids: [mine, alsoMine, theirs].join(',') })
      ).toEqual([mine, alsoMine].sort())
    })

    it('matches nothing when nothing named is an id', async () => {
      await expense('Mine', 10)
      expect(await listIds({ ids: 'abc' })).toEqual([])
    })

    it('refuses a list past the cap', async () => {
      const many = Array.from(
        { length: 201 },
        (_, i) => `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`
      )
      const response = await http()
        .get('/transactions')
        .query({ ids: many.join(',') })
        .set(ctx.auth(owner))
      expect(response.status).toBe(400)
    })
  })

  describe('personId and reimbursement', () => {
    it('keeps only the expenses still owed by the person, settled ones with all', async () => {
      const alice = await person('Alice')
      const bob = await person('Bob')
      const openByAlice = await expense('Open by Alice', 30)
      const settledByAlice = await expense('Settled by Alice', 15)
      const openByBob = await expense('Open by Bob', 12)
      await expense('Nobody owes', 50)
      await debt(openByAlice, alice, 30)
      const settledDebt = await debt(settledByAlice, alice, 15)
      await debt(openByBob, bob, 12)
      const receipt = await income(15)
      const settlement = await http()
        .post('/settlements')
        .set(ctx.auth(owner))
        .send({
          personId: alice,
          incomeTransactionId: receipt,
          reimbursements: [{ reimbursementId: settledDebt, amountSettled: 15 }],
        })
      expect(settlement.status).toBe(201)

      expect(await listIds({ personId: alice, reimbursement: 'open' })).toEqual(
        [openByAlice]
      )
      expect(await listIds({ personId: alice, reimbursement: 'all' })).toEqual(
        [openByAlice, settledByAlice].sort()
      )
      expect(await listIds({ personId: alice })).toEqual(
        [openByAlice, settledByAlice].sort()
      )
      expect(await listIds({ reimbursement: 'open' })).toEqual(
        [openByAlice, openByBob].sort()
      )
      expect(await listIds({ reimbursement: 'all' })).toEqual(
        [openByAlice, settledByAlice, openByBob].sort()
      )
    })

    it('reads a partial settlement as still open, a forgiven one as closed', async () => {
      const alice = await person('Alice')
      const partial = await expense('Partial', 30)
      const forgiven = await expense('Forgiven', 30)
      const partialDebt = await debt(partial, alice, 30)
      const forgivenDebt = await debt(forgiven, alice, 30)
      const receipt = await income(36)
      const settlement = await http()
        .post('/settlements')
        .set(ctx.auth(owner))
        .send({
          personId: alice,
          incomeTransactionId: receipt,
          reimbursements: [
            { reimbursementId: partialDebt, amountSettled: 18 },
            {
              reimbursementId: forgivenDebt,
              amountSettled: 18,
              forceComplete: true,
            },
          ],
        })
      expect(settlement.status).toBe(201)

      expect(await listIds({ reimbursement: 'open' })).toEqual([partial])
    })

    it('combines with the classic filters', async () => {
      const alice = await person('Alice')
      const cat = await prisma.category.create({
        data: { userId, name: 'Courses', type: 'EXPENSE' },
      })
      const inCat = await expense('In category', 30, { categoryId: cat.id })
      const outOfCat = await expense('Out of category', 30)
      await debt(inCat, alice, 30)
      await debt(outOfCat, alice, 30)

      expect(
        await listIds({
          personId: alice,
          reimbursement: 'open',
          categoryId: cat.id,
        })
      ).toEqual([inCat])
    })
  })

  describe('settlementId', () => {
    it('returns the expenses the settlement closed and the income that paid them', async () => {
      const alice = await person('Alice')
      const first = await expense('First', 10)
      const second = await expense('Second', 20)
      const other = await expense('Other', 30)
      const firstDebt = await debt(first, alice, 10)
      const secondDebt = await debt(second, alice, 20)
      await debt(other, alice, 30)
      const receipt = await income(30)
      await income(99)
      const created = await http()
        .post('/settlements')
        .set(ctx.auth(owner))
        .send({
          personId: alice,
          incomeTransactionId: receipt,
          reimbursements: [
            { reimbursementId: firstDebt, amountSettled: 10 },
            { reimbursementId: secondDebt, amountSettled: 20 },
          ],
        })
      expect(created.status).toBe(201)
      const settlementId = (created.body as { id: string }).id

      expect(await listIds({ settlementId })).toEqual(
        [first, second, receipt].sort()
      )
      expect(await listIds({ settlementId, type: 'INCOME' })).toEqual([receipt])
    })

    it('answers an empty list for a settlement that is not the user’s', async () => {
      await expense('Mine', 10)
      expect(
        await listIds({ settlementId: '550e8400-e29b-41d4-a716-446655440000' })
      ).toEqual([])
    })
  })

  describe('importId and syncRunId', () => {
    it('returns the rows one import wrote', async () => {
      const history = await prisma.importHistory.create({
        data: { userId, status: 'COMPLETED', totalInFile: 1 },
      })
      const otherHistory = await prisma.importHistory.create({
        data: { userId, status: 'COMPLETED', totalInFile: 1 },
      })
      const imported = await expense('Imported', 10, {
        importHistoryId: history.id,
      })
      await expense('Other import', 10, { importHistoryId: otherHistory.id })
      await expense('By hand', 10)

      expect(await listIds({ importId: history.id })).toEqual([imported])
    })

    it('returns the rows one sync run wrote', async () => {
      const run = await prisma.bankSyncRun.create({
        data: {
          userId,
          aspspName: 'Boursorama Banque',
          fetchedAt: new Date('2026-09-01'),
        },
      })
      const synced = await expense('Synced', 10, { syncRunId: run.id })
      await expense('Not synced', 10)

      expect(await listIds({ syncRunId: run.id })).toEqual([synced])
    })
  })

  describe('categoryId=none and subcategoryId=none', () => {
    it('returns the rows filed nowhere, and the rows of a category without a subcategory', async () => {
      const cat = await prisma.category.create({
        data: { userId, name: 'Courses', type: 'EXPENSE' },
      })
      const sub = await prisma.subcategory.create({
        data: { userId, categoryId: cat.id, name: 'Marché' },
      })
      const unfiled = await expense('Unfiled', 10)
      const filedNoSub = await expense('Filed, no sub', 10, {
        categoryId: cat.id,
      })
      const filedWithSub = await expense('Filed with sub', 10, {
        categoryId: cat.id,
        subcategoryId: sub.id,
      })

      expect(await listIds({ categoryId: 'none' })).toEqual([unfiled])
      expect(
        await listIds({ categoryId: cat.id, subcategoryId: 'none' })
      ).toEqual([filedNoSub])
      expect(
        await listIds({ categoryId: cat.id, subcategoryId: sub.id })
      ).toEqual([filedWithSub])
      expect(await listIds({ categoryId: cat.id })).toEqual(
        [filedNoSub, filedWithSub].sort()
      )
    })
  })

  describe('the reimbursement response', () => {
    it('names the settlements and the incomes that credited a debt', async () => {
      const alice = await person('Alice')
      const first = await expense('First', 10)
      const firstDebt = await debt(first, alice, 10)
      const receipt = await income(10)
      const created = await http()
        .post('/settlements')
        .set(ctx.auth(owner))
        .send({
          personId: alice,
          incomeTransactionId: receipt,
          reimbursements: [{ reimbursementId: firstDebt, amountSettled: 10 }],
        })
      expect(created.status).toBe(201)

      const all = await http().get('/reimbursements').set(ctx.auth(owner))
      const line = (
        all.body as Array<{
          id: string
          settlementIds: string[]
          incomeTransactionIds: string[]
        }>
      ).find(entry => entry.id === firstDebt)
      expect(line).toMatchObject({
        settlementIds: [(created.body as { id: string }).id],
        incomeTransactionIds: [receipt],
      })
    })
  })
})
