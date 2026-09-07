/**
 * The bank sync as HTTP, and the guards a person will actually meet.
 *
 * What matters here is not the happy path — that needs a bank — but that
 * every refusal is a refusal with a reason, and that nothing belonging to
 * another user is reachable by id.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

describe('Bank sync API (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  let connectionId: string
  let accountId: string

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
    connectionId = (
      await prisma.bankConnection.create({
        data: {
          userId,
          aspspName: 'Boursorama Banque',
          aspspCountry: 'FR',
          sessionId: 'session-1',
          consentValidUntil: new Date(Date.now() + 90 * 86_400_000),
        },
        select: { id: true },
      })
    ).id
  })

  async function link(
    overrides: { cashAccountType?: string; accountId?: string } = {}
  ): Promise<string> {
    const created = await prisma.bankAccountLink.create({
      data: {
        connectionId,
        userId,
        externalAccountId: `bank-${Math.random()}`,
        accountName: 'M BOILLEY RICHARD',
        cashAccountType: overrides.cashAccountType ?? 'CACC',
        ...(overrides.accountId !== undefined && {
          accountId: overrides.accountId,
        }),
      },
      select: { id: true },
    })
    return created.id
  }

  it('says whether this server can sync at all', async () => {
    const response = await request(ctx.server)
      .get('/bank-sync/status')
      .set(ctx.auth(owner))
      .expect(200)

    expect(response.body).toHaveProperty('configured')
  })

  it('lists a connection with what pressing sync would do', async () => {
    const response = await request(ctx.server)
      .get('/bank-sync/connections')
      .set(ctx.auth(owner))
      .expect(200)

    const body = response.body as { aspspName: string; action: string }[]
    expect(body).toHaveLength(1)
    expect(body[0]?.aspspName).toBe('Boursorama Banque')
    expect(body[0]?.action).toBe('fetch')
  })

  it('honours BANK_SYNC_MIN_INTERVAL_HOURS on the status a person sees, not just on the sync call itself', async () => {
    // A connection synced moments ago would normally still say "fetched less
    // than 8h ago" — the whole point of the override for local testing is
    // that the button offering to press it isn't disabled on that reason.
    // `viewConnection` computes this independently of `sync()`'s own check,
    // so it needs the same override or the button stays disabled regardless
    // of what the sync endpoint itself would have allowed.
    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: { lastSyncAt: new Date() },
    })

    const original = process.env.BANK_SYNC_MIN_INTERVAL_HOURS
    process.env.BANK_SYNC_MIN_INTERVAL_HOURS = '0'
    try {
      const response = await request(ctx.server)
        .get('/bank-sync/connections')
        .set(ctx.auth(owner))
        .expect(200)

      const body = response.body as { action: string; reason: string }[]
      expect(body[0]?.action).toBe('fetch')
    } finally {
      if (original === undefined)
        delete process.env.BANK_SYNC_MIN_INTERVAL_HOURS
      else process.env.BANK_SYNC_MIN_INTERVAL_HOURS = original
    }
  })

  it('shows another user nothing', async () => {
    const response = await request(ctx.server)
      .get('/bank-sync/connections')
      .set(ctx.auth(stranger))
      .expect(200)

    expect(response.body).toEqual([])
  })

  it('names which accounts still carry a row a sync lost the reference to', async () => {
    await prisma.transaction.create({
      data: {
        userId,
        accountId,
        hash: 'hash-orphaned',
        date: new Date('2026-08-25'),
        description: 'CARTE FITNESS PARK',
        amount: -39.99,
        type: 'EXPENSE',
        source: 'BANK_API',
        externalId: null,
      },
    })
    // A claimed CSV row is a different case entirely — never counted here.
    await prisma.transaction.create({
      data: {
        userId,
        accountId,
        hash: 'hash-claimed-csv',
        date: new Date('2026-08-20'),
        description: 'AUTRE',
        amount: -10,
        type: 'EXPENSE',
        externalId: 'ENTRY-CLAIMED',
      },
    })

    const response = await request(ctx.server)
      .get('/bank-sync/needs-review')
      .set(ctx.auth(owner))
      .expect(200)

    expect(response.body).toEqual([
      { accountId, accountLabel: 'Perso Bourso', count: 1 },
    ])
  })

  it('shows another user none of it', async () => {
    await prisma.transaction.create({
      data: {
        userId,
        accountId,
        hash: 'hash-orphaned-2',
        date: new Date('2026-08-25'),
        description: 'CARTE FITNESS PARK',
        amount: -39.99,
        type: 'EXPENSE',
        source: 'BANK_API',
        externalId: null,
      },
    })

    const response = await request(ctx.server)
      .get('/bank-sync/needs-review')
      .set(ctx.auth(stranger))
      .expect(200)

    expect(response.body).toEqual([])
  })

  it('refuses to show one connection to anyone else', async () => {
    await request(ctx.server)
      .get(`/bank-sync/connections/${connectionId}`)
      .set(ctx.auth(stranger))
      .expect(404)
  })

  it('records which account a bank account is', async () => {
    const id = await link()

    const response = await request(ctx.server)
      .patch(`/bank-sync/links/${id}`)
      .set(ctx.auth(owner))
      .send({ accountId })
      .expect(200)

    expect((response.body as { accountLabel: string }).accountLabel).toBe(
      'Perso Bourso'
    )
  })

  it('refuses to read a card account', async () => {
    // Its purchases are already reported by the account it settles onto.
    const id = await link({ cashAccountType: 'CARD', accountId })

    const response = await request(ctx.server)
      .patch(`/bank-sync/links/${id}`)
      .set(ctx.auth(owner))
      .send({ isIngested: true })
      .expect(400)

    expect((response.body as { message: string }).message).toContain(
      'counts each of them twice'
    )
  })

  it('refuses to read an account nobody has identified', async () => {
    const id = await link()

    const response = await request(ctx.server)
      .patch(`/bank-sync/links/${id}`)
      .set(ctx.auth(owner))
      .send({ isIngested: true })
      .expect(400)

    expect((response.body as { message: string }).message).toContain(
      'nowhere to go'
    )
  })

  it('refuses an account belonging to someone else', async () => {
    const id = await link()
    const theirs = await prisma.user.findFirstOrThrow({
      where: { NOT: { id: userId } },
    })
    const theirAccount = await prisma.account.create({
      data: { userId: theirs.id, name: 'Leur compte' },
    })

    await request(ctx.server)
      .patch(`/bank-sync/links/${id}`)
      .set(ctx.auth(owner))
      .send({ accountId: theirAccount.id })
      .expect(404)
  })

  it('refuses to sync a connection with nothing enabled', async () => {
    await link({ accountId })

    const response = await request(ctx.server)
      .post(`/bank-sync/connections/${connectionId}/sync`)
      .set(ctx.auth(owner))
      .expect(400)

    expect((response.body as { message: string }).message).toContain(
      'nothing to read'
    )
  })

  it('asks for a reconnection rather than calling a bank that has stopped answering', async () => {
    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: { status: 'EXPIRED' },
    })

    const response = await request(ctx.server)
      .post(`/bank-sync/connections/${connectionId}/sync`)
      .set(ctx.auth(owner))
      .expect(400)

    expect((response.body as { message: string }).message).toContain('consent')
  })

  it('refuses to sync a connection belonging to someone else', async () => {
    await request(ctx.server)
      .post(`/bank-sync/connections/${connectionId}/sync`)
      .set(ctx.auth(stranger))
      .expect(404)
  })
})
