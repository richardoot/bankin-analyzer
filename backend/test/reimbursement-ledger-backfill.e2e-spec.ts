/**
 * Phase 2: does the backfill reproduce the existing credits exactly?
 *
 * The migration runs once, on an empty database, so replaying migrations proves
 * only that the SQL parses. What has to be proven is the arithmetic — above all
 * the CASH / WRITE_OFF split of a force-completed settlement, where the cash is
 * known per settlement and the credit per line.
 *
 * So these specs read the shipped migration, cut everything below the
 * BACKFILL-START marker, seed data underneath it and run it for real. The SQL
 * under test is the SQL that ships; there is no second copy to drift.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations')
const MARKER = '-- BACKFILL-START'

/** The backfill half of the migration that introduced the ledger. */
function backfillSql(): string {
  const directory = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .find(name => name.endsWith('_add_reimbursement_payment_ledger'))

  if (!directory) {
    throw new Error('Ledger migration not found — was it renamed?')
  }

  const sql = readFileSync(
    path.join(MIGRATIONS_DIR, directory, 'migration.sql'),
    'utf8'
  )
  const at = sql.indexOf(MARKER)
  if (at === -1) {
    throw new Error(`${MARKER} marker missing from ${directory}/migration.sql`)
  }

  return sql.slice(at)
}

interface PaymentRow {
  amount: string | number
  kind: string
  income_transaction_id: string | null
  settlement_id: string | null
}

