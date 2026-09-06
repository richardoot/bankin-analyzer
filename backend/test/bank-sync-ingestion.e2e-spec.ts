/**
 * Phase 4: the first thing in this project that writes to `app.transactions`.
 *
 * The rules it must not break are all about what it does to rows that already
 * exist. A matched transaction is *claimed*, never recreated: the row may
 * carry a reimbursement, a tag, a note, a category the user fixed by hand, and
 * a delete-and-reinsert would take all of it while looking like a successful
 * sync. On production data this path claimed 1 531 rows and every one kept its
 * category; these specs are what keep that true.
 *
 * They run the real script against a real database, with a dump written to a
 * temp file — the same entry point the operator uses, not a reimplementation
 * of it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { main as ingest } from '../src/scripts/ingest-bank-run'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

/** A dump shaped like `spike-enable-banking-fetch.ts` writes. */
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

describe('Bank sync ingestion (e2e)', () => {
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

  /** A CSV row the sync should recognise rather than duplicate. */
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

  /** Run the script the way the operator does, with the account enabled. */
  async function run(dumpPath: string, apply: boolean): Promise<void> {
    await ingest(prisma, {
      dumpPath,
      email: owner.email,
      enable: ['bank-acc-1'],
      // Stated rather than inferred: these fixtures hold too few transactions
      // for the evidence-based proposal to reach its confidence threshold,
      // which is exactly the situation an account with no CSV history is in.
      map: [`bank-acc-1=${accountId}`],
      apply,
    })
  }

  it('claims an existing row instead of inserting a second one', async () => {
    const existing = await csvRow()
    const path = dumpOf([
      {
        entry_reference: 'ENTRY-1',
        amount: '39.99',
        date: '2026-08-25',
        label: 'CARTE 25/08/26 FITNESS PARK CB*7962',
      },
    ])

    await run(path, true)

    expect(await prisma.transaction.count()).toBe(1)
    const row = await prisma.transaction.findUniqueOrThrow({
      where: { id: existing },
    })
    expect(row.externalId).toBe('ENTRY-1')
  })

  it('leaves the work a claimed row already carried', async () => {
    // The failure this exists to prevent: a sync that reports success while
    // quietly dropping a category, a note, or a tag.
    const existing = await csvRow()
    const tag = await prisma.tag.create({
      data: { userId, name: 'Vacances' },
      select: { id: true },
    })
    await prisma.transactionTag.create({
      data: { transactionId: existing, tagId: tag.id },
    })

    await run(
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

    const row = await prisma.transaction.findUniqueOrThrow({
      where: { id: existing },
      include: { tags: true },
    })
    expect(row.categoryId).toBe(categoryId)
    expect(row.note).toBe('écrit à la main')
    expect(row.tags).toHaveLength(1)
  })

  it('keeps a claimed row filed as coming from the CSV', async () => {
    // It did come from a CSV. Gaining a bank reference does not change that.
    const existing = await csvRow()

    await run(
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

    const row = await prisma.transaction.findUniqueOrThrow({
      where: { id: existing },
    })
    expect(row.source).toBe('BANKIN_CSV')
  })

  it('inserts a transaction the ledger does not have', async () => {
    // After the account's own earliest row — the date floor only holds back
    // what is older than that, and its own spec covers that case.
    await csvRow({ date: '2026-06-01' })

    await run(
      dumpOf([
        {
          entry_reference: 'ENTRY-NEW',
          amount: '12.50',
          date: '2026-10-01',
          label: 'CARTE 01/10/26 BOULANGERIE CB*7962',
        },
      ]),
      true
    )

    const inserted = await prisma.transaction.findFirstOrThrow({
      where: { source: 'BANK_API' },
    })
    expect(inserted.externalId).toBe('ENTRY-NEW')
    expect(inserted.accountId).toBe(accountId)
    // Unfiled on purpose: the bank sends no category, and a wrong one is
    // invisible where a missing one is one click from correct.
    expect(inserted.categoryId).toBeNull()
  })

  it('writes nothing without --apply', async () => {
    await csvRow({ date: '2026-06-01' })

    await run(
      dumpOf([
        {
          entry_reference: 'ENTRY-NEW',
          amount: '12.50',
          date: '2026-10-01',
          label: 'BOULANGERIE',
        },
      ]),
      false
    )

    expect(await prisma.transaction.count()).toBe(1)
    expect(
      await prisma.transaction.count({ where: { externalId: { not: null } } })
    ).toBe(0)
  })

  it('does nothing the second time the same fetch is ingested', async () => {
    await csvRow()
    const path = dumpOf([
      {
        entry_reference: 'ENTRY-1',
        amount: '39.99',
        date: '2026-08-25',
        label: 'CARTE 25/08/26 FITNESS PARK CB*7962',
      },
      {
        entry_reference: 'ENTRY-NEW',
        amount: '12.50',
        date: '2024-10-01',
        label: 'BOULANGERIE',
      },
    ])

    await run(path, true)
    const afterFirst = await prisma.transaction.count()
    await run(path, true)

    expect(await prisma.transaction.count()).toBe(afterFirst)
  })

  it('records the bank account it read, and what it maps to', async () => {
    await csvRow()
    await run(
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

    const link = await prisma.bankAccountLink.findFirstOrThrow({
      where: { userId },
    })
    expect(link.externalAccountId).toBe('bank-acc-1')
    expect(link.isIngested).toBe(true)
  })

  describe('the date floor', () => {
    it('does not insert a row older than the account already knows', async () => {
      // The failure this exists to prevent: a re-authorization's deeper
      // window hands back a genuine, previously unseen transaction from a
      // month already closed, and inserting it revises a total the user had
      // already reviewed.
      await csvRow({ date: '2026-06-01' })

      await run(
        dumpOf([
          {
            entry_reference: 'ENTRY-OLD',
            amount: '12.50',
            date: '2026-01-15',
            label: 'BOULANGERIE',
          },
          {
            entry_reference: 'ENTRY-NEW',
            amount: '8.00',
            date: '2026-07-01',
            label: 'BAR TABAC',
          },
        ]),
        true
      )

      expect(
        await prisma.transaction.findFirst({
          where: { externalId: 'ENTRY-OLD' },
        })
      ).toBeNull()
      expect(
        await prisma.transaction.findFirst({
          where: { externalId: 'ENTRY-NEW' },
        })
      ).not.toBeNull()
    })

    it('does not hold back a claim just because the row is old', async () => {
      // Claiming only adds a reference to a row that already exists — it
      // cannot revise a total, so the floor has nothing to protect against
      // here.
      const existing = await csvRow({ date: '2026-01-15' })

      await run(
        dumpOf([
          {
            entry_reference: 'ENTRY-1',
            amount: '39.99',
            date: '2026-01-15',
            label: 'CARTE 15/01/26 FITNESS PARK CB*7962',
          },
        ]),
        true
      )

      const row = await prisma.transaction.findUniqueOrThrow({
        where: { id: existing },
      })
      expect(row.externalId).toBe('ENTRY-1')
    })

    it('applies no floor to an account with no history yet', async () => {
      // Nothing to protect on a first backfill — this is exactly where the
      // deep history the bank briefly offers is worth having.
      await run(
        dumpOf([
          {
            entry_reference: 'ENTRY-DEEP',
            amount: '12.50',
            date: '2023-01-15',
            label: 'BOULANGERIE',
          },
        ]),
        true
      )

      expect(
        await prisma.transaction.findFirst({
          where: { externalId: 'ENTRY-DEEP' },
        })
      ).not.toBeNull()
    })
  })
})
