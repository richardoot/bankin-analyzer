/**
 * Phase 0 of the reimbursement rework: the safety net.
 *
 * Nothing about how reimbursements are computed should move before there is a
 * way to measure what moves. This file provides two instruments, both written
 * against the *current* code:
 *
 *  1. **The solde invariant.** A reimbursement does not create or destroy
 *     wealth — it only picks which side of the ledger it lands on. So
 *     `income - expenses` must come out identical whether `deductReimbursements`
 *     is on or off. The dashboard honours this. The budget does not: the
 *     `continue` in budgets.service.ts drops reimbursement income from the
 *     income side even when the toggle is off, without ever deducting it from
 *     the expense side, so the money simply vanishes. That case is marked
 *     `it.fails` and is the first thing phase 1 fixes.
 *
 *  2. **The golden master.** Snapshots of `/dashboard/summary` and
 *     `/budgets/statistics` over a dataset built to touch every branch the
 *     rework will disturb: a joint account (divisor), an associated category
 *     pair, a partial debt, a multi-line settlement, an exceptional tag, and a
 *     reimbursement received the month *after* the expense it repays.
 *
 * The snapshots are not an assertion that today's numbers are right — several
 * are provably wrong (see the plan). They are a tripwire: phases 1 and 4 are
 * expected to move them, and every moved value has to be explained by a named
 * cause before the snapshot is accepted.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

/** The window every request below is scoped to. */
const PERIOD = { startDate: '2026-01-01', endDate: '2026-02-28' }

/** Labels standing in for the random uuids, so snapshots survive a re-run. */
type Labels = Map<string, string>

interface Fixture {
  labels: Labels
  santeId: string
  remboursementSanteId: string
}

describe('Reimbursement baseline (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let fixture: Fixture

  beforeAll(async () => {
    ctx = await createE2eApp([owner])
    prisma = ctx.prisma

    const me = await request(ctx.server).get('/users/me').set(ctx.auth(owner))
    const userId = (me.body as { id: string }).id

    fixture = await seed(prisma, userId, ctx)
  }, 60000)

  afterAll(async () => {
    await ctx.close()
  })

  const http = (): request.Agent => request(ctx.server)

  async function dashboard(
    filters: Record<string, unknown>
  ): Promise<DashboardBody> {
    const response = await http()
      .post('/dashboard/summary')
      .set(ctx.auth(owner))
      .send({ ...PERIOD, ...filters })

    expect(response.status).toBe(201)
    return response.body as DashboardBody
  }

  async function budget(filters: Record<string, unknown>): Promise<BudgetBody> {
    const response = await http()
      .post('/budgets/statistics')
      .set(ctx.auth(owner))
      .send({ ...PERIOD, ...filters })

    expect(response.status).toBe(201)
    return response.body as BudgetBody
  }

  describe('the solde invariant', () => {
    // 600 EUR of health costs repaid: either the expense drops by 600, or the
    // income rises by 600. Both land on the same solde. Until phase 1 the
    // budget failed this by exactly 600 — it dropped reimbursement income from
    // the income side with the toggle off, without ever crediting the expense.
    // The breakdown flag is not cosmetic here: the dashboard only fills
    // `pendingReimbursement` when it is on, so without it the pending assertion
    // below would compare zero to zero and prove nothing.
    const endpoints = [
      {
        name: 'dashboard',
        call: (f: Record<string, unknown>) =>
          dashboard({ ...f, includeCategoryBreakdown: true }),
      },
      {
        name: 'budget',
        call: (f: Record<string, unknown>) =>
          budget({ ...f, includeMonthlyBreakdown: true }),
      },
    ]

    for (const { name, call } of endpoints) {
      it(`holds on the ${name}: deducting only moves money between sides`, async () => {
        const deducted = await call({ deductReimbursements: true })
        const gross = await call({ deductReimbursements: false })

        expect(soldeOf(deducted)).toBeCloseTo(soldeOf(gross), 2)
      })

      it(`holds on the ${name} with pending deducted too`, async () => {
        const deducted = await call({
          deductReimbursements: true,
          deductPendingReimbursements: true,
        })
        const gross = await call({ deductReimbursements: false })

        // A debt not yet collected is not income either way: deducting it in
        // advance lowers the expense, so the solde must rise by the same amount.
        expect(soldeOf(deducted) - soldeOf(gross)).toBeCloseTo(
          pendingTotal(deducted),
          2
        )
      })
    }
  })

  describe('golden master', () => {
    const configurations = [
      { name: 'received deducted (default)', filters: {} },
      {
        name: 'received and pending deducted',
        filters: { deductPendingReimbursements: true },
      },
      {
        name: 'nothing deducted',
        filters: { deductReimbursements: false },
      },
    ]

    for (const { name, filters } of configurations) {
      it(`dashboard — ${name}`, async () => {
        const body = await dashboard({
          ...filters,
          includeCategoryBreakdown: true,
        })

        expect(normalize(body, fixture.labels)).toMatchSnapshot()
      })

      it(`budget — ${name}`, async () => {
        const body = await budget({
          ...filters,
          includeMonthlyBreakdown: true,
        })

        expect(normalize(body, fixture.labels)).toMatchSnapshot()
      })
    }
  })

  describe('the dataset itself', () => {
    it('records the reimbursement states the master depends on', async () => {
      const requests = await prisma.reimbursementRequest.findMany({
        where: { categoryId: fixture.remboursementSanteId },
        orderBy: { amount: 'desc' },
      })

      // Alice's two debts, both left partial by the same February transfer,
      // plus Bruno's untouched one — the PENDING line the pending-deduction
      // toggle bites on. All three carry the income category, as the frontend
      // writes it.
      expect(
        requests.map(r => [
          Number(r.amount),
          Number(r.amountReceived),
          r.status,
        ])
      ).toEqual([
        [600, 560, 'PARTIAL'],
        [150, 0, 'PENDING'],
        [100, 40, 'PARTIAL'],
      ])
    })

    it('keeps the joint account halved in the aggregates', async () => {
      const body = await dashboard({ deductReimbursements: false })
      const courses = body.expensesByCategory.find(
        c => c.category === 'Courses'
      )

      // 600 on the joint account counts 300, plus 400 on the standard one.
      expect(courses?.amount).toBeCloseTo(700, 2)
    })
  })
})

