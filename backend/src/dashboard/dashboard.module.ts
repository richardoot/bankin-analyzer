import { Module } from '@nestjs/common'
import { AmortizedSlicesService } from '../transactions/amortized-slices.service'
import { RecurrencesModule } from '../recurrences/recurrences.module'
import { FilterPreferencesModule } from '../filter-preferences/filter-preferences.module'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'

@Module({
  imports: [FilterPreferencesModule, RecurrencesModule],
  controllers: [DashboardController],
  providers: [DashboardService, AmortizedSlicesService],
  exports: [DashboardService],
})
export class DashboardModule {}
