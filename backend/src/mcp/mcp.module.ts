import { Module } from '@nestjs/common'
import { McpController } from './mcp.controller'
import { WellKnownController } from './well-known.controller'
import { McpAuthGuard } from './mcp-auth.guard'
import { TransactionsModule } from '../transactions/transactions.module'
import { CategoriesModule } from '../categories/categories.module'
import { BudgetsModule } from '../budgets/budgets.module'
import { DashboardModule } from '../dashboard/dashboard.module'
import { AccountsModule } from '../accounts/accounts.module'
import { AuthModule } from '../auth/auth.module'
import { SubcategoriesModule } from '../subcategories/subcategories.module'
import { PersonsModule } from '../persons/persons.module'
import { ReimbursementsModule } from '../reimbursements/reimbursements.module'
import { SettlementsModule } from '../settlements/settlements.module'

@Module({
  imports: [
    AuthModule,
    TransactionsModule,
    CategoriesModule,
    BudgetsModule,
    DashboardModule,
    AccountsModule,
    SubcategoriesModule,
    PersonsModule,
    ReimbursementsModule,
    SettlementsModule,
  ],
  controllers: [McpController, WellKnownController],
  providers: [McpAuthGuard],
})
export class McpModule {}
