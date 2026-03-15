import { Module } from '@nestjs/common'
import { CategoryAssociationController } from './category-association.controller'
import { CategoryAssociationService } from './category-association.service'

@Module({
  controllers: [CategoryAssociationController],
  providers: [CategoryAssociationService],
  exports: [CategoryAssociationService],
})
export class CategoryAssociationModule {}