interface CategoryBlock {
  categoryId?: string
  category?: string
  categoryName?: string
  amount?: number
  totalAmount?: number
  pendingReimbursement?: number
}

interface DashboardBody {
  expensesByCategory: CategoryBlock[]
  incomeByCategory: CategoryBlock[]
  totalExpenses: number
  totalIncome: number
}

interface BudgetBody {
  expensesByCategory: CategoryBlock[]
  incomeByCategory: CategoryBlock[]
  totalExpenses: number
  totalIncome: number
}

/** What a reimbursement must never change. */
function soldeOf(body: DashboardBody | BudgetBody): number {
  return body.totalIncome - body.totalExpenses
}

/**
 * Pending deduction the response claims to have applied. It must match the
 * movement it caused in the solde: a deduction reported but not applied is the
 * signature of a mis-keyed category map.
 */
function pendingTotal(body: DashboardBody | BudgetBody): number {
  return body.expensesByCategory.reduce(
    (sum, category) => sum + (category.pendingReimbursement ?? 0),
    0
  )
}

/**
 * Swap every uuid for the label it was seeded under. Ids are regenerated on
 * each run, so without this the snapshots would never match twice.
 */
function normalize(value: unknown, labels: Labels): unknown {
  if (typeof value === 'string') {
    const label = labels.get(value)
    if (label) return label
    return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value) ? '<uuid>' : value
  }
  if (Array.isArray(value)) {
    return value.map(item => normalize(item, labels))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalize(item, labels)])
    )
  }
  return value
}

/**
 * One coherent household over two months, shaped to exercise every branch the
 * rework touches. Amounts are chosen so no two categories tie: the services
 * sort by amount, and a tie would make the snapshot order arbitrary.
 */
