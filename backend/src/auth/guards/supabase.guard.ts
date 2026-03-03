import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { SupabaseService } from '../supabase.service'
import { UsersService } from '../../users/users.service'
import type { User } from '../../generated/prisma'

export interface AuthenticatedRequest extends Request {
  supabaseUser: SupabaseUser
  user: User
}

@Injectable()
export class SupabaseGuard implements CanActivate {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly usersService: UsersService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = this.extractTokenFromHeader(request)

    if (!token) {
      throw new UnauthorizedException('No token provided')
    }

    // Validate token and get Supabase user
    const supabaseUser = await this.supabaseService.getUser(token)

    // Auto-create or retrieve user from database
    let user = await this.usersService.findBySupabaseId(supabaseUser.id)

    if (!user) {
      user = await this.usersService.create({
        supabaseId: supabaseUser.id,
        email: supabaseUser.email ?? '',
      })
    }

    // Attach both Supabase user and DB user to request
    request.supabaseUser = supabaseUser
    request.user = user

    return true
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? []
    return type === 'Bearer' ? token : undefined
  }
}
