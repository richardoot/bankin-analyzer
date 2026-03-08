import { Module } from '@nestjs/common'
import { ImportHistoriesController } from './import-histories.controller'
import { ImportHistoriesService } from './import-histories.service'

@Module({
  controllers: [ImportHistoriesController],
  providers: [ImportHistoriesService],
  exports: [ImportHistoriesService],
})
export class ImportHistoriesModule {}
