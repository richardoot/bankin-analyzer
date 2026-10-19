import { Module } from '@nestjs/common'
import { TagFamiliesController } from './tag-families.controller'
import { TagFamiliesService } from './tag-families.service'

@Module({
  controllers: [TagFamiliesController],
  providers: [TagFamiliesService],
  exports: [TagFamiliesService],
})
export class TagFamiliesModule {}
