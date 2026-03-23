import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { SubcategoriesService } from './subcategories.service'
import { PrismaService } from '../prisma/prisma.service'

const mockSubcategory = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  userId: '550e8400-e29b-41d4-a716-446655440001',
  categoryId: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Restaurant',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockSubcategory2 = {
  id: '550e8400-e29b-41d4-a716-446655440011',
  userId: '550e8400-e29b-41d4-a716-446655440001',
  categoryId: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Supermarche',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockPrismaService = {
  subcategory: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
  },
}

describe('SubcategoriesService', () => {
  let service: SubcategoriesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubcategoriesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile()

    service = module.get<SubcategoriesService>(SubcategoriesService)

    vi.clearAllMocks()
  })

  describe('findAllByUser', () => {
    it('should return all subcategories for a user', async () => {
      mockPrismaService.subcategory.findMany.mockResolvedValue([
        mockSubcategory,
        mockSubcategory2,
      ])

      const result = await service.findAllByUser(mockSubcategory.userId)

      expect(result).toEqual([mockSubcategory, mockSubcategory2])
      expect(mockPrismaService.subcategory.findMany).toHaveBeenCalledWith({
        where: { userId: mockSubcategory.userId },
        orderBy: { name: 'asc' },
      })
    })

    it('should return empty array when no subcategories', async () => {
      mockPrismaService.subcategory.findMany.mockResolvedValue([])

      const result = await service.findAllByUser('user-without-subcategories')

      expect(result).toEqual([])
    })
  })

  describe('findByCategoryId', () => {
    it('should return subcategories for a specific category', async () => {
      mockPrismaService.subcategory.findMany.mockResolvedValue([
        mockSubcategory,
        mockSubcategory2,
      ])

      const result = await service.findByCategoryId(
        mockSubcategory.userId,
        mockSubcategory.categoryId
      )

      expect(result).toEqual([mockSubcategory, mockSubcategory2])
      expect(mockPrismaService.subcategory.findMany).toHaveBeenCalledWith({
        where: {
          userId: mockSubcategory.userId,
          categoryId: mockSubcategory.categoryId,
        },
        orderBy: { name: 'asc' },
      })
    })

    it('should return empty array when category has no subcategories', async () => {
      mockPrismaService.subcategory.findMany.mockResolvedValue([])

      const result = await service.findByCategoryId(
        mockSubcategory.userId,
        'category-without-subcategories'
      )

      expect(result).toEqual([])
    })
  })

  describe('findOrCreate', () => {
    it('should return existing subcategory if found', async () => {
      mockPrismaService.subcategory.findUnique.mockResolvedValue(
        mockSubcategory
      )

      const result = await service.findOrCreate(
        mockSubcategory.userId,
        mockSubcategory.categoryId,
        mockSubcategory.name
      )

      expect(result).toEqual(mockSubcategory)
      expect(mockPrismaService.subcategory.findUnique).toHaveBeenCalledWith({
        where: {
          categoryId_name: {
            categoryId: mockSubcategory.categoryId,
            name: mockSubcategory.name,
          },
        },
      })
      expect(mockPrismaService.subcategory.create).not.toHaveBeenCalled()
    })

    it('should create new subcategory if not found', async () => {
      mockPrismaService.subcategory.findUnique.mockResolvedValue(null)
      mockPrismaService.subcategory.create.mockResolvedValue(mockSubcategory)

      const result = await service.findOrCreate(
        mockSubcategory.userId,
        mockSubcategory.categoryId,
        mockSubcategory.name
      )

      expect(result).toEqual(mockSubcategory)
      expect(mockPrismaService.subcategory.create).toHaveBeenCalledWith({
        data: {
          userId: mockSubcategory.userId,
          categoryId: mockSubcategory.categoryId,
          name: mockSubcategory.name,
        },
      })
    })
  })

  describe('create', () => {
    it('should create a new subcategory via findOrCreate', async () => {
      mockPrismaService.subcategory.findUnique.mockResolvedValue(null)
      mockPrismaService.subcategory.create.mockResolvedValue(mockSubcategory)

      const result = await service.create(mockSubcategory.userId, {
        categoryId: mockSubcategory.categoryId,
        name: mockSubcategory.name,
      })

      expect(result).toEqual(mockSubcategory)
    })

    it('should return existing subcategory if already exists', async () => {
      mockPrismaService.subcategory.findUnique.mockResolvedValue(
        mockSubcategory
      )

      const result = await service.create(mockSubcategory.userId, {
        categoryId: mockSubcategory.categoryId,
        name: mockSubcategory.name,
      })

      expect(result).toEqual(mockSubcategory)
      expect(mockPrismaService.subcategory.create).not.toHaveBeenCalled()
    })
  })

  describe('findOrCreateMany', () => {
    it('should return empty result for empty input', async () => {
      const result = await service.findOrCreateMany(mockSubcategory.userId, [])

      expect(result).toEqual({ subcategories: [], newCount: 0 })
      expect(mockPrismaService.subcategory.findMany).not.toHaveBeenCalled()
    })

    it('should filter out empty names', async () => {
      const result = await service.findOrCreateMany(mockSubcategory.userId, [
        { categoryId: mockSubcategory.categoryId, name: '' },
        { categoryId: mockSubcategory.categoryId, name: '   ' },
      ])

      expect(result).toEqual({ subcategories: [], newCount: 0 })
      expect(mockPrismaService.subcategory.findMany).not.toHaveBeenCalled()
    })

    it('should create new subcategories and return all', async () => {
      mockPrismaService.subcategory.findMany
        .mockResolvedValueOnce([]) // First call: find existing
        .mockResolvedValueOnce([mockSubcategory, mockSubcategory2]) // Second call: get all

      mockPrismaService.subcategory.createMany.mockResolvedValue({ count: 2 })

      const result = await service.findOrCreateMany(mockSubcategory.userId, [
        { categoryId: mockSubcategory.categoryId, name: 'Restaurant' },
        { categoryId: mockSubcategory.categoryId, name: 'Supermarche' },
      ])

      expect(result.subcategories).toEqual([mockSubcategory, mockSubcategory2])
      expect(result.newCount).toBe(2)
      expect(mockPrismaService.subcategory.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: mockSubcategory.userId,
            categoryId: mockSubcategory.categoryId,
            name: 'Restaurant',
          },
          {
            userId: mockSubcategory.userId,
            categoryId: mockSubcategory.categoryId,
            name: 'Supermarche',
          },
        ],
        skipDuplicates: true,
      })
    })

    it('should not create duplicates', async () => {
      mockPrismaService.subcategory.findMany
        .mockResolvedValueOnce([mockSubcategory]) // First call: find existing
        .mockResolvedValueOnce([mockSubcategory, mockSubcategory2]) // Second call: get all

      mockPrismaService.subcategory.createMany.mockResolvedValue({ count: 1 })

      const result = await service.findOrCreateMany(mockSubcategory.userId, [
        { categoryId: mockSubcategory.categoryId, name: 'Restaurant' }, // Already exists
        { categoryId: mockSubcategory.categoryId, name: 'Supermarche' }, // New
      ])

      expect(result.newCount).toBe(1)
      expect(mockPrismaService.subcategory.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: mockSubcategory.userId,
            categoryId: mockSubcategory.categoryId,
            name: 'Supermarche',
          },
        ],
        skipDuplicates: true,
      })
    })

    it('should deduplicate input by categoryId|name', async () => {
      mockPrismaService.subcategory.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockSubcategory])

      mockPrismaService.subcategory.createMany.mockResolvedValue({ count: 1 })

      const result = await service.findOrCreateMany(mockSubcategory.userId, [
        { categoryId: mockSubcategory.categoryId, name: 'Restaurant' },
        { categoryId: mockSubcategory.categoryId, name: 'Restaurant' }, // Duplicate
      ])

      expect(result.newCount).toBe(1)
      expect(mockPrismaService.subcategory.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: mockSubcategory.userId,
            categoryId: mockSubcategory.categoryId,
            name: 'Restaurant',
          },
        ],
        skipDuplicates: true,
      })
    })
  })
})
