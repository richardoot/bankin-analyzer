import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import * as Sentry from '@sentry/nestjs'
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

    // The app's own row for this identity, created on first sight.
    const user = await this.usersService.findOrCreateBySupabaseId(
      supabaseUser.id,
      supabaseUser.email ?? ''
    )

    // Attach both Supabase user and DB user to request
    request.supabaseUser = supabaseUser
    request.user = user

    // What Sentry knows of the person: an opaque id, so that an error can
    // be counted per user and a trace found again, and nothing more.
    Sentry.setUser({ id: user.id })

    return true
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? []
    return type === 'Bearer' ? token : undefined
  }
}
