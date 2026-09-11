import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AiSuggestionsModule } from './ai-suggestions/ai-suggestions.module'
import { PrismaModule } from './prisma/prisma.module'
import { UsersModule } from './users/users.module'
import { AuthModule } from './auth/auth.module'
import { CategoriesModule } from './categories/categories.module'
import { SubcategoriesModule } from './subcategories/subcategories.module'
import { TransactionsModule } from './transactions/transactions.module'
import { FilterPreferencesModule } from './filter-preferences/filter-preferences.module'
import { PersonsModule } from './persons/persons.module'
import { ReimbursementsModule } from './reimbursements/reimbursements.module'
import { ImportHistoriesModule } from './import-histories/import-histories.module'
import { SettlementsModule } from './settlements/settlements.module'
import { DashboardModule } from './dashboard/dashboard.module'
import { BudgetsModule } from './budgets/budgets.module'
import { AccountsModule } from './accounts/accounts.module'
import { McpModule } from './mcp/mcp.module'
import { TagsModule } from './tags/tags.module'
import { BankSyncModule } from './bank-sync/bank-sync.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // The counters live in process memory. On a long-lived server that is a
    // real limit; on serverless (Vercel) each instance counts alone, so this
    // is best-effort damage limiting, not a guarantee. The routes that spend
    // money — AI categorization, AI icons, the bank fetch — carry their own
    // tighter @Throttle, and the bank sync's true gate is sync-policy.ts,
    // which counts in the database and therefore across instances. Moving
    // this to a shared store (ThrottlerStorageRedisService + Upstash) is the
    // upgrade path when a guarantee is wanted.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 100 }],
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    AccountsModule,
    CategoriesModule,
    SubcategoriesModule,
    TransactionsModule,
    FilterPreferencesModule,
    PersonsModule,
    ReimbursementsModule,
    ImportHistoriesModule,
    SettlementsModule,
    AiSuggestionsModule,
    DashboardModule,
    BudgetsModule,
    TagsModule,
    BankSyncModule,
    McpModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
