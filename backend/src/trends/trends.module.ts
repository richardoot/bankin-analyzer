import { Module } from '@nestjs/common'
import { FilterPreferencesModule } from '../filter-preferences/filter-preferences.module'
import { RecurrencesModule } from '../recurrences/recurrences.module'
import { AmortizedSlicesService } from '../transactions/amortized-slices.service'
import { TrendsController } from './trends.controller'
import { TrendsService } from './trends.service'

@Module({
  imports: [FilterPreferencesModule, RecurrencesModule],
  controllers: [TrendsController],
  providers: [TrendsService, AmortizedSlicesService],
  exports: [TrendsService],
})
export class TrendsModule {}
