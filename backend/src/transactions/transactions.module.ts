import { Module } from '@nestjs/common'
import { TransactionsController } from './transactions.controller'
import { TransactionsService } from './transactions.service'
import { AccountsModule } from '../accounts/accounts.module'
import { AiSuggestionsModule } from '../ai-suggestions/ai-suggestions.module'

@Module({
  imports: [AccountsModule, AiSuggestionsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
