import { Global, Module } from '@nestjs/common'
import { SupabaseService } from './supabase.service'
import { SupabaseGuard } from './guards/supabase.guard'
import { UsersModule } from '../users/users.module'

@Global()
@Module({
  imports: [UsersModule],
  providers: [SupabaseService, SupabaseGuard],
  exports: [SupabaseService, SupabaseGuard],
})
export class AuthModule {}
