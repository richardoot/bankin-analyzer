import { describe, expect, it, vi } from 'vitest'
import type { Response } from 'express'
import { HealthController } from './health.controller'
import type { HealthReport, HealthService } from './health.service'

function controller(report: HealthReport): HealthController {
  return new HealthController({
    check: () => Promise.resolve(report),
  } as unknown as HealthService)
}

const ok: HealthReport = {
  status: 'ok',
  checks: { database: { status: 'ok', latencyMs: 4 } },
  pool: { total: 1, idle: 1, waiting: 0 },
  version: null,
}

describe('HealthController', () => {
  it('answers 200 with the report when everything is fine', async () => {
    const res = { status: vi.fn() } as unknown as Response
    expect(await controller(ok).check(res)).toBe(ok)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('answers 503 when the database is out, as a monitor expects', async () => {
    const res = { status: vi.fn() } as unknown as Response
    const down: HealthReport = {
      ...ok,
      status: 'error',
      checks: { database: { status: 'error', latencyMs: 3000 } },
    }
    expect(await controller(down).check(res)).toBe(down)
    expect(res.status).toHaveBeenCalledWith(503)
  })
})
