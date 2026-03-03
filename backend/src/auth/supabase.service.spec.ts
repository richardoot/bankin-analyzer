import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { SupabaseService } from './supabase.service'

// Mock createClient
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
  })),
}))

import { createClient } from '@supabase/supabase-js'

const mockSupabaseUser = {
  id: 'supabase-user-id',
  email: 'test@example.com',
  created_at: '2024-01-15T10:30:00.000Z',
  aud: 'authenticated',
  role: 'authenticated',
}

describe('SupabaseService', () => {
  let service: SupabaseService
  let mockGetUser: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    // Set env variables
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

    // Reset mocks
    vi.clearAllMocks()

    mockGetUser = vi.fn()
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: mockGetUser,
      },
    } as never)

    const module: TestingModule = await Test.createTestingModule({
      providers: [SupabaseService],
    }).compile()

    service = module.get<SupabaseService>(SupabaseService)
  })

  describe('constructor', () => {
    it('should throw error if SUPABASE_URL is not defined', async () => {
      delete process.env.SUPABASE_URL

      await expect(
        Test.createTestingModule({
          providers: [SupabaseService],
        }).compile()
      ).rejects.toThrow(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined'
      )
    })

    it('should throw error if SUPABASE_SERVICE_ROLE_KEY is not defined', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      await expect(
        Test.createTestingModule({
          providers: [SupabaseService],
        }).compile()
      ).rejects.toThrow(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined'
      )
    })
  })

  describe('getUser', () => {
    it('should return user when token is valid', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: mockSupabaseUser },
        error: null,
      })

      const result = await service.getUser('valid-token')

      expect(result).toEqual(mockSupabaseUser)
      expect(mockGetUser).toHaveBeenCalledWith('valid-token')
    })

    it('should throw UnauthorizedException when token is invalid', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      })

      await expect(service.getUser('invalid-token')).rejects.toThrow(
        UnauthorizedException
      )
    })

    it('should throw UnauthorizedException when user is null', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      await expect(service.getUser('token-without-user')).rejects.toThrow(
        UnauthorizedException
      )
    })
  })
})
