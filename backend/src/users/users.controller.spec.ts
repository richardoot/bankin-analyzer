import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { SupabaseService } from '../auth/supabase.service'
import { SupabaseGuard } from '../auth/guards/supabase.guard'

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  supabaseId: 'supabase-user-id',
  email: 'test@example.com',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockUser2 = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  supabaseId: 'supabase-user-id-2',
  email: 'test2@example.com',
  createdAt: new Date('2024-01-16T10:30:00.000Z'),
  updatedAt: new Date('2024-01-16T10:30:00.000Z'),
}

const mockUsersService = {
  findAll: vi.fn(),
  findOne: vi.fn(),
  delete: vi.fn(),
}

const mockSupabaseService = {
  getUser: vi.fn(),
}

describe('UsersController', () => {
  let controller: UsersController

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
      ],
    })
      .overrideGuard(SupabaseGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<UsersController>(UsersController)
  })

  describe('getMe', () => {
    it('should return the current user', () => {
      const result = controller.getMe(mockUser)

      expect(result).toEqual(mockUser)
    })
  })

  describe('findAll', () => {
    it('should return an array of users', async () => {
      mockUsersService.findAll.mockResolvedValue([mockUser, mockUser2])

      const result = await controller.findAll()

      expect(result).toEqual([mockUser, mockUser2])
      expect(mockUsersService.findAll).toHaveBeenCalled()
    })

    it('should return empty array when no users', async () => {
      mockUsersService.findAll.mockResolvedValue([])

      const result = await controller.findAll()

      expect(result).toEqual([])
    })
  })

  describe('findOne', () => {
    it('should return a user by id', async () => {
      mockUsersService.findOne.mockResolvedValue(mockUser)

      const result = await controller.findOne(mockUser.id)

      expect(result).toEqual(mockUser)
      expect(mockUsersService.findOne).toHaveBeenCalledWith(mockUser.id)
    })
  })

  describe('deleteMe', () => {
    it('should delete the current user', async () => {
      mockUsersService.delete.mockResolvedValue(mockUser)

      await controller.deleteMe(mockUser)

      expect(mockUsersService.delete).toHaveBeenCalledWith(mockUser.id)
    })
  })

  describe('delete', () => {
    it('should delete user when deleting own account', async () => {
      mockUsersService.delete.mockResolvedValue(mockUser)

      await controller.delete(mockUser.id, mockUser)

      expect(mockUsersService.delete).toHaveBeenCalledWith(mockUser.id)
    })

    it('should throw ForbiddenException when deleting another user', async () => {
      await expect(controller.delete(mockUser2.id, mockUser)).rejects.toThrow(
        ForbiddenException
      )
      await expect(controller.delete(mockUser2.id, mockUser)).rejects.toThrow(
        'Vous ne pouvez supprimer que votre propre compte'
      )
      expect(mockUsersService.delete).not.toHaveBeenCalled()
    })
  })
})
