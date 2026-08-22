/**
 * Moving a category's transactions into another one, against a real database.
 *
 * The planning rules are covered on their own in
 * `category-migration.plan.spec.ts`. What can only be checked here is the half
 * the plan cannot know about: that reparenting a subcategory really keeps its
 * id and its transactions, that a merge really relabels the denormalized
 * `subcategory` the dashboard groups on, and that the arrangements the plan
 * refuses are exactly the ones `@@unique([categoryId, name])` would have
 * rejected anyway.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

interface PreviewBody {
  sourceCategoryName: string
  targetCategoryName: string
  sourceSubcategories: {
    id: string
    name: string
    transactionCount: number
    nameTakenInTarget: boolean
  }[]
  targetSubcategories: { id: string; name: string }[]
  uncategorizedCount: number
  defaultActions: {
    sourceSubcategoryId: string | null
    action: string
    targetSubcategoryId?: string
  }[]
  budgetPlanEntries: { planName: string; amount: number }[]
}

interface ResultBody {
  movedTransactions: number
  movedSubcategories: number
  mergedSubcategories: number
  keptTransactions: number
  keptSubcategories: number
  sourceLeftEmpty: boolean
}

describe('Category migration (e2e)', () => {
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
    const account = await prisma.account.create({
      data: { userId, name: 'Compte courant' },
    })
    accountId = account.id
  })

  const http = () => request(ctx.server)

  async function createCategory(
    name: string,
    type: 'EXPENSE' | 'INCOME' = 'EXPENSE'
  ): Promise<string> {
    const category = await prisma.category.create({
      data: { userId, name, type },
    })
    return category.id
  }

  async function createSubcategory(
    categoryId: string,
    name: string
  ): Promise<string> {
    const subcategory = await prisma.subcategory.create({
      data: { userId, categoryId, name },
    })
    return subcategory.id
  }

  let txCounter = 0
  async function createTransaction(
    categoryId: string,
    subcategory: { id: string; name: string } | null
  ): Promise<string> {
    txCounter++
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        accountId,
        categoryId,
        subcategoryId: subcategory?.id ?? null,
        subcategory: subcategory?.name ?? null,
        hash: `${userId}-tx-${txCounter}-${Date.now()}`,
        date: new Date('2026-03-04'),
        description: `Achat ${txCounter}`,
        amount: -10,
        type: 'EXPENSE',
      },
    })
    return transaction.id
  }

  async function preview(
    sourceId: string,
    targetId: string
  ): Promise<PreviewBody> {
    const response = await http()
      .get(`/categories/${sourceId}/migration-preview`)
      .query({ targetCategoryId: targetId })
      .set(ctx.auth(owner))

    expect(response.status).toBe(200)
    return response.body as PreviewBody
  }

  async function migrate(
    sourceId: string,
    targetId: string,
    actions: unknown[]
  ): Promise<request.Response> {
    return http()
      .post(`/categories/${sourceId}/migrate`)
      .set(ctx.auth(owner))
      .send({ targetCategoryId: targetId, actions })
  }

  /**
   * "Loisirs & Sorties" → "Loisirs": one colliding name, two clean ones, and
   * a few transactions filed nowhere.
   */
  async function scenario() {
    const source = await createCategory('Loisirs & Sorties')
    const target = await createCategory('Loisirs')

    const srcSport = await createSubcategory(source, 'Sport')
    const srcMusic = await createSubcategory(source, 'Musique')
    const dstSport = await createSubcategory(target, 'Sport')
    const dstCinema = await createSubcategory(target, 'Cinéma')

    await createTransaction(source, { id: srcSport, name: 'Sport' })
    await createTransaction(source, { id: srcSport, name: 'Sport' })
    await createTransaction(source, { id: srcMusic, name: 'Musique' })
    await createTransaction(source, null)

    return { source, target, srcSport, srcMusic, dstSport, dstCinema }
  }

  describe('preview', () => {
    it('flags the line the destination has no room for', async () => {
      const { source, target, srcSport } = await scenario()

      const body = await preview(source, target)

      const sport = body.sourceSubcategories.find(s => s.id === srcSport)
      expect(sport).toMatchObject({
        transactionCount: 2,
        nameTakenInTarget: true,
      })
      expect(
        body.sourceSubcategories.find(s => s.name === 'Musique')
      ).toMatchObject({ nameTakenInTarget: false })
      expect(body.uncategorizedCount).toBe(1)
    })

    it('arrives already decided, merging only where it must', async () => {
      const { source, target, srcSport, srcMusic, dstSport } = await scenario()

      const { defaultActions } = await preview(source, target)

      expect(defaultActions).toContainEqual({
        sourceSubcategoryId: srcSport,
        action: 'MERGE',
        targetSubcategoryId: dstSport,
      })
      expect(defaultActions).toContainEqual({
        sourceSubcategoryId: srcMusic,
        action: 'MOVE',
      })
      expect(defaultActions).toContainEqual({
        sourceSubcategoryId: null,
        action: 'MOVE',
      })
    })

    it('names the budget line that will lose its spending', async () => {
      const { source, target } = await scenario()
      const plan = await prisma.budgetPlan.create({
        data: {
          userId,
          name: 'Second semestre 2026',
          startDate: new Date('2026-07-01'),
          endDate: new Date('2026-12-31'),
        },
      })
      await prisma.budgetPlanEntry.create({
        data: { budgetPlanId: plan.id, categoryId: source, amount: 300 },
      })

      const body = await preview(source, target)

      // The only consequence the mapping table cannot show.
      expect(body.budgetPlanEntries).toEqual([
        {
          planName: 'Second semestre 2026',
          amount: 300,
          startDate: expect.any(String),
          endDate: expect.any(String),
        },
      ])
    })

    it('refuses a destination of the other type', async () => {
      const source = await createCategory('Loisirs', 'EXPENSE')
      const target = await createCategory('Salaire', 'INCOME')

      const response = await http()
        .get(`/categories/${source}/migration-preview`)
        .query({ targetCategoryId: target })
        .set(ctx.auth(owner))

      expect(response.status).toBe(400)
    })
  })

  describe('migrate', () => {
    it('reparents a subcategory instead of recreating it', async () => {
      const { source, target, srcMusic } = await scenario()
      const { defaultActions } = await preview(source, target)

      const response = await migrate(source, target, defaultActions)
      expect(response.status).toBe(201)

      // Same row, new parent: every transaction pointing at it still does.
      const music = await prisma.subcategory.findUnique({
        where: { id: srcMusic },
      })
      expect(music?.categoryId).toBe(target)
    })

    it('relabels what it merges, and drops the emptied subcategory', async () => {
      const { source, target, srcSport, dstSport } = await scenario()
      const { defaultActions } = await preview(source, target)

      await migrate(source, target, defaultActions)

      const moved = await prisma.transaction.findMany({
        where: { userId, subcategoryId: dstSport },
      })
      expect(moved).toHaveLength(2)
      // The dashboard groups on this denormalized label, so a stale one would
      // show a heading the destination category does not have.
      expect(moved.every(t => t.subcategory === 'Sport')).toBe(true)
      expect(
        await prisma.subcategory.findUnique({ where: { id: srcSport } })
      ).toBeNull()
    })

    it('empties the source without deleting it', async () => {
      const { source, target } = await scenario()
      const { defaultActions } = await preview(source, target)

      const response = await migrate(source, target, defaultActions)

      expect(response.body as ResultBody).toMatchObject({
        movedTransactions: 4,
        movedSubcategories: 1,
        mergedSubcategories: 1,
        keptTransactions: 0,
        sourceLeftEmpty: true,
      })
      // Emptying is not asking for removal.
      expect(
        await prisma.category.findUnique({ where: { id: source } })
      ).not.toBeNull()
      expect(
        await prisma.transaction.count({ where: { categoryId: source } })
      ).toBe(0)
    })

    it('leaves behind exactly what was marked to stay', async () => {
      const { source, target, srcSport, srcMusic, dstSport } = await scenario()

      const response = await migrate(source, target, [
        {
          sourceSubcategoryId: srcSport,
          action: 'MERGE',
          targetSubcategoryId: dstSport,
        },
        { sourceSubcategoryId: srcMusic, action: 'KEEP' },
        { sourceSubcategoryId: null, action: 'KEEP' },
      ])

      expect(response.body as ResultBody).toMatchObject({
        movedTransactions: 2,
        keptTransactions: 2,
        keptSubcategories: 1,
        sourceLeftEmpty: false,
      })
      expect(
        await prisma.transaction.count({ where: { categoryId: source } })
      ).toBe(2)
      const music = await prisma.subcategory.findUnique({
        where: { id: srcMusic },
      })
      expect(music?.categoryId).toBe(source)
    })

    it('can file the unfiled transactions under a destination subcategory', async () => {
      const { source, target, srcSport, srcMusic, dstSport, dstCinema } =
        await scenario()

      await migrate(source, target, [
        {
          sourceSubcategoryId: srcSport,
          action: 'MERGE',
          targetSubcategoryId: dstSport,
        },
        { sourceSubcategoryId: srcMusic, action: 'MOVE' },
        {
          sourceSubcategoryId: null,
          action: 'MERGE',
          targetSubcategoryId: dstCinema,
        },
      ])

      const filed = await prisma.transaction.findMany({
        where: { userId, subcategoryId: dstCinema },
      })
      expect(filed).toHaveLength(1)
      expect(filed[0]?.subcategory).toBe('Cinéma')
    })

    it('never leaves a transaction whose subcategory sits elsewhere', async () => {
      const { source, target } = await scenario()
      const { defaultActions } = await preview(source, target)

      await migrate(source, target, defaultActions)

      // The invariant the whole feature exists to respect, checked against the
      // real rows rather than inferred from the plan.
      const rows = await prisma.transaction.findMany({
        where: { userId, subcategoryId: { not: null } },
        select: {
          categoryId: true,
          subcategoryRef: { select: { categoryId: true } },
        },
      })
      expect(
        rows.filter(r => r.subcategoryRef?.categoryId !== r.categoryId)
      ).toEqual([])
    })

    it('refuses to move onto a name the destination already uses', async () => {
      const { source, target, srcSport, srcMusic } = await scenario()

      // The database would refuse this too; failing early says why.
      const response = await migrate(source, target, [
        { sourceSubcategoryId: srcSport, action: 'MOVE' },
        { sourceSubcategoryId: srcMusic, action: 'KEEP' },
        { sourceSubcategoryId: null, action: 'KEEP' },
      ])

      expect(response.status).toBe(400)
      expect((response.body as { message: string }).message).toMatch(
        /already exists in the destination/
      )
    })

    it('changes nothing when the arrangement is refused', async () => {
      const { source, target, srcSport } = await scenario()

      // One line missing: the unfiled transactions were never decided.
      const response = await migrate(source, target, [
        { sourceSubcategoryId: srcSport, action: 'KEEP' },
      ])

      expect(response.status).toBe(400)
      expect(
        await prisma.transaction.count({ where: { categoryId: source } })
      ).toBe(4)
    })

    it('refuses to move a category into itself', async () => {
      const { source } = await scenario()

      const response = await migrate(source, source, [])

      expect(response.status).toBe(400)
    })
  })
})
