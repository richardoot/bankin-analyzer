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
 *
 * Lot 3, the annual envelope:
 *
 * - the analysis weighs the envelope by event year, the same in either basis;
 * - `GET /tags/budget-summary` charges a family with an envelope its prorata
 *   of the window, in place of its tags' envelopes, its spend counted once.
 *
 * Lot 5, the families of the year on the dashboard (`POST /dashboard/summary`):
 *
 * - over the current calendar year in Paris, in event basis: a line paid the
 *   year before for an edition of this year counts, a deposit paid this year
 *   for next year's edition does not; a line carrying two of the family's
 *   tags counts once;
 * - the year's real expenses, the share's denominator, are every expense
 *   dated in that year, and its exceptional expenses those of them carrying
 *   an exceptional tag, in a family or not;
 * - each family lists its spending per event year, oldest first;
 * - a user without a family reads an empty list.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { calendarDayIn } from '../src/tags/tag-status'
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

    it('weighs the envelope by event year, the same in either basis', async () => {
      const family = (await createFamily('Vacances')).body as FamilyBody
      await http()
        .patch(`/tag-families/${family.id}`)
        .set(ctx.auth(owner))
        .send({ annualBudget: 1000 })
        .expect(200)
      const lisbon = await datedTag(
        'Lisbonne 2027',
        family.id,
        '2027-01-03',
        '2027-01-08'
      )
      const rome = await datedTag(
        'Rome 2026',
        family.id,
        '2026-12-05',
        '2026-12-09'
      )
      await expense([lisbon.id], { date: '2026-11-20', amount: -340 })
      await expense([rome.id], { date: '2026-10-02', amount: -250 })

      const event = (await analyse(family.id, { year: '2026' }))
        .body as AnalysisBody & { envelope: unknown }
      const cash = (await analyse(family.id, { year: '2026', basis: 'cash' }))
        .body as AnalysisBody & { envelope: unknown }

      expect(event.envelope).toEqual({
        annualBudget: 1000,
        year: 2026,
        spentEventBasis: 250,
        remaining: 750,
      })
      expect(cash.envelope).toEqual(event.envelope)
      expect(cash.totalExpenses).toBe(590)
    })

    it('answers 404 on someone else’s family and 400 on an unknown basis', async () => {
      const foreign = (await createFamily('HYROX', stranger)).body as FamilyBody
      expect((await analyse(foreign.id)).status).toBe(404)

      const mine = (await createFamily('HYROX')).body as FamilyBody
      expect((await analyse(mine.id, { basis: 'budget' })).status).toBe(400)
      expect((await analyse(mine.id, { year: 'soon' })).status).toBe(400)
    })
  })

  describe('budget summary', () => {
    interface SummaryBody {
      items: Array<{ id: string; budgetAmount: number | null; spent: number }>
      families: Array<{
        id: string
        proratedBudget: number
        spent: number
        items: Array<{ id: string }>
      }>
      totalBudget: number
      totalSpent: number
    }

    async function project(
      name: string,
      budgetAmount: number,
      familyId?: string
    ): Promise<string> {
      const response = await http()
        .post('/tags')
        .set(ctx.auth(owner))
        .send({
          name,
          isExceptional: true,
          budgetAmount,
          ...(familyId && { familyId }),
        })
      expect(response.status).toBe(201)
      return (response.body as TagBody).id
    }

    async function summary(): Promise<SummaryBody> {
      const response = await http()
        .get('/tags/budget-summary')
        .query({ startDate: '2026-01-01', endDate: '2026-03-31' })
        .set(ctx.auth(owner))
      expect(response.status).toBe(200)
      return response.body as SummaryBody
    }

    it('charges a family its prorata, in place of its tags’ envelopes', async () => {
      const travel = (await createFamily('Voyages')).body as FamilyBody
      await http()
        .patch(`/tag-families/${travel.id}`)
        .set(ctx.auth(owner))
        .send({ annualBudget: 1200 })
        .expect(200)
      const ski = await project('Ski 2026', 900, travel.id)
      const train = await project('Train ski 2026', 700, travel.id)
      const move = await project('Déménagement', 500)
      // One line carries both tags of the family: counted once.
      await expense([ski, train], { date: '2026-02-10', amount: -200 })
      await expense([ski], { date: '2026-02-12', amount: -50 })
      await expense([move], { date: '2026-03-01', amount: -80 })
      // Outside the window: not spent in it.
      await expense([ski], { date: '2026-05-01', amount: -999 })

      const body = await summary()

      expect(body.families.map(f => [f.id, f.proratedBudget, f.spent])).toEqual(
        [[travel.id, 300, 250]]
      )
      expect(body.families.flatMap(f => f.items.map(i => i.id)).sort()).toEqual(
        [ski, train].sort()
      )
      expect(body.items.map(i => [i.id, i.budgetAmount, i.spent])).toEqual([
        [move, 500, 80],
      ])
      expect(body.totalBudget).toBe(800)
      expect(body.totalSpent).toBe(330)
    })

    it('leaves the tags of a family without an envelope as they were', async () => {
      const concerts = (await createFamily('Concerts')).body as FamilyBody
      const tag = await project('Bad Bunny 2026', 150, concerts.id)
      await expense([tag], { date: '2026-01-20', amount: -90 })

      const body = await summary()

      expect(body.families).toEqual([])
      expect(body.items.map(i => [i.id, i.budgetAmount, i.spent])).toEqual([
        [tag, 150, 90],
      ])
      expect(body.totalBudget).toBe(150)
    })
  })

  describe('dashboard, the families of the year', () => {
    interface FamilyOfYearBody {
      id: string
      year: number
      spent: number
      spentByYear: { year: number; spent: number }[]
      annualBudget: number | null
      remaining: number | null
      transactionCount: number
      tagCount: number
    }
    interface DashboardBody {
      tagFamiliesOfYear: FamilyOfYearBody[]
      realExpensesOfYear: number | null
      exceptionalExpensesOfYear: number | null
      totalExpenses: number
    }

    /** The calendar year the server reads, in Paris. */
    const year = Number(calendarDayIn(new Date()).slice(0, 4))

    async function datedTag(
      name: string,
      familyId: string,
      start: string,
      end: string
    ): Promise<string> {
      const response = await http().post('/tags').set(ctx.auth(owner)).send({
        name,
        familyId,
        isExceptional: true,
        eventStartDate: start,
        eventEndDate: end,
      })
      expect(response.status).toBe(201)
      return (response.body as TagBody).id
    }

    async function dashboard(): Promise<DashboardBody> {
      const response = await http()
        .post('/dashboard/summary')
        .set(ctx.auth(owner))
        // A period that is not the year: the card reads the year anyway.
        .send({ startDate: `${year}-01-01`, endDate: `${year}-01-31` })
      // A POST without @HttpCode: Nest answers 201.
      expect(response.status).toBe(201)
      return response.body as DashboardBody
    }

    it('is empty for a user without a family', async () => {
      await expense([], { date: `${year}-01-10`, amount: -50 })

      const body = await dashboard()

      expect(body.tagFamiliesOfYear).toEqual([])
      expect(body.realExpensesOfYear).toBeNull()
      expect(body.exceptionalExpensesOfYear).toBeNull()
      expect(body.totalExpenses).toBe(50)
    })

    it('reads the year in event basis, each line once, with the envelope', async () => {
      const travel = (await createFamily('Voyages')).body as FamilyBody
      await http()
        .patch(`/tag-families/${travel.id}`)
        .set(ctx.auth(owner))
        .send({ annualBudget: 1000 })
        .expect(200)
      const rome = await datedTag(
        `Rome ${year}`,
        travel.id,
        `${year}-12-05`,
        `${year}-12-09`
      )
      const train = await datedTag(
        `Train Rome ${year}`,
        travel.id,
        `${year}-12-05`,
        `${year}-12-05`
      )
      const lisbon = await datedTag(
        `Lisbonne ${year + 1}`,
        travel.id,
        `${year + 1}-01-03`,
        `${year + 1}-01-08`
      )
      // Both tags of the family on one line: once.
      await expense([rome, train], { date: `${year}-03-10`, amount: -200 })
      // Paid the year before, for this year's edition: this year.
      await expense([rome], { date: `${year - 1}-11-20`, amount: -340 })
      // Paid this year, for next year's edition: next year.
      await expense([lisbon], { date: `${year}-02-01`, amount: -500 })
      await expense([], { date: `${year}-01-15`, amount: -1000 })
      // An edition two years ago: in the family's years, not in this year.
      const seville = await datedTag(
        `Séville ${year - 2}`,
        travel.id,
        `${year - 2}-05-01`,
        `${year - 2}-05-04`
      )
      await expense([seville], { date: `${year - 2}-04-20`, amount: -300 })
      // Exceptional without a family: in the year's exceptional only.
      const fine = (
        await http()
          .post('/tags')
          .set(ctx.auth(owner))
          .send({ name: 'Amende', isExceptional: true })
          .expect(201)
      ).body as TagBody
      await expense([fine.id], { date: `${year}-04-01`, amount: -80 })
      // A family with nothing this year is not listed.
      await createFamily('Concerts')

      const body = await dashboard()

      expect(body.tagFamiliesOfYear).toEqual([
        {
          id: travel.id,
          name: 'Voyages',
          color: '#22c55e',
          icon: null,
          year,
          spent: 540,
          // Next year's deposit is not drawn: up to this year only.
          spentByYear: [
            { year: year - 2, spent: 300 },
            { year, spent: 540 },
          ],
          annualBudget: 1000,
          remaining: 460,
          transactionCount: 2,
          tagCount: 2,
        },
      ])
      // Every expense dated this year: 200 + 500 + 1 000 + 80.
      expect(body.realExpensesOfYear).toBe(1780)
      // Those with an exceptional tag, by payment date: 200 + 500 + 80.
      expect(body.exceptionalExpensesOfYear).toBe(780)
      // The period itself is unchanged by the card.
      expect(body.totalExpenses).toBe(1000)
    })
  })

  // A tag reads like the dashboard: a reimbursement comes off the expense it
  // repays, and the income it was drawn from is not shown as income again.
  describe('netting, the dashboard rule', () => {
    interface AnalysisBody {
      totalExpenses: number
      totalIncome: number
      transactionCount: number
      byCategory: { type: string; amount: number }[]
    }

    async function income(
      tagIds: string[],
      { date = '2026-12-10', amount = 150 } = {}
    ): Promise<string> {
      const row = await prisma.transaction.create({
        data: {
          userId,
          accountId,
          hash: `e2e-family-income-${(sequence += 1)}`,
          date: new Date(date),
          description: 'VIR ALICE',
          amount,
          type: 'INCOME',
        },
      })
      for (const tagId of tagIds) {
        await prisma.transactionTag.create({
          data: { tagId, transactionId: row.id },
        })
      }
      return row.id
    }

    async function post(
      path: string,
      body: Record<string, unknown>
    ): Promise<{ id: string }> {
      const response = await http().post(path).set(ctx.auth(owner)).send(body)
      expect(response.status, `${path}: ${JSON.stringify(response.body)}`).toBe(
        201
      )
      return response.body as { id: string }
    }

    /**
     * Rome: a 300 € hotel half repaid in cash by Alice, through a 150 €
     * transfer the user tagged with the trip too, and a 100 € dinner with
     * 40 € still owed. Read with the default preference (a debt still owed
     * is deducted): 150 + 60 = 210, no income, two lines.
     */
    async function rome(): Promise<{ familyId: string; tagId: string }> {
      const family = (await createFamily('Voyages')).body as FamilyBody
      const tag = (
        await http().post('/tags').set(ctx.auth(owner)).send({
          name: 'Rome 2026',
          familyId: family.id,
          isExceptional: true,
          eventStartDate: '2026-12-05',
          eventEndDate: '2026-12-09',
        })
      ).body as TagBody
      const hotel = await expense([tag.id], {
        date: '2026-12-05',
        amount: -300,
      })
      const dinner = await expense([tag.id], {
        date: '2026-12-06',
        amount: -100,
      })
      const refund = await income([tag.id])
      const alice = await post('/persons', { name: 'Alice' })
      const hotelDebt = await post('/reimbursements', {
        transactionId: hotel,
        personId: alice.id,
        amount: 150,
      })
      await post('/reimbursements', {
        transactionId: dinner,
        personId: alice.id,
        amount: 40,
      })
      await post('/settlements', {
        personId: alice.id,
        incomeTransactionId: refund,
        reimbursements: [{ reimbursementId: hotelDebt.id, amountSettled: 150 }],
      })
      return { familyId: family.id, tagId: tag.id }
    }

    it('nets a tag, and hides the income drawn to repay it', async () => {
      const { tagId } = await rome()

      const body = (
        await http().get(`/tags/${tagId}/analysis`).set(ctx.auth(owner))
      ).body as AnalysisBody

      expect(body.totalExpenses).toBe(210)
      expect(body.totalIncome).toBe(0)
      expect(body.transactionCount).toBe(2)
      expect(body.byCategory.map(c => c.type)).toEqual(['EXPENSE'])
    })

    it('reads the family, the budget and the dashboard with the same figure', async () => {
      const { familyId, tagId } = await rome()

      const family = (
        await http()
          .get(`/tag-families/${familyId}/analysis`)
          .query({ year: '2026' })
          .set(ctx.auth(owner))
      ).body as AnalysisBody & { tags: { id: string; spent: number }[] }
      expect(family.totalExpenses).toBe(210)
      expect(family.totalIncome).toBe(0)
      expect(family.transactionCount).toBe(2)
      expect(family.tags.map(t => [t.id, t.spent])).toEqual([[tagId, 210]])

      const summary = (
        await http()
          .get('/tags/budget-summary')
          .query({ startDate: '2026-12-01', endDate: '2026-12-31' })
          .set(ctx.auth(owner))
      ).body as { items: { id: string; spent: number }[]; totalSpent: number }
      expect(summary.items.map(i => [i.id, i.spent])).toEqual([[tagId, 210]])
      expect(summary.totalSpent).toBe(210)

      const dashboard = (
        await http()
          .post('/dashboard/summary')
          .set(ctx.auth(owner))
          .send({ startDate: '2026-12-01', endDate: '2026-12-31' })
      ).body as {
        exceptionalEvents: { id: string; amount: number }[]
        tagFamiliesOfYear: { id: string; spent: number }[]
      }
      expect(dashboard.exceptionalEvents).toEqual([
        expect.objectContaining({ id: tagId, amount: 210 }),
      ])
      expect(dashboard.tagFamiliesOfYear).toEqual([
        expect.objectContaining({ id: familyId, spent: 210 }),
      ])
    })
  })
})
