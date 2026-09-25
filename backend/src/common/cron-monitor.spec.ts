import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CHECKIN_MARGIN_MINUTES,
  DEFAULT_MAX_RUNTIME_MINUTES,
  monitoredRun,
} from './cron-monitor'

const { captureCheckIn, flush, waitUntil } = vi.hoisted(() => ({
  captureCheckIn: vi.fn(() => 'check-in-1'),
  flush: vi.fn(() => Promise.resolve(true)),
  waitUntil: vi.fn(),
}))

vi.mock('@sentry/nestjs', () => ({ captureCheckIn, flush }))
vi.mock('@vercel/functions', () => ({ waitUntil }))

const monitor = { slug: 'nightly', crontab: '30 4 * * *' }

describe('monitoredRun', () => {
  beforeEach(() => {
    captureCheckIn.mockClear()
    flush.mockClear()
    waitUntil.mockClear()
  })

  it('checks in when it starts, with the schedule Sentry should expect', async () => {
    await monitoredRun(monitor, () => Promise.resolve('done'))
    expect(captureCheckIn).toHaveBeenNthCalledWith(
      1,
      { monitorSlug: 'nightly', status: 'in_progress' },
      {
        schedule: { type: 'crontab', value: '30 4 * * *' },
        timezone: 'UTC',
        checkinMargin: DEFAULT_CHECKIN_MARGIN_MINUTES,
        maxRuntime: DEFAULT_MAX_RUNTIME_MINUTES,
        failureIssueThreshold: 1,
        recoveryThreshold: 1,
      }
    )
  })

  it('checks out ok, with the duration, and returns the result', async () => {
    const result = await monitoredRun(monitor, () => Promise.resolve('done'))
    expect(result).toBe('done')
    expect(captureCheckIn).toHaveBeenLastCalledWith({
      checkInId: 'check-in-1',
      monitorSlug: 'nightly',
      status: 'ok',
      duration: expect.any(Number) as number,
    })
  })

  it('lets the caller call a completed run a failure', async () => {
    const result = await monitoredRun(
      monitor,
      () => Promise.resolve({ failed: 2 }),
      r => r.failed > 0
    )
    expect(result).toEqual({ failed: 2 })
    expect(captureCheckIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'error' })
    )
  })

  it('checks out as an error when the job throws, and rethrows', async () => {
    const boom = new Error('boom')
    await expect(
      monitoredRun(monitor, () => Promise.reject(boom))
    ).rejects.toBe(boom)
    expect(captureCheckIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'error' })
    )
  })

  it('asks the platform to wait for the upload, every time', async () => {
    await monitoredRun(monitor, () => Promise.resolve(1))
    await monitoredRun(monitor, () => Promise.reject(new Error('x'))).catch(
      () => undefined
    )
    expect(flush).toHaveBeenCalledTimes(2)
    expect(waitUntil).toHaveBeenCalledTimes(2)
  })

  it('takes the margins it is given', async () => {
    await monitoredRun(
      { ...monitor, checkinMarginMinutes: 30, maxRuntimeMinutes: 60 },
      () => Promise.resolve(1)
    )
    expect(captureCheckIn.mock.calls[0]?.[1]).toMatchObject({
      checkinMargin: 30,
      maxRuntime: 60,
    })
  })
})
