import { Injectable, UnauthorizedException } from '@nestjs/common'
import { createClient } from '@supabase/supabase-js'
import type { User as SupabaseUser } from '@supabase/supabase-js'

@Injectable()
export class SupabaseService {
  private readonly supabase: ReturnType<typeof createClient>

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined'
      )
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  async getUser(token: string): Promise<SupabaseUser> {
    const {
      data: { user },
      error,
    } = await this.supabase.auth.getUser(token)

    if (error || !user) {
      throw new UnauthorizedException('Invalid or expired token')
    }

    return user
  }

  async deleteUser(supabaseId: string): Promise<void> {
    const { error } = await this.supabase.auth.admin.deleteUser(supabaseId)

    if (error) {
      throw new Error(`Failed to delete user from Supabase: ${error.message}`)
    }
  }
}
