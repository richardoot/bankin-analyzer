import { Module } from '@nestjs/common'
import { CategoryCatalogService } from './category-catalog.service'

/**
 * Its own module rather than a provider of CategoriesModule: UsersModule needs
 * it at user creation, and CategoriesModule already imports the AI module —
 * pulling it into the users graph would drag that along.
 */
@Module({
  providers: [CategoryCatalogService],
  exports: [CategoryCatalogService],
})
export class CategoryCatalogModule {}
