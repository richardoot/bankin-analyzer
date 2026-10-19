/**
 * Lot 4 of the tag families (agent-os/product/tag-families.md): the three MCP
 * tools on tags, called through `POST /mcp` against real Postgres.
 *
 * - `get_tag_candidates` searches the event's window widened by two days on
 *   each side, bounds included, and leaves out what already carries the tag,
 *   what is on a stats-excluded account, income, and committed spending;
 * - `get_tags` reads each tag's spend with the project's conventions (the
 *   expenses in absolute value, a joint account's share, excluded accounts
 *   ignored);
 * - `set_transaction_tags` writes through the tags service: someone else's
 *   tag is refused before anything is written, an exceptional tag on a
 *   smoothed expense is refused with the service's own words.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

interface ToolAnswer {
  isError: boolean
  text: string
  /** The JSON inside <user_financial_data>, when the answer is data. */
  data: any
}

describe('MCP tag tools (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  let strangerId: string
  let accountId: string

  beforeAll(async () => {
    ctx = await createE2eApp([owner, stranger])
    prisma = ctx.prisma
  }, 60000)

  afterAll(async () => {
    await ctx.close()
  })

  const http = (): request.Agent => request(ctx.server)

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
  })

  let rpcId = 0
  /** One tools/call, as an MCP client sends it; the SSE frame is unwrapped. */
  async function callTool(
    name: string,
    args: Record<string, unknown>,
    who = owner
  ): Promise<ToolAnswer> {
    rpcId += 1
    const res = await http()
      .post('/mcp')
      .set(ctx.auth(who))
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: rpcId,
        method: 'tools/call',
        params: { name, arguments: args },
      })
    expect(res.status).toBe(200)
    const raw = res.text
    const frame = raw.includes('data: ')
      ? raw
          .split('\n')
          .filter(line => line.startsWith('data: '))
          .map(line => line.slice('data: '.length))
          .join('')
      : raw
    const message = JSON.parse(frame) as {
      result: { content: Array<{ text: string }>; isError?: boolean }
    }
    const text = message.result.content[0]?.text ?? ''
    const fenced =
      /^<user_financial_data>\n([\s\S]*)\n<\/user_financial_data>$/.exec(text)
    return {
      isError: message.result.isError === true,
      text,
      data: fenced ? JSON.parse(fenced[1] as string) : null,
    }
  }

  async function datedTag(
    name: string,
    start: string,
    end: string,
    owner = userId
  ): Promise<string> {
    const tag = await prisma.tag.create({
      data: {
        userId: owner,
        name,
        isExceptional: true,
        eventStartDate: new Date(start),
        eventEndDate: new Date(end),
      },
    })
    return tag.id
  }

  let sequence = 0
  async function row(data: {
    date: string
    amount?: number
    type?: 'EXPENSE' | 'INCOME'
    account?: string
    subcategoryId?: string
    categoryId?: string
    amortizationMonths?: number
    tagIds?: string[]
    description?: string
  }): Promise<string> {
    sequence += 1
    const created = await prisma.transaction.create({
      data: {
        userId,
        accountId: data.account ?? accountId,
        hash: `e2e-tag-mcp-${sequence}`,
        date: new Date(data.date),
        description: data.description ?? `CB ${sequence}`,
        amount: data.amount ?? -40,
        type: data.type ?? 'EXPENSE',
        categoryId: data.categoryId ?? null,
        subcategoryId: data.subcategoryId ?? null,
        amortizationMonths: data.amortizationMonths ?? null,
      },
    })
    for (const tagId of data.tagIds ?? []) {
      await prisma.transactionTag.create({
        data: { tagId, transactionId: created.id },
      })
    }
    return created.id
  }

  async function subcategory(
    name: string,
    rhythm: 'COMMITTED' | 'VARIABLE'
  ): Promise<{ categoryId: string; subcategoryId: string }> {
    const category = await prisma.category.create({
      data: { userId, name: `E2E ${name}`, type: 'EXPENSE' },
    })
    const sub = await prisma.subcategory.create({
      data: {
        userId,
        categoryId: category.id,
        name: `E2E ${name}`,
        rhythm,
      },
    })
    return { categoryId: category.id, subcategoryId: sub.id }
  }

  describe('get_tag_candidates', () => {
    it('searches two days on each side of the window, bounds included', async () => {
      const tagId = await datedTag(
        'HYROX Paris 2026',
        '2026-06-10',
        '2026-06-12'
      )
      await row({ date: '2026-06-07', description: 'J-3' })
      const first = await row({ date: '2026-06-08', description: 'J-2' })
      const during = await row({ date: '2026-06-11', description: 'pendant' })
      // A row booked late in the day still counts on its day.
      const last = await row({
        date: '2026-06-14T18:30:00.000Z',
        description: 'J+2',
      })
      await row({ date: '2026-06-15', description: 'J+3' })

      const answer = await callTool('get_tag_candidates', { tagId })

      expect(answer.isError).toBe(false)
      expect(answer.data.searchedFrom).toBe('2026-06-08')
      expect(answer.data.searchedTo).toBe('2026-06-14')
      expect(
        answer.data.candidates.map((c: { id: string; label: string }) => [
          c.id,
          c.label,
        ])
      ).toEqual([
        [first, 'J-2'],
        [during, 'pendant'],
        [last, 'J+2'],
      ])
      expect(answer.data.rule).toContain('par marchand')
    })

    it('leaves out the tagged, the excluded account, income and committed spending', async () => {
      const tagId = await datedTag('Rome 2026', '2026-12-05', '2026-12-09')
      const savings = (
        await prisma.account.create({
          data: { userId, name: 'Livret', isExcludedFromStats: true },
        })
      ).id
      const rent = await subcategory('Loyer', 'COMMITTED')
      const outings = await subcategory('Sorties', 'VARIABLE')

      await row({ date: '2026-12-06', tagIds: [tagId] })
      await row({ date: '2026-12-06', account: savings })
      await row({ date: '2026-12-06', amount: 50, type: 'INCOME' })
      await row({ date: '2026-12-06', ...rent })
      const restaurant = await row({ date: '2026-12-06', ...outings })
      const unfiled = await row({ date: '2026-12-07' })
      const smoothed = await row({
        date: '2026-12-08',
        amortizationMonths: 12,
        ...outings,
      })

      const answer = await callTool('get_tag_candidates', { tagId })

      expect(
        answer.data.candidates.map(
          (c: {
            id: string
            rhythm: string | null
            amortizationMonths: number | null
          }) => [c.id, c.rhythm, c.amortizationMonths]
        )
      ).toEqual([
        [restaurant, 'VARIABLE', null],
        [unfiled, null, null],
        [smoothed, 'VARIABLE', 12],
      ])
    })

    it('refuses a tag without a window', async () => {
      const theme = await prisma.tag.create({
        data: { userId, name: 'Cadeaux' },
      })

      const answer = await callTool('get_tag_candidates', { tagId: theme.id })

      expect(answer.isError).toBe(true)
      expect(answer.text).toContain(
        "L'étiquette « Cadeaux » n'a pas de fenêtre"
      )
    })
  })

  describe('get_tags', () => {
    it('reads what each tag spent: expenses only, a joint share, excluded accounts ignored', async () => {
      const tagId = await datedTag('Prague 2025', '2025-08-01', '2025-08-07')
      const joint = (
        await prisma.account.create({
          data: { userId, name: 'Joint', divisor: 2 },
        })
      ).id
      const savings = (
        await prisma.account.create({
          data: { userId, name: 'Livret', isExcludedFromStats: true },
        })
      ).id
      await row({ date: '2025-08-02', amount: -100, tagIds: [tagId] })
      await row({
        date: '2025-08-03',
        amount: -60,
        account: joint,
        tagIds: [tagId],
      })
      await row({
        date: '2025-08-03',
        amount: -500,
        account: savings,
        tagIds: [tagId],
      })
      await row({
        date: '2025-08-04',
        amount: 20,
        type: 'INCOME',
        tagIds: [tagId],
      })
      await prisma.tag.create({ data: { userId, name: 'Pro' } })

      const answer = await callTool('get_tags', {})

      expect(
        answer.data.tags.map(
          (t: { name: string; spent: number; transactionCount: number }) => [
            t.name,
            t.spent,
            t.transactionCount,
          ]
        )
      ).toEqual([
        ['Prague 2025', 130, 4],
        ['Pro', 0, 0],
      ])
    })
  })

  describe('set_transaction_tags', () => {
    it('adds and removes, reading the tags back', async () => {
      const event = await datedTag('Lyon 2026', '2026-05-02', '2026-05-03')
      const theme = (
        await prisma.tag.create({ data: { userId, name: 'Cadeaux' } })
      ).id
      const tx = await row({ date: '2026-05-02', tagIds: [theme] })

      const answer = await callTool('set_transaction_tags', {
        transactionId: tx,
        add: [event],
        remove: [theme],
        expectedAmount: 40,
      })

      expect(answer.isError).toBe(false)
      expect(answer.data.after).toEqual([
        { id: event, name: 'Lyon 2026', isExceptional: true },
      ])
      const links = await prisma.transactionTag.findMany({
        where: { transactionId: tx },
      })
      expect(links.map(l => l.tagId)).toEqual([event])
    })

    it("refuses someone else's tag without writing anything", async () => {
      const mine = await datedTag('Lyon 2026', '2026-05-02', '2026-05-03')
      const theirs = await datedTag(
        'Lyon 2026',
        '2026-05-02',
        '2026-05-03',
        strangerId
      )
      const tx = await row({ date: '2026-05-02' })

      const answer = await callTool('set_transaction_tags', {
        transactionId: tx,
        add: [mine, theirs],
      })

      expect(answer.isError).toBe(true)
      expect(answer.text).toContain(theirs)
      expect(
        await prisma.transactionTag.count({ where: { transactionId: tx } })
      ).toBe(0)
    })

    it('refuses an exceptional tag on a smoothed expense, in the service words, writing nothing', async () => {
      const event = await datedTag('Lyon 2026', '2026-05-02', '2026-05-03')
      const theme = (
        await prisma.tag.create({ data: { userId, name: 'Cadeaux' } })
      ).id
      const tx = await row({
        date: '2026-05-02',
        amortizationMonths: 24,
        description: 'CB DECATHLON',
      })

      const answer = await callTool('set_transaction_tags', {
        transactionId: tx,
        add: [theme, event],
      })

      expect(answer.isError).toBe(true)
      expect(answer.text).toBe(
        "Refusé par le serveur : La transaction « CB DECATHLON » est étalée sur plusieurs mois : un achat étalé reste dans la vie courante, alors qu'une étiquette exceptionnelle l'en sortirait. Choisissez l'un ou l'autre, et retirez l'étalement d'abord pour en faire un épisode."
      )
      expect(
        await prisma.transactionTag.count({ where: { transactionId: tx } })
      ).toBe(0)
    })

    it("refuses someone else's transaction", async () => {
      const event = await datedTag('Lyon 2026', '2026-05-02', '2026-05-03')
      const tx = await row({ date: '2026-05-02' })

      const answer = await callTool(
        'set_transaction_tags',
        { transactionId: tx, add: [event] },
        stranger
      )

      expect(answer.isError).toBe(true)
      expect(answer.text).toContain('introuvable chez cet utilisateur')
    })
  })
})
