import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { PrismaModule } from './prisma/prisma.module'
import { UsersModule } from './users/users.module'
import { AuthModule } from './auth/auth.module'
import { CategoriesModule } from './categories/categories.module'
import { TransactionsModule } from './transactions/transactions.module'
import { FilterPreferencesModule } from './filter-preferences/filter-preferences.module'
import { PersonsModule } from './persons/persons.module'
import { ReimbursementsModule } from './reimbursements/reimbursements.module'
import { ImportHistoriesModule } from './import-histories/import-histories.module'
import { SettlementsModule } from './settlements/settlements.module'
import { DashboardModule } from './dashboard/dashboard.module'
import { CategoryAssociationModule } from './category-association/category-association.module'
import { AiSuggestionsModule } from './ai-suggestions/ai-suggestions.module'
import { BudgetsModule } from './budgets/budgets.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    CategoriesModule,
    TransactionsModule,
    FilterPreferencesModule,
    PersonsModule,
    ReimbursementsModule,
    ImportHistoriesModule,
    SettlementsModule,
    DashboardModule,
    CategoryAssociationModule,
    AiSuggestionsModule,
    BudgetsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
