import { Module } from '@nestjs/common'
import { RecurrencesModule } from '../recurrences/recurrences.module'
import { TagBaselineService } from './tag-baseline.service'

/** The everyday reference of a dated tag, for the tags and their families. */
@Module({
  imports: [RecurrencesModule],
  providers: [TagBaselineService],
  exports: [TagBaselineService],
})
export class TagBaselineModule {}
