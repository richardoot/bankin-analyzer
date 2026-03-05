import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { PersonsController } from './persons.controller'
import { PersonsService } from './persons.service'
import { SupabaseGuard } from '../auth/guards/supabase.guard'

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  supabaseId: 'supabase-user-id',
  email: 'test@example.com',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockPerson = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: mockUser.id,
  name: 'Alice Martin',
  email: 'alice@example.com',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockPerson2 = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  userId: mockUser.id,
  name: 'Bob Dupont',
  email: null,
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockPersonsService = {
  findAllByUser: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

describe('PersonsController', () => {
  let controller: PersonsController

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PersonsController],
      providers: [
        {
          provide: PersonsService,
          useValue: mockPersonsService,
        },
      ],
    })
      .overrideGuard(SupabaseGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<PersonsController>(PersonsController)
  })

  describe('findAll', () => {
    it('should return all persons for current user', async () => {
      mockPersonsService.findAllByUser.mockResolvedValue([
        mockPerson,
        mockPerson2,
      ])

      const result = await controller.findAll(mockUser)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: mockPerson.id,
        name: mockPerson.name,
        email: mockPerson.email,
        createdAt: mockPerson.createdAt,
        updatedAt: mockPerson.updatedAt,
      })
      expect(mockPersonsService.findAllByUser).toHaveBeenCalledWith(mockUser.id)
    })

    it('should return empty array when no persons', async () => {
      mockPersonsService.findAllByUser.mockResolvedValue([])

      const result = await controller.findAll(mockUser)

      expect(result).toEqual([])
    })
  })

  describe('findOne', () => {
    it('should return a person by id', async () => {
      mockPersonsService.findOne.mockResolvedValue(mockPerson)

      const result = await controller.findOne(mockUser, mockPerson.id)

      expect(result).toEqual({
        id: mockPerson.id,
        name: mockPerson.name,
        email: mockPerson.email,
        createdAt: mockPerson.createdAt,
        updatedAt: mockPerson.updatedAt,
      })
      expect(mockPersonsService.findOne).toHaveBeenCalledWith(
        mockPerson.id,
        mockUser.id
      )
    })
  })

  describe('create', () => {
    it('should create a new person', async () => {
      const createDto = {
        name: 'Charlie Brown',
        email: 'charlie@example.com',
      }
      const newPerson = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        userId: mockUser.id,
        ...createDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockPersonsService.create.mockResolvedValue(newPerson)

      const result = await controller.create(mockUser, createDto)

      expect(result.name).toBe(createDto.name)
      expect(result.email).toBe(createDto.email)
      expect(mockPersonsService.create).toHaveBeenCalledWith(
        mockUser.id,
        createDto
      )
    })
  })

  describe('update', () => {
    it('should update a person', async () => {
      const updateDto = { name: 'Alice Updated' }
      const updatedPerson = { ...mockPerson, name: 'Alice Updated' }
      mockPersonsService.update.mockResolvedValue(updatedPerson)

      const result = await controller.update(mockUser, mockPerson.id, updateDto)

      expect(result.name).toBe('Alice Updated')
      expect(mockPersonsService.update).toHaveBeenCalledWith(
        mockPerson.id,
        mockUser.id,
        updateDto
      )
    })
  })

  describe('delete', () => {
    it('should delete a person', async () => {
      mockPersonsService.delete.mockResolvedValue(undefined)

      await controller.delete(mockUser, mockPerson.id)

      expect(mockPersonsService.delete).toHaveBeenCalledWith(
        mockPerson.id,
        mockUser.id
      )
    })
  })
})
