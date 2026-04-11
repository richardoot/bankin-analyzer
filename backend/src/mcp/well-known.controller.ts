import { Controller, Get, Req } from '@nestjs/common'
import type { Request } from 'express'

@Controller('.well-known')
export class WellKnownController {
  /**
   * RFC 9728 Protected Resource Metadata for the MCP endpoint.
   *
   * `authorization_servers` must point to the Supabase GoTrue OAuth 2.1
   * server exposed through Kong. We use `API_EXTERNAL_URL` (the URL
   * reachable by MCP clients) rather than the internal `SUPABASE_URL`
   * used by the backend to talk to Kong via the docker network.
   */
  @Get('oauth-protected-resource')
  getProtectedResourceMetadata(@Req() req: Request): Record<string, unknown> {
    const scheme = req.protocol
    const host = req.get('host') ?? 'localhost:3001'
    const resource = `${scheme}://${host}/mcp`

    const authServer = process.env.API_EXTERNAL_URL ?? 'http://localhost:54321'

    return {
      resource,
      authorization_servers: [`${authServer}/auth/v1`],
      scopes_supported: ['openid', 'profile'],
      bearer_methods_supported: ['header'],
    }
  }
}
