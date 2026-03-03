import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { SupabaseGuard } from './supabase.guard'
import { SupabaseService } from '../supabase.service'
import { UsersService } from '../../users/users.service'

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

const createMockExecutionContext = (
  authorizationHeader?: string
): ExecutionContext => {
  const mockRequest = {
    headers: {
      authorization: authorizationHeader,
    },
  }

  return {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
    }),
  } as ExecutionContext
}

describe('SupabaseGuard', () => {
  let guard: SupabaseGuard

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupabaseGuard,
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile()

    guard = module.get<SupabaseGuard>(SupabaseGuard)
  })

  describe('canActivate', () => {
    it('should throw UnauthorizedException when no token is provided', async () => {
      const context = createMockExecutionContext()

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      )
      await expect(guard.canActivate(context)).rejects.toThrow(
        'No token provided'
      )
    })

    it('should throw UnauthorizedException when token format is invalid', async () => {
      const context = createMockExecutionContext('InvalidFormat token')

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      )
    })

    it('should return true and attach user when token is valid and user exists', async () => {
      mockSupabaseService.getUser.mockResolvedValue(mockSupabaseUser)
      mockUsersService.findBySupabaseId.mockResolvedValue(mockDbUser)

      const context = createMockExecutionContext('Bearer valid-token')
      const request = context.switchToHttp().getRequest()

      const result = await guard.canActivate(context)

      expect(result).toBe(true)
      expect(request.supabaseUser).toEqual(mockSupabaseUser)
      expect(request.user).toEqual(mockDbUser)
      expect(mockSupabaseService.getUser).toHaveBeenCalledWith('valid-token')
      expect(mockUsersService.findBySupabaseId).toHaveBeenCalledWith(
        mockSupabaseUser.id
      )
    })

    it('should create user when token is valid but user does not exist', async () => {
      mockSupabaseService.getUser.mockResolvedValue(mockSupabaseUser)
      mockUsersService.findBySupabaseId.mockResolvedValue(null)
      mockUsersService.create.mockResolvedValue(mockDbUser)

      const context = createMockExecutionContext('Bearer valid-token')
      const request = context.switchToHttp().getRequest()

      const result = await guard.canActivate(context)

      expect(result).toBe(true)
      expect(request.user).toEqual(mockDbUser)
      expect(mockUsersService.create).toHaveBeenCalledWith({
        supabaseId: mockSupabaseUser.id,
        email: mockSupabaseUser.email,
      })
    })

    it('should propagate UnauthorizedException from SupabaseService', async () => {
      mockSupabaseService.getUser.mockRejectedValue(
        new UnauthorizedException('Invalid or expired token')
      )

      const context = createMockExecutionContext('Bearer invalid-token')

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      )
    })
  })
})
