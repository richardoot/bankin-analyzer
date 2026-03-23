import { Module } from '@nestjs/common'
import { TransactionsController } from './transactions.controller'
import { TransactionsService } from './transactions.service'
import { CategoriesModule } from '../categories/categories.module'
import { SubcategoriesModule } from '../subcategories/subcategories.module'
import { AccountsModule } from '../accounts/accounts.module'

@Module({
  imports: [CategoriesModule, SubcategoriesModule, AccountsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
