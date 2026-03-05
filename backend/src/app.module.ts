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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
