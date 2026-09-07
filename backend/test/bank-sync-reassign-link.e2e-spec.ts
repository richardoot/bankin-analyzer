/**
 * Correcting which account a bank account is — not just for the next sync,
 * but for what an earlier, wrong mapping already wrote.
 *
 * A plain reassignment (no history to fix) is covered by
 * `bank-sync-api.e2e-spec.ts`'s ownership checks; what matters here is the
 * three things a wrong mapping can have done — inserted a row nothing else
 * knows about, inserted a row the correct account already had via CSV, and
 * claimed a CSV row by coincidence — and the one thing this must never do:
 * take a tag, a reimbursement, a settlement or a payment with it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

describe('Correcting a bank account link (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  let oldAccountId: string
  let newAccountId: string
  let connectionId: string
  let linkId: string

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

    oldAccountId = (
      await prisma.account.create({
        data: { userId, name: 'Carte Visa Ultim' },
        select: { id: true },
      })
    ).id
    newAccountId = (
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
        },
        select: { id: true },
      })
    ).id
    linkId = (
      await prisma.bankAccountLink.create({
        data: {
          connectionId,
          userId,
          externalAccountId: 'bank-acc-1',
          accountName: 'M BOILLEY RICHARD',
          accountId: oldAccountId,
          isIngested: true,
        },
        select: { id: true },
      })
    ).id

    // What a run wrote under the wrong account: staged, then landed.
    await prisma.bankStagedTransaction.create({
      data: {
        runId: (
          await prisma.bankSyncRun.create({
            data: {
              userId,
              aspspName: 'Boursorama Banque',
              fetchedAt: new Date(),
            },
            select: { id: true },
          })
        ).id,
        userId,
        externalAccountId: 'bank-acc-1',
        accountName: 'M BOILLEY RICHARD',
        externalId: 'ENTRY-1',
        date: new Date('2026-08-25'),
        amount: -39.99,
        label: 'CARTE FITNESS PARK',
        raw: {},
      },
    })
  })

  function preview(accountId: string | null) {
    return request(ctx.server)
      .post(`/bank-sync/links/${linkId}/reassignment/preview`)
      .set(ctx.auth(owner))
      .send({ accountId })
  }

  function reassign(accountId: string | null) {
    return request(ctx.server)
      .post(`/bank-sync/links/${linkId}/reassignment`)
      .set(ctx.auth(owner))
      .send({ accountId })
  }

  it('moves a row nothing on the corrected account already had', async () => {
    const inserted = await prisma.transaction.create({
      data: {
        userId,
        accountId: oldAccountId,
        hash: 'hash-inserted',
        date: new Date('2026-08-25'),
        description: 'CARTE FITNESS PARK',
        amount: -39.99,
        type: 'EXPENSE',
        source: 'BANK_API',
        externalId: 'ENTRY-1',
      },
      select: { id: true },
    })

    const response = await reassign(newAccountId).expect(201)
    expect(response.body).toMatchObject({ moved: 1, merged: 0 })

    const row = await prisma.transaction.findUniqueOrThrow({
      where: { id: inserted.id },
    })
    expect(row.accountId).toBe(newAccountId)
    expect(row.externalId).toBe('ENTRY-1')

    const link = await prisma.bankAccountLink.findUniqueOrThrow({
      where: { id: linkId },
    })
    expect(link.accountId).toBe(newAccountId)
  })

  it('merges into an existing CSV row instead of duplicating it', async () => {
    const inserted = await prisma.transaction.create({
      data: {
        userId,
        accountId: oldAccountId,
        hash: 'hash-inserted',
        date: new Date('2026-08-25'),
        description: 'CARTE FITNESS PARK',
        amount: -39.99,
        type: 'EXPENSE',
        source: 'BANK_API',
        externalId: 'ENTRY-1',
      },
      select: { id: true },
    })
    const existingOnCorrectAccount = await prisma.transaction.create({
      data: {
        userId,
        accountId: newAccountId,
        hash: 'hash-existing-csv',
        date: new Date('2026-08-25'),
        description: 'CARTE FITNESS PARK',
        amount: -39.99,
        type: 'EXPENSE',
      },
      select: { id: true },
    })

    const response = await reassign(newAccountId).expect(201)
    expect(response.body).toMatchObject({ moved: 0, merged: 1 })

    expect(
      await prisma.transaction.findUnique({ where: { id: inserted.id } })
    ).toBeNull()
    const claimed = await prisma.transaction.findUniqueOrThrow({
      where: { id: existingOnCorrectAccount.id },
    })
    expect(claimed.externalId).toBe('ENTRY-1')
    expect(claimed.accountId).toBe(newAccountId)
  })

  it('unlinks a CSV row claimed by coincidence, keeping its tag', async () => {
    const claimedByMistake = await prisma.transaction.create({
      data: {
        userId,
        accountId: oldAccountId,
        hash: 'hash-claimed',
        date: new Date('2026-08-25'),
        description: 'CARTE FITNESS PARK',
        amount: -39.99,
        type: 'EXPENSE',
        externalId: 'ENTRY-1',
        bookingStatus: 'BOOK',
      },
      select: { id: true },
    })
    const tag = await prisma.tag.create({
      data: { userId, name: 'Loisirs' },
      select: { id: true },
    })
    await prisma.transactionTag.create({
      data: { transactionId: claimedByMistake.id, tagId: tag.id },
    })

    const response = await reassign(newAccountId).expect(201)
    expect(response.body).toMatchObject({ unlinked: 1 })

    const row = await prisma.transaction.findUniqueOrThrow({
      where: { id: claimedByMistake.id },
      include: { tags: true },
    })
    expect(row.accountId).toBe(oldAccountId)
    expect(row.externalId).toBeNull()
    expect(row.bookingStatus).toBeNull()
    expect(row.tags).toHaveLength(1)
  })

  it('leaves a matched row alone once it has gained a tag since', async () => {
    const inserted = await prisma.transaction.create({
      data: {
        userId,
        accountId: oldAccountId,
        hash: 'hash-inserted',
        date: new Date('2026-08-25'),
        description: 'CARTE FITNESS PARK',
        amount: -39.99,
        type: 'EXPENSE',
        source: 'BANK_API',
        externalId: 'ENTRY-1',
      },
      select: { id: true },
    })
    await prisma.transaction.create({
      data: {
        userId,
        accountId: newAccountId,
        hash: 'hash-existing-csv',
        date: new Date('2026-08-25'),
        description: 'CARTE FITNESS PARK',
        amount: -39.99,
        type: 'EXPENSE',
      },
    })
    const tag = await prisma.tag.create({
      data: { userId, name: 'À vérifier' },
      select: { id: true },
    })
    await prisma.transactionTag.create({
      data: { transactionId: inserted.id, tagId: tag.id },
    })

    const response = await reassign(newAccountId).expect(201)
    expect(response.body).toMatchObject({ blockedByWork: 1, merged: 0 })

    const stillThere = await prisma.transaction.findUnique({
      where: { id: inserted.id },
    })
    expect(stillThere).not.toBeNull()
    expect(stillThere?.accountId).toBe(oldAccountId)
  })

  it('unlinks rather than deletes an inserted row when the link is cleared entirely', async () => {
    // The transaction still happened — only the sync's claim on it was
    // wrong. Deleting it would be losing a real record, not fixing one.
    const inserted = await prisma.transaction.create({
      data: {
        userId,
        accountId: oldAccountId,
        hash: 'hash-inserted',
        date: new Date('2026-08-25'),
        description: 'CARTE FITNESS PARK',
        amount: -39.99,
        type: 'EXPENSE',
        source: 'BANK_API',
        externalId: 'ENTRY-1',
        bookingStatus: 'BOOK',
      },
      select: { id: true },
    })

    const response = await reassign(null).expect(201)
    expect(response.body).toMatchObject({ unlinked: 1 })

    const row = await prisma.transaction.findUniqueOrThrow({
      where: { id: inserted.id },
    })
    expect(row.accountId).toBe(oldAccountId)
    expect(row.externalId).toBeNull()
    expect(row.bookingStatus).toBeNull()
    const link = await prisma.bankAccountLink.findUniqueOrThrow({
      where: { id: linkId },
    })
    expect(link.accountId).toBeNull()
    expect(link.isIngested).toBe(false)
  })

  it('previews without writing anything', async () => {
    await prisma.transaction.create({
      data: {
        userId,
        accountId: oldAccountId,
        hash: 'hash-inserted',
        date: new Date('2026-08-25'),
        description: 'CARTE FITNESS PARK',
        amount: -39.99,
        type: 'EXPENSE',
        source: 'BANK_API',
        externalId: 'ENTRY-1',
      },
    })

    const response = await preview(newAccountId).expect(201)
    expect(response.body).toMatchObject({ moved: 1 })

    expect(await prisma.transaction.count()).toBe(1)
    expect(
      await prisma.transaction.findFirst({ where: { accountId: oldAccountId } })
    ).not.toBeNull()
    const link = await prisma.bankAccountLink.findUniqueOrThrow({
      where: { id: linkId },
    })
    expect(link.accountId).toBe(oldAccountId)
  })

  it('recovers a row a previous correction already unlinked', async () => {
    // The failure this exists to prevent: correcting a link once (to "aucun",
    // or to the wrong account first) strips the bank reference this method
    // used to depend on entirely, and clears the link's own `accountId` too —
    // so a second correction, through the page's dropdown exactly as a person
    // would use it, has neither left to find the row by.
    const inserted = await prisma.transaction.create({
      data: {
        userId,
        accountId: oldAccountId,
        hash: 'hash-inserted',
        date: new Date('2026-08-25'),
        description: 'CARTE FITNESS PARK',
        amount: -39.99,
        type: 'EXPENSE',
        source: 'BANK_API',
        externalId: 'ENTRY-1',
      },
      select: { id: true },
    })

    // First correction: cleared entirely, as a person exploring the tool
    // might do before settling on the real answer.
    await reassign(null).expect(201)
    const afterFirstCorrection = await prisma.transaction.findUniqueOrThrow({
      where: { id: inserted.id },
    })
    expect(afterFirstCorrection.externalId).toBeNull()
    const linkAfterClear = await prisma.bankAccountLink.findUniqueOrThrow({
      where: { id: linkId },
    })
    expect(linkAfterClear.accountId).toBeNull()

    // Second correction: the account it actually is, picked straight from
    // the dropdown — no help from a previously-known `oldAccountId`.
    const response = await reassign(newAccountId).expect(201)
    expect(response.body).toMatchObject({ moved: 1 })

    const row = await prisma.transaction.findUniqueOrThrow({
      where: { id: inserted.id },
    })
    expect(row.accountId).toBe(newAccountId)
    expect(row.externalId).toBe('ENTRY-1')
  })

  it('recovers a row already sitting on the account the second correction names', async () => {
    // The failure this exists to prevent: "aucun" leaves a row exactly where
    // the wrong sync put it, and if that happens to be the very account a
    // direct, single-step correction now names — the ordinary way to fix a
    // mistake once its real account is known — the row was excluded from an
    // earlier version of this search precisely because it already sat there.
    const inserted = await prisma.transaction.create({
      data: {
        userId,
        accountId: oldAccountId,
        hash: 'hash-inserted',
        date: new Date('2026-08-25'),
        description: 'CARTE FITNESS PARK',
        amount: -39.99,
        type: 'EXPENSE',
        source: 'BANK_API',
        externalId: 'ENTRY-1',
      },
      select: { id: true },
    })

    await reassign(null).expect(201)
    const afterClear = await prisma.transaction.findUniqueOrThrow({
      where: { id: inserted.id },
    })
    expect(afterClear.accountId).toBe(oldAccountId)
    expect(afterClear.externalId).toBeNull()

    // Corrected straight back to the account it was never actually wrong
    // about being on — only the bank's claim on it needed restoring.
    const response = await reassign(oldAccountId).expect(201)
    expect(response.body).toMatchObject({ moved: 1 })

    const row = await prisma.transaction.findUniqueOrThrow({
      where: { id: inserted.id },
    })
    expect(row.accountId).toBe(oldAccountId)
    expect(row.externalId).toBe('ENTRY-1')
  })

  it('is not reachable by a stranger', async () => {
    await request(ctx.server)
      .post(`/bank-sync/links/${linkId}/reassignment`)
      .set(ctx.auth(stranger))
      .send({ accountId: newAccountId })
      .expect(404)
  })

  it('refuses to claim an account another bank link already has', async () => {
    const other = await prisma.bankAccountLink.create({
      data: {
        connectionId,
        userId,
        externalAccountId: 'bank-acc-2',
        accountName: 'M BOILLEY RICHARD 2',
        accountId: newAccountId,
        isIngested: true,
      },
      select: { id: true },
    })

    const response = await reassign(newAccountId).expect(400)
    expect((response.body as { message: string }).message).toContain('already')

    // Untouched: the refusal happened before anything was written.
    const untouchedLink = await prisma.bankAccountLink.findUniqueOrThrow({
      where: { id: linkId },
    })
    expect(untouchedLink.accountId).toBe(oldAccountId)
    const otherLink = await prisma.bankAccountLink.findUniqueOrThrow({
      where: { id: other.id },
    })
    expect(otherLink.accountId).toBe(newAccountId)
  })
})

describe('Swapping two accounts (e2e)', () => {
  // Two links, each mapped to the account the other one should have — the
  // scenario the multi-connexion guard above makes impossible to fix in one
  // step each, since both targets are occupied at the same time. What
  // matters here is that the guard doesn't make the swap unreachable, only
  // that it takes clearing one side first.
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  let accountA: string
  let accountB: string
  let linkA: string
  let linkB: string

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

    accountA = (
      await prisma.account.create({
        data: { userId, name: 'CJ Fixe' },
        select: { id: true },
      })
    ).id
    accountB = (
      await prisma.account.create({
        data: { userId, name: 'CJ Irregulier' },
        select: { id: true },
      })
    ).id
    const connectionId = (
      await prisma.bankConnection.create({
        data: { userId, aspspName: 'Boursorama Banque', aspspCountry: 'FR' },
        select: { id: true },
      })
    ).id
    // A should be B, and B should be A — each currently wrong in the
    // opposite direction, exactly a two-way swap.
    linkA = (
      await prisma.bankAccountLink.create({
        data: {
          connectionId,
          userId,
          externalAccountId: 'bank-acc-a',
          accountName: 'Compte A',
          accountId: accountA,
          isIngested: true,
        },
        select: { id: true },
      })
    ).id
    linkB = (
      await prisma.bankAccountLink.create({
        data: {
          connectionId,
          userId,
          externalAccountId: 'bank-acc-b',
          accountName: 'Compte B',
          accountId: accountB,
          isIngested: true,
        },
        select: { id: true },
      })
    ).id
  })

  function reassign(linkId: string, accountId: string | null) {
    return request(ctx.server)
      .post(`/bank-sync/links/${linkId}/reassignment`)
      .set(ctx.auth(owner))
      .send({ accountId })
  }

  it('refuses a direct swap in either direction, but succeeds once one side is cleared first', async () => {
    // Neither direct move works first: each target is the other link's
    // current account.
    await reassign(linkA, accountB).expect(400)
    await reassign(linkB, accountA).expect(400)

    // Clear one side to free its target, then the other two moves go
    // through in order.
    await reassign(linkB, null).expect(201)
    await reassign(linkA, accountB).expect(201)
    await reassign(linkB, accountA).expect(201)

    const finalA = await prisma.bankAccountLink.findUniqueOrThrow({
      where: { id: linkA },
    })
    const finalB = await prisma.bankAccountLink.findUniqueOrThrow({
      where: { id: linkB },
    })
    expect(finalA.accountId).toBe(accountB)
    expect(finalB.accountId).toBe(accountA)
  })
})
