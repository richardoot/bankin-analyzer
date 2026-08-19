import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

/** Two callers, so ownership rules can be exercised for real. */
const alice = e2eIdentity('alice')
const bob = e2eIdentity('bob')

describe('Users (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService

  beforeAll(async () => {
    ctx = await createE2eApp([alice, bob])
    prisma = ctx.prisma
  })

  afterAll(async () => {
    await ctx.close()
  })

  // The database starts empty and is dropped with the file, so each test wipes
  // only what it needs to.
  beforeEach(async () => {
    await prisma.user.deleteMany()
  })

  function usersOf(body: unknown): { id: string; email: string }[] {
    return Array.isArray(body) ? (body as { id: string; email: string }[]) : []
  }

  /** Hitting any authenticated route provisions the caller's row. */
  async function signIn(identity = alice): Promise<{ id: string }> {
    const response = await request(ctx.server)
      .get('/users/me')
      .set(ctx.auth(identity))

    expect(response.status).toBe(200)
    return response.body as { id: string }
  }

  describe('authentication', () => {
    it('should reject a request with no token', async () => {
      const response = await request(ctx.server).get('/users/me')

      expect(response.status).toBe(401)
    })

    it('should reject a malformed authorization header', async () => {
      const response = await request(ctx.server)
        .get('/users/me')
        .set({ Authorization: `Token ${alice.token}` })

      expect(response.status).toBe(401)
    })

    it('should reject an unknown token', async () => {
      const response = await request(ctx.server)
        .get('/users/me')
        .set({ Authorization: 'Bearer not-a-real-token' })

      expect(response.status).toBe(401)
    })
  })

  describe('/users/me (GET)', () => {
    it('should provision the user on first call', async () => {
      expect(
        await prisma.user.findUnique({
          where: { supabaseId: alice.supabaseId },
        })
      ).toBeNull()

      const response = await request(ctx.server)
        .get('/users/me')
        .set(ctx.auth(alice))

      expect(response.status).toBe(200)
      expect(response.body.email).toBe(alice.email)
      expect(response.body.supabaseId).toBe(alice.supabaseId)

      // The guard wrote it through, not just echoed it back.
      expect(
        await prisma.user.findUnique({
          where: { supabaseId: alice.supabaseId },
        })
      ).not.toBeNull()
    })

    it('should reuse the same row on the next call', async () => {
      const first = await signIn()
      const second = await signIn()

      expect(second.id).toBe(first.id)
      expect(await prisma.user.count()).toBe(1)
    })
  })

  describe('/users (GET)', () => {
    it('should return only the caller before anyone else signs in', async () => {
      const response = await request(ctx.server)
        .get('/users')
        .set(ctx.auth(alice))

      expect(response.status).toBe(200)
      // Alice provisioned herself by calling this route, and is the only one.
      expect(usersOf(response.body).map(u => u.email)).toEqual([alice.email])
    })

    it('should list every user once both have signed in', async () => {
      await signIn(alice)
      await signIn(bob)

      const response = await request(ctx.server)
        .get('/users')
        .set(ctx.auth(alice))

      expect(response.status).toBe(200)
      expect(
        usersOf(response.body)
          .map(u => u.email)
          .sort()
      ).toEqual([alice.email, bob.email].sort())
    })
  })

  describe('/users/:id (GET)', () => {
    it('should return a user by id', async () => {
      const caller = await signIn()

      const response = await request(ctx.server)
        .get(`/users/${caller.id}`)
        .set(ctx.auth(alice))

      expect(response.status).toBe(200)
      expect(response.body.id).toBe(caller.id)
      expect(response.body.email).toBe(alice.email)
    })

    it('should return 404 for a non-existent user', async () => {
      await signIn()

      const response = await request(ctx.server)
        .get('/users/550e8400-e29b-41d4-a716-446655440000')
        .set(ctx.auth(alice))

      expect(response.status).toBe(404)
    })
  })

  describe('/users/:id (DELETE)', () => {
    it('should delete your own account', async () => {
      const { id } = await signIn()

      const response = await request(ctx.server)
        .delete(`/users/${id}`)
        .set(ctx.auth(alice))

      expect(response.status).toBe(204)
      expect(await prisma.user.findUnique({ where: { id } })).toBeNull()
    })

    it("should refuse to delete someone else's account", async () => {
      const caller = await signIn(alice)
      await signIn(bob)

      const response = await request(ctx.server)
        .delete(`/users/${caller.id}`)
        .set(ctx.auth(bob))

      expect(response.status).toBe(403)
      // And Alice is still there.
      expect(
        await prisma.user.findUnique({ where: { id: caller.id } })
      ).not.toBeNull()
    })
  })

  describe('/users/me (DELETE)', () => {
    it('should delete the caller account', async () => {
      const { id } = await signIn()

      const response = await request(ctx.server)
        .delete('/users/me')
        .set(ctx.auth(alice))

      expect(response.status).toBe(204)
      expect(await prisma.user.findUnique({ where: { id } })).toBeNull()
      // The Supabase identity goes too, otherwise the next sign-in would
      // silently re-provision a fresh, empty account.
      expect(ctx.deletedFromAuth).toContain(alice.supabaseId)
    })
  })
})
