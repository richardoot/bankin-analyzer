/**
 * Lot 1 of the tag families (agent-os/product/tag-families.md), against the
 * real endpoints, the global ValidationPipe and the migrated schema:
 *
 * - a family name is unique per user (409), someone else's family is a 404,
 *   on its own routes and when a tag is filed under it;
 * - deleting a family keeps its tags, without a family (ON DELETE SET NULL).
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
    await http().get('/users/me').set(ctx.auth(owner))
    await http().get('/users/me').set(ctx.auth(stranger))
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
})
