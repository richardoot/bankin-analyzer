import { Module } from '@nestjs/common'
import { FilterPreferencesModule } from '../filter-preferences/filter-preferences.module'
import { BudgetsController } from './budgets.controller'
import { BudgetsService } from './budgets.service'
import { BudgetPlansController } from './budget-plans.controller'
import { BudgetPlansService } from './budget-plans.service'

@Module({
  imports: [FilterPreferencesModule],
  controllers: [BudgetsController, BudgetPlansController],
  providers: [BudgetsService, BudgetPlansService],
  exports: [BudgetsService, BudgetPlansService],
})
export class BudgetsModule {}
