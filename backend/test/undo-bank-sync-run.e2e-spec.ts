/**
 * Undoing a bank sync run.
 *
 * `Transaction.syncRunId` is what makes this possible at all: before it
 * existed, `BankSyncRun` was a record nothing pointed back to, so a fetch
 * that ran against the wrong mapping had no way out but hand-editing the
 * ledger. These specs are what keep the undo honest — it must delete exactly
 * what its run inserted, unlink exactly what it claimed, and never take work
 * added since.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { main as ingest } from '../src/scripts/ingest-bank-run'
import { main as undo } from '../src/scripts/undo-bank-sync-run'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

function writeDump(
  transactions: {
    entry_reference: string
    amount: string
    date: string
    label: string
  }[]
): string {
  const path = join(tmpdir(), `bank-dump-${Date.now()}-${Math.random()}.json`)
  writeFileSync(
    path,
    JSON.stringify({
      session: 'session-1',
      reports: [{ accountUid: 'bank-acc-1', accountName: 'M BOILLEY RICHARD' }],
      dump: {
        'bank-acc-1': transactions.map(t => ({
          entry_reference: t.entry_reference,
          transaction_amount: { amount: t.amount, currency: 'EUR' },
          credit_debit_indicator: 'DBIT',
          booking_date: t.date,
          status: 'BOOK',
          remittance_information: [t.label],
        })),
      },
    })
  )
  return path
}

describe('Undo a bank sync run (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  let accountId: string
  let categoryId: string
  const dumps: string[] = []

  beforeAll(async () => {
    ctx = await createE2eApp([owner])
    prisma = ctx.prisma
  }, 60000)

  afterAll(async () => {
    for (const path of dumps) rmSync(path, { force: true })
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
    categoryId = (
      await prisma.category.create({
        data: { userId, name: 'Sport', type: 'EXPENSE' },
        select: { id: true },
      })
    ).id
  })

  function dumpOf(transactions: Parameters<typeof writeDump>[0]): string {
    const path = writeDump(transactions)
    dumps.push(path)
    return path
  }

  async function csvRow(
    overrides: { description?: string; amount?: number; date?: string } = {}
  ): Promise<string> {
    const created = await prisma.transaction.create({
      data: {
        userId,
        accountId,
        categoryId,
        hash: `hash-${Math.random()}`,
        date: new Date(overrides.date ?? '2026-08-25'),
        description: overrides.description ?? 'CB Fitness Park',
        amount: overrides.amount ?? -39.99,
        type: 'EXPENSE',
        note: 'écrit à la main',
      },
      select: { id: true },
    })
    return created.id
  }

  async function fetchBank(dumpPath: string, apply: boolean): Promise<void> {
    await ingest(prisma, {
      dumpPath,
      email: owner.email,
      enable: ['bank-acc-1'],
      map: [`bank-acc-1=${accountId}`],
      apply,
    })
  }

  async function latestRunId(): Promise<string> {
    const run = await prisma.bankSyncRun.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    return run.id
  }

  it('deletes a row it inserted', async () => {
    await fetchBank(
      dumpOf([
        {
          entry_reference: 'ENTRY-NEW',
          amount: '12.50',
          date: '2024-10-01',
          label: 'BOULANGERIE',
        },
      ]),
      true
    )
    const runId = await latestRunId()
    expect(await prisma.transaction.count()).toBe(1)

    await undo(prisma, { runId, apply: true })

    expect(await prisma.transaction.count()).toBe(0)
  })

  it('unlinks a row it claimed, leaving the work it already carried', async () => {
    const existing = await csvRow()
    const tag = await prisma.tag.create({
      data: { userId, name: 'Vacances' },
      select: { id: true },
    })
    await prisma.transactionTag.create({
      data: { transactionId: existing, tagId: tag.id },
    })

    await fetchBank(
      dumpOf([
        {
          entry_reference: 'ENTRY-1',
          amount: '39.99',
          date: '2026-08-25',
          label: 'CARTE 25/08/26 FITNESS PARK CB*7962',
        },
      ]),
      true
    )
    const runId = await latestRunId()
    const claimed = await prisma.transaction.findUniqueOrThrow({
      where: { id: existing },
    })
    expect(claimed.externalId).toBe('ENTRY-1')

    await undo(prisma, { runId, apply: true })

    const row = await prisma.transaction.findUniqueOrThrow({
      where: { id: existing },
      include: { tags: true },
    })
    expect(row.externalId).toBeNull()
    expect(row.bookingStatus).toBeNull()
    expect(row.categoryId).toBe(categoryId)
    expect(row.note).toBe('écrit à la main')
    expect(row.source).toBe('BANKIN_CSV')
    expect(row.tags).toHaveLength(1)
  })

  it('writes nothing without --apply', async () => {
    await fetchBank(
      dumpOf([
        {
          entry_reference: 'ENTRY-NEW',
          amount: '12.50',
          date: '2024-10-01',
          label: 'BOULANGERIE',
        },
      ]),
      true
    )
    const runId = await latestRunId()

    await undo(prisma, { runId, apply: false })

    expect(await prisma.transaction.count()).toBe(1)
  })

  it('refuses to delete an inserted row that has since been tagged', async () => {
    await fetchBank(
      dumpOf([
        {
          entry_reference: 'ENTRY-NEW',
          amount: '12.50',
          date: '2024-10-01',
          label: 'BOULANGERIE',
        },
      ]),
      true
    )
    const runId = await latestRunId()
    const inserted = await prisma.transaction.findFirstOrThrow({
      where: { source: 'BANK_API' },
    })
    const tag = await prisma.tag.create({
      data: { userId, name: 'À vérifier' },
      select: { id: true },
    })
    await prisma.transactionTag.create({
      data: { transactionId: inserted.id, tagId: tag.id },
    })

    await undo(prisma, { runId, apply: true })

    const stillThere = await prisma.transaction.findUnique({
      where: { id: inserted.id },
      include: { tags: true },
    })
    expect(stillThere).not.toBeNull()
    expect(stillThere?.tags).toHaveLength(1)
  })

  it('leaves a different run entirely alone', async () => {
    await fetchBank(
      dumpOf([
        {
          entry_reference: 'ENTRY-FIRST',
          amount: '12.50',
          date: '2024-10-01',
          label: 'BOULANGERIE',
        },
      ]),
      true
    )
    const firstRunId = await latestRunId()

    await fetchBank(
      dumpOf([
        {
          entry_reference: 'ENTRY-SECOND',
          amount: '8.00',
          date: '2024-10-02',
          label: 'BAR TABAC',
        },
      ]),
      true
    )

    expect(await prisma.transaction.count()).toBe(2)

    await undo(prisma, { runId: firstRunId, apply: true })

    const remaining = await prisma.transaction.findMany()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.externalId).toBe('ENTRY-SECOND')
  })

  it('rejects an unknown run id', async () => {
    await expect(
      undo(prisma, { runId: 'no-such-run', apply: false })
    ).rejects.toThrow('No such bank sync run')
  })
})
