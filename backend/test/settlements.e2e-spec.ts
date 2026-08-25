/**
 * The settlement payload contract, pinned end to end.
 *
 * The frontend declares `CreateSettlementDto` in `frontend/src/lib/api.ts` as
 * its own hand-written copy: nothing makes the two definitions drift together,
 * and a type-check on either side stays green while the wire shape diverges.
 * These specs close that gap from the only place that can — the real endpoint,
 * behind the real ValidationPipe.
 *
 * Every payload below is the literal shape the settlement modals build in
 * `SettlementModal.vue` and `SingleSettlementModal.vue`. The rejection cases
 * are the mirror image: each one is a guard the frontend enforces before
 * sending, and each would start returning 400 the day that guard is dropped.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

interface PendingDebt {
  reimbursementId: string
  amount: number
}

describe('Settlements payload contract (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  let accountId: string
  let personId: string

  beforeAll(async () => {
    ctx = await createE2eApp([owner])
    prisma = ctx.prisma
  })

  afterAll(async () => {
    await ctx.close()
  })

  const http = () => request(ctx.server)

  let sequence = 0
  const nextHash = () => `e2e-settlement-${(sequence += 1)}`

  beforeEach(async () => {
    await prisma.user.deleteMany()

    const me = await http().get('/users/me').set(ctx.auth(owner))
    expect(me.status).toBe(200)
    userId = (me.body as { id: string }).id

    const account = await prisma.account.create({
      data: { userId, name: 'Compte courant' },
    })
    accountId = account.id

    const person = await http()
      .post('/persons')
      .set(ctx.auth(owner))
      .send({ name: 'Alice Martin' })
    personId = (person.body as { id: string }).id
  })

  /** An expense owed by the person, as the reimbursements page would show it. */
  async function pendingDebt(
    description: string,
    amount: number
  ): Promise<PendingDebt> {
    const expense = await prisma.transaction.create({
      data: {
        userId,
        accountId,
        hash: nextHash(),
        date: new Date('2026-08-12'),
        description,
        amount: -amount,
        type: 'EXPENSE',
      },
    })

    const created = await http()
      .post('/reimbursements')
      .set(ctx.auth(owner))
      .send({ transactionId: expense.id, personId, amount })

    expect(created.status).toBe(201)
    return {
      reimbursementId: (created.body as { id: string }).id,
      amount,
    }
  }

  /** The receipt: money actually landed on the account. */
  async function incomeTransaction(amount: number): Promise<string> {
    const income = await prisma.transaction.create({
      data: {
        userId,
        accountId,
        hash: nextHash(),
        date: new Date('2026-08-14'),
        description: 'VIR ALICE MARTIN',
        amount,
        type: 'INCOME',
      },
    })
    return income.id
  }

  async function reimbursementById(id: string) {
    const all = await http().get('/reimbursements').set(ctx.auth(owner))
    return (
      all.body as Array<{
        id: string
        status: string
        amountReceived: number
        amountRemaining: number
      }>
    ).find(entry => entry.id === id)
  }

  it('accepts the payload the multi-line modal builds', async () => {
    const monoprix = await pendingDebt('Monoprix', 15)
    const carrefour = await pendingDebt('Carrefour', 30)
    const receipt = await incomeTransaction(45)

    // Verbatim from SettlementModal.handleConfirm: the retained lines, each
    // with the amount the cascade gave it, and no key beyond that.
    const response = await http()
      .post('/settlements')
      .set(ctx.auth(owner))
      .send({
        personId,
        incomeTransactionId: receipt,
        reimbursements: [
          { reimbursementId: monoprix.reimbursementId, amountSettled: 15 },
          { reimbursementId: carrefour.reimbursementId, amountSettled: 30 },
        ],
      })

    expect(response.status).toBe(201)
    expect(await reimbursementById(monoprix.reimbursementId)).toMatchObject({
      status: 'COMPLETED',
      amountRemaining: 0,
    })
    expect(await reimbursementById(carrefour.reimbursementId)).toMatchObject({
      status: 'COMPLETED',
      amountRemaining: 0,
    })
  })

  it('accepts the payload the single-line modal builds, shortfall included', async () => {
    const carrefour = await pendingDebt('Carrefour', 30)
    const receipt = await incomeTransaction(45)

    // Verbatim from SingleSettlementModal.handleConfirm: one line, the amount
    // the user kept, and the flag that closes the gap.
    const response = await http()
      .post('/settlements')
      .set(ctx.auth(owner))
      .send({
        personId,
        incomeTransactionId: receipt,
        reimbursements: [
          {
            reimbursementId: carrefour.reimbursementId,
            amountSettled: 18,
            forceComplete: true,
          },
        ],
      })

    expect(response.status).toBe(201)
    // The point of the flag: 12 EUR short, and still off the pending list.
    // `amountReceived` counts the forgiven part too, so the debt reads as
    // fully credited — only `amountUsed` below tracks the cash.
    expect(await reimbursementById(carrefour.reimbursementId)).toMatchObject({
      status: 'COMPLETED',
      amountRemaining: 0,
    })

    // The invariant the modal depends on: forgiving 12 EUR must not draw them
    // from the receipt, or the next settlement would find it 12 EUR short.
    const available = await http()
      .get(`/settlements/transaction/${receipt}/available-amount`)
      .set(ctx.auth(owner))
    expect(available.body).toMatchObject({ availableAmount: 27 })
  })

  it('leaves a partial line pending when the shortfall is not forgiven', async () => {
    const carrefour = await pendingDebt('Carrefour', 30)
    const receipt = await incomeTransaction(18)

    const response = await http()
      .post('/settlements')
      .set(ctx.auth(owner))
      .send({
        personId,
        incomeTransactionId: receipt,
        reimbursements: [
          { reimbursementId: carrefour.reimbursementId, amountSettled: 18 },
        ],
      })

    expect(response.status).toBe(201)
    expect(await reimbursementById(carrefour.reimbursementId)).toMatchObject({
      amountReceived: 18,
      amountRemaining: 12,
    })
  })

  describe('the guards the frontend has to respect', () => {
    it('rejects a key the DTO does not declare', async () => {
      // ValidationPipe runs with forbidNonWhitelisted, so leaking a piece of
      // modal state onto the wire is a 400 rather than a silently ignored key.
      const carrefour = await pendingDebt('Carrefour', 30)
      const receipt = await incomeTransaction(45)

      const response = await http()
        .post('/settlements')
        .set(ctx.auth(owner))
        .send({
          personId,
          incomeTransactionId: receipt,
          reimbursements: [
            {
              reimbursementId: carrefour.reimbursementId,
              amountSettled: 30,
              selected: true,
            },
          ],
        })

      expect(response.status).toBe(400)
    })

    it('rejects a line credited nothing', async () => {
      // Why SettlementModal filters `state.amount > 0` before sending: a
      // retained line the cascade could not pay would 400 the whole request.
      const monoprix = await pendingDebt('Monoprix', 15)
      const carrefour = await pendingDebt('Carrefour', 30)
      const receipt = await incomeTransaction(15)

      const response = await http()
        .post('/settlements')
        .set(ctx.auth(owner))
        .send({
          personId,
          incomeTransactionId: receipt,
          reimbursements: [
            { reimbursementId: monoprix.reimbursementId, amountSettled: 15 },
            { reimbursementId: carrefour.reimbursementId, amountSettled: 0 },
          ],
        })

      expect(response.status).toBe(400)
    })

    it('rejects a settlement that credits no line at all', async () => {
      // Why both modals gate confirmation on a positive total.
      const receipt = await incomeTransaction(45)

      const response = await http()
        .post('/settlements')
        .set(ctx.auth(owner))
        .send({
          personId,
          incomeTransactionId: receipt,
          reimbursements: [],
        })

      expect(response.status).toBe(400)
    })

    it('rejects drawing more than the receipt still holds', async () => {
      // Why the modal blocks on `isOverAllocated` instead of letting the user
      // confirm and discover the failure afterwards.
      const carrefour = await pendingDebt('Carrefour', 30)
      const receipt = await incomeTransaction(20)

      const response = await http()
        .post('/settlements')
        .set(ctx.auth(owner))
        .send({
          personId,
          incomeTransactionId: receipt,
          reimbursements: [
            { reimbursementId: carrefour.reimbursementId, amountSettled: 30 },
          ],
        })

      expect(response.status).toBe(400)
      expect((response.body as { message: string }).message).toContain(
        'Insufficient available amount'
      )
    })

    it('rejects a receipt that is not income', async () => {
      const carrefour = await pendingDebt('Carrefour', 30)
      const expense = await prisma.transaction.create({
        data: {
          userId,
          accountId,
          hash: nextHash(),
          date: new Date('2026-08-14'),
          description: 'Pas un encaissement',
          amount: -50,
          type: 'EXPENSE',
        },
      })

      const response = await http()
        .post('/settlements')
        .set(ctx.auth(owner))
        .send({
          personId,
          incomeTransactionId: expense.id,
          reimbursements: [
            { reimbursementId: carrefour.reimbursementId, amountSettled: 30 },
          ],
        })

      expect(response.status).toBe(400)
    })
  })
})
