/**
 * Phase 1 of the bank sync: a transaction gains an identity the bank owns.
 *
 * The columns are inert — nothing writes `external_id` yet — so what is worth
 * proving is that they behave as the migration claims against real Postgres,
 * before phase 4 starts depending on it:
 *
 *   - existing rows are BANKIN_CSV without anyone updating them,
 *   - one bank reference cannot be filed twice on the same account,
 *   - the CSV rows, which have no reference at all, are untouched by that
 *     constraint — Postgres counts NULLs as distinct, and if it did not, the
 *     second import into an account would fail outright,
 *   - the same reference on two accounts is allowed, which is both what the
 *     API's uniqueness rule requires and how Boursorama's double reporting
 *     slips through.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

describe('Transaction identity (e2e)', () => {
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

  async function account(name: string): Promise<string> {
    const created = await prisma.account.create({ data: { userId, name } })
    return created.id
  }

  async function transaction(
    accountId: string,
    hash: string,
    externalId?: string
  ): Promise<{ id: string }> {
    return prisma.transaction.create({
      data: {
        userId,
        accountId,
        hash,
        date: new Date('2026-08-25'),
        description: 'APPLE.COM/BILL',
        amount: -39.99,
        type: 'EXPENSE',
        ...(externalId !== undefined && { externalId }),
      },
      select: { id: true },
    })
  }

  it('files a row as coming from a CSV unless told otherwise', async () => {
    const accountId = await account('Compte courant')
    const { id } = await transaction(accountId, 'hash-1')

    const row = await prisma.transaction.findUniqueOrThrow({
      where: { id },
      select: { source: true, externalId: true, bookingStatus: true },
    })

    expect(row.source).toBe('BANKIN_CSV')
    expect(row.externalId).toBeNull()
    expect(row.bookingStatus).toBeNull()
  })

  it('refuses the same bank reference twice on one account', async () => {
    const accountId = await account('Compte courant')
    await transaction(accountId, 'hash-1', 'ENTRY-REF-1')

    await expect(
      transaction(accountId, 'hash-2', 'ENTRY-REF-1')
    ).rejects.toThrow()
  })

  it('lets the same reference exist on two different accounts', async () => {
    // The API states the reference is unique per account, not globally — and
    // this is also the shape of Boursorama's double reporting, which the
    // constraint deliberately does not catch.
    const card = await account('Carte Visa Ultim')
    const current = await account('Compte courant')

    await transaction(card, 'hash-card', 'ENTRY-REF-1')

    await expect(
      transaction(current, 'hash-current', 'ENTRY-REF-1')
    ).resolves.toBeDefined()
  })

  it('lets an account hold many rows with no reference at all', async () => {
    // If NULLs collided, the second CSV row imported into an account would be
    // rejected — the whole existing import path would stop working.
    const accountId = await account('Compte courant')

    await transaction(accountId, 'hash-1')
    await transaction(accountId, 'hash-2')
    await transaction(accountId, 'hash-3')

    expect(await prisma.transaction.count({ where: { accountId } })).toBe(3)
  })

  it('keeps the CSV import writing CSV rows', async () => {
    // The behaviour that must not change: importing through the existing
    // endpoint still produces rows marked BANKIN_CSV, with no bank identity.
    await request(ctx.server)
      .post('/transactions/import')
      .set(ctx.auth(owner))
      .send({
        transactions: [
          {
            date: '2026-08-25T00:00:00.000Z',
            description: 'CB Apple.com/bill',
            amount: -39.99,
            category: 'Abonnements',
            account: 'Perso Bourso',
            type: 'EXPENSE',
          },
        ],
      })
      .expect(201)

    const rows = await prisma.transaction.findMany({
      where: { userId },
      select: { source: true, externalId: true },
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.source).toBe('BANKIN_CSV')
    expect(rows[0]?.externalId).toBeNull()
  })
})
