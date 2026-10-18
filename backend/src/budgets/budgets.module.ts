import { Module } from '@nestjs/common'
import { AmortizedSlicesService } from '../transactions/amortized-slices.service'
import { FilterPreferencesModule } from '../filter-preferences/filter-preferences.module'
import { BudgetsController } from './budgets.controller'
import { BudgetsService } from './budgets.service'
import { BudgetPlansController } from './budget-plans.controller'
import { BudgetPlansService } from './budget-plans.service'

@Module({
  imports: [FilterPreferencesModule],
  controllers: [BudgetsController, BudgetPlansController],
  providers: [BudgetsService, BudgetPlansService, AmortizedSlicesService],
  exports: [BudgetsService, BudgetPlansService],
})
export class BudgetsModule {}
