/**
 * Lot 1 of the smoothed purchases (agent-os/product/amortization-framework.md):
 * the everyday reading spreads a smoothed purchase over its months, on the
 * budget statistics and the dashboard, against real Postgres.
 *
 * The invariants of the plan:
 *
 *   - the slices of a purchase sum to its net, to the cent, the last one
 *     absorbing the rounding gap;
 *   - the real reading is identical with and without the smoothing;
 *   - over a window covering the whole smoothing, everyday = real −
 *     exceptional, per category and per subcategory.
 *
 * And the cases the CTE re-checks because sync and the legacy migration can
 * write past the service: a smoothed income, a smoothed row carrying an
 * exceptional tag.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

/** The plan after the purchase: July to December 2026. */
const PLAN = { startDate: '2026-07-01', endDate: '2026-12-31' }
/** Covers the 24 months of the phone, June 2026 to May 2028. */
const WHOLE = { startDate: '2026-06-01', endDate: '2028-05-31' }

interface Line {
  subcategoryId: string | null
  totalAmount?: number
  amount?: number
  everydayAmount?: number
  amortizedAmount?: number
}

interface BudgetCategory {
  categoryId: string
  totalAmount: number
  everydayAmount?: number
  everydayAveragePerMonth?: number
  exceptionalAmount?: number
  monthlyAmounts?: number[]
  everydayMonthlyAmounts?: number[]
  amortizedAmount?: number
  amortizedMonthlyAmounts?: number[]
  subcategories?: Line[]
}

interface BudgetBody {
  expensesByCategory: BudgetCategory[]
  monthLabels?: string[]
  amortizedPurchases?: {
    transactionId: string
    monthlyAmount: number
    netAmount: number
    amountInPeriod: number
  }[]
}

interface DashboardCategory {
  categoryId: string
  amount: number
  exceptionalAmount?: number
  everydayAmount?: number
  amortizedAmount?: number
  amortizedMonthlyAmounts?: number[]
  subcategories?: Line[]
}

interface DashboardBody {
  expensesByCategory: DashboardCategory[]
  monthlyData: {
    month: string
    netExpenses: number
    exceptionalExpenses: number
    everydayNetExpenses: number
  }[]
  everydaySpendingStructure: { committed: number; variable: number }
}

