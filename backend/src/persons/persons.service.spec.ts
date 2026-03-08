import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { PersonsService } from './persons.service'
import { PrismaService } from '../prisma/prisma.service'

const mockPerson = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Alice Martin',
  email: 'alice@example.com',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockPerson2 = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  userId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Bob Dupont',
  email: null,
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockPrismaService = {
  person: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}

describe('PersonsService', () => {
  let service: PersonsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile()

    service = module.get<PersonsService>(PersonsService)

    vi.clearAllMocks()
  })

  describe('findAllByUser', () => {
    it('should return all persons for a user', async () => {
      mockPrismaService.person.findMany.mockResolvedValue([
        mockPerson,
        mockPerson2,
      ])

      const result = await service.findAllByUser(mockPerson.userId)

      expect(result).toEqual([mockPerson, mockPerson2])
      expect(mockPrismaService.person.findMany).toHaveBeenCalledWith({
        where: { userId: mockPerson.userId },
        orderBy: { name: 'asc' },
      })
    })

    it('should return empty array when no persons', async () => {
      mockPrismaService.person.findMany.mockResolvedValue([])

      const result = await service.findAllByUser('user-without-persons')

      expect(result).toEqual([])
    })
  })

  describe('findOne', () => {
    it('should return a person by id', async () => {
      mockPrismaService.person.findFirst.mockResolvedValue(mockPerson)

      const result = await service.findOne(mockPerson.id, mockPerson.userId)

      expect(result).toEqual(mockPerson)
      expect(mockPrismaService.person.findFirst).toHaveBeenCalledWith({
        where: { id: mockPerson.id, userId: mockPerson.userId },
      })
    })

    it('should throw NotFoundException when person not found', async () => {
      mockPrismaService.person.findFirst.mockResolvedValue(null)

      await expect(
        service.findOne('non-existent-id', mockPerson.userId)
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('create', () => {
    it('should create a new person with email', async () => {
      mockPrismaService.person.create.mockResolvedValue(mockPerson)

      const result = await service.create(mockPerson.userId, {
        name: mockPerson.name,
        email: mockPerson.email,
      })

      expect(result).toEqual(mockPerson)
      expect(mockPrismaService.person.create).toHaveBeenCalledWith({
        data: {
          userId: mockPerson.userId,
          name: mockPerson.name,
          email: mockPerson.email,
        },
      })
    })

    it('should create a new person without email', async () => {
      mockPrismaService.person.create.mockResolvedValue(mockPerson2)

      const result = await service.create(mockPerson2.userId, {
        name: mockPerson2.name,
      })

      expect(result).toEqual(mockPerson2)
      expect(mockPrismaService.person.create).toHaveBeenCalledWith({
        data: {
          userId: mockPerson2.userId,
          name: mockPerson2.name,
          email: null,
        },
      })
    })
  })

  describe('update', () => {
    it('should update a person', async () => {
      const updatedPerson = { ...mockPerson, name: 'Alice Updated' }
      mockPrismaService.person.findFirst.mockResolvedValue(mockPerson)
      mockPrismaService.person.update.mockResolvedValue(updatedPerson)

      const result = await service.update(mockPerson.id, mockPerson.userId, {
        name: 'Alice Updated',
      })

      expect(result).toEqual(updatedPerson)
      expect(mockPrismaService.person.update).toHaveBeenCalledWith({
        where: { id: mockPerson.id },
        data: { name: 'Alice Updated' },
      })
    })

    it('should throw NotFoundException when person not found', async () => {
      mockPrismaService.person.findFirst.mockResolvedValue(null)

      await expect(
        service.update('non-existent-id', mockPerson.userId, { name: 'Test' })
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('delete', () => {
    it('should delete a person', async () => {
      mockPrismaService.person.findFirst.mockResolvedValue(mockPerson)
      mockPrismaService.person.delete.mockResolvedValue(mockPerson)

      await service.delete(mockPerson.id, mockPerson.userId)

      expect(mockPrismaService.person.delete).toHaveBeenCalledWith({
        where: { id: mockPerson.id },
      })
    })

    it('should throw NotFoundException when person not found', async () => {
      mockPrismaService.person.findFirst.mockResolvedValue(null)

      await expect(
        service.delete('non-existent-id', mockPerson.userId)
      ).rejects.toThrow(NotFoundException)
    })
  })
})
