import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { UsersService } from './users.service'
import { PrismaService } from '../prisma/prisma.service'
import { SupabaseService } from '../auth/supabase.service'

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  supabaseId: '550e8400-e29b-41d4-a716-446655440001',
  email: 'test@example.com',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockPrismaService = {
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}

const mockSupabaseService = {
  deleteUser: vi.fn(),
}

describe('UsersService', () => {
  let service: UsersService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
      ],
    }).compile()

    service = module.get<UsersService>(UsersService)

    // Reset mocks
    vi.clearAllMocks()
  })

  describe('findAll', () => {
    it('should return an array of users', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([mockUser])

      const result = await service.findAll()

      expect(result).toEqual([mockUser])
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      })
    })

    it('should return empty array when no users', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([])

      const result = await service.findAll()

      expect(result).toEqual([])
    })
  })

  describe('findOne', () => {
    it('should return a user by id', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser)

      const result = await service.findOne(mockUser.id)

      expect(result).toEqual(mockUser)
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      })
    })

    it('should throw NotFoundException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null)

      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        NotFoundException
      )
    })
  })

  describe('findBySupabaseId', () => {
    it('should return a user by supabaseId', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser)

      const result = await service.findBySupabaseId(mockUser.supabaseId)

      expect(result).toEqual(mockUser)
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { supabaseId: mockUser.supabaseId },
      })
    })

    it('should return null when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null)

      const result = await service.findBySupabaseId('non-existent-supabase-id')

      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('should create a new user', async () => {
      const createUserDto = {
        supabaseId: mockUser.supabaseId,
        email: mockUser.email,
      }
      mockPrismaService.user.create.mockResolvedValue(mockUser)

      const result = await service.create(createUserDto)

      expect(result).toEqual(mockUser)
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          supabaseId: createUserDto.supabaseId,
          email: createUserDto.email,
        },
      })
    })
  })

  describe('delete', () => {
    it('should delete user from Supabase and PostgreSQL', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser)
      mockSupabaseService.deleteUser.mockResolvedValue(undefined)
      mockPrismaService.user.delete.mockResolvedValue(mockUser)

      const result = await service.delete(mockUser.id)

      expect(result).toEqual(mockUser)
      expect(mockSupabaseService.deleteUser).toHaveBeenCalledWith(
        mockUser.supabaseId
      )
      expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      })
    })

    it('should throw NotFoundException when deleting non-existent user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null)

      await expect(service.delete('non-existent-id')).rejects.toThrow(
        NotFoundException
      )
    })

    it('should throw error if Supabase deletion fails', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser)
      mockSupabaseService.deleteUser.mockRejectedValue(
        new Error('Failed to delete user from Supabase')
      )

      await expect(service.delete(mockUser.id)).rejects.toThrow(
        'Failed to delete user from Supabase'
      )
      expect(mockPrismaService.user.delete).not.toHaveBeenCalled()
    })
  })
})
