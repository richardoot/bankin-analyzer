/**
 * An account is the user's, and an export keeps its own name for it.
 *
 * Before the aliases, an import resolved an account by its name. The settings
 * offer to rename an account, so renaming `Perso Bourso` to `Bourso` made the
 * next export — whose column still said `Perso Bourso` — create a second
 * account beside the first: STANDARD, divisor 1, whatever the original was.
 * One real account, two rows, and a joint account's amounts halved on one side
 * and not the other.
 *
 * That defect predates the bank sync entirely. These specs are what keep it
 * closed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

describe('Import account aliases (e2e)', () => {
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

  function row(account: string, description = 'CB Fitness Park') {
    return {
      date: '2026-08-25T00:00:00.000Z',
      description,
      amount: -39.99,
      category: 'Sport',
      account,
      type: 'EXPENSE' as const,
    }
  }

  const doImport = (transactions: unknown[]) =>
    request(ctx.server)
      .post('/transactions/import')
      .set(ctx.auth(owner))
      .send({ transactions })

  const preview = (transactions: unknown[]) =>
    request(ctx.server)
      .post('/transactions/import/preview')
      .set(ctx.auth(owner))
      .send({ transactions })

  it('records the label an import used for an account it created', async () => {
    await doImport([row('Perso Bourso')]).expect(201)

    const alias = await prisma.accountAlias.findUniqueOrThrow({
      where: { userId_label: { userId, label: 'Perso Bourso' } },
      include: { account: true },
    })
    expect(alias.account.name).toBe('Perso Bourso')
  })

  it('keeps importing into the same account after it is renamed', async () => {
    // The defect this table exists for.
    await doImport([row('Perso Bourso')]).expect(201)
    const account = await prisma.account.findFirstOrThrow({ where: { userId } })

    await request(ctx.server)
      .put(`/accounts/${account.id}`)
      .set(ctx.auth(owner))
      .send({ name: 'Bourso' })
      .expect(200)

    await doImport([row('Perso Bourso', 'CB Carrefour')]).expect(201)

    expect(await prisma.account.count({ where: { userId } })).toBe(1)
    expect(
      await prisma.transaction.count({ where: { accountId: account.id } })
    ).toBe(2)
  })

  it('keeps a renamed joint account joint', async () => {
    // The quiet half of the defect: the second account arrived STANDARD with
    // divisor 1, so the same money counted twice over on one side and once on
    // the other.
    await doImport([row('Compte Joint')]).expect(201)
    const account = await prisma.account.findFirstOrThrow({ where: { userId } })
    await prisma.account.update({
      where: { id: account.id },
      data: { name: 'CJ', type: 'JOINT', divisor: 2 },
    })

    await doImport([row('Compte Joint', 'CB Autre')]).expect(201)

    const accounts = await prisma.account.findMany({ where: { userId } })
    expect(accounts).toHaveLength(1)
    expect(accounts[0]?.divisor).toBe(2)
  })

  it('adopts an account that already answers to the label', async () => {
    // A database older than the aliases, or an account made by hand. It must
    // be recognised, not duplicated.
    const made = await prisma.account.create({
      data: { userId, name: 'Livret A', type: 'STANDARD', divisor: 1 },
    })

    await doImport([row('Livret A')]).expect(201)

    expect(await prisma.account.count({ where: { userId } })).toBe(1)
    expect(
      await prisma.transaction.count({ where: { accountId: made.id } })
    ).toBe(1)
  })

  it('names the accounts a preview is about to invent', async () => {
    // So an interface can ask which existing account they are, instead of the
    // import deciding alone.
    const response = await preview([
      row('Perso Bourso'),
      row('Compte Joint', 'CB Autre'),
    ]).expect(201)

    expect(
      (response.body as { newAccounts: string[] }).newAccounts.sort()
    ).toEqual(['Compte Joint', 'Perso Bourso'])
  })

  it('says nothing about accounts it already knows', async () => {
    await doImport([row('Perso Bourso')]).expect(201)

    const response = await preview([row('Perso Bourso')]).expect(201)

    expect((response.body as { newAccounts: string[] }).newAccounts).toEqual([])
  })

  it('gives one account per label, whatever the order within an import', async () => {
    await doImport([
      row('Perso Bourso'),
      row('Perso Bourso', 'CB Autre'),
      row('Perso Bourso', 'CB Encore'),
    ]).expect(201)

    expect(await prisma.account.count({ where: { userId } })).toBe(1)
    expect(await prisma.accountAlias.count({ where: { userId } })).toBe(1)
  })
})
