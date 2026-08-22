import { Module } from '@nestjs/common'
import { CategoriesController } from './categories.controller'
import { CategoriesService } from './categories.service'
import { CategoryMigrationService } from './category-migration.service'
import { AiSuggestionsModule } from '../ai-suggestions/ai-suggestions.module'

@Module({
  imports: [AiSuggestionsModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoryMigrationService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
