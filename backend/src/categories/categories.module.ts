import { Module } from '@nestjs/common'
import { CategoriesController } from './categories.controller'
import { CategoriesService } from './categories.service'
import { LegacyMigrationService } from './legacy-migration.service'
import { AiSuggestionsModule } from '../ai-suggestions/ai-suggestions.module'

@Module({
  imports: [AiSuggestionsModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, LegacyMigrationService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