describe('Reimbursement ledger backfill (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  const sql = backfillSql()

  beforeAll(async () => {
    ctx = await createE2eApp([owner])
    prisma = ctx.prisma
  }, 60000)

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    // Cascades through transactions, settlements and any payment already
    // written, so each spec starts from an empty ledger.
    await prisma.user.deleteMany()
    const me = await request(ctx.server).get('/users/me').set(ctx.auth(owner))
    userId = (me.body as { id: string }).id
  })

  /** Run the shipped backfill against whatever the spec has just seeded. */
  async function runBackfill(): Promise<void> {
    await prisma.$executeRawUnsafe(sql)
  }

  async function paymentsOf(reimbursementId: string): Promise<PaymentRow[]> {
    return prisma.$queryRawUnsafe<PaymentRow[]>(
      `SELECT amount, kind::text AS kind, income_transaction_id, settlement_id
       FROM app.reimbursement_payments
       WHERE reimbursement_id = $1
       ORDER BY kind, amount DESC`,
      reimbursementId
    )
  }

  /** An expense, a debt on it, and the income transaction that repays it. */
  async function scenario(options: {
    debt: number
    amountReceived: number
    label: string
  }): Promise<{
    reimbursementId: string
    incomeTransactionId: string
    personId: string
  }> {
    const account = await prisma.account.create({
      data: { userId, name: `Compte ${options.label}` },
    })
    const expenseCategory = await prisma.category.create({
      data: { userId, name: `Sante ${options.label}`, type: 'EXPENSE' },
    })
    const expense = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: expenseCategory.id,
        hash: `${userId}-expense-${options.label}`,
        date: new Date('2026-01-12'),
        description: 'Cabinet dentaire',
        amount: -options.debt,
        type: 'EXPENSE',
      },
    })
    const incomeCategory = await prisma.category.create({
      data: { userId, name: `Remboursement ${options.label}`, type: 'INCOME' },
    })
    const incomeTransaction = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: incomeCategory.id,
        hash: `${userId}-income-${options.label}`,
        date: new Date('2026-02-15'),
        description: 'VIR ALICE MARTIN',
        amount: options.debt,
        type: 'INCOME',
      },
    })
    const person = await prisma.person.create({
      data: { userId, name: `Alice ${options.label}` },
    })
    const reimbursement = await prisma.reimbursementRequest.create({
      data: {
        userId,
        transactionId: expense.id,
        personId: person.id,
        amount: options.debt,
        amountReceived: options.amountReceived,
        status:
          options.amountReceived >= options.debt
            ? 'COMPLETED'
            : options.amountReceived > 0
              ? 'PARTIAL'
              : 'PENDING',
      },
    })

    return {
      reimbursementId: reimbursement.id,
      incomeTransactionId: incomeTransaction.id,
      personId: person.id,
    }
  }

  it('mirrors a plain settlement as a single CASH payment', async () => {
    const { reimbursementId, incomeTransactionId, personId } = await scenario({
      debt: 600,
      amountReceived: 600,
      label: 'plain',
    })
    const settlement = await prisma.settlement.create({
      data: {
        userId,
        personId,
        incomeTransactionId,
        amountUsed: 600,
        reimbursements: { create: [{ reimbursementId, amountSettled: 600 }] },
      },
    })

    await runBackfill()

    const payments = await paymentsOf(reimbursementId)
    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({
      kind: 'CASH',
      income_transaction_id: incomeTransactionId,
      settlement_id: settlement.id,
    })
    expect(Number(payments[0]?.amount)).toBeCloseTo(600, 2)
  })

  it('splits a force-completed settlement into the cash and the remainder', async () => {
    // 5 EUR closing a 600 EUR debt: 595 were forgiven, never collected.
    const { reimbursementId, incomeTransactionId, personId } = await scenario({
      debt: 600,
      amountReceived: 600,
      label: 'forced',
    })
    await prisma.settlement.create({
      data: {
        userId,
        personId,
        incomeTransactionId,
        amountUsed: 5,
        reimbursements: { create: [{ reimbursementId, amountSettled: 600 }] },
      },
    })

    await runBackfill()

    const payments = await paymentsOf(reimbursementId)
    expect(payments).toHaveLength(2)

    const cash = payments.find(p => p.kind === 'CASH')
    const writeOff = payments.find(p => p.kind === 'WRITE_OFF')

    expect(Number(cash?.amount)).toBeCloseTo(5, 2)
    expect(cash?.income_transaction_id).toBe(incomeTransactionId)

    expect(Number(writeOff?.amount)).toBeCloseTo(595, 2)
    // A forgiven remainder has no cash, so it names no transaction.
    expect(writeOff?.income_transaction_id).toBeNull()

    // Together they still credit the full debt, so the status stays COMPLETED.
    const credited = payments.reduce((sum, p) => sum + Number(p.amount), 0)
    expect(credited).toBeCloseTo(600, 2)
  })

  it('spreads a multi-line settlement across its lines', async () => {
    const first = await scenario({
      debt: 600,
      amountReceived: 560,
      label: 'multi-a',
    })
    const second = await scenario({
      debt: 100,
      amountReceived: 40,
      label: 'multi-b',
    })

    await prisma.settlement.create({
      data: {
        userId,
        personId: first.personId,
        incomeTransactionId: first.incomeTransactionId,
        amountUsed: 600,
        reimbursements: {
          create: [
            { reimbursementId: first.reimbursementId, amountSettled: 560 },
            { reimbursementId: second.reimbursementId, amountSettled: 40 },
          ],
        },
      },
    })

    await runBackfill()

    // Each line keeps its own credit; none of it becomes a write-off, because
    // the settlement drew every cent it handed out.
    const firstPayments = await paymentsOf(first.reimbursementId)
    const secondPayments = await paymentsOf(second.reimbursementId)

    expect(firstPayments.map(p => p.kind)).toEqual(['CASH'])
    expect(Number(firstPayments[0]?.amount)).toBeCloseTo(560, 2)
    expect(secondPayments.map(p => p.kind)).toEqual(['CASH'])
    expect(Number(secondPayments[0]?.amount)).toBeCloseTo(40, 2)
  })

  it('recovers a credit recorded outside any settlement', async () => {
    // What the removed PATCH :id/receive left behind: money on the row, no
    // settlement, no income transaction to point at.
    const { reimbursementId } = await scenario({
      debt: 600,
      amountReceived: 250,
      label: 'orphan',
    })

    await runBackfill()

    const payments = await paymentsOf(reimbursementId)
    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({
      kind: 'CASH',
      income_transaction_id: null,
      settlement_id: null,
    })
    expect(Number(payments[0]?.amount)).toBeCloseTo(250, 2)
  })

  it('writes nothing for a debt nobody has paid', async () => {
    const { reimbursementId } = await scenario({
      debt: 600,
      amountReceived: 0,
      label: 'pending',
    })

    await runBackfill()

    expect(await paymentsOf(reimbursementId)).toEqual([])
  })

  it('refuses to guess when a multi-line settlement forgave a shortfall', async () => {
    const first = await scenario({
      debt: 600,
      amountReceived: 600,
      label: 'ambiguous-a',
    })
    const second = await scenario({
      debt: 100,
      amountReceived: 100,
      label: 'ambiguous-b',
    })

    // 6 EUR of cash closing 700 EUR of debt across two lines: nothing stored
    // says which line the 6 went to, so the split cannot be derived.
    await prisma.settlement.create({
      data: {
        userId,
        personId: first.personId,
        incomeTransactionId: first.incomeTransactionId,
        amountUsed: 6,
        reimbursements: {
          create: [
            { reimbursementId: first.reimbursementId, amountSettled: 600 },
            { reimbursementId: second.reimbursementId, amountSettled: 100 },
          ],
        },
      },
    })

    // The precondition the prod audit established is asserted, not assumed:
    // a database that breaks it stops rather than inventing numbers.
    await expect(runBackfill()).rejects.toThrow(
      /multi-line settlement\(s\) forgave a shortfall/
    )

    const payments = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      'SELECT count(*) AS count FROM app.reimbursement_payments'
    )
    expect(Number(payments[0]?.count)).toBe(0)
  })
})
