import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BankSyncScheduleController,
  SCHEDULED_SYNC_MONITOR,
  reportScheduledSyncFailures,
} from './bank-sync-schedule.controller'
import type { BankSyncService, ScheduledSyncSummary } from './bank-sync.service'

const { captureCheckIn, captureMessage, flush } = vi.hoisted(() => ({
  captureCheckIn: vi.fn(() => 'check-in-1'),
  captureMessage: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@sentry/nestjs', () => ({ captureCheckIn, captureMessage, flush }))
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))

const quiet: ScheduledSyncSummary = {
  considered: 3,
  synced: 2,
  skipped: 1,
  failed: 0,
  failures: [],
}

const badNight: ScheduledSyncSummary = {
  considered: 3,
  synced: 1,
  skipped: 0,
  failed: 2,
  failures: [
    { aspspName: 'Boursorama', connectionId: 'c1', reason: 'bank said no' },
    { aspspName: 'BNP', connectionId: 'c2', reason: 'timeout' },
  ],
}

function controller(summary: ScheduledSyncSummary): BankSyncScheduleController {
  return new BankSyncScheduleController({
    runScheduledSync: () => Promise.resolve(summary),
  } as unknown as BankSyncService)
}

describe('SCHEDULED_SYNC_MONITOR', () => {
  it('expects the run on the schedule Vercel actually uses', () => {
    const vercel = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'vercel.json'), 'utf8')
    ) as { crons: { path: string; schedule: string }[] }
    const cron = vercel.crons.find(c => c.path === '/bank-sync/scheduled-run')
    expect(cron?.schedule).toBe(SCHEDULED_SYNC_MONITOR.crontab)
  })
})

describe('BankSyncScheduleController', () => {
  beforeEach(() => {
    captureCheckIn.mockClear()
    captureMessage.mockClear()
  })

  it('answers the summary and checks in ok on a quiet night', async () => {
    expect(await controller(quiet).run()).toBe(quiet)
    expect(captureCheckIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ monitorSlug: 'daily-bank-sync', status: 'ok' })
    )
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('still answers 200, but checks in as failed and says which banks', async () => {
    expect(await controller(badNight).run()).toBe(badNight)
    expect(captureCheckIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'error' })
    )
    expect(captureMessage).toHaveBeenCalledWith(
      'Scheduled bank sync: 2 of 3 connection(s) failed (Boursorama, BNP)',
      expect.objectContaining({
        level: 'warning',
        fingerprint: ['scheduled-bank-sync-failures'],
      })
    )
  })
})

describe('reportScheduledSyncFailures', () => {
  it('carries the whole summary, so the issue can be read without the logs', () => {
    captureMessage.mockClear()
    reportScheduledSyncFailures(badNight)
    const options = captureMessage.mock.calls[0]?.[1] as { extra: unknown }
    expect(options.extra).toEqual(badNight)
  })
})
