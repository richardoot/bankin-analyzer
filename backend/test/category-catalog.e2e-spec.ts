import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { CATEGORY_CATALOG } from '../src/categories/catalog'
import { provisionCatalogForUser } from '../src/categories/category-catalog.provisioning'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')

const CATALOG_CATEGORY_COUNT = CATEGORY_CATALOG.length
const CATALOG_SUBCATEGORY_COUNT = CATEGORY_CATALOG.reduce(
  (sum, category) => sum + category.subcategories.length,
  0
)

/**
 * The catalogue landing on real rows: the unit tests cover the decisions,
 * this covers the SQL that carries them out — the batched inserts, the
 * unique key on (user, catalogue key), and the two paths a real account
 * takes: brand new, and predating the catalogue.
 */
describe('Category catalogue (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService

  beforeAll(async () => {
    ctx = await createE2eApp([owner])
    prisma = ctx.prisma
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await prisma.user.deleteMany()
  })

  async function ownerId(): Promise<string> {
    const me = await request(ctx.server).get('/users/me').set(ctx.auth(owner))
    expect(me.status).toBe(200)
    return (me.body as { id: string }).id
  }

  it('gives a brand-new user the whole catalogue on the request that creates the row', async () => {
    const userId = await ownerId()

    const [categories, subcategories] = await Promise.all([
      prisma.category.findMany({ where: { userId } }),
      prisma.subcategory.findMany({ where: { userId } }),
    ])
    expect(categories).toHaveLength(CATALOG_CATEGORY_COUNT)
    expect(subcategories).toHaveLength(CATALOG_SUBCATEGORY_COUNT)
    expect(categories.every(c => c.catalogKey !== null)).toBe(true)

    const housing = categories.find(c => c.catalogKey === 'housing')
    expect(housing).toMatchObject({
      name: 'Logement',
      type: 'EXPENSE',
      icon: '🏠',
      defaultNature: 'ESSENTIAL',
      defaultRhythm: 'VARIABLE',
    })
    const rent = subcategories.find(s => s.catalogKey === 'housing.rent')
    expect(rent).toMatchObject({
      categoryId: housing?.id,
      name: 'Loyer ou crédit immobilier',
      nature: 'ESSENTIAL',
      rhythm: 'COMMITTED',
    })

    // Income and transfer rows carry no attributes, on purpose.
    const salary = subcategories.find(
      s => s.catalogKey === 'work-income.salary'
    )
    expect(salary).toMatchObject({ nature: null, rhythm: null })
    const transfer = categories.find(c => c.catalogKey === 'internal-transfer')
    expect(transfer).toMatchObject({ type: 'TRANSFER', defaultNature: null })
  })

  it('is idempotent: a second run finds nothing to do', async () => {
    const userId = await ownerId()

    const summary = await provisionCatalogForUser(prisma, userId)

    expect(summary).toEqual({
      createdCategories: 0,
      adoptedCategories: 0,
      createdSubcategories: 0,
      adoptedSubcategories: 0,
      retiredDeleted: 0,
      retiredReleased: 0,
    })
    expect(await prisma.category.count({ where: { userId } })).toBe(
      CATALOG_CATEGORY_COUNT
    )
  })

  it('adopts the legacy rows of an account predating the catalogue', async () => {
    // A user row without the request path, the way every account created
    // before the catalogue exists in production.
    const user = await prisma.user.create({
      data: { supabaseId: 'legacy-supabase', email: 'legacy@e2e.invalid' },
    })
    const housing = await prisma.category.create({
      data: { userId: user.id, name: 'Logement', type: 'EXPENSE', icon: '🏡' },
    })
    // Bears the catalogue label exactly: adopted. "Loyer" alone would not
    // be — the catalogue says "Loyer ou crédit immobilier" — and that is the
    // migration assistant's job, not this one's.
    const insurance = await prisma.subcategory.create({
      data: {
        userId: user.id,
        categoryId: housing.id,
        name: 'assurance habitation',
      },
    })
    const misc = await prisma.subcategory.create({
      data: {
        userId: user.id,
        categoryId: housing.id,
        name: 'Logement - Autres',
      },
    })
    const bankin = await prisma.category.create({
      data: {
        userId: user.id,
        name: 'Alimentation & Restau.',
        type: 'EXPENSE',
      },
    })

    const summary = await provisionCatalogForUser(prisma, user.id)

    expect(summary).toEqual({
      createdCategories: CATALOG_CATEGORY_COUNT - 1,
      adoptedCategories: 1,
      createdSubcategories: CATALOG_SUBCATEGORY_COUNT - 1,
      adoptedSubcategories: 1,
      retiredDeleted: 0,
      retiredReleased: 0,
    })

    // Adopted in place: same id, catalogue key, icon and defaults.
    const adopted = await prisma.category.findUniqueOrThrow({
      where: { id: housing.id },
    })
    expect(adopted).toMatchObject({
      catalogKey: 'housing',
      icon: '🏠',
      defaultNature: 'ESSENTIAL',
      defaultRhythm: 'VARIABLE',
    })
    const adoptedInsurance = await prisma.subcategory.findUniqueOrThrow({
      where: { id: insurance.id },
    })
    expect(adoptedInsurance).toMatchObject({
      catalogKey: 'housing.insurance',
      nature: 'ESSENTIAL',
      rhythm: 'COMMITTED',
    })

    // Left for the migration assistant: the lookalike category and the
    // subcategory whose name is not the catalogue's.
    const untouchedMisc = await prisma.subcategory.findUniqueOrThrow({
      where: { id: misc.id },
    })
    expect(untouchedMisc.catalogKey).toBeNull()
    const untouchedBankin = await prisma.category.findUniqueOrThrow({
      where: { id: bankin.id },
    })
    expect(untouchedBankin.catalogKey).toBeNull()

    // And the catalogue's own "Autre" sits beside the legacy one.
    const others = await prisma.subcategory.findMany({
      where: {
        categoryId: housing.id,
        name: { in: ['Autre', 'Logement - Autres'] },
      },
    })
    expect(others).toHaveLength(2)

    // Nothing left to do afterwards.
    const again = await provisionCatalogForUser(prisma, user.id)
    expect(again.createdCategories + again.adoptedCategories).toBe(0)
  })

  it('retires what a newer catalogue dropped: empty rows go, used rows are released', async () => {
    const userId = await ownerId()
    const transport = await prisma.category.findUniqueOrThrow({
      where: { userId_catalogKey: { userId, catalogKey: 'transport' } },
    })
    // Two rows from a former catalogue version: one empty, one in use.
    await prisma.subcategory.create({
      data: {
        userId,
        categoryId: transport.id,
        name: 'Péage et stationnement',
        catalogKey: 'transport.tolls-parking',
        nature: 'ESSENTIAL',
        rhythm: 'VARIABLE',
      },
    })
    const used = await prisma.subcategory.create({
      data: {
        userId,
        categoryId: transport.id,
        name: 'Train et avion',
        catalogKey: 'transport.train-plane',
        nature: 'PLEASURE',
        rhythm: 'VARIABLE',
      },
    })
    const account = await prisma.account.create({
      data: { userId, name: 'Compte courant' },
    })
    await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: transport.id,
        subcategoryId: used.id,
        subcategory: used.name,
        hash: `${userId}-train`,
        date: new Date('2026-03-04'),
        description: 'SNCF',
        amount: -60,
        type: 'EXPENSE',
      },
    })

    const summary = await provisionCatalogForUser(prisma, userId)

    expect(summary).toMatchObject({ retiredDeleted: 1, retiredReleased: 1 })
    expect(
      await prisma.subcategory.findFirst({
        where: { userId, catalogKey: 'transport.tolls-parking' },
      })
    ).toBeNull()
    const released = await prisma.subcategory.findUniqueOrThrow({
      where: { id: used.id },
    })
    expect(released).toMatchObject({
      catalogKey: null,
      name: 'Train et avion',
      nature: 'PLEASURE',
    })
    expect(
      await prisma.transaction.count({ where: { subcategoryId: used.id } })
    ).toBe(1)
  })

  it('keeps one user’s catalogue apart from another’s', async () => {
    const first = await ownerId()
    const other = await prisma.user.create({
      data: { supabaseId: 'other-supabase', email: 'other@e2e.invalid' },
    })
    await provisionCatalogForUser(prisma, other.id)

    expect(await prisma.category.count({ where: { userId: first } })).toBe(
      CATALOG_CATEGORY_COUNT
    )
    expect(await prisma.category.count({ where: { userId: other.id } })).toBe(
      CATALOG_CATEGORY_COUNT
    )
  })
})
