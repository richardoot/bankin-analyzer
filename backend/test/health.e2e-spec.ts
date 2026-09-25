/**
 * The observability plumbing, end to end: the health probe an uptime
 * monitor calls, and the request id every response carries.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

describe('health and request ids', () => {
  let ctx: E2eContext
  const alice = e2eIdentity('alice')

  beforeAll(async () => {
    ctx = await createE2eApp([alice])
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('GET /health answers 200 once the database is reachable', async () => {
    const res = await request(ctx.server).get('/health').expect(200)
    expect(res.body).toMatchObject({
      status: 'ok',
      checks: { database: { status: 'ok' } },
    })
    expect(res.body.checks.database.latencyMs).toBeGreaterThanOrEqual(0)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('needs no token and no rate-limit budget', async () => {
    for (let i = 0; i < 3; i += 1) {
      await request(ctx.server).get('/health').expect(200)
    }
  })

  it("stamps every response with Vercel's id when there is one", async () => {
    const res = await request(ctx.server)
      .get('/health')
      .set('x-vercel-id', 'cdg1::abcde-1712345678901-0123456789ab')
      .expect(200)
    expect(res.headers['x-request-id']).toBe(
      'cdg1::abcde-1712345678901-0123456789ab'
    )
  })

  it('mints an id otherwise, on a refused request too', async () => {
    const res = await request(ctx.server).get('/transactions').expect(401)
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body).not.toHaveProperty('requestId')
  })
})
