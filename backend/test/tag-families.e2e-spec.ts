/**
 * Lot 1 of the tag families (agent-os/product/tag-families.md), against the
 * real endpoints, the global ValidationPipe and the migrated schema:
 *
 * - a family name is unique per user (409), someone else's family is a 404,
 *   on its own routes and when a tag is filed under it;
 * - deleting a family keeps its tags, without a family (ON DELETE SET NULL);
 * - `GET /transactions?tagFamilyId=` lists each row carrying one of the
 *   family's tags once, even when it carries two of them.
 *
 * Lot 2, `GET /tag-families/:id/analysis`, against the real SQL:
 *
 * - the family's total is the sum of its tags without a shared line, less
 *   than it by exactly the shared part otherwise;
 * - its years sum to its total, in either basis;
 * - in cash basis, a year of the family is what the transaction list shows
 *   for that family and that year;
 * - a line paid in 2026 for an edition starting in 2027 is a 2027 expense in
 *   event basis, a 2026 one in cash basis.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

interface FamilyBody {
  id: string
  name: string
  color: string | null
  annualBudget: number | null
  tagCount: number
}

interface TagBody {
  id: string
  familyId: string | null
  family: { id: string; name: string; color: string | null } | null
}

describe('Tag families (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let userId: string
  let accountId: string

  beforeAll(async () => {
    ctx = await createE2eApp([owner, stranger])
    prisma = ctx.prisma
  })

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
    await http().get('/users/me').set(ctx.auth(stranger))
    accountId = (
      await prisma.account.create({ data: { userId, name: 'Courant' } })
    ).id
  })

  async function createFamily(
    name: string,
    who = owner
  ): Promise<request.Response> {
    return http()
      .post('/tag-families')
      .set(ctx.auth(who))
      .send({ name, color: '#22c55e' })
  }

  async function createTag(
    name: string,
    familyId?: string
  ): Promise<request.Response> {
    return http()
      .post('/tags')
      .set(ctx.auth(owner))
      .send({ name, ...(familyId && { familyId }) })
  }

  let sequence = 0
  async function expense(
    tagIds: string[],
    { date = '2026-06-10', amount = -40 } = {}
  ): Promise<string> {
    const row = await prisma.transaction.create({
      data: {
        userId,
        accountId,
        hash: `e2e-family-${(sequence += 1)}`,
        date: new Date(date),
        description: 'CB',
        amount,
        type: 'EXPENSE',
      },
    })
    for (const tagId of tagIds) {
      await prisma.transactionTag.create({
        data: { tagId, transactionId: row.id },
      })
    }
    return row.id
  }

  it('creates, lists with a tag count, and refuses a duplicate name', async () => {
    const created = await createFamily('Voyages')
    expect(created.status).toBe(201)
    const family = created.body as FamilyBody
    expect(family).toMatchObject({
      name: 'Voyages',
      color: '#22c55e',
      annualBudget: null,
      tagCount: 0,
    })

    expect((await createTag('Rome 2026', family.id)).status).toBe(201)
    expect((await createFamily('Voyages')).status).toBe(409)
    // Another user may use the same name.
    expect((await createFamily('Voyages', stranger)).status).toBe(201)

    const list = await http().get('/tag-families').set(ctx.auth(owner))
    expect(list.status).toBe(200)
    expect((list.body as FamilyBody[]).map(f => [f.name, f.tagCount])).toEqual([
      ['Voyages', 1],
    ])
  })

  it('answers 404 on someone else’s family, filing a tag under it included', async () => {
    const foreign = (await createFamily('HYROX', stranger)).body as FamilyBody

    const rename = await http()
      .patch(`/tag-families/${foreign.id}`)
      .set(ctx.auth(owner))
      .send({ name: 'Mine' })
    expect(rename.status).toBe(404)
    const remove = await http()
      .delete(`/tag-families/${foreign.id}`)
      .set(ctx.auth(owner))
    expect(remove.status).toBe(404)

    expect((await createTag('HYROX Lyon 2026', foreign.id)).status).toBe(404)
    const tag = (await createTag('HYROX Paris 2026')).body as TagBody
    const filed = await http()
      .patch(`/tags/${tag.id}`)
      .set(ctx.auth(owner))
      .send({ familyId: foreign.id })
    expect(filed.status).toBe(404)
    expect(
      (await prisma.tag.findUniqueOrThrow({ where: { id: tag.id } })).familyId
    ).toBeNull()
  })

  it('names the family on the tag, and takes it out on null', async () => {
    const family = (await createFamily('Concerts')).body as FamilyBody
    const tag = (await createTag('Bad Bunny 2026', family.id)).body as TagBody
    expect(tag.familyId).toBe(family.id)
    expect(tag.family).toEqual({
      id: family.id,
      name: 'Concerts',
      color: '#22c55e',
    })

    const out = await http()
      .patch(`/tags/${tag.id}`)
      .set(ctx.auth(owner))
      .send({ familyId: null })
    expect(out.status).toBe(200)
    expect((out.body as TagBody).family).toBeNull()
  })

  it('deleting a family keeps its tags, without a family', async () => {
    const family = (await createFamily('Voyages')).body as FamilyBody
    const tag = (await createTag('Prague 2025', family.id)).body as TagBody

    const removed = await http()
      .delete(`/tag-families/${family.id}`)
      .set(ctx.auth(owner))
    expect(removed.status).toBe(200)

    const kept = await prisma.tag.findUnique({ where: { id: tag.id } })
    expect(kept).not.toBeNull()
    expect(kept?.familyId).toBeNull()
  })

  it('lists each row of a family once, even carrying two of its tags', async () => {
    const family = (await createFamily('HYROX')).body as FamilyBody
    const other = (await createFamily('Voyages')).body as FamilyBody
    const race = (await createTag('HYROX Lyon 2026', family.id)).body as TagBody
    const trip = (await createTag('Déplacement Lyon', family.id))
      .body as TagBody
    const rome = (await createTag('Rome 2026', other.id)).body as TagBody
    const loose = (await createTag('Cadeaux')).body as TagBody

    const both = await expense([race.id, trip.id])
    const raceOnly = await expense([race.id])
    await expense([rome.id])
    await expense([loose.id])
    await expense([])

    const response = await http()
      .get('/transactions')
      .query({ tagFamilyId: family.id, limit: '100' })
      .set(ctx.auth(owner))
    expect(response.status).toBe(200)
    const body = response.body as {
      data: Array<{ id: string }>
      meta: { total: number }
    }
    expect(body.data.map(t => t.id).sort()).toEqual([both, raceOnly].sort())
    expect(body.meta.total).toBe(2)

    // Someone else's family matches nothing of mine.
    const foreign = (await createFamily('HYROX', stranger)).body as FamilyBody
    const none = await http()
      .get('/transactions')
      .query({ tagFamilyId: foreign.id })
      .set(ctx.auth(owner))
    expect((none.body as { data: unknown[] }).data).toEqual([])
  })

  describe('analysis', () => {
    interface AnalysisBody {
      family: { id: string; name: string }
      basis: string
      year: number | null
      availableYears: number[]
      totalExpenses: number
      transactionCount: number
      byYear: Array<{
        year: number
        expenses: number
        transactionCount: number
      }>
      byCategory: Array<{ amount: number; type: string }>
      tags: Array<{
        id: string
        spent: number
        days: number | null
        transactionCount: number
        surplus: number | null
      }>
      comparison: { editionCount: number; medianSpent: number } | null
    }

    async function datedTag(
      name: string,
      familyId: string,
      start: string,
      end: string
    ): Promise<TagBody> {
      const response = await http().post('/tags').set(ctx.auth(owner)).send({
        name,
        familyId,
        isExceptional: true,
        eventStartDate: start,
        eventEndDate: end,
      })
      expect(response.status).toBe(201)
      return response.body as TagBody
    }

    async function analyse(
      familyId: string,
      query: Record<string, string> = {},
      who = owner
    ): Promise<request.Response> {
      return http()
        .get(`/tag-families/${familyId}/analysis`)
        .query(query)
        .set(ctx.auth(who))
    }

    const sumOf = (values: number[]): number =>
      Math.round(values.reduce((s, v) => s + v, 0) * 100) / 100

    it('totals the sum of its tags, less the shared part exactly', async () => {
      const family = (await createFamily('HYROX')).body as FamilyBody
      const race = await datedTag(
        'HYROX Lyon 2026',
        family.id,
        '2026-03-14',
        '2026-03-15'
      )
      const trip = (await createTag('Déplacement Lyon', family.id))
        .body as TagBody
      await expense([race.id], { date: '2026-01-10', amount: -120 })
      await expense([trip.id], { date: '2026-03-14', amount: -65.5 })

      const apart = (await analyse(family.id)).body as AnalysisBody
      expect(apart.totalExpenses).toBe(185.5)
      expect(apart.totalExpenses).toBe(sumOf(apart.tags.map(t => t.spent)))

      // One line carrying both tags: in each tag, once in the family.
      await expense([race.id, trip.id], { date: '2026-03-15', amount: -30 })

      const shared = await analyse(family.id)
      expect(shared.status).toBe(200)
      const body = shared.body as AnalysisBody
      expect(body.totalExpenses).toBe(215.5)
      expect(body.transactionCount).toBe(3)
      expect(sumOf(body.tags.map(t => t.spent))).toBe(245.5)
      expect(sumOf(body.tags.map(t => t.spent)) - body.totalExpenses).toBe(30)
      expect(sumOf(body.byCategory.map(c => c.amount))).toBe(215.5)
      // The edition's surplus comes from its own baseline, as on its page.
      const tagAnalysis = await http()
        .get(`/tags/${race.id}/analysis`)
        .set(ctx.auth(owner))
      const raceLine = body.tags.find(t => t.id === race.id)
      expect(raceLine?.surplus).toBe(
        (tagAnalysis.body as { totalSurplus: number | null }).totalSurplus
      )
      expect(raceLine?.days).toBe(2)
      expect(body.comparison).toMatchObject({
        editionCount: 1,
        medianSpent: 150,
      })
    })

    it('sums its years to its total, in either basis', async () => {
      const family = (await createFamily('Voyages')).body as FamilyBody
      const prague = await datedTag(
        'Prague 2025',
        family.id,
        '2025-05-01',
        '2025-05-04'
      )
      const lisbon = await datedTag(
        'Lisbonne 2027',
        family.id,
        '2027-01-03',
        '2027-01-08'
      )
      const loose = (await createTag('Valises', family.id)).body as TagBody
      await expense([prague.id], { date: '2024-12-02', amount: -210 })
      await expense([prague.id], { date: '2025-05-02', amount: -90 })
      await expense([lisbon.id], { date: '2026-11-20', amount: -340 })
      await expense([loose.id], { date: '2026-02-11', amount: -75 })

      for (const basis of ['event', 'cash']) {
        const body = (await analyse(family.id, { basis })).body as AnalysisBody
        expect(body.basis).toBe(basis)
        expect(body.totalExpenses).toBe(715)
        expect(sumOf(body.byYear.map(y => y.expenses))).toBe(body.totalExpenses)
        expect(sumOf(body.byYear.map(y => y.transactionCount))).toBe(4)
        for (const year of body.availableYears) {
          const one = (await analyse(family.id, { basis, year: String(year) }))
            .body as AnalysisBody
          expect(one.totalExpenses).toBe(
            body.byYear.find(y => y.year === year)?.expenses
          )
        }
      }
      const event = (await analyse(family.id)).body as AnalysisBody
      expect(event.availableYears).toEqual([2025, 2026, 2027])
      const cash = (await analyse(family.id, { basis: 'cash' }))
        .body as AnalysisBody
      expect(cash.availableYears).toEqual([2024, 2025, 2026])
    })

    it('in cash basis, a year is what the transaction list shows', async () => {
      const family = (await createFamily('Concerts')).body as FamilyBody
      const show = await datedTag(
        'Bad Bunny 2026',
        family.id,
        '2026-06-20',
        '2026-06-20'
      )
      const other = (await createTag('Fêtes', family.id)).body as TagBody
      await expense([show.id], { date: '2025-11-03', amount: -150 })
      await expense([show.id, other.id], { date: '2026-06-20', amount: -42 })
      await expense([other.id], { date: '2026-12-31', amount: -18.4 })
      await expense([other.id], { date: '2027-01-01', amount: -9 })

      const analysis = (
        await analyse(family.id, { basis: 'cash', year: '2026' })
      ).body as AnalysisBody
      const list = await http()
        .get('/transactions')
        .query({
          tagFamilyId: family.id,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          limit: '100',
        })
        .set(ctx.auth(owner))
      const rows = (list.body as { data: Array<{ amount: number | string }> })
        .data

      expect(analysis.transactionCount).toBe(rows.length)
      expect(analysis.totalExpenses).toBe(
        sumOf(rows.map(r => Math.abs(Number(r.amount))))
      )
      expect(analysis.totalExpenses).toBe(60.4)
    })

    it('counts a line paid in 2026 for a 2027 edition in 2027, in 2026 in cash', async () => {
      const family = (await createFamily('Vacances')).body as FamilyBody
      const lisbon = await datedTag(
        'Lisbonne 2027',
        family.id,
        '2027-01-03',
        '2027-01-08'
      )
      await expense([lisbon.id], { date: '2026-11-20', amount: -340 })

      const event2027 = (await analyse(family.id, { year: '2027' }))
        .body as AnalysisBody
      expect(event2027.totalExpenses).toBe(340)
      expect(event2027.tags.map(t => t.id)).toEqual([lisbon.id])
      const event2026 = (await analyse(family.id, { year: '2026' }))
        .body as AnalysisBody
      expect(event2026.totalExpenses).toBe(0)
      expect(event2026.tags).toEqual([])

      const cash2026 = (
        await analyse(family.id, { year: '2026', basis: 'cash' })
      ).body as AnalysisBody
      expect(cash2026.totalExpenses).toBe(340)
      const cash2027 = (
        await analyse(family.id, { year: '2027', basis: 'cash' })
      ).body as AnalysisBody
      expect(cash2027.totalExpenses).toBe(0)
    })

    it('answers 404 on someone else’s family and 400 on an unknown basis', async () => {
      const foreign = (await createFamily('HYROX', stranger)).body as FamilyBody
      expect((await analyse(foreign.id)).status).toBe(404)

      const mine = (await createFamily('HYROX')).body as FamilyBody
      expect((await analyse(mine.id, { basis: 'budget' })).status).toBe(400)
      expect((await analyse(mine.id, { year: 'soon' })).status).toBe(400)
    })
  })
})
