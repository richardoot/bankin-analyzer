import { Module } from '@nestjs/common'
import { TagBaselineModule } from '../tags/tag-baseline.module'
import { TagFamiliesController } from './tag-families.controller'
import { TagFamiliesService } from './tag-families.service'
import { TagFamilyAnalysisService } from './tag-family-analysis.service'

@Module({
  imports: [TagBaselineModule],
  controllers: [TagFamiliesController],
  providers: [TagFamiliesService, TagFamilyAnalysisService],
  exports: [TagFamiliesService],
})
export class TagFamiliesModule {}
