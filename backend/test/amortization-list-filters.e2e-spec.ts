/**
 * Lot 2 of the smoothed purchases (agent-os/product/amortization-framework.md):
 * the list filters behind the screens, against the real endpoint and SQL.
 *
 * - `amortized=true` is the « Lissées » filter of the Transactions page.
 * - `alsoIds` is how a budget cell read « Vie courante » opens its rows: the
 *   cell counts the slices of a purchase dated in another month, so its link
 *   names that purchase on top of the category and month it filters on. A
 *   union, scoped to the user: naming someone else's row shows nothing more.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

describe('GET /transactions smoothing filters (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  let strangerId: string
  let accountId: string
  let strangerAccountId: string

  beforeAll(async () => {
    ctx = await createE2eApp([owner, stranger])
    prisma = ctx.prisma
  })

  afterAll(async () => {
    await ctx.close()
  })

  const http = (): request.Agent => request(ctx.server)

  let sequence = 0
  const nextHash = (): string => `e2e-amort-list-${(sequence += 1)}`

  beforeEach(async () => {
    await prisma.user.deleteMany()
    userId = (
      (await http().get('/users/me').set(ctx.auth(owner))).body as {
        id: string
      }
    ).id
    strangerId = (
      (await http().get('/users/me').set(ctx.auth(stranger))).body as {
        id: string
      }
    ).id
    accountId = (
      await prisma.account.create({ data: { userId, name: 'Courant' } })
    ).id
    strangerAccountId = (
      await prisma.account.create({
        data: { userId: strangerId, name: 'Autre' },
      })
    ).id
  })

  async function expense(
    amount: number,
    date: string,
    extra: {
      categoryId?: string
      amortizationMonths?: number
      mine?: boolean
    } = {}
  ): Promise<string> {
    const mine = extra.mine ?? true
    const row = await prisma.transaction.create({
      data: {
        userId: mine ? userId : strangerId,
        accountId: mine ? accountId : strangerAccountId,
        hash: nextHash(),
        date: new Date(date),
        description: 'CB',
        amount: -amount,
        type: 'EXPENSE',
        categoryId: extra.categoryId ?? null,
        amortizationMonths: extra.amortizationMonths ?? null,
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

  it('« Lissées » keeps the smoothed rows only', async () => {
    const phone = await expense(1300, '2026-06-10', { amortizationMonths: 24 })
    await expense(40, '2026-06-11')

    expect(await listIds({ amortized: 'true' })).toEqual([phone])
  })

  it('a cell opens its month and the purchase whose slice it counts', async () => {
    const tech = (
      await prisma.category.create({
        data: { userId, name: 'High-tech e2e', type: 'EXPENSE' },
      })
    ).id
    const phone = await expense(1300, '2026-06-10', {
      categoryId: tech,
      amortizationMonths: 24,
    })
    const cable = await expense(15, '2026-08-03', { categoryId: tech })
    // Same month, another category: the union does not widen the filter.
    await expense(60, '2026-08-04')
    const theirs = await expense(500, '2026-06-10', {
      mine: false,
      amortizationMonths: 12,
    })

    const cell = {
      categoryId: tech,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      exceptional: 'exclude',
    }
    expect(await listIds(cell)).toEqual([cable])
    expect(await listIds({ ...cell, alsoIds: `${phone},${theirs}` })).toEqual(
      [cable, phone].sort()
    )
  })
})
