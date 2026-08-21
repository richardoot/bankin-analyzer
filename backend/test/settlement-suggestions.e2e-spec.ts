/**
 * Phase 5: suggesting which transfer repays which debt.
 *
 * The payment ledger is exact but costs a gesture the old category pairing did
 * not: one explicit link per encashment. These specs cover the endpoint that
 * pays that back — it reads the real data, ranks the plausible pairs, and
 * writes nothing.
 *
 * The route order matters as much as the ranking: `suggestions` sits under the
 * same prefix as `:id`, and declaring it second would make Nest read it as a
 * settlement id and answer 404.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

interface Suggestion {
  transactionId: string
  personName: string
  score: number
  reasons: string[]
  coverage: number
  availableAmount: number
  debts: Array<{ reimbursementId: string; amountRemaining: number }>
}

describe('Settlement suggestions (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  let accountId: string
  let santeId: string
  let remboursementSanteId: string

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
    const sante = await prisma.category.create({
      data: { userId, name: 'Sante', type: 'EXPENSE' },
    })
    santeId = sante.id
    const remboursement = await prisma.category.create({
      data: { userId, name: 'Remboursement sante', type: 'INCOME' },
    })
    remboursementSanteId = remboursement.id
  })

  const http = (): request.Agent => request(ctx.server)

  let sequence = 0
  async function expense(
    amount: number,
    categoryId = santeId
  ): Promise<string> {
    sequence += 1
    const row = await prisma.transaction.create({
      data: {
        userId,
        accountId,
        categoryId,
        hash: `${userId}-exp-${sequence}`,
        date: new Date('2026-01-12'),
        description: 'Cabinet dentaire',
        amount: -amount,
        type: 'EXPENSE',
      },
    })
    return row.id
  }

  async function incoming(
    amount: number,
    description: string,
    categoryId: string | null = remboursementSanteId
  ): Promise<string> {
    sequence += 1
    const row = await prisma.transaction.create({
      data: {
        userId,
        accountId,
        categoryId,
        hash: `${userId}-inc-${sequence}`,
        date: new Date('2026-02-15'),
        description,
        amount,
        type: 'INCOME',
      },
    })
    return row.id
  }

  async function owes(
    personName: string,
    amount: number,
    transactionId: string
  ): Promise<{ personId: string; reimbursementId: string }> {
    const person = await prisma.person.upsert({
      where: { userId_name: { userId, name: personName } },
      create: { userId, name: personName },
      update: {},
    })
    const response = await http()
      .post('/reimbursements')
      .set(ctx.auth(owner))
      .send({ transactionId, personId: person.id, amount })

    expect(response.status).toBe(201)
    return {
      personId: person.id,
      reimbursementId: (response.body as { id: string }).id,
    }
  }

  async function suggestions(): Promise<Suggestion[]> {
    const response = await http()
      .get('/settlements/suggestions')
      .set(ctx.auth(owner))

    expect(response.status).toBe(200)
    return response.body as Suggestion[]
  }

  it('resolves the route rather than reading it as a settlement id', async () => {
    // Nothing to suggest yet, but the endpoint must still answer 200 and not
    // fall through to `GET /settlements/:id`.
    expect(await suggestions()).toEqual([])
  })

  it('suggests a transfer naming the payer', async () => {
    const tx = await expense(600)
    await owes('Alice Martin', 600, tx)
    const income = await incoming(600, 'VIR ALICE MARTIN')

    const [suggestion] = await suggestions()

    expect(suggestion).toMatchObject({
      transactionId: income,
      personName: 'Alice Martin',
      coverage: 600,
      availableAmount: 600,
    })
    expect(suggestion?.reasons).toContain('name')
    expect(suggestion?.debts).toHaveLength(1)
  })

  it('fires the category signal through the association', async () => {
    await prisma.categoryAssociation.create({
      data: {
        userId,
        expenseCategoryId: santeId,
        incomeCategoryId: remboursementSanteId,
      },
    })
    const tx = await expense(600)
    await owes('Alice Martin', 600, tx)
    // Neither the name nor the amount matches: only the pairing can fire.
    await incoming(137.42, 'VIREMENT RECU')

    const [suggestion] = await suggestions()

    expect(suggestion?.reasons).toEqual(['category'])
  })

  it('ranks the named payer above one that merely owes the same amount', async () => {
    const first = await expense(600)
    const second = await expense(600)
    await owes('Alice Martin', 600, first)
    await owes('Bruno Petit', 600, second)
    await incoming(600, 'VIR ALICE MARTIN')

    const ranked = await suggestions()

    expect(ranked.map(s => s.personName)).toEqual([
      'Alice Martin',
      'Bruno Petit',
    ])
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0)
  })

  it('drops a transfer whose cash a settlement already took', async () => {
    const tx = await expense(600)
    const { personId, reimbursementId } = await owes('Alice Martin', 600, tx)
    const income = await incoming(600, 'VIR ALICE MARTIN')

    await http()
      .post('/settlements')
      .set(ctx.auth(owner))
      .send({
        personId,
        incomeTransactionId: income,
        reimbursements: [{ reimbursementId, amountSettled: 600 }],
      })

    // The debt is settled and the cash is spent: nothing left to propose.
    expect(await suggestions()).toEqual([])
  })

  it('keeps proposing the remainder after a partial settlement', async () => {
    const tx = await expense(600)
    const { personId, reimbursementId } = await owes('Alice Martin', 600, tx)
    const first = await incoming(200, 'VIR ALICE MARTIN')
    await http()
      .post('/settlements')
      .set(ctx.auth(owner))
      .send({
        personId,
        incomeTransactionId: first,
        reimbursements: [{ reimbursementId, amountSettled: 200 }],
      })

    const second = await incoming(400, 'VIR ALICE MARTIN')

    const ranked = await suggestions()
    const remaining = ranked.find(s => s.transactionId === second)

    expect(remaining?.coverage).toBe(400)
    expect(remaining?.debts[0]?.amountRemaining).toBe(400)
  })

  it('says nothing about a transfer that resembles nothing', async () => {
    const tx = await expense(600)
    await owes('Alice Martin', 600, tx)
    await incoming(3000, 'VIR SALAIRE ACME', null)

    const ranked = await suggestions()

    expect(ranked.map(s => s.transactionId)).not.toContain('VIR SALAIRE ACME')
    expect(ranked.every(s => s.reasons.length > 0)).toBe(true)
  })

  it('writes nothing', async () => {
    const tx = await expense(600)
    await owes('Alice Martin', 600, tx)
    await incoming(600, 'VIR ALICE MARTIN')

    await suggestions()

    // A suggestion is a proposal, not a decision.
    expect(await prisma.settlement.count()).toBe(0)
    expect(await prisma.reimbursementPayment.count()).toBe(0)
    const debt = await prisma.reimbursementRequest.findFirstOrThrow()
    expect(Number(debt.amountReceived)).toBe(0)
    expect(debt.status).toBe('PENDING')
  })

  it('never leaks another user data', async () => {
    const tx = await expense(600)
    await owes('Alice Martin', 600, tx)
    await incoming(600, 'VIR ALICE MARTIN')

    const stranger = e2eIdentity('stranger')
    const response = await http()
      .get('/settlements/suggestions')
      .set({ Authorization: `Bearer ${stranger.token}` })

    expect(response.status).toBe(401)
  })
})
