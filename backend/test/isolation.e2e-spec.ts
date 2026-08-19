import { describe, it, expect } from 'vitest'
import { createE2eApp, e2eIdentity } from './e2e-app'

/**
 * Guards the harness itself. E2E specs used to run against the shared
 * development database named by `backend/.env` — which, before that file was
 * repointed, was the hosted one. If the isolation ever regresses, this fails
 * here rather than by quietly writing somewhere real.
 */
describe('e2e isolation', () => {
  it('leaves DATABASE_URL pointing nowhere', async () => {
    // e2e-setup.ts sets a dead address before dotenv reads .env, and dotenv
    // does not override variables that are already set.
    expect(process.env.DATABASE_URL).toContain('127.0.0.1:1')
    expect(process.env.DATABASE_URL).not.toContain('5432')
  })

  it('starts from an empty database, not the developer one', async () => {
    const ctx = await createE2eApp([e2eIdentity('probe')])

    try {
      const rows = await ctx.prisma.$queryRawUnsafe<{ n: bigint }[]>(
        'SELECT count(*) AS n FROM app.transactions'
      )
      expect(Number(rows[0]?.n)).toBe(0)
    } finally {
      await ctx.close()
    }
  })
})
