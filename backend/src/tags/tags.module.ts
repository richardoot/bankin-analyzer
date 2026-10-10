import { Module } from '@nestjs/common'
import { RecurrencesModule } from '../recurrences/recurrences.module'
import { TagsController } from './tags.controller'
import { TagsService } from './tags.service'

@Module({
  imports: [RecurrencesModule],
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
