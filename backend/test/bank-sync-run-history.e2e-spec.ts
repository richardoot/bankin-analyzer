/**
 * Sync history: seeing past runs, and undoing one — the same idea as the CSV
 * import history, applied to a run instead of an import.
 *
 * `Transaction.syncRunId` is what makes both possible: every row a run
 * touched says so, so a list can count them and an undo can find exactly
 * what to give back. What matters here is that undoing deletes only what was
 * inserted, unlinks only what was claimed, never touches a row that has
 * gained work since, and that a run already undone refuses a second attempt
 * rather than doing nothing twice.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

describe('Bank sync run history (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  let accountId: string
  let runId: string

  beforeAll(async () => {
    ctx = await createE2eApp([owner, stranger])
    prisma = ctx.prisma
  }, 60000)

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await prisma.user.deleteMany()
    const me = await request(ctx.server).get('/users/me').set(ctx.auth(owner))
    userId = (me.body as { id: string }).id
    await request(ctx.server).get('/users/me').set(ctx.auth(stranger))

    accountId = (
      await prisma.account.create({
        data: { userId, name: 'Perso Bourso' },
        select: { id: true },
      })
    ).id
    runId = (
      await prisma.bankSyncRun.create({
        data: {
          userId,
          aspspName: 'Boursorama Banque',
          fetchedAt: new Date('2026-09-01'),
        },
        select: { id: true },
      })
    ).id
  })

  async function insertedRow(
    overrides: {
      id?: string
      hash?: string
    } = {}
  ) {
    return prisma.transaction.create({
      data: {
        userId,
        accountId,
        hash: overrides.hash ?? `hash-inserted-${Math.random()}`,
        date: new Date('2026-08-25'),
        description: 'CB Fitness Park',
        amount: -39.99,
        type: 'EXPENSE',
        source: 'BANK_API',
        externalId: 'ENTRY-1',
        syncRunId: runId,
      },
      select: { id: true },
    })
  }

  async function claimedRow() {
    return prisma.transaction.create({
      data: {
        userId,
        accountId,
        hash: `hash-claimed-${Math.random()}`,
        date: new Date('2026-08-20'),
        description: 'CB Auchan',
        amount: -10,
        type: 'EXPENSE',
        externalId: 'ENTRY-2',
        bookingStatus: 'BOOK',
        syncRunId: runId,
        note: 'écrit à la main',
      },
      select: { id: true },
    })
  }

  it('lists a run with what it inserted and claimed', async () => {
    await insertedRow()
    await claimedRow()

    const response = await request(ctx.server)
      .get('/bank-sync/runs')
      .set(ctx.auth(owner))
      .expect(200)

    expect(response.body).toEqual([
      expect.objectContaining({
        id: runId,
        aspspName: 'Boursorama Banque',
        inserted: 1,
        claimed: 1,
        undoneAt: null,
      }),
    ])
  })

  it('shows another user nothing', async () => {
    await insertedRow()

    const response = await request(ctx.server)
      .get('/bank-sync/runs')
      .set(ctx.auth(stranger))
      .expect(200)

    expect(response.body).toEqual([])
  })

  it('previews an undo without writing anything', async () => {
    const inserted = await insertedRow()
    await claimedRow()

    const response = await request(ctx.server)
      .post(`/bank-sync/runs/${runId}/undo/preview`)
      .set(ctx.auth(owner))
      .expect(201)

    expect(response.body).toEqual({ deleted: 1, unlinked: 1, blocked: 0 })
    expect(
      await prisma.transaction.findUnique({ where: { id: inserted.id } })
    ).not.toBeNull()
  })

  it('deletes what it inserted, unlinks what it only claimed', async () => {
    const inserted = await insertedRow()
    const claimed = await claimedRow()

    const response = await request(ctx.server)
      .post(`/bank-sync/runs/${runId}/undo`)
      .set(ctx.auth(owner))
      .expect(201)

    expect(response.body).toEqual({ deleted: 1, unlinked: 1, blocked: 0 })
    expect(
      await prisma.transaction.findUnique({ where: { id: inserted.id } })
    ).toBeNull()
    const restored = await prisma.transaction.findUniqueOrThrow({
      where: { id: claimed.id },
    })
    expect(restored.externalId).toBeNull()
    expect(restored.bookingStatus).toBeNull()
    expect(restored.syncRunId).toBeNull()
    expect(restored.note).toBe('écrit à la main')

    const run = await prisma.bankSyncRun.findUniqueOrThrow({
      where: { id: runId },
    })
    expect(run.undoneAt).not.toBeNull()

    const listed = await request(ctx.server)
      .get('/bank-sync/runs')
      .set(ctx.auth(owner))
      .expect(200)
    expect(listed.body).toEqual([
      expect.objectContaining({ inserted: 0, claimed: 0 }),
    ])
  })

  it('never deletes an inserted row that has since been tagged', async () => {
    const inserted = await insertedRow()
    const tag = await prisma.tag.create({
      data: { userId, name: 'À vérifier' },
      select: { id: true },
    })
    await prisma.transactionTag.create({
      data: { transactionId: inserted.id, tagId: tag.id },
    })

    const response = await request(ctx.server)
      .post(`/bank-sync/runs/${runId}/undo`)
      .set(ctx.auth(owner))
      .expect(201)

    expect(response.body).toEqual({ deleted: 0, unlinked: 0, blocked: 1 })
    const stillThere = await prisma.transaction.findUnique({
      where: { id: inserted.id },
      include: { tags: true },
    })
    expect(stillThere).not.toBeNull()
    expect(stillThere?.tags).toHaveLength(1)
  })

  it('refuses a second undo of the same run', async () => {
    await insertedRow()

    await request(ctx.server)
      .post(`/bank-sync/runs/${runId}/undo`)
      .set(ctx.auth(owner))
      .expect(201)

    await request(ctx.server)
      .post(`/bank-sync/runs/${runId}/undo`)
      .set(ctx.auth(owner))
      .expect(400)
  })

  it('is not reachable by a stranger', async () => {
    await insertedRow()

    await request(ctx.server)
      .post(`/bank-sync/runs/${runId}/undo/preview`)
      .set(ctx.auth(stranger))
      .expect(404)

    await request(ctx.server)
      .post(`/bank-sync/runs/${runId}/undo`)
      .set(ctx.auth(stranger))
      .expect(404)
  })
})
