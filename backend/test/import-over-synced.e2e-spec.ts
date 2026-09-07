/**
 * Importing an export over a month the bank sync already wrote.
 *
 * This is the one path that corrupted data. The import deduplicates on a hash
 * computed over the description, and the two sources word the same transaction
 * differently — `CB Protiming` against `CARTE 31/08/24 PROTIMING CB*7962` — so
 * a synced month arrived looking entirely new and was inserted a second time.
 * Measured on real rows before this existed: wrong every time.
 *
 * The duplicate that resulted was the worst kind: it carried no bank
 * reference, so no later sync would ever recognise it, and nothing downstream
 * had any way to tell the two apart.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

describe('Importing over synced rows (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  let accountId: string

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
      await prisma.account.create({
        data: { userId, name: 'Perso Bourso' },
        select: { id: true },
      })
    ).id
  })

  /** A row the sync wrote: the bank's wording, and its reference. */
  async function syncedRow(
    overrides: {
      description?: string
      amount?: number
      date?: string
      externalId?: string
      categoryId?: string | null
    } = {}
  ): Promise<string> {
    const created = await prisma.transaction.create({
      data: {
        userId,
        accountId,
        hash: `synced-${Math.random()}`,
        date: new Date(overrides.date ?? '2026-08-25'),
        description:
          overrides.description ?? 'CARTE 25/08/26 PROTIMING    CB*7962',
        amount: overrides.amount ?? -39.99,
        type: 'EXPENSE',
        source: 'BANK_API',
        externalId: overrides.externalId ?? 'ENTRY-1',
        bookingStatus: 'BOOK',
        ...(overrides.categoryId !== undefined && {
          categoryId: overrides.categoryId,
        }),
      },
      select: { id: true },
    })
    return created.id
  }

  /** The same movement as an export words it. */
  function csvRow(
    overrides: { description?: string; amount?: number; date?: string } = {}
  ) {
    return {
      date: `${overrides.date ?? '2026-08-25'}T00:00:00.000Z`,
      description: overrides.description ?? 'CB Protiming',
      amount: overrides.amount ?? -39.99,
      category: 'Loisirs',
      account: 'Perso Bourso',
      type: 'EXPENSE' as const,
    }
  }

  const preview = (transactions: unknown[]) =>
    request(ctx.server)
      .post('/transactions/import/preview')
      .set(ctx.auth(owner))
      .send({ transactions })

  const doImport = (transactions: unknown[]) =>
    request(ctx.server)
      .post('/transactions/import')
      .set(ctx.auth(owner))
      .send({ transactions })

  it('reports the synced row as an existing duplicate', async () => {
    await syncedRow()

    const response = await preview([csvRow()]).expect(201)
    const body = response.body as {
      newCount: number
      externalDuplicateCount: number
      externalDuplicates: { existing: { description: string } }[]
    }

    expect(body.externalDuplicateCount).toBe(1)
    expect(body.newCount).toBe(0)
    expect(body.externalDuplicates[0]?.existing.description).toContain(
      'PROTIMING'
    )
  })

  it('does not insert it a second time', async () => {
    await syncedRow()

    await doImport([csvRow()]).expect(201)

    expect(await prisma.transaction.count({ where: { userId } })).toBe(1)
  })

  it('leaves the synced row exactly as it was', async () => {
    // It may already carry a category, a tag, a reimbursement. An import has
    // nothing to add that is worth the risk of overwriting any of it.
    const id = await syncedRow()

    await doImport([csvRow()]).expect(201)

    const row = await prisma.transaction.findUniqueOrThrow({ where: { id } })
    expect(row.source).toBe('BANK_API')
    expect(row.externalId).toBe('ENTRY-1')
    expect(row.description).toBe('CARTE 25/08/26 PROTIMING    CB*7962')
  })

  it('tolerates the days the two sources disagree by', async () => {
    await syncedRow({ date: '2026-08-25' })

    await doImport([csvRow({ date: '2026-08-27' })]).expect(201)

    expect(await prisma.transaction.count({ where: { userId } })).toBe(1)
  })

  it('still imports a transaction the sync never saw', async () => {
    await syncedRow()

    await doImport([
      csvRow(),
      csvRow({ description: 'CB Boulangerie', amount: -12.5 }),
    ]).expect(201)

    expect(await prisma.transaction.count({ where: { userId } })).toBe(2)
  })

  it('does not mistake a different amount for the same movement', async () => {
    await syncedRow({ amount: -39.99 })

    await doImport([csvRow({ amount: -40.99 })]).expect(201)

    expect(await prisma.transaction.count({ where: { userId } })).toBe(2)
  })

  it('never matches two CSV rows onto one synced row', async () => {
    // Two purchases the same day for the same amount, worded differently — so
    // the hash keeps both — and both resembling the synced row. Exactly one may
    // claim it; the other is a transaction in its own right.
    //
    // Two identical rows would not test this: they share a hash and are
    // already dropped as an internal duplicate before reaching the matcher.
    await syncedRow()

    await doImport([
      csvRow({ description: 'CB Protiming' }),
      csvRow({ description: 'CB Protiming Bordeaux' }),
    ]).expect(201)

    // The synced row, plus whichever of the two did not claim it.
    expect(await prisma.transaction.count({ where: { userId } })).toBe(2)
    expect(
      await prisma.transaction.count({
        where: { userId, source: 'BANKIN_CSV' },
      })
    ).toBe(1)
  })

  it('leaves rows the sync never touched to the hash', async () => {
    // A CSV row must not be reported as a duplicate of another CSV row on
    // amount and date alone — that would invent duplicates that are not there.
    await prisma.transaction.create({
      data: {
        userId,
        accountId,
        hash: 'csv-row',
        date: new Date('2026-08-25'),
        description: 'Autre chose',
        amount: -39.99,
        type: 'EXPENSE',
      },
    })

    const response = await preview([csvRow()]).expect(201)

    expect((response.body as { newCount: number }).newCount).toBe(1)
  })
})
