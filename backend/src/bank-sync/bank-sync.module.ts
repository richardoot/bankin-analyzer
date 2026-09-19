import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { AuthModule } from '../auth/auth.module'
import { AiSuggestionsModule } from '../ai-suggestions/ai-suggestions.module'
import { BankSyncController } from './bank-sync.controller'
import { BankSyncScheduleController } from './bank-sync-schedule.controller'
import { BankSyncService } from './bank-sync.service'
import { EnableBankingClient } from './enable-banking.client'
import { EnableBankingCredentialsService } from './enable-banking-credentials.service'

@Module({
  imports: [PrismaModule, AuthModule, AiSuggestionsModule],
  controllers: [BankSyncController, BankSyncScheduleController],
  providers: [
    BankSyncService,
    EnableBankingClient,
    EnableBankingCredentialsService,
  ],
  exports: [BankSyncService],
})
export class BankSyncModule {}
