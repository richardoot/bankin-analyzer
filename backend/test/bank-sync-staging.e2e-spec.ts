/**
 * Phase 2: what the bank sent is kept aside, and the ledger is not touched.
 *
 * Two things are worth proving against real Postgres rather than a mock.
 *
 * The first is the date. A booking date has no time of day, and storing one is
 * how the CSV import previously drifted a day for every timezone east of UTC —
 * the drift `scripts/normalize-transaction-dates.ts` exists to repair. The
 * column is a DATE for that reason, and reading it back through node-postgres
 * yields a JS Date at *local* midnight, which prints as 22:00 the previous day
 * in Paris. That display is not the storage, and a reader who "fixes" it would
 * introduce exactly the bug the DATE type prevents. So the assertion is made
 * on the stored text.
 *
 * The second is that staging stages: after writing a run, `app.transactions`
 * holds precisely what it held before.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

describe('Bank sync staging (e2e)', () => {
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

  async function run(): Promise<string> {
    const created = await prisma.bankSyncRun.create({
      data: {
        userId,
        aspspName: 'Boursorama Banque',
        sessionId: 'session-1',
        fetchedAt: new Date('2026-09-02T10:00:00.000Z'),
      },
      select: { id: true },
    })
    return created.id
  }

  async function stage(
    runId: string,
    overrides: Partial<{
      externalAccountId: string
      externalId: string | null
      date: string
      amount: number
      label: string
    }> = {}
  ): Promise<string> {
    const created = await prisma.bankStagedTransaction.create({
      data: {
        runId,
        userId,
        externalAccountId: overrides.externalAccountId ?? 'acc-api-1',
        accountName: 'Carte Visa Ultim - RICHARD BOILLEY',
        externalId:
          overrides.externalId === undefined ? 'ENTRY-1' : overrides.externalId,
        bookingStatus: 'BOOK',
        date: new Date(overrides.date ?? '2024-09-02'),
        amount: overrides.amount ?? -39.99,
        label: overrides.label ?? 'CARTE 25/08/26 APPLE.COM/BILL CB*7962',
        raw: { entry_reference: 'ENTRY-1', booking_date: '2024-09-02' },
      },
      select: { id: true },
    })
    return created.id
  }

  it('stores the booking date the bank gave, with no timezone drift', async () => {
    const runId = await run()
    await stage(runId, { date: '2024-09-02' })

    // Read as text: the driver's JS Date would say 2024-09-01T22:00Z in Paris
    // and prove nothing about what Postgres holds.
    const [row] = await prisma.$queryRaw<{ stored: string }[]>`
      SELECT "date"::text AS stored FROM "app"."bank_staged_transactions"
    `
    expect(row?.stored).toBe('2024-09-02')
  })

  it('keeps the untouched payload alongside the reduced row', async () => {
    const runId = await run()
    const id = await stage(runId)

    const staged = await prisma.bankStagedTransaction.findUniqueOrThrow({
      where: { id },
      select: { raw: true },
    })
    expect(staged.raw).toMatchObject({ entry_reference: 'ENTRY-1' })
  })

  it('does not write anything into the ledger', async () => {
    const runId = await run()
    await stage(runId)
    await stage(runId, { externalId: 'ENTRY-2' })

    expect(await prisma.transaction.count()).toBe(0)
  })

  it('refuses the same bank reference twice on one account within a run', async () => {
    // Re-staging a fetch must not stack a second copy of it.
    const runId = await run()
    await stage(runId, { externalId: 'ENTRY-1' })

    await expect(stage(runId, { externalId: 'ENTRY-1' })).rejects.toThrow()
  })

  it('allows the same reference on two accounts of the same bank', async () => {
    // Boursorama reports one card purchase on the card and on the current
    // account. Staging must hold both — recognising them is a later decision,
    // and it cannot be made on data that was refused at the door.
    const runId = await run()
    await stage(runId, { externalAccountId: 'card', externalId: 'ENTRY-1' })

    await expect(
      stage(runId, { externalAccountId: 'current', externalId: 'ENTRY-1' })
    ).resolves.toBeDefined()
  })

  it('lets a later run stage the same reference again', async () => {
    // Two fetches of an overlapping window are normal; the uniqueness is per
    // run, so the second one is not rejected as a duplicate of the first.
    const first = await run()
    await stage(first, { externalId: 'ENTRY-1' })

    const second = await run()
    await expect(
      stage(second, { externalId: 'ENTRY-1' })
    ).resolves.toBeDefined()
  })

  it('takes the staged rows with the run when it is deleted', async () => {
    const runId = await run()
    await stage(runId)

    await prisma.bankSyncRun.delete({ where: { id: runId } })

    expect(await prisma.bankStagedTransaction.count()).toBe(0)
  })
})
