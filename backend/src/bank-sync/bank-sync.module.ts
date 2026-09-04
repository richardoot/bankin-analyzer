import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { AuthModule } from '../auth/auth.module'
import { BankSyncController } from './bank-sync.controller'
import { BankSyncService } from './bank-sync.service'
import { EnableBankingClient } from './enable-banking.client'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BankSyncController],
  providers: [BankSyncService, EnableBankingClient],
  exports: [BankSyncService],
})
export class BankSyncModule {}
