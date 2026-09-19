import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { BankSyncService } from './bank-sync.service'
import { CronSecretGuard } from './cron-secret.guard'

/**
 * The door the daily cron knocks on. Its own controller, because the main
 * one is guarded by SupabaseGuard at class level — a cron has no user JWT
 * and never will; it authenticates with CRON_SECRET instead.
 *
 * GET because that is the verb Vercel Cron sends. The walk itself is
 * idempotent enough for it: the sync policy turns a repeat within the same
 * day into skips.
 */
@ApiExcludeController()
@Controller('bank-sync')
export class BankSyncScheduleController {
  constructor(private readonly bankSync: BankSyncService) {}

  @Get('scheduled-run')
  @UseGuards(CronSecretGuard)
  async run(): Promise<{
    considered: number
    synced: number
    skipped: number
    failed: number
  }> {
    return this.bankSync.runScheduledSync()
  }
}
