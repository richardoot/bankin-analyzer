import type { ExecutionContext } from '@nestjs/common'
import { createParamDecorator } from '@nestjs/common'
import type { AuthenticatedRequest } from '../guards/supabase.guard'
import type { User } from '../../generated/prisma'

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>()
    return request.user
  }
)
