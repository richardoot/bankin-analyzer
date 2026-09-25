import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import * as Sentry from '@sentry/nestjs'
import { BankSyncService } from './bank-sync.service'
import type { ScheduledSyncSummary } from './bank-sync.service'
import { CronSecretGuard } from './cron-secret.guard'
import { monitoredRun } from '../common/cron-monitor'
import type { CronMonitor } from '../common/cron-monitor'

/**
 * How Sentry knows the nightly sync. The crontab must be the one in
 * vercel.json — a spec holds the two together — because Sentry judges a
 * run missed against this schedule, not against Vercel's.
 */
export const SCHEDULED_SYNC_MONITOR: CronMonitor = {
  slug: 'daily-bank-sync',
  crontab: '30 4 * * *',
}

/**
 * The door the daily cron knocks on. Its own controller, because the main
 * one is guarded by SupabaseGuard at class level — a cron has no user JWT
 * and never will; it authenticates with CRON_SECRET instead.
 *
 * GET because that is the verb Vercel Cron sends. The walk itself is
 * idempotent enough for it: the sync policy turns a repeat within the same
 * day into skips.
 *
 * Every run checks in with Sentry, and a night on which any bank refused
 * counts as a failed run there, with the banks and their reasons in a
 * message of its own — the summary in the HTTP answer reaches only
 * Vercel's log, which nobody reads at half past four.
 */
@ApiExcludeController()
@Controller('bank-sync')
export class BankSyncScheduleController {
  constructor(private readonly bankSync: BankSyncService) {}

  @Get('scheduled-run')
  @UseGuards(CronSecretGuard)
  async run(): Promise<ScheduledSyncSummary> {
    return monitoredRun(
      SCHEDULED_SYNC_MONITOR,
      async () => {
        const summary = await this.bankSync.runScheduledSync()
        if (summary.failed > 0) reportScheduledSyncFailures(summary)
        return summary
      },
      summary => summary.failed > 0
    )
  }
}

/**
 * One Sentry event per bad night, all of them grouped under one issue —
 * the second bad night in a row adds to it, the next good one lets it be
 * resolved, and a later bad night reopens it as a regression. Bank names
 * and the errors' own words, nothing about the user or the money.
 */
export function reportScheduledSyncFailures(
  summary: ScheduledSyncSummary
): void {
  const banks = summary.failures.map(f => f.aspspName).join(', ')
  Sentry.captureMessage(
    `Scheduled bank sync: ${summary.failed} of ${summary.considered} ` +
      `connection(s) failed (${banks})`,
    {
      level: 'warning',
      fingerprint: ['scheduled-bank-sync-failures'],
      extra: { ...summary },
    }
  )
}
