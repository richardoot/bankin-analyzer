import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { CategoriesService } from './categories.service'
import { PrismaService } from '../prisma/prisma.service'
import { TransactionType } from '../generated/prisma'

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
    create: vi.fn(),
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
})