async function seed(
  prisma: PrismaService,
  userId: string,
  ctx: E2eContext
): Promise<Fixture> {
  const labels: Labels = new Map()
  const label = <T extends { id: string }>(row: T, name: string): T => {
    labels.set(row.id, name)
    return row
  }

  const courant = label(
    await prisma.account.create({
      data: { userId, name: 'Compte courant' },
    }),
    'account:courant'
  )
  const joint = label(
    await prisma.account.create({
      data: { userId, name: 'Compte joint', type: 'JOINT', divisor: 2 },
    }),
    'account:joint'
  )

  const sante = label(
    await prisma.category.create({
      data: { userId, name: 'Sante', type: 'EXPENSE' },
    }),
    'category:Sante'
  )
  const courses = label(
    await prisma.category.create({
      data: { userId, name: 'Courses', type: 'EXPENSE' },
    }),
    'category:Courses'
  )
  const voyage = label(
    await prisma.category.create({
      data: { userId, name: 'Voyage', type: 'EXPENSE' },
    }),
    'category:Voyage'
  )
  const salaire = label(
    await prisma.category.create({
      data: { userId, name: 'Salaire', type: 'INCOME' },
    }),
    'category:Salaire'
  )
  const remboursementSante = label(
    await prisma.category.create({
      data: { userId, name: 'Remboursement sante', type: 'INCOME' },
    }),
    'category:RemboursementSante'
  )

  const dentiste = label(
    await prisma.subcategory.create({
      data: { userId, categoryId: sante.id, name: 'Dentiste' },
    }),
    'subcategory:Dentiste'
  )
  const pharmacie = label(
    await prisma.subcategory.create({
      data: { userId, categoryId: sante.id, name: 'Pharmacie' },
    }),
    'subcategory:Pharmacie'
  )

  const vacances = label(
    await prisma.tag.create({
      data: { userId, name: 'Vacances Italie', isExceptional: true },
    }),
    'tag:VacancesItalie'
  )

  let sequence = 0
  const transaction = async (data: {
    accountId: string
    categoryId: string
    subcategoryId?: string
    subcategory?: string
    date: string
    description: string
    amount: number
    type: 'EXPENSE' | 'INCOME'
  }): Promise<{ id: string }> => {
    sequence += 1
    return prisma.transaction.create({
      data: {
        userId,
        hash: `${userId}-tx-${sequence}`,
        ...data,
        date: new Date(data.date),
      },
    })
  }

  // January: the expenses.
  const txDentiste = label(
    await transaction({
      accountId: courant.id,
      categoryId: sante.id,
      subcategoryId: dentiste.id,
      subcategory: 'Dentiste',
      date: '2026-01-12',
      description: 'Cabinet dentaire',
      amount: -800,
      type: 'EXPENSE',
    }),
    'tx:dentiste'
  )
  const txPharmacie = label(
    await transaction({
      accountId: courant.id,
      categoryId: sante.id,
      subcategoryId: pharmacie.id,
      subcategory: 'Pharmacie',
      date: '2026-01-18',
      description: 'Pharmacie du centre',
      amount: -200,
      type: 'EXPENSE',
    }),
    'tx:pharmacie'
  )
  // Joint account: 600 spent, 300 counted.
  const txCoursesJoint = label(
    await transaction({
      accountId: joint.id,
      categoryId: courses.id,
      date: '2026-01-20',
      description: 'Monoprix',
      amount: -600,
      type: 'EXPENSE',
    }),
    'tx:coursesJoint'
  )
  const txVoyage = label(
    await transaction({
      accountId: courant.id,
      categoryId: voyage.id,
      date: '2026-01-25',
      description: 'Billets Rome',
      amount: -1200,
      type: 'EXPENSE',
    }),
    'tx:voyage'
  )
  await transaction({
    accountId: courant.id,
    categoryId: salaire.id,
    date: '2026-01-28',
    description: 'Virement salaire',
    amount: 3000,
    type: 'INCOME',
  })

  // The trip is a one-off, not everyday life.
  await prisma.transactionTag.create({
    data: { transactionId: txVoyage.id, tagId: vacances.id },
  })

  // February: more spending, and the repayment of January's health costs.
  await transaction({
    accountId: courant.id,
    categoryId: courses.id,
    date: '2026-02-10',
    description: 'Grand Frais',
    amount: -400,
    type: 'EXPENSE',
  })
  const txRemboursement = label(
    await transaction({
      accountId: courant.id,
      categoryId: remboursementSante.id,
      date: '2026-02-15',
      description: 'VIR ALICE MARTIN',
      amount: 600,
      type: 'INCOME',
    }),
    'tx:remboursement'
  )

  const alice = label(
    await prisma.person.create({ data: { userId, name: 'Alice Martin' } }),
    'person:Alice'
  )
  const bruno = label(
    await prisma.person.create({ data: { userId, name: 'Bruno Petit' } }),
    'person:Bruno'
  )

  // Debts and their settlement go through the HTTP API rather than straight
  // into the tables. Since phase 3 the credit lives in `reimbursement_payments`
  // and is written by the service; seeding the old columns by hand would build
  // a fixture the application could never produce, and the deduction — which
  // now reads the ledger — would find nothing.
  const post = async (
    path: string,
    body: Record<string, unknown>
  ): Promise<{ id: string }> => {
    const response = await request(ctx.server)
      .post(path)
      .set(ctx.auth(owner))
      .send(body)
    if (response.status !== 201) {
      throw new Error(
        `${path} answered ${response.status}: ${JSON.stringify(response.body)}`
      )
    }
    return response.body as { id: string }
  }

  // categoryId holds the *income* category — that is what the frontend writes.
  // It no longer drives any calculation; it survives as a saisie hint.
  const dueDentiste = label(
    await post('/reimbursements', {
      transactionId: txDentiste.id,
      personId: alice.id,
      categoryId: remboursementSante.id,
      amount: 600,
    }),
    'reimbursement:dentiste'
  )
  const duePharmacie = label(
    await post('/reimbursements', {
      transactionId: txPharmacie.id,
      personId: alice.id,
      categoryId: remboursementSante.id,
      amount: 100,
    }),
    'reimbursement:pharmacie'
  )
  // Never settled: keeps a PENDING line alive, on the halved account.
  label(
    await post('/reimbursements', {
      transactionId: txCoursesJoint.id,
      personId: bruno.id,
      categoryId: remboursementSante.id,
      amount: 150,
    }),
    'reimbursement:courses'
  )

  // One February transfer closing two debts at once, neither of them fully.
  const settlement = label(
    await post('/settlements', {
      personId: alice.id,
      incomeTransactionId: txRemboursement.id,
      reimbursements: [
        { reimbursementId: dueDentiste.id, amountSettled: 560 },
        { reimbursementId: duePharmacie.id, amountSettled: 40 },
      ],
    }),
    'settlement:fevrier'
  )
  labels.set(settlement.id, 'settlement:fevrier')

  return {
    labels,
    santeId: sante.id,
    remboursementSanteId: remboursementSante.id,
  }
}
