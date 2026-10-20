import { Module } from '@nestjs/common'
import { TagFamiliesModule } from '../tag-families/tag-families.module'
import { TagsController } from './tags.controller'
import { TagsService } from './tags.service'
import { TagBaselineModule } from './tag-baseline.module'

@Module({
  imports: [TagBaselineModule, TagFamiliesModule],
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
