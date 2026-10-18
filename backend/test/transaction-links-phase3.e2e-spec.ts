/**
 * The links of phase 3, against the real endpoints and the real SQL.
 *
 * A breakdown line of the Dashboard and the Budget is now the subcategory a
 * row is filed under — its id — rather than the legacy text column, so the
 * line and the list its link opens count the same rows. The unit specs pin
 * the parsing and the where clauses; this is where the joins, the fallbacks
 * and the user scoping are exercised for real.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

interface BreakdownLine {
  subcategoryId: string | null
  subcategory: string
  transactionCount: number
}

describe('GET /transactions phase 3 link filters (e2e)', () => {
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
  const nextHash = (): string => `e2e-link3-${(sequence += 1)}`

  beforeEach(async () => {
    await prisma.user.deleteMany()
    const me = await http().get('/users/me').set(ctx.auth(owner))
    userId = (me.body as { id: string }).id
    await http().get('/users/me').set(ctx.auth(stranger))
    accountId = (
      await prisma.account.create({ data: { userId, name: 'Courant' } })
    ).id
  })

  async function category(
    name: string,
    extra: {
      defaultNature?: 'ESSENTIAL' | 'PLEASURE' | null
      defaultRhythm?: 'COMMITTED' | 'VARIABLE' | null
      userId?: string
    } = {}
  ): Promise<string> {
    const row = await prisma.category.create({
      data: {
        userId: extra.userId ?? userId,
        name,
        type: 'EXPENSE',
        defaultNature: extra.defaultNature ?? null,
        defaultRhythm: extra.defaultRhythm ?? null,
      },
    })
    return row.id
  }

  async function subcategory(
    categoryId: string,
    name: string,
    extra: {
      nature?: 'ESSENTIAL' | 'PLEASURE' | null
      rhythm?: 'COMMITTED' | 'VARIABLE' | null
    } = {}
  ): Promise<string> {
    const row = await prisma.subcategory.create({
      data: {
        userId,
        categoryId,
        name,
        nature: extra.nature ?? null,
        rhythm: extra.rhythm ?? null,
      },
    })
    return row.id
  }

  async function expense(
    amount: number,
    extra: {
      categoryId?: string | null
      subcategoryId?: string | null
      /** The legacy text column, which may disagree with the id. */
      subcategory?: string | null
      date?: string
      description?: string
      userId?: string
      accountId?: string
    } = {}
  ): Promise<string> {
    const row = await prisma.transaction.create({
      data: {
        userId: extra.userId ?? userId,
        accountId: extra.accountId ?? accountId,
        hash: nextHash(),
        date: new Date(extra.date ?? '2026-08-12'),
        description: extra.description ?? 'CB',
        amount: -amount,
        type: 'EXPENSE',
        categoryId: extra.categoryId ?? null,
        subcategoryId: extra.subcategoryId ?? null,
        subcategory: extra.subcategory ?? null,
      },
    })
    return row.id
  }

  async function listIds(query: Record<string, string>): Promise<string[]> {
    const response = await http()
      .get('/transactions')
      .query({ limit: '100', ...query })
      .set(ctx.auth(owner))
    expect(response.status).toBe(200)
    return (response.body as { data: Array<{ id: string }> }).data
      .map(t => t.id)
      .sort()
  }

  describe('subcategory breakdowns, by the real subcategory', () => {
    it('the Dashboard and the Budget name each line by its id, and its link counts the same rows', async () => {
      const food = await category('Alimentation e2e')
      const groceries = await subcategory(food, 'Courses')
      const dining = await subcategory(food, 'Restaurant')
      // The text column says « Restaurant », the id says « Courses »: the
      // id wins, as it does for the link.
      await expense(10, {
        categoryId: food,
        subcategoryId: groceries,
        subcategory: 'Restaurant',
      })
      await expense(20, {
        categoryId: food,
        subcategoryId: groceries,
        subcategory: 'Courses',
      })
      await expense(30, {
        categoryId: food,
        subcategoryId: dining,
        subcategory: null,
      })
      // Text without an id: filed at the category alone.
      await expense(40, { categoryId: food, subcategory: 'Courses' })

      const dashboard = await http()
        .post('/dashboard/summary')
        .set(ctx.auth(owner))
        .send({
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          includeCategoryBreakdown: true,
          deductReimbursements: false,
          deductPendingReimbursements: false,
        })
      expect(dashboard.status).toBe(201)
      const dashCategory = (
        dashboard.body as {
          expensesByCategory: Array<{
            categoryId: string
            amount: number
            subcategories: BreakdownLine[]
          }>
        }
      ).expensesByCategory.find(c => c.categoryId === food)
      expect(dashCategory?.amount).toBe(100)

      const budget = await http()
        .post('/budgets/statistics')
        .set(ctx.auth(owner))
        .send({
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          deductReimbursements: false,
          deductPendingReimbursements: false,
        })
      expect(budget.status).toBe(201)
      const budgetCategory = (
        budget.body as {
          expensesByCategory: Array<{
            categoryId: string
            totalAmount: number
            subcategories: BreakdownLine[]
          }>
        }
      ).expensesByCategory.find(c => c.categoryId === food)
      expect(budgetCategory?.totalAmount).toBe(100)

      const expected = [
        [groceries, 'Courses', 2],
        [dining, 'Restaurant', 1],
        [null, '', 1],
      ]
      const shape = (lines: BreakdownLine[] | undefined): unknown[][] =>
        (lines ?? [])
          .map(l => [l.subcategoryId, l.subcategory, l.transactionCount])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      const sortedExpected = [...expected].sort((a, b) =>
        String(a[0]).localeCompare(String(b[0]))
      )
      expect(shape(dashCategory?.subcategories)).toEqual(sortedExpected)
      expect(shape(budgetCategory?.subcategories)).toEqual(sortedExpected)

      // Each line's link opens exactly as many rows as it counts.
      for (const line of dashCategory?.subcategories ?? []) {
        const ids = await listIds({
          categoryId: food,
          subcategoryId: line.subcategoryId ?? 'none',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        })
        expect(ids).toHaveLength(line.transactionCount)
      }
    })
  })
})
