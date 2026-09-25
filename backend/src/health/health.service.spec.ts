import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATABASE_TIMEOUT_MS, HealthService } from './health.service'
import type { PrismaService } from '../prisma/prisma.service'

function service(queryRaw: () => Promise<unknown>): HealthService {
  return new HealthService({
    $queryRaw: queryRaw,
    poolStats: () => ({ total: 1, idle: 1, waiting: 0 }),
  } as unknown as PrismaService)
}

describe('HealthService', () => {
  const env = process.env

  beforeEach(() => {
    vi.useFakeTimers()
    process.env = { ...env }
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env = env
  })

  it('is ok when the database answers', async () => {
    const report = await service(() =>
      Promise.resolve([{ '?column?': 1 }])
    ).check()
    expect(report.status).toBe('ok')
    expect(report.checks.database.status).toBe('ok')
    expect(report.checks.database.latencyMs).toBeGreaterThanOrEqual(0)
    expect(report.pool).toEqual({ total: 1, idle: 1, waiting: 0 })
  })

  it('is an error when the query fails', async () => {
    const report = await service(() =>
      Promise.reject(new Error('connection refused'))
    ).check()
    expect(report.status).toBe('error')
    expect(report.checks.database.status).toBe('error')
  })

  it('gives up on a database that hangs, rather than hanging with it', async () => {
    const pending = service(() => new Promise(() => undefined)).check()
    await vi.advanceTimersByTimeAsync(DATABASE_TIMEOUT_MS + 1)
    const report = await pending
    expect(report.status).toBe('error')
    expect(report.checks.database.latencyMs).toBeGreaterThanOrEqual(
      DATABASE_TIMEOUT_MS
    )
  })

  it('names the deployed commit when Vercel says which one it is', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'df188bb0123456789abcdef'
    const report = await service(() => Promise.resolve(1)).check()
    expect(report.version).toBe('df188bb')
  })

  it('has no version to name elsewhere', async () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA
    const report = await service(() => Promise.resolve(1)).check()
    expect(report.version).toBeNull()
  })
})
