import { Module } from '@nestjs/common'
import { BudgetsController } from './budgets.controller'
import { BudgetsService } from './budgets.service'
import { BudgetPlansController } from './budget-plans.controller'
import { BudgetPlansService } from './budget-plans.service'

@Module({
  controllers: [BudgetsController, BudgetPlansController],
  providers: [BudgetsService, BudgetPlansService],
  exports: [BudgetsService, BudgetPlansService],
})
export class BudgetsModule {}
