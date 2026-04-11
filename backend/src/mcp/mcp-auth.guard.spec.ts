import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { McpAuthGuard } from './mcp-auth.guard'
import { SupabaseService } from '../auth/supabase.service'
import { UsersService } from '../users/users.service'

const mockSupabaseUser = {
  id: 'supabase-user-id',
  email: 'test@example.com',
  created_at: '2024-01-15T10:30:00.000Z',
  aud: 'authenticated',
  role: 'authenticated',
}

const mockDbUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  supabaseId: 'supabase-user-id',
  email: 'test@example.com',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockSupabaseService = {
  getUser: vi.fn(),
}

const mockUsersService = {
  findBySupabaseId: vi.fn(),
  create: vi.fn(),
}

interface MockContextOptions {
  authorization?: string
  protocol?: string
  host?: string
}

const createMockExecutionContext = (
  opts: MockContextOptions = {}
): {
  context: ExecutionContext
  request: { headers: { authorization?: string } } & Record<string, unknown>
  response: { setHeader: ReturnType<typeof vi.fn> }
} => {
  const response = {
    setHeader: vi.fn(),
  }

  const request = {
    headers: {
      authorization: opts.authorization,
      host: opts.host ?? 'api.example.com',
    },
    protocol: opts.protocol ?? 'https',
    get: (name: string): string | undefined => {
      if (name.toLowerCase() === 'host') {
        return opts.host ?? 'api.example.com'
      }
      return undefined
    },
  }

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext

  return { context, request, response }
}

describe('McpAuthGuard', () => {
  let guard: McpAuthGuard

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpAuthGuard,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile()

    guard = module.get<McpAuthGuard>(McpAuthGuard)
  })

  describe('canActivate — missing token', () => {
    it('throws UnauthorizedException when no authorization header', async () => {
      const { context } = createMockExecutionContext()

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      )
      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided'
      )
    })

    it('sets WWW-Authenticate header with resource_metadata pointing to protected resource', async () => {
      const { context, response } = createMockExecutionContext({
        protocol: 'https',
        host: 'api.bankin.example.com',
      })

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      )

      expect(response.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Bearer resource_metadata="https://api.bankin.example.com/.well-known/oauth-protected-resource"'
      )
    })

    it('throws when authorization header uses a non-Bearer scheme', async () => {
      const { context, response } = createMockExecutionContext({
        authorization: 'Basic dXNlcjpwYXNz',
      })

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      )
      expect(response.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('resource_metadata=')
      )
    })
  })

  describe('canActivate — invalid token', () => {
    it('sets WWW-Authenticate header with error="invalid_token" when SupabaseService rejects', async () => {
      mockSupabaseService.getUser.mockRejectedValue(
        new UnauthorizedException('Invalid or expired token')
      )

      const { context, response } = createMockExecutionContext({
        authorization: 'Bearer bad-token',
      })

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      )

      expect(response.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('error="invalid_token"')
      )
      expect(response.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('resource_metadata=')
      )
    })

    it('wraps non-UnauthorizedException errors in UnauthorizedException', async () => {
      mockSupabaseService.getUser.mockRejectedValue(new Error('network down'))

      const { context } = createMockExecutionContext({
        authorization: 'Bearer some-token',
      })

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      )
    })
  })

  describe('canActivate — valid token', () => {
    it('attaches supabaseUser and db user to the request and returns true', async () => {
      mockSupabaseService.getUser.mockResolvedValue(mockSupabaseUser)
      mockUsersService.findBySupabaseId.mockResolvedValue(mockDbUser)

      const { context, request, response } = createMockExecutionContext({
        authorization: 'Bearer valid-token',
      })

      const result = await guard.canActivate(context)

      expect(result).toBe(true)
      expect(request.supabaseUser).toEqual(mockSupabaseUser)
      expect(request.user).toEqual(mockDbUser)
      expect(mockSupabaseService.getUser).toHaveBeenCalledWith('valid-token')
      expect(mockUsersService.findBySupabaseId).toHaveBeenCalledWith(
        mockSupabaseUser.id
      )
      expect(response.setHeader).not.toHaveBeenCalled()
    })

    it('auto-creates the db user when none exists for the supabase id', async () => {
      mockSupabaseService.getUser.mockResolvedValue(mockSupabaseUser)
      mockUsersService.findBySupabaseId.mockResolvedValue(null)
      mockUsersService.create.mockResolvedValue(mockDbUser)

      const { context, request } = createMockExecutionContext({
        authorization: 'Bearer valid-token',
      })

      const result = await guard.canActivate(context)

      expect(result).toBe(true)
      expect(request.user).toEqual(mockDbUser)
      expect(mockUsersService.create).toHaveBeenCalledWith({
        supabaseId: mockSupabaseUser.id,
        email: mockSupabaseUser.email,
      })
    })

    it('passes empty string email to create when Supabase user has no email', async () => {
      mockSupabaseService.getUser.mockResolvedValue({
        ...mockSupabaseUser,
        email: undefined,
      })
      mockUsersService.findBySupabaseId.mockResolvedValue(null)
      mockUsersService.create.mockResolvedValue(mockDbUser)

      const { context } = createMockExecutionContext({
        authorization: 'Bearer valid-token',
      })

      await guard.canActivate(context)

      expect(mockUsersService.create).toHaveBeenCalledWith({
        supabaseId: mockSupabaseUser.id,
        email: '',
      })
    })
  })
})
