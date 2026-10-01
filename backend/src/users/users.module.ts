import { Global, Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { CategoryCatalogModule } from '../categories/category-catalog.module'

@Global()
@Module({
  imports: [CategoryCatalogModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
