import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

/**
 * The migration assistant over the real API and the real SQL: a legacy
 * "Abonnements" the way Bankin' exports it, migrated into the catalogue with
 * every kind of decision at once, and everything that hangs off it —
 * envelopes, hidden preference, tags — checked afterwards.
 */
describe('Legacy category migration (e2e)', () => {
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

  let txCounter = 0
  async function file(
    categoryId: string,
    subcategory: { id: string; name: string } | null,
    count: number,
    type: 'EXPENSE' | 'INCOME' = 'EXPENSE'
  ): Promise<void> {
    for (let i = 0; i < count; i++) {
      txCounter++
      await prisma.transaction.create({
        data: {
          userId,
          accountId,
          categoryId,
          subcategoryId: subcategory?.id ?? null,
          subcategory: subcategory?.name ?? null,
          hash: `${userId}-${txCounter}`,
          date: new Date('2026-03-04'),
          description: `Ligne ${txCounter}`,
          amount: type === 'EXPENSE' ? -12 : 12,
          type,
        },
      })
    }
  }

  async function catalog(key: string): Promise<{ id: string; name: string }> {
    return prisma.category.findUniqueOrThrow({
      where: { userId_catalogKey: { userId, catalogKey: key } },
      select: { id: true, name: true },
    })
  }

  /** "Abonnements" as Bankin' exported it, with three subcategories and loose rows. */
  async function legacyAbonnements() {
    const category = await prisma.category.create({
      data: { userId, name: 'Abonnements', type: 'EXPENSE', icon: '📱' },
    })
    const phone = await prisma.subcategory.create({
      data: { userId, categoryId: category.id, name: 'Téléphonie mobile' },
    })
    const sport = await prisma.subcategory.create({
      data: { userId, categoryId: category.id, name: 'Sport' },
    })
    const ai = await prisma.subcategory.create({
      data: { userId, categoryId: category.id, name: 'AI' },
    })
    await file(category.id, phone, 3)
    await file(category.id, sport, 2)
    await file(category.id, ai, 2)
    await file(category.id, null, 1)
    return { category, phone, sport, ai }
  }

  describe('GET /categories/legacy', () => {
    it('lists the legacy categories with a suggestion per line', async () => {
      const { category, phone, sport } = await legacyAbonnements()

      const response = await http()
        .get('/categories/legacy')
        .set(ctx.auth(owner))

      expect(response.status).toBe(200)
      const body = response.body as {
        totalTransactions: number
        categories: {
          id: string
          name: string
          transactionCount: number
          lines: {
            sourceSubcategoryId: string | null
            name: string | null
            transactionCount: number
            suggestion: {
              subcategoryKey: string | null
              categoryKey: string | null
              action: string
            } | null
          }[]
        }[]
      }
      expect(body.totalTransactions).toBe(8)
      expect(body.categories).toHaveLength(1)
      const legacy = body.categories[0]!
      expect(legacy).toMatchObject({
        id: category.id,
        name: 'Abonnements',
        transactionCount: 8,
      })
      expect(
        legacy.lines.find(l => l.sourceSubcategoryId === phone.id)
      ).toMatchObject({
        transactionCount: 3,
        suggestion: { subcategoryKey: 'telecom.phone' },
      })
      // The pair is what tells a gym membership from a football match.
      expect(
        legacy.lines.find(l => l.sourceSubcategoryId === sport.id)?.suggestion
      ).toMatchObject({
        subcategoryKey: 'leisure.gym',
      })
      expect(
        legacy.lines.find(l => l.sourceSubcategoryId === null)
      ).toMatchObject({
        name: null,
        transactionCount: 1,
        suggestion: {
          action: 'CATALOG',
          categoryKey: 'telecom',
          subcategoryKey: null,
        },
      })
    })

    it('is empty once nothing legacy remains', async () => {
      const response = await http()
        .get('/categories/legacy')
        .set(ctx.auth(owner))

      expect(response.body).toEqual({ categories: [], totalTransactions: 0 })
    })
  })

  describe('a catalogue category with subcategories of its own', () => {
    /** "Logement" adopted by name, "Loyer" left beside "Loyer ou crédit immobilier". */
    async function strayLoyer() {
      const housing = await catalog('housing')
      const loyer = await prisma.subcategory.create({
        data: { userId, categoryId: housing.id, name: 'Loyer' },
      })
      await file(housing.id, loyer, 5)
      // Rows filed at the category alone, and under a catalogue subcategory:
      // neither is a line.
      const rent = await prisma.subcategory.findUniqueOrThrow({
        where: { userId_catalogKey: { userId, catalogKey: 'housing.rent' } },
      })
      await file(housing.id, { id: rent.id, name: rent.name }, 2)
      await file(housing.id, null, 1)
      return { housing, loyer, rent }
    }

    it('is listed with only its keyless subcategories as lines', async () => {
      const { housing, loyer } = await strayLoyer()

      const response = await http()
        .get('/categories/legacy')
        .set(ctx.auth(owner))

      expect(response.status).toBe(200)
      const body = response.body as {
        totalTransactions: number
        categories: {
          id: string
          isCatalog: boolean
          catalogKey: string | null
          transactionCount: number
          lines: {
            sourceSubcategoryId: string | null
            suggestion: { subcategoryKey: string | null } | null
          }[]
        }[]
      }
      expect(body.categories).toHaveLength(1)
      expect(body.categories[0]).toMatchObject({
        id: housing.id,
        isCatalog: true,
        catalogKey: 'housing',
        transactionCount: 5,
      })
      expect(body.categories[0]?.lines).toEqual([
        expect.objectContaining({
          sourceSubcategoryId: loyer.id,
          suggestion: expect.objectContaining({
            subcategoryKey: 'housing.rent',
          }),
        }),
      ])
      expect(body.totalTransactions).toBe(5)
    })

    it('files the stray rows under the catalogue subcategory and keeps the category', async () => {
      const { housing, loyer, rent } = await strayLoyer()

      const response = await http()
        .post(`/categories/${housing.id}/legacy-migration`)
        .set(ctx.auth(owner))
        .send({
          decisions: [
            {
              sourceSubcategoryId: loyer.id,
              action: 'CATALOG',
              categoryKey: 'housing',
              subcategoryKey: 'housing.rent',
            },
          ],
        })

      expect(response.status).toBe(201)
      expect(response.body).toMatchObject({
        movedTransactions: 5,
        deletedSubcategories: 1,
        sourceDeleted: false,
      })
      expect(
        await prisma.transaction.count({
          where: { categoryId: housing.id, subcategoryId: rent.id },
        })
      ).toBe(7)
      expect(
        await prisma.subcategory.findUnique({ where: { id: loyer.id } })
      ).toBeNull()
      expect(
        await prisma.category.findUnique({ where: { id: housing.id } })
      ).not.toBeNull()

      // Nothing left to tidy: the category is no longer listed.
      const after = await http().get('/categories/legacy').set(ctx.auth(owner))
      expect((after.body as { categories: unknown[] }).categories).toHaveLength(
        0
      )
    })

    it('refuses to file a subcategory onto itself', async () => {
      const { housing, loyer } = await strayLoyer()

      const response = await http()
        .post(`/categories/${housing.id}/legacy-migration`)
        .set(ctx.auth(owner))
        .send({
          decisions: [
            {
              sourceSubcategoryId: loyer.id,
              action: 'CUSTOM',
              categoryKey: 'housing',
              subcategoryName: 'Loyer',
            },
          ],
        })

      expect(response.status).toBe(400)
      expect(
        await prisma.subcategory.findUnique({ where: { id: loyer.id } })
      ).not.toBeNull()
    })
  })

  describe('POST /categories/:id/legacy-migration', () => {
    it('migrates every line as decided, then deletes the empty category', async () => {
      const { category, phone, sport, ai } = await legacyAbonnements()
      const telecom = await catalog('telecom')
      const leisure = await catalog('leisure')
      const savings = await catalog('emergency-savings')
      const tag = await prisma.tag.create({ data: { userId, name: 'Pro' } })
      // An envelope on the legacy category, in a plan where telecom has none.
      const plan = await prisma.budgetPlan.create({
        data: {
          userId,
          name: 'Budget 2026',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
        },
      })
      await prisma.budgetPlanEntry.create({
        data: { budgetPlanId: plan.id, categoryId: category.id, amount: 60 },
      })
      // Hidden by preference, the old way of keeping it out of the dashboard.
      await prisma.filterPreferences.create({
        data: { userId, globalHiddenExpenseCategoryIds: [category.id] },
      })

      const decisions = [
        {
          sourceSubcategoryId: phone.id,
          action: 'CATALOG',
          categoryKey: 'telecom',
          subcategoryKey: 'telecom.phone',
        },
        {
          sourceSubcategoryId: sport.id,
          action: 'CATALOG',
          categoryKey: 'leisure',
          subcategoryKey: 'leisure.gym',
        },
        {
          sourceSubcategoryId: ai.id,
          action: 'CUSTOM',
          categoryKey: 'telecom',
          subcategoryName: 'AI',
          tagId: tag.id,
        },
        {
          sourceSubcategoryId: null,
          action: 'CATALOG',
          categoryKey: 'emergency-savings',
        },
      ]

      const preview = await http()
        .post(`/categories/${category.id}/legacy-migration/preview`)
        .set(ctx.auth(owner))
        .send({ decisions })
      expect(preview.status).toBe(200)
      expect(preview.body).toMatchObject({
        movedTransactions: 8,
        unfiledTransactions: 0,
        typeChangedTransactions: 1,
        deletesSourceCategory: true,
        dropsHiddenPreference: true,
        budgetEntries: [
          {
            planName: 'Budget 2026',
            amount: 60,
            targetCategoryName: telecom.name,
            mergesIntoExisting: false,
          },
        ],
      })
      expect(
        (preview.body as { moves: { reparentsSubcategory: boolean }[] })
          .moves[2]
      ).toMatchObject({
        reparentsSubcategory: true,
        subcategoryName: 'AI',
      })

      const response = await http()
        .post(`/categories/${category.id}/legacy-migration`)
        .set(ctx.auth(owner))
        .send({ decisions })

      expect(response.status).toBe(201)
      expect(response.body).toEqual({
        sourceCategoryId: category.id,
        movedTransactions: 8,
        unfiledTransactions: 0,
        keptTransactions: 0,
        typeChangedTransactions: 1,
        createdSubcategories: 0,
        reparentedSubcategories: 1,
        deletedSubcategories: 2,
        taggedTransactions: 2,
        budgetEntriesMoved: 1,
        budgetEntriesMerged: 0,
        budgetEntriesDropped: 0,
        hiddenPreferenceDropped: true,
        sourceDeleted: true,
      })

      // The rows: filed where decided, label and type included.
      const telecomPhone = await prisma.subcategory.findUniqueOrThrow({
        where: { userId_catalogKey: { userId, catalogKey: 'telecom.phone' } },
      })
      expect(
        await prisma.transaction.count({
          where: {
            userId,
            categoryId: telecom.id,
            subcategoryId: telecomPhone.id,
            subcategory: telecomPhone.name,
          },
        })
      ).toBe(3)
      expect(
        await prisma.transaction.count({
          where: { userId, categoryId: leisure.id },
        })
      ).toBe(2)
      expect(
        await prisma.transaction.count({
          where: {
            userId,
            categoryId: savings.id,
            type: 'TRANSFER',
            subcategoryId: null,
          },
        })
      ).toBe(1)

      // "AI" travelled, id intact, and took its new parent's defaults.
      const movedAi = await prisma.subcategory.findUniqueOrThrow({
        where: { id: ai.id },
      })
      expect(movedAi).toMatchObject({
        categoryId: telecom.id,
        nature: 'ESSENTIAL',
        rhythm: 'COMMITTED',
      })
      expect(
        await prisma.transaction.count({
          where: { subcategoryId: ai.id, categoryId: telecom.id },
        })
      ).toBe(2)
      // …and its rows carry the tag.
      expect(
        await prisma.transactionTag.count({ where: { tagId: tag.id } })
      ).toBe(2)

      // The envelope followed the category that received most rows.
      const entries = await prisma.budgetPlanEntry.findMany({
        where: { budgetPlanId: plan.id },
      })
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ categoryId: telecom.id })
      expect(entries[0]?.amount.toNumber()).toBe(60)

      // The hidden preference went with the category, which is gone.
      const preferences = await prisma.filterPreferences.findUniqueOrThrow({
        where: { userId },
      })
      expect(preferences.globalHiddenExpenseCategoryIds).toEqual([])
      expect(
        await prisma.category.findUnique({ where: { id: category.id } })
      ).toBeNull()
      expect(
        await prisma.subcategory.findUnique({ where: { id: phone.id } })
      ).toBeNull()
    })

    it('sums an envelope into one the target already has', async () => {
      const { category, phone, sport, ai } = await legacyAbonnements()
      const telecom = await catalog('telecom')
      const plan = await prisma.budgetPlan.create({
        data: {
          userId,
          name: 'Budget 2026',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
        },
      })
      await prisma.budgetPlanEntry.create({
        data: { budgetPlanId: plan.id, categoryId: category.id, amount: 60 },
      })
      await prisma.budgetPlanEntry.create({
        data: { budgetPlanId: plan.id, categoryId: telecom.id, amount: 40 },
      })

      const response = await http()
        .post(`/categories/${category.id}/legacy-migration`)
        .set(ctx.auth(owner))
        .send({
          decisions: [
            {
              sourceSubcategoryId: phone.id,
              action: 'CATALOG',
              categoryKey: 'telecom',
            },
            {
              sourceSubcategoryId: sport.id,
              action: 'CATALOG',
              categoryKey: 'telecom',
            },
            {
              sourceSubcategoryId: ai.id,
              action: 'CATALOG',
              categoryKey: 'telecom',
            },
            {
              sourceSubcategoryId: null,
              action: 'CATALOG',
              categoryKey: 'telecom',
            },
          ],
        })

      expect(response.status).toBe(201)
      expect(response.body).toMatchObject({
        budgetEntriesMerged: 1,
        budgetEntriesMoved: 0,
      })
      const entries = await prisma.budgetPlanEntry.findMany({
        where: { budgetPlanId: plan.id },
      })
      expect(entries).toHaveLength(1)
      expect(entries[0]?.amount.toNumber()).toBe(100)
    })

    it('unfiles a heading that names no purpose, keeps a line, and keeps the category', async () => {
      const { category, phone, sport, ai } = await legacyAbonnements()
      const tag = await prisma.tag.create({
        data: { userId, name: 'Vacances', isExceptional: true },
      })

      const response = await http()
        .post(`/categories/${category.id}/legacy-migration`)
        .set(ctx.auth(owner))
        .send({
          decisions: [
            { sourceSubcategoryId: phone.id, action: 'UNFILE', tagId: tag.id },
            { sourceSubcategoryId: sport.id, action: 'KEEP' },
            {
              sourceSubcategoryId: ai.id,
              action: 'CUSTOM',
              categoryKey: 'telecom',
              subcategoryName: 'Assistants',
            },
            { sourceSubcategoryId: null, action: 'KEEP' },
          ],
        })

      expect(response.status).toBe(201)
      expect(response.body).toMatchObject({
        movedTransactions: 2,
        unfiledTransactions: 3,
        keptTransactions: 3,
        createdSubcategories: 1,
        deletedSubcategories: 2,
        taggedTransactions: 3,
        sourceDeleted: false,
      })
      expect(
        await prisma.transaction.count({
          where: { userId, categoryId: null, subcategoryId: null },
        })
      ).toBe(3)
      expect(
        await prisma.transactionTag.count({ where: { tagId: tag.id } })
      ).toBe(3)
      const created = await prisma.subcategory.findFirst({
        where: { userId, name: 'Assistants' },
      })
      expect(created).toMatchObject({
        catalogKey: null,
        nature: 'ESSENTIAL',
        rhythm: 'COMMITTED',
      })
      expect(
        await prisma.category.findUnique({ where: { id: category.id } })
      ).not.toBeNull()
      expect(
        await prisma.subcategory.findUnique({ where: { id: sport.id } })
      ).not.toBeNull()
    })

    it('rejects an impossible arrangement without touching anything', async () => {
      const { category, phone, sport, ai } = await legacyAbonnements()

      const response = await http()
        .post(`/categories/${category.id}/legacy-migration`)
        .set(ctx.auth(owner))
        .send({
          decisions: [
            {
              sourceSubcategoryId: phone.id,
              action: 'CATALOG',
              categoryKey: 'refunds',
            },
            { sourceSubcategoryId: sport.id, action: 'KEEP' },
            { sourceSubcategoryId: ai.id, action: 'KEEP' },
            { sourceSubcategoryId: null, action: 'KEEP' },
          ],
        })

      expect(response.status).toBe(400)
      expect(
        await prisma.transaction.count({ where: { categoryId: category.id } })
      ).toBe(8)
    })

    it('rejects a missing line rather than defaulting it', async () => {
      const { category, phone } = await legacyAbonnements()

      const response = await http()
        .post(`/categories/${category.id}/legacy-migration`)
        .set(ctx.auth(owner))
        .send({
          decisions: [{ sourceSubcategoryId: phone.id, action: 'UNFILE' }],
        })

      expect(response.status).toBe(400)
    })

    it("refuses a catalogue category, another user's category, and another user's tag", async () => {
      const { category, phone, sport, ai } = await legacyAbonnements()
      const telecom = await catalog('telecom')

      const locked = await http()
        .post(`/categories/${telecom.id}/legacy-migration`)
        .set(ctx.auth(owner))
        .send({ decisions: [] })
      expect(locked.status).toBe(404)

      const foreign = await http()
        .post(`/categories/${category.id}/legacy-migration`)
        .set(ctx.auth(stranger))
        .send({ decisions: [] })
      expect(foreign.status).toBe(404)

      const strangerRow = await prisma.user.findUniqueOrThrow({
        where: { supabaseId: stranger.supabaseId },
      })
      const strangerTag = await prisma.tag.create({
        data: { userId: strangerRow.id, name: 'Leur tag' },
      })
      const badTag = await http()
        .post(`/categories/${category.id}/legacy-migration`)
        .set(ctx.auth(owner))
        .send({
          decisions: [
            {
              sourceSubcategoryId: phone.id,
              action: 'UNFILE',
              tagId: strangerTag.id,
            },
            { sourceSubcategoryId: sport.id, action: 'KEEP' },
            { sourceSubcategoryId: ai.id, action: 'KEEP' },
            { sourceSubcategoryId: null, action: 'KEEP' },
          ],
        })
      expect(badTag.status).toBe(404)
    })
  })
})
