import { Module } from '@nestjs/common'
import { RecurrencesModule } from '../recurrences/recurrences.module'
import { TagFamiliesModule } from '../tag-families/tag-families.module'
import { TagsController } from './tags.controller'
import { TagsService } from './tags.service'

@Module({
  imports: [RecurrencesModule, TagFamiliesModule],
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
