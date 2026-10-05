import { Module } from '@nestjs/common'
import { FilterPreferencesModule } from '../filter-preferences/filter-preferences.module'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'

@Module({
  imports: [FilterPreferencesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
