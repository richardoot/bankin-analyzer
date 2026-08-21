/**
 * Phase 3: the ledger becomes the source of truth for writes.
 *
 * Settling a debt now records one row per movement — cash drawn, remainder
 * forgiven — and `amountReceived` / `status` are rewritten as the sum and the
 * reading of those rows in the same transaction. Deleting a settlement removes
 * its payments and re-totals whatever remains, instead of subtracting a stored
 * figure that mixed the two.
 *
 * The case that motivates all of it is the last spec here: a debt paid in part,
 * then force-completed, then un-settled. The previous code gave back the whole
 * debt and silently wiped the earlier payment — the bug
 * `scripts/audit-forced-settlements.ts` was written to hunt down. It cannot be
 * expressed in the new model, and this proves it against real SQL.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

interface Fixture {
  personId: string
  expenseTransactionId: string
  incomeTransactionId: string
}

describe('Settlement ledger (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string

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
  })

  const http = (): request.Agent => request(ctx.server)

  /** An expense of 800, an income of 800, and a person owing something. */
  async function fixture(): Promise<Fixture> {
    const account = await prisma.account.create({
      data: { userId, name: 'Compte courant' },
    })
    const expenseCategory = await prisma.category.create({
      data: { userId, name: 'Sante', type: 'EXPENSE' },
    })
    const incomeCategory = await prisma.category.create({
      data: { userId, name: 'Remboursement sante', type: 'INCOME' },
    })
    const expense = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: expenseCategory.id,
        hash: `${userId}-expense`,
        date: new Date('2026-01-12'),
        description: 'Cabinet dentaire',
        amount: -800,
        type: 'EXPENSE',
      },
    })
    const income = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: incomeCategory.id,
        hash: `${userId}-income`,
        date: new Date('2026-02-15'),
        description: 'VIR ALICE MARTIN',
        amount: 800,
        type: 'INCOME',
      },
    })
    const person = await prisma.person.create({
      data: { userId, name: 'Alice Martin' },
    })

    return {
      personId: person.id,
      expenseTransactionId: expense.id,
      incomeTransactionId: income.id,
    }
  }

  async function createReimbursement(
    f: Fixture,
    amount: number
  ): Promise<string> {
    const response = await http()
      .post('/reimbursements')
      .set(ctx.auth(owner))
      .send({
        transactionId: f.expenseTransactionId,
        personId: f.personId,
        amount,
      })

    expect(response.status).toBe(201)
    return (response.body as { id: string }).id
  }

  async function settle(
    f: Fixture,
    lines: Array<{
      reimbursementId: string
      amountSettled: number
      forceComplete?: boolean
    }>
  ): Promise<string> {
    const response = await http()
      .post('/settlements')
      .set(ctx.auth(owner))
      .send({
        personId: f.personId,
        incomeTransactionId: f.incomeTransactionId,
        reimbursements: lines,
      })

    expect(response.status).toBe(201)
    return (response.body as { id: string }).id
  }

  async function stateOf(
    reimbursementId: string
  ): Promise<{ amountReceived: number; status: string }> {
    const row = await prisma.reimbursementRequest.findFirstOrThrow({
      where: { id: reimbursementId },
    })
    return {
      amountReceived: Number(row.amountReceived),
      status: row.status,
    }
  }

  async function ledgerOf(
    reimbursementId: string
  ): Promise<Array<{ amount: number; kind: string; hasIncome: boolean }>> {
    const rows = await prisma.reimbursementPayment.findMany({
      where: { reimbursementId },
      orderBy: [{ kind: 'asc' }, { amount: 'desc' }],
    })
    return rows.map(row => ({
      amount: Number(row.amount),
      kind: row.kind,
      hasIncome: row.incomeTransactionId !== null,
    }))
  }

  describe('recording a settlement', () => {
    it('writes one CASH payment and derives the column from it', async () => {
      const f = await fixture()
      const debt = await createReimbursement(f, 600)

      await settle(f, [{ reimbursementId: debt, amountSettled: 600 }])

      expect(await ledgerOf(debt)).toEqual([
        { amount: 600, kind: 'CASH', hasIncome: true },
      ])
      expect(await stateOf(debt)).toEqual({
        amountReceived: 600,
        status: 'COMPLETED',
      })
    })

    it('leaves a partial payment partial', async () => {
      const f = await fixture()
      const debt = await createReimbursement(f, 600)

      await settle(f, [{ reimbursementId: debt, amountSettled: 200 }])

      expect(await stateOf(debt)).toEqual({
        amountReceived: 200,
        status: 'PARTIAL',
      })
    })

    it('splits a force-completed line into cash and a write-off', async () => {
      const f = await fixture()
      const debt = await createReimbursement(f, 600)

      await settle(f, [
        { reimbursementId: debt, amountSettled: 5, forceComplete: true },
      ])

      expect(await ledgerOf(debt)).toEqual([
        { amount: 5, kind: 'CASH', hasIncome: true },
        // Forgiveness is backed by no money, so it names no transaction.
        { amount: 595, kind: 'WRITE_OFF', hasIncome: false },
      ])
      expect(await stateOf(debt)).toEqual({
        amountReceived: 600,
        status: 'COMPLETED',
      })
    })

    it('gives each line of a multi-line settlement its own payment', async () => {
      const f = await fixture()
      const first = await createReimbursement(f, 600)
      const second = await createReimbursement(f, 100)

      await settle(f, [
        { reimbursementId: first, amountSettled: 560 },
        { reimbursementId: second, amountSettled: 40 },
      ])

      expect(await ledgerOf(first)).toEqual([
        { amount: 560, kind: 'CASH', hasIncome: true },
      ])
      expect(await ledgerOf(second)).toEqual([
        { amount: 40, kind: 'CASH', hasIncome: true },
      ])
    })

    it('refuses to credit a debt beyond what it was for', async () => {
      const f = await fixture()
      const debt = await createReimbursement(f, 600)
      await settle(f, [{ reimbursementId: debt, amountSettled: 500 }])

      const response = await http()
        .post('/settlements')
        .set(ctx.auth(owner))
        .send({
          personId: f.personId,
          incomeTransactionId: f.incomeTransactionId,
          reimbursements: [{ reimbursementId: debt, amountSettled: 200 }],
        })

      expect(response.status).toBe(400)
      // Nothing partially applied: the whole settlement is one transaction.
      expect(await stateOf(debt)).toEqual({
        amountReceived: 500,
        status: 'PARTIAL',
      })
    })
  })

  describe('deleting a settlement', () => {
    it('takes back exactly what it credited', async () => {
      const f = await fixture()
      const debt = await createReimbursement(f, 600)
      const settlementId = await settle(f, [
        { reimbursementId: debt, amountSettled: 600 },
      ])

      const response = await http()
        .delete(`/settlements/${settlementId}`)
        .set(ctx.auth(owner))
      expect([200, 204]).toContain(response.status)

      expect(await ledgerOf(debt)).toEqual([])
      expect(await stateOf(debt)).toEqual({
        amountReceived: 0,
        status: 'PENDING',
      })
    })

    it('frees the cash back on the income transaction', async () => {
      const f = await fixture()
      const debt = await createReimbursement(f, 600)
      const settlementId = await settle(f, [
        { reimbursementId: debt, amountSettled: 600 },
      ])

      await http().delete(`/settlements/${settlementId}`).set(ctx.auth(owner))

      const available = await http()
        .get(
          `/settlements/transaction/${f.incomeTransactionId}/available-amount`
        )
        .set(ctx.auth(owner))

      expect(available.status).toBe(200)
      expect(
        (available.body as { availableAmount: number }).availableAmount
      ).toBeCloseTo(800, 2)
    })

    it('keeps an earlier payment when a force-completed settlement is undone', async () => {
      const f = await fixture()
      const debt = await createReimbursement(f, 600)

      // 30 collected first…
      await settle(f, [{ reimbursementId: debt, amountSettled: 30 }])
      // …then the rest written off in a second settlement.
      const forced = await settle(f, [
        { reimbursementId: debt, amountSettled: 20, forceComplete: true },
      ])

      expect(await stateOf(debt)).toEqual({
        amountReceived: 600,
        status: 'COMPLETED',
      })

      await http().delete(`/settlements/${forced}`).set(ctx.auth(owner))

      // The old code subtracted the stored credit — 570 — from 600 and landed
      // on 30 by luck, or on 0 when the stored figure was the whole debt.
      // Re-totalling the remaining ledger can only give back the 30 that is
      // genuinely still there.
      expect(await ledgerOf(debt)).toEqual([
        { amount: 30, kind: 'CASH', hasIncome: true },
      ])
      expect(await stateOf(debt)).toEqual({
        amountReceived: 30,
        status: 'PARTIAL',
      })
    })
  })

  describe('the invariants the target model will enforce', () => {
    it('refuses a reimbursement on an income transaction', async () => {
      const f = await fixture()

      const response = await http()
        .post('/reimbursements')
        .set(ctx.auth(owner))
        .send({
          transactionId: f.incomeTransactionId,
          personId: f.personId,
          amount: 100,
        })

      expect(response.status).toBe(400)
    })

    it('refuses to owe more on an expense than it cost', async () => {
      const f = await fixture()
      await createReimbursement(f, 600)

      // 600 already claimed on an 800 expense; 300 more would overshoot.
      const response = await http()
        .post('/reimbursements')
        .set(ctx.auth(owner))
        .send({
          transactionId: f.expenseTransactionId,
          personId: f.personId,
          amount: 300,
        })

      expect(response.status).toBe(400)
      expect(await prisma.reimbursementRequest.count()).toBe(1)
    })

    it('allows debts that exactly cover the expense', async () => {
      const f = await fixture()
      await createReimbursement(f, 600)
      await createReimbursement(f, 200)

      expect(await prisma.reimbursementRequest.count()).toBe(2)
    })

    it('refuses to lower a debt under what is already credited', async () => {
      const f = await fixture()
      const debt = await createReimbursement(f, 600)
      await settle(f, [{ reimbursementId: debt, amountSettled: 500 }])

      const response = await http()
        .patch(`/reimbursements/${debt}`)
        .set(ctx.auth(owner))
        .send({ amount: 200 })

      expect(response.status).toBe(400)
    })

    it('reopens a settled debt when its amount is raised', async () => {
      const f = await fixture()
      const debt = await createReimbursement(f, 600)
      await settle(f, [{ reimbursementId: debt, amountSettled: 600 }])
      expect((await stateOf(debt)).status).toBe('COMPLETED')

      const response = await http()
        .patch(`/reimbursements/${debt}`)
        .set(ctx.auth(owner))
        .send({ amount: 800 })

      expect(response.status).toBe(200)
      // The status is a reading of the ledger against the debt, so moving the
      // debt re-reads it rather than leaving a stale COMPLETED behind.
      expect(await stateOf(debt)).toEqual({
        amountReceived: 600,
        status: 'PARTIAL',
      })
    })
  })
})
