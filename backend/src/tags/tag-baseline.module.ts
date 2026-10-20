import { Module } from '@nestjs/common'
import { FilterPreferencesModule } from '../filter-preferences/filter-preferences.module'
import { RecurrencesModule } from '../recurrences/recurrences.module'
import { TagBaselineService } from './tag-baseline.service'
import { TagNettingService } from './tag-netting.service'

/**
 * What the tags and their families share: the everyday reference of a dated
 * tag, and the netting rule that makes their figures read like the dashboard.
 */
@Module({
  imports: [RecurrencesModule, FilterPreferencesModule],
  providers: [TagBaselineService, TagNettingService],
  exports: [TagBaselineService, TagNettingService],
})
export class TagBaselineModule {}
