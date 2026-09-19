import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { timingSafeEqual } from 'crypto'

/**
 * Lets the scheduler in, and nobody else.
 *
 * Vercel Cron presents `Authorization: Bearer <CRON_SECRET>` on every
 * invocation once the environment variable exists; anything else — curl
 * without the secret, a browser, a scanner — is refused. Closed by
 * default: with no CRON_SECRET configured the endpoint answers 503 rather
 * than silently accepting everyone.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.CRON_SECRET
    if (!secret) {
      throw new ServiceUnavailableException(
        'CRON_SECRET is not configured — the scheduled sync is disabled.'
      )
    }

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>()
    const header = request.headers['authorization'] ?? ''
    const presented = header.startsWith('Bearer ') ? header.slice(7) : ''

    const a = Buffer.from(presented)
    const b = Buffer.from(secret)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException()
    }
    return true
  }
}
