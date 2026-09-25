import { Controller, Get, Header, HttpStatus, Res } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import type { Response } from 'express'
import { HealthService } from './health.service'
import type { HealthReport } from './health.service'

/**
 * The door an uptime monitor knocks on.
 *
 * Unauthenticated, because the monitor has no user and the report says
 * nothing a stranger can use: two statuses, a latency and a short commit
 * hash. Outside the throttler, because a monitor probing from several
 * regions must never be told 429 and page someone for a limit of our own.
 *
 * 503 rather than 200 with `status: "error"` in the body: every monitor
 * understands a status code, and few are configured to read a body.
 */
@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Liveness and database reachability' })
  async check(
    @Res({ passthrough: true }) res: Response
  ): Promise<HealthReport> {
    const report = await this.health.check()
    if (report.status !== 'ok') res.status(HttpStatus.SERVICE_UNAVAILABLE)
    return report
  }
}
