import { Module } from '@nestjs/common'
import { FilterPreferencesController } from './filter-preferences.controller'
import { FilterPreferencesService } from './filter-preferences.service'

@Module({
  controllers: [FilterPreferencesController],
  providers: [FilterPreferencesService],
  exports: [FilterPreferencesService],
})
export class FilterPreferencesModule {}