describe('Smoothed purchases, the everyday reading (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  let accountId: string
  let hightechId: string
  let telephoneId: string
  let accessoiresId: string
  let sequence = 0

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
    accountId = (
      await prisma.account.create({ data: { userId, name: 'Compte courant' } })
    ).id
    hightechId = (
      await prisma.category.create({
        data: { userId, name: 'High-tech', type: 'EXPENSE' },
      })
    ).id
    telephoneId = (
      await prisma.subcategory.create({
        data: {
          userId,
          categoryId: hightechId,
          name: 'Téléphone',
          nature: 'PLEASURE',
          rhythm: 'VARIABLE',
        },
      })
    ).id
    accessoiresId = (
      await prisma.subcategory.create({
        data: {
          userId,
          categoryId: hightechId,
          name: 'Accessoires',
          nature: 'PLEASURE',
          rhythm: 'VARIABLE',
        },
      })
    ).id
  })

  async function transaction(data: {
    date: string
    amount: number
    subcategoryId?: string
    type?: 'EXPENSE' | 'INCOME'
    amortizationMonths?: number
    description?: string
  }): Promise<string> {
    sequence += 1
    const created = await prisma.transaction.create({
      data: {
        userId,
        accountId,
        hash: `lot1-${sequence}`,
        date: new Date(data.date),
        description: data.description ?? `TX ${sequence}`,
        amount: data.amount,
        type: data.type ?? (data.amount < 0 ? 'EXPENSE' : 'INCOME'),
        categoryId: hightechId,
        subcategoryId: data.subcategoryId ?? telephoneId,
        amortizationMonths: data.amortizationMonths ?? null,
      },
      select: { id: true },
    })
    return created.id
  }

  /** The iPhone of the plan: 1 300 € in June, over 24 months. */
  function iphone(): Promise<string> {
    return transaction({
      date: '2026-06-12',
      amount: -1300,
      amortizationMonths: 24,
      description: 'IPHONE 17 PRO',
    })
  }

  async function exceptionalTag(): Promise<string> {
    return (
      await prisma.tag.create({
        data: { userId, name: 'Voyage Japon', isExceptional: true },
      })
    ).id
  }

  async function budget(
    window: { startDate: string; endDate: string },
    extra: Record<string, unknown> = {}
  ): Promise<BudgetBody> {
    const res = await request(ctx.server)
      .post('/budgets/statistics')
      .set(ctx.auth(owner))
      .send({
        ...window,
        includeMonthlyBreakdown: true,
        deductPendingReimbursements: false,
        ...extra,
      })
      .expect(201)
    return res.body as BudgetBody
  }

  async function dashboard(window: {
    startDate: string
    endDate: string
  }): Promise<DashboardBody> {
    const res = await request(ctx.server)
      .post('/dashboard/summary')
      .set(ctx.auth(owner))
      .send({
        ...window,
        includeCategoryBreakdown: true,
        deductPendingReimbursements: false,
      })
      .expect(201)
    return res.body as DashboardBody
  }

  const hightechOf = <T extends { categoryId: string }>(body: {
    expensesByCategory: T[]
  }): T | undefined =>
    body.expensesByCategory.find(c => c.categoryId === hightechId)

  const lineOf = (
    category: { subcategories?: Line[] } | undefined,
    subcategoryId: string
  ): Line | undefined =>
    category?.subcategories?.find(l => l.subcategoryId === subcategoryId)

  it('weighs 54.17 € a month in a July–December plan, without overflowing it', async () => {
    await iphone()

    const body = await budget(PLAN)
    const hightech = hightechOf(body)

    // Real: the phone was bought in June, outside the plan.
    expect(hightech?.totalAmount).toBe(0)
    expect(hightech?.monthlyAmounts).toEqual([0, 0, 0, 0, 0, 0])
    // Everyday: six regular slices, no more.
    expect(hightech?.everydayAveragePerMonth).toBe(54.17)
    expect(hightech?.everydayAmount).toBe(325.02)
    expect(hightech?.everydayMonthlyAmounts).toEqual(Array(6).fill(54.17))
    expect(hightech?.amortizedMonthlyAmounts).toEqual(Array(6).fill(54.17))
    expect(body.amortizedPurchases?.[0]).toMatchObject({
      monthlyAmount: 54.17,
      netAmount: 1300,
      amountInPeriod: 325.02,
    })
  })

  it('sums its slices to the net to the cent, the last one adjusted', async () => {
    await iphone()

    const body = await budget(WHOLE)
    const slices = hightechOf(body)?.amortizedMonthlyAmounts ?? []

    expect(slices).toHaveLength(24)
    expect(slices.slice(0, 23)).toEqual(Array(23).fill(54.17))
    // 1300 − 23 × 54.17 = 54.09
    expect(slices[23]).toBe(54.09)
    expect(Math.round(slices.reduce((s, v) => s + v, 0) * 100)).toBe(130000)
  })

  it('follows a partial reimbursement recorded later, on every slice', async () => {
    const id = await iphone()
    const person = await prisma.person.create({
      data: { userId, name: 'Assurance' },
    })
    const claim = await prisma.reimbursementRequest.create({
      data: { userId, transactionId: id, personId: person.id, amount: 300 },
    })
    const refund = await transaction({
      date: '2026-09-03',
      amount: 120,
      type: 'INCOME',
      subcategoryId: accessoiresId,
    })
    await prisma.reimbursementPayment.create({
      data: {
        userId,
        reimbursementId: claim.id,
        incomeTransactionId: refund,
        amount: 120,
        kind: 'CASH',
        settledAt: new Date('2026-09-05'),
      },
    })

    // 1300 − 120 received = 1180 over 24 months: 49.17 a month.
    const plan = await budget(PLAN)
    expect(hightechOf(plan)?.everydayMonthlyAmounts).toEqual(
      Array(6).fill(49.17)
    )

    // The slices before the refund moved too, and still sum to the net.
    const whole = await budget(WHOLE)
    const slices = hightechOf(whole)?.amortizedMonthlyAmounts ?? []
    expect(slices[0]).toBe(49.17)
    expect(Math.round(slices.reduce((s, v) => s + v, 0) * 100)).toBe(118000)

    // With the debt still owed taken off too: 1300 − 300 = 1000.
    const pending = await budget(PLAN, { deductPendingReimbursements: true })
    expect(hightechOf(pending)?.everydayMonthlyAmounts).toEqual(
      Array(6).fill(41.67)
    )
  })

  it('leaves the real reading of the budget and the dashboard identical', async () => {
    const id = await iphone()
    const tag = await exceptionalTag()
    const souvenir = await transaction({
      date: '2026-07-20',
      amount: -90,
      subcategoryId: accessoiresId,
    })
    await prisma.transactionTag.create({
      data: { transactionId: souvenir, tagId: tag },
    })
    await transaction({
      date: '2026-08-02',
      amount: -25,
      subcategoryId: accessoiresId,
    })

    const windows = [
      PLAN,
      WHOLE,
      { startDate: '2026-06-01', endDate: '2026-06-30' },
    ]
    // One at a time: the throwaway database serves one connection.
    const read = async (): Promise<unknown[]> => {
      const bodies: unknown[] = []
      for (const w of windows) {
        bodies.push(real(await budget(w)), real(await dashboard(w)))
      }
      return bodies
    }

    await prisma.transaction.update({
      where: { id },
      data: { amortizationMonths: null },
    })
    const before = await read()
    await prisma.transaction.update({
      where: { id },
      data: { amortizationMonths: 24 },
    })
    const after = await read()

    expect(after).toEqual(before)
  })

  it('reads everyday as real minus exceptional over the whole smoothing, per category and per line', async () => {
    await iphone()
    const tag = await exceptionalTag()
    const souvenir = await transaction({
      date: '2026-07-20',
      amount: -90,
      subcategoryId: telephoneId,
    })
    await prisma.transactionTag.create({
      data: { transactionId: souvenir, tagId: tag },
    })
    await transaction({
      date: '2026-08-02',
      amount: -25,
      subcategoryId: telephoneId,
    })

    const b = hightechOf(await budget(WHOLE))
    expect(b?.totalAmount).toBe(1415)
    expect(b?.exceptionalAmount).toBe(90)
    expect(b?.everydayAmount).toBe(1325)
    expect(lineOf(b, telephoneId)?.everydayAmount).toBe(1325)

    const d = hightechOf(await dashboard(WHOLE))
    expect(d?.amount).toBe(1415)
    expect(d?.everydayAmount).toBe(
      Math.round(((d?.amount ?? 0) - (d?.exceptionalAmount ?? 0)) * 100) / 100
    )
    expect(lineOf(d, telephoneId)?.everydayAmount).toBe(1325)
  })

  it('reads a slice as committed on the dashboard, month by month', async () => {
    await iphone()

    const body = await dashboard({
      startDate: '2026-06-01',
      endDate: '2026-07-31',
    })

    expect(
      body.monthlyData.map(m => [m.month, m.netExpenses, m.everydayNetExpenses])
    ).toEqual([
      ['2026-06', 1300, 54.17],
      ['2026-07', 0, 54.17],
    ])
    expect(body.everydaySpendingStructure).toMatchObject({
      committed: 108.34,
      variable: 0,
    })
  })

  it('ignores a smoothing on an income written past the service', async () => {
    await transaction({
      date: '2026-07-10',
      amount: 1200,
      type: 'INCOME',
      amortizationMonths: 12,
    })

    const body = await budget(PLAN)
    expect(body.amortizedPurchases).toBeUndefined()
    expect(hightechOf(body)?.everydayAmount).toBeUndefined()
  })

  it('reads a smoothed row carrying an exceptional tag as exceptional, the tag winning', async () => {
    const id = await transaction({
      date: '2026-07-12',
      amount: -1300,
      amortizationMonths: 24,
    })
    const tag = await exceptionalTag()
    // Past the service, which refuses it: sync or the legacy migration.
    await prisma.transactionTag.create({
      data: { transactionId: id, tagId: tag },
    })

    const body = await budget(PLAN)
    const hightech = hightechOf(body)
    expect(hightech?.totalAmount).toBe(1300)
    expect(hightech?.exceptionalAmount).toBe(1300)
    expect(hightech?.everydayAmount).toBe(0)
    expect(hightech?.amortizedAmount).toBeUndefined()
    expect(body.amortizedPurchases).toBeUndefined()
  })

  it('reads slices a future plan is already committed to', async () => {
    await iphone()

    const body = await budget({
      startDate: '2027-01-01',
      endDate: '2027-06-30',
    })
    expect(hightechOf(body)?.everydayMonthlyAmounts).toEqual(
      Array(6).fill(54.17)
    )
  })
})

/**
 * Only what the real reading says: every everyday and smoothing field out,
 * and the empty carriers the everyday reading adds — a category, a line or a
 * month only slices reach, whose real figures are all zero and which the
 * real reading would not list. Every real figure must then match.
 */
function real(body: unknown): unknown {
  if (Array.isArray(body)) {
    return body.filter(item => !isEmptyCarrier(item)).map(real)
  }
  if (body && typeof body === 'object') {
    return Object.fromEntries(
      Object.entries(body)
        .filter(
          ([key]) =>
            !/^everyday|^amortized/i.test(key) &&
            // Derived from the everyday structure's committed share.
            key !== 'remainingToLive'
        )
        .map(([key, value]) => [key, real(value)])
    )
  }
  return body
}

function isEmptyCarrier(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false
  const o = item as Record<string, unknown>
  if (o.transactionCount === 0) return true
  return (
    'month' in o &&
    'netExpenses' in o &&
    o.expenses === 0 &&
    o.netExpenses === 0 &&
    o.income === 0 &&
    o.exceptionalExpenses === 0
  )
}
