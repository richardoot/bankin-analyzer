import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import type { Request } from 'express'
import { WellKnownController } from './well-known.controller'

const createMockRequest = (
  host = 'api.bankin.example.com',
  protocol = 'https'
): Request =>
  ({
    protocol,
    get: (name: string): string | undefined => {
      if (name.toLowerCase() === 'host') {
        return host
      }
      return undefined
    },
  }) as unknown as Request

describe('WellKnownController', () => {
  let controller: WellKnownController
  const originalEnv = process.env.API_EXTERNAL_URL

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WellKnownController],
    }).compile()

    controller = module.get<WellKnownController>(WellKnownController)
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.API_EXTERNAL_URL
    } else {
      process.env.API_EXTERNAL_URL = originalEnv
    }
  })

  describe('GET /.well-known/oauth-protected-resource', () => {
    it('returns a resource URL built from request protocol and host', () => {
      const req = createMockRequest('api.bankin.example.com', 'https')

      const metadata = controller.getProtectedResourceMetadata(req)

      expect(metadata.resource).toBe('https://api.bankin.example.com/mcp')
    })

    it('supports http scheme for localhost dev', () => {
      const req = createMockRequest('localhost:3001', 'http')

      const metadata = controller.getProtectedResourceMetadata(req)

      expect(metadata.resource).toBe('http://localhost:3001/mcp')
    })

    it('uses API_EXTERNAL_URL for the authorization server', () => {
      process.env.API_EXTERNAL_URL = 'https://myproject.supabase.co'
      const req = createMockRequest()

      const metadata = controller.getProtectedResourceMetadata(req)

      expect(metadata.authorization_servers).toEqual([
        'https://myproject.supabase.co/auth/v1',
      ])
    })

    it('falls back to localhost:54321 when API_EXTERNAL_URL is not set', () => {
      delete process.env.API_EXTERNAL_URL
      const req = createMockRequest()

      const metadata = controller.getProtectedResourceMetadata(req)

      expect(metadata.authorization_servers).toEqual([
        'http://localhost:54321/auth/v1',
      ])
    })

    it('advertises openid and profile scopes', () => {
      const req = createMockRequest()

      const metadata = controller.getProtectedResourceMetadata(req)

      expect(metadata.scopes_supported).toEqual(['openid', 'profile'])
    })

    it('declares bearer token passing via header only', () => {
      const req = createMockRequest()

      const metadata = controller.getProtectedResourceMetadata(req)

      expect(metadata.bearer_methods_supported).toEqual(['header'])
    })

    it('falls back to a default host if the request has none', () => {
      const req = {
        protocol: 'http',
        get: () => undefined,
      } as unknown as Request

      const metadata = controller.getProtectedResourceMetadata(req)

      expect(metadata.resource).toBe('http://localhost:3001/mcp')
    })
  })
})
