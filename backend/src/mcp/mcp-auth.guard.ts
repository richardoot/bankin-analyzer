import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { SupabaseService } from '../auth/supabase.service'
import { UsersService } from '../users/users.service'
import type { User } from '../generated/prisma'

export interface McpAuthenticatedRequest extends Request {
  supabaseUser: SupabaseUser
  user: User
}

/**
 * Guard for the MCP endpoint.
 *
 * Validates the Bearer token via Supabase, and on failure emits the
 * `WWW-Authenticate: Bearer resource_metadata=...` header required by the
 * MCP OAuth spec (RFC 9728) so that clients can discover the authorization
 * server.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly usersService: UsersService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp()
    const request = http.getRequest<McpAuthenticatedRequest>()
    const response = http.getResponse<Response>()

    const token = this.extractTokenFromHeader(request)

    if (!token) {
      this.setWwwAuthenticate(request, response)
      throw new UnauthorizedException('No token provided')
    }

    try {
      const supabaseUser = await this.supabaseService.getUser(token)

      let user = await this.usersService.findBySupabaseId(supabaseUser.id)
      if (!user) {
        user = await this.usersService.create({
          supabaseId: supabaseUser.id,
          email: supabaseUser.email ?? '',
        })
      }

      request.supabaseUser = supabaseUser
      request.user = user

      return true
    } catch (err) {
      this.setWwwAuthenticate(request, response, 'invalid_token')
      throw err instanceof UnauthorizedException
        ? err
        : new UnauthorizedException('Invalid token')
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? []
    return type === 'Bearer' ? token : undefined
  }

  private setWwwAuthenticate(
    request: Request,
    response: Response,
    error?: string
  ): void {
    const scheme = request.protocol
    const host = request.get('host') ?? 'localhost:3001'
    const resourceMetadataUrl = `${scheme}://${host}/.well-known/oauth-protected-resource`

    const parts = [`Bearer resource_metadata="${resourceMetadataUrl}"`]
    if (error) {
      parts.push(`error="${error}"`)
    }
    response.setHeader('WWW-Authenticate', parts.join(', '))
  }
}
