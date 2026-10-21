import { Module } from '@nestjs/common'
import { AiSuggestionsModule } from '../ai-suggestions/ai-suggestions.module'
import { FilterPreferencesModule } from '../filter-preferences/filter-preferences.module'
import { RecurrencesModule } from '../recurrences/recurrences.module'
import { AmortizedSlicesService } from '../transactions/amortized-slices.service'
import { TrendDigestService } from './trend-digest.service'
import { TrendsController } from './trends.controller'
import { TrendsService } from './trends.service'

@Module({
  imports: [AiSuggestionsModule, FilterPreferencesModule, RecurrencesModule],
  controllers: [TrendsController],
  providers: [TrendsService, TrendDigestService, AmortizedSlicesService],
  exports: [TrendsService],
})
export class TrendsModule {}
