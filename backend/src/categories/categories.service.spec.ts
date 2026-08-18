import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { CategoriesService } from './categories.service'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma, TransactionType } from '../generated/prisma'

const mockCategory = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Alimentation',
  type: TransactionType.EXPENSE,
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockCategory2 = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  userId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Salaires',
  type: TransactionType.INCOME,
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockPrismaService = {
  category: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}

describe('CategoriesService', () => {
  let service: CategoriesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile()

    service = module.get<CategoriesService>(CategoriesService)

    vi.clearAllMocks()
  })

  describe('findAllByUser', () => {
    it('should return all categories for a user', async () => {
      mockPrismaService.category.findMany.mockResolvedValue([
        mockCategory,
        mockCategory2,
      ])

      const result = await service.findAllByUser(mockCategory.userId)

      expect(result).toEqual([mockCategory, mockCategory2])
      expect(mockPrismaService.category.findMany).toHaveBeenCalledWith({
        where: { userId: mockCategory.userId },
        orderBy: { name: 'asc' },
      })
    })

    it('should return empty array when no categories', async () => {
      mockPrismaService.category.findMany.mockResolvedValue([])

      const result = await service.findAllByUser('user-without-categories')

      expect(result).toEqual([])
    })
  })

  describe('findOrCreate', () => {
    it('should return existing category if found', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(mockCategory)

      const result = await service.findOrCreate(
        mockCategory.userId,
        mockCategory.name,
        mockCategory.type
      )

      expect(result).toEqual(mockCategory)
      expect(mockPrismaService.category.findUnique).toHaveBeenCalledWith({
        where: {
          userId_name_type: {
            userId: mockCategory.userId,
            name: mockCategory.name,
            type: mockCategory.type,
          },
        },
      })
      expect(mockPrismaService.category.create).not.toHaveBeenCalled()
    })

    it('should create new category if not found', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(null)
      mockPrismaService.category.create.mockResolvedValue(mockCategory)

      const result = await service.findOrCreate(
        mockCategory.userId,
        mockCategory.name,
        mockCategory.type
      )

      expect(result).toEqual(mockCategory)
      expect(mockPrismaService.category.create).toHaveBeenCalledWith({
        data: {
          userId: mockCategory.userId,
          name: mockCategory.name,
          type: mockCategory.type,
        },
      })
    })
  })

  describe('create', () => {
    it('should create a new category via findOrCreate', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(null)
      mockPrismaService.category.create.mockResolvedValue(mockCategory)

      const result = await service.create(mockCategory.userId, {
        name: mockCategory.name,
        type: mockCategory.type,
      })

      expect(result).toEqual(mockCategory)
    })

    it('should return existing category if already exists', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(mockCategory)

      const result = await service.create(mockCategory.userId, {
        name: mockCategory.name,
        type: mockCategory.type,
      })

      expect(result).toEqual(mockCategory)
      expect(mockPrismaService.category.create).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('should update isExcludedFromBudget for an owned category', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      mockPrismaService.category.update.mockResolvedValue({
        ...mockCategory,
        isExcludedFromBudget: true,
      })

      const result = await service.update(
        mockCategory.userId,
        mockCategory.id,
        {
          isExcludedFromBudget: true,
        }
      )

      expect(result.isExcludedFromBudget).toBe(true)
      expect(mockPrismaService.category.findFirst).toHaveBeenCalledWith({
        where: { id: mockCategory.id, userId: mockCategory.userId },
      })
      expect(mockPrismaService.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: { isExcludedFromBudget: true },
      })
    })

    it('should throw NotFoundException when the category is not owned', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(null)

      await expect(
        service.update('other-user', mockCategory.id, {
          isExcludedFromBudget: true,
        })
      ).rejects.toThrow(NotFoundException)
      expect(mockPrismaService.category.update).not.toHaveBeenCalled()
    })

    it('should not set fields left undefined in the DTO', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      mockPrismaService.category.update.mockResolvedValue(mockCategory)

      await service.update(mockCategory.userId, mockCategory.id, {})

      expect(mockPrismaService.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: {},
      })
    })
  })

  describe('update — renaming', () => {
    const renamed = { ...mockCategory, name: 'Courses' }

    it('should rename the category', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      mockPrismaService.category.update.mockResolvedValue(renamed)

      const result = await service.update(
        mockCategory.userId,
        mockCategory.id,
        {
          name: 'Courses',
        }
      )

      expect(result.name).toBe('Courses')
      expect(mockPrismaService.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: { name: 'Courses' },
      })
    })

    // Everything referencing a category — transactions, budget entries,
    // associations, hidden-category preferences — does so by id, so a rename
    // is one UPDATE and nothing else. The Prisma mock exposes no other model,
    // so any attempt at a side write would throw here.
    it('should rename an income category the same single-statement way', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory2)
      mockPrismaService.category.update.mockResolvedValue({
        ...mockCategory2,
        name: 'Paie',
      })

      await service.update(mockCategory2.userId, mockCategory2.id, {
        name: 'Paie',
      })

      expect(mockPrismaService.category.update).toHaveBeenCalledTimes(1)
      expect(mockPrismaService.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory2.id },
        data: { name: 'Paie' },
      })
    })

    it('should reject a name already taken by another category of the same type', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      mockPrismaService.category.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.0.0',
        })
      )

      await expect(
        service.update(mockCategory.userId, mockCategory.id, {
          name: 'Loisirs',
        })
      ).rejects.toThrow(ConflictException)
    })
  })
})
