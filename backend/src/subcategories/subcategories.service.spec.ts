import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { SubcategoriesService } from './subcategories.service'
import { PrismaService } from '../prisma/prisma.service'

const userId = '550e8400-e29b-41d4-a716-446655440001'

/** A catalogue expense category, with the defaults of its "Autre". */
const expenseCategory = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId,
  name: 'Loisirs et culture',
  type: 'EXPENSE',
  icon: '🎉',
  catalogKey: 'leisure',
  defaultNature: 'PLEASURE',
  defaultRhythm: 'VARIABLE',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
}

const incomeCategory = {
  ...expenseCategory,
  id: '550e8400-e29b-41d4-a716-446655440002',
  name: 'Remboursements',
  type: 'INCOME',
  catalogKey: 'refunds',
  defaultNature: null,
  defaultRhythm: null,
}

const transferCategory = {
  ...incomeCategory,
  id: '550e8400-e29b-41d4-a716-446655440003',
  name: 'Virement interne',
  type: 'TRANSFER',
  catalogKey: 'internal-transfer',
}

/** A category from before the catalogue: no key, no defaults. */
const legacyCategory = {
  ...expenseCategory,
  id: '550e8400-e29b-41d4-a716-446655440004',
  name: 'Loisirs & Sorties',
  catalogKey: null,
  defaultNature: null,
  defaultRhythm: null,
}

const mockSubcategory = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  userId,
  categoryId: expenseCategory.id,
  name: 'Escalade',
  icon: null,
  catalogKey: null,
  nature: 'PLEASURE',
  rhythm: 'VARIABLE',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockSubcategory2 = {
  ...mockSubcategory,
  id: '550e8400-e29b-41d4-a716-446655440011',
  name: 'Poterie',
}

const otherSubcategory = {
  ...mockSubcategory,
  id: '550e8400-e29b-41d4-a716-446655440012',
  name: 'Autre',
  catalogKey: 'leisure.other',
}

const mockPrismaService = {
  subcategory: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    delete: vi.fn(),
  },
  category: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  transaction: {
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(mockPrismaService)
  ),
}

describe('SubcategoriesService', () => {
  let service: SubcategoriesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubcategoriesService,
        { provide: PrismaService, useValue: mockPrismaService },
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

      const result = await service.findAllByUser(userId)

      expect(result).toEqual([mockSubcategory, mockSubcategory2])
      expect(mockPrismaService.subcategory.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { name: 'asc' },
      })
    })
  })

  describe('findByCategoryId', () => {
    it('should return subcategories for a specific category', async () => {
      mockPrismaService.subcategory.findMany.mockResolvedValue([
        mockSubcategory,
      ])

      const result = await service.findByCategoryId(userId, expenseCategory.id)

      expect(result).toEqual([mockSubcategory])
      expect(mockPrismaService.subcategory.findMany).toHaveBeenCalledWith({
        where: { userId, categoryId: expenseCategory.id },
        orderBy: { name: 'asc' },
      })
    })
  })

  describe('create', () => {
    it('creates under an expense category with the attributes asked for', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(expenseCategory)
      mockPrismaService.subcategory.findUnique.mockResolvedValue(null)
      mockPrismaService.subcategory.create.mockResolvedValue(mockSubcategory)

      const result = await service.create(userId, {
        categoryId: expenseCategory.id,
        name: 'Escalade',
        nature: 'ESSENTIAL',
        rhythm: 'COMMITTED',
      })

      expect(result).toEqual(mockSubcategory)
      expect(mockPrismaService.category.findFirst).toHaveBeenCalledWith({
        where: { id: expenseCategory.id, userId },
      })
      expect(mockPrismaService.subcategory.create).toHaveBeenCalledWith({
        data: {
          userId,
          categoryId: expenseCategory.id,
          name: 'Escalade',
          nature: 'ESSENTIAL',
          rhythm: 'COMMITTED',
        },
      })
    })

    it("defaults the attributes to the parent's own when none are given", async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(expenseCategory)
      mockPrismaService.subcategory.findUnique.mockResolvedValue(null)
      mockPrismaService.subcategory.create.mockResolvedValue(mockSubcategory)

      await service.create(userId, {
        categoryId: expenseCategory.id,
        name: 'Escalade',
      })

      expect(mockPrismaService.subcategory.create).toHaveBeenCalledWith({
        data: {
          userId,
          categoryId: expenseCategory.id,
          name: 'Escalade',
          nature: 'PLEASURE',
          rhythm: 'VARIABLE',
        },
      })
    })

    it('leaves the attributes null under a legacy category, which has no defaults', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(legacyCategory)
      mockPrismaService.subcategory.findUnique.mockResolvedValue(null)
      mockPrismaService.subcategory.create.mockResolvedValue(mockSubcategory)

      await service.create(userId, {
        categoryId: legacyCategory.id,
        name: 'Escalade',
      })

      expect(mockPrismaService.subcategory.create).toHaveBeenCalledWith({
        data: {
          userId,
          categoryId: legacyCategory.id,
          name: 'Escalade',
          nature: null,
          rhythm: null,
        },
      })
    })

    it('hands back the subcategory already bearing that name', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(expenseCategory)
      mockPrismaService.subcategory.findUnique.mockResolvedValue(
        mockSubcategory
      )

      const result = await service.create(userId, {
        categoryId: expenseCategory.id,
        name: 'Escalade',
      })

      expect(result).toEqual(mockSubcategory)
      expect(mockPrismaService.subcategory.create).not.toHaveBeenCalled()
    })

    it('creates under an income category without attributes', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(incomeCategory)
      mockPrismaService.subcategory.findUnique.mockResolvedValue(null)
      mockPrismaService.subcategory.create.mockResolvedValue(mockSubcategory)

      await service.create(userId, {
        categoryId: incomeCategory.id,
        name: 'Cagnotte',
      })

      expect(mockPrismaService.subcategory.create).toHaveBeenCalledWith({
        data: {
          userId,
          categoryId: incomeCategory.id,
          name: 'Cagnotte',
          nature: null,
          rhythm: null,
        },
      })
    })

    it('refuses a nature or a rhythm under an income category', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(incomeCategory)

      await expect(
        service.create(userId, {
          categoryId: incomeCategory.id,
          name: 'Cagnotte',
          nature: 'PLEASURE',
        })
      ).rejects.toThrow(BadRequestException)
      expect(mockPrismaService.subcategory.create).not.toHaveBeenCalled()
    })

    it('refuses anything under a transfer category', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(transferCategory)

      await expect(
        service.create(userId, {
          categoryId: transferCategory.id,
          name: 'Livret A',
        })
      ).rejects.toThrow(ForbiddenException)
      expect(mockPrismaService.subcategory.findUnique).not.toHaveBeenCalled()
    })

    it('reports a category the user does not own as not found', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(null)

      await expect(
        service.create(userId, {
          categoryId: expenseCategory.id,
          name: 'Escalade',
        })
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('findOrCreateMany', () => {
    it('should return empty result for empty input', async () => {
      const result = await service.findOrCreateMany(userId, [])

      expect(result).toEqual({ subcategories: [], newCount: 0 })
      expect(mockPrismaService.category.findMany).not.toHaveBeenCalled()
    })

    it('should filter out empty names', async () => {
      const result = await service.findOrCreateMany(userId, [
        { categoryId: expenseCategory.id, name: '' },
        { categoryId: expenseCategory.id, name: '   ' },
      ])

      expect(result).toEqual({ subcategories: [], newCount: 0 })
      expect(mockPrismaService.category.findMany).not.toHaveBeenCalled()
    })

    it("creates the missing ones with their parent's defaults and returns all", async () => {
      mockPrismaService.category.findMany.mockResolvedValue([expenseCategory])
      mockPrismaService.subcategory.findMany
        .mockResolvedValueOnce([]) // find existing
        .mockResolvedValueOnce([mockSubcategory, mockSubcategory2]) // all
      mockPrismaService.subcategory.createMany.mockResolvedValue({ count: 2 })

      const result = await service.findOrCreateMany(userId, [
        { categoryId: expenseCategory.id, name: 'Escalade' },
        { categoryId: expenseCategory.id, name: 'Poterie' },
      ])

      expect(result.subcategories).toEqual([mockSubcategory, mockSubcategory2])
      expect(result.newCount).toBe(2)
      expect(mockPrismaService.subcategory.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId,
            categoryId: expenseCategory.id,
            name: 'Escalade',
            nature: 'PLEASURE',
            rhythm: 'VARIABLE',
          },
          {
            userId,
            categoryId: expenseCategory.id,
            name: 'Poterie',
            nature: 'PLEASURE',
            rhythm: 'VARIABLE',
          },
        ],
        skipDuplicates: true,
      })
    })

    it('should not create duplicates', async () => {
      mockPrismaService.category.findMany.mockResolvedValue([expenseCategory])
      mockPrismaService.subcategory.findMany
        .mockResolvedValueOnce([mockSubcategory])
        .mockResolvedValueOnce([mockSubcategory, mockSubcategory2])
      mockPrismaService.subcategory.createMany.mockResolvedValue({ count: 1 })

      const result = await service.findOrCreateMany(userId, [
        { categoryId: expenseCategory.id, name: 'Escalade' },
        { categoryId: expenseCategory.id, name: 'Poterie' },
      ])

      expect(result.newCount).toBe(1)
      expect(mockPrismaService.subcategory.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId,
            categoryId: expenseCategory.id,
            name: 'Poterie',
            nature: 'PLEASURE',
            rhythm: 'VARIABLE',
          },
        ],
        skipDuplicates: true,
      })
    })

    it('should deduplicate input by categoryId|name', async () => {
      mockPrismaService.category.findMany.mockResolvedValue([expenseCategory])
      mockPrismaService.subcategory.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockSubcategory])
      mockPrismaService.subcategory.createMany.mockResolvedValue({ count: 1 })

      const result = await service.findOrCreateMany(userId, [
        { categoryId: expenseCategory.id, name: 'Escalade' },
        { categoryId: expenseCategory.id, name: 'Escalade' },
      ])

      expect(result.newCount).toBe(1)
      expect(mockPrismaService.subcategory.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId,
            categoryId: expenseCategory.id,
            name: 'Escalade',
            nature: 'PLEASURE',
            rhythm: 'VARIABLE',
          },
        ],
        skipDuplicates: true,
      })
    })

    it('leaves out names under a category the user does not own, or a transfer one', async () => {
      // The parent lookup already excludes transfers and other users' rows.
      mockPrismaService.category.findMany.mockResolvedValue([])

      const result = await service.findOrCreateMany(userId, [
        { categoryId: transferCategory.id, name: 'Livret A' },
      ])

      expect(result).toEqual({ subcategories: [], newCount: 0 })
      expect(mockPrismaService.subcategory.findMany).not.toHaveBeenCalled()
      expect(mockPrismaService.category.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          id: { in: [transferCategory.id] },
          type: { not: 'TRANSFER' },
        },
      })
    })
  })

  describe('remove', () => {
    it('re-files the transactions to the category\'s "Autre" and deletes the row', async () => {
      mockPrismaService.subcategory.findFirst
        .mockResolvedValueOnce({
          ...mockSubcategory,
          category: { catalogKey: 'leisure' },
        })
        .mockResolvedValueOnce(otherSubcategory)
      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 3 })

      const result = await service.remove(userId, mockSubcategory.id)

      expect(result).toEqual({
        refiledTransactions: 3,
        fallbackSubcategoryId: otherSubcategory.id,
        fallbackSubcategoryName: 'Autre',
      })
      expect(mockPrismaService.subcategory.findFirst).toHaveBeenNthCalledWith(
        2,
        {
          where: {
            categoryId: expenseCategory.id,
            catalogKey: 'leisure.other',
          },
        }
      )
      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith({
        where: { subcategoryId: mockSubcategory.id, userId },
        data: { subcategoryId: otherSubcategory.id, subcategory: 'Autre' },
      })
      expect(mockPrismaService.subcategory.delete).toHaveBeenCalledWith({
        where: { id: mockSubcategory.id },
      })
    })

    it('falls back to the category alone under a legacy category', async () => {
      mockPrismaService.subcategory.findFirst.mockResolvedValueOnce({
        ...mockSubcategory,
        categoryId: legacyCategory.id,
        category: { catalogKey: null },
      })
      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 1 })

      const result = await service.remove(userId, mockSubcategory.id)

      expect(result).toEqual({
        refiledTransactions: 1,
        fallbackSubcategoryId: null,
        fallbackSubcategoryName: null,
      })
      // No "Autre" to look for.
      expect(mockPrismaService.subcategory.findFirst).toHaveBeenCalledTimes(1)
      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith({
        where: { subcategoryId: mockSubcategory.id, userId },
        data: { subcategoryId: null, subcategory: null },
      })
    })

    it('refuses to delete a catalogue subcategory', async () => {
      mockPrismaService.subcategory.findFirst.mockResolvedValueOnce({
        ...otherSubcategory,
        category: { catalogKey: 'leisure' },
      })

      await expect(service.remove(userId, otherSubcategory.id)).rejects.toThrow(
        ForbiddenException
      )
      expect(mockPrismaService.subcategory.delete).not.toHaveBeenCalled()
    })

    it('reports a subcategory the user does not own as not found', async () => {
      mockPrismaService.subcategory.findFirst.mockResolvedValueOnce(null)

      await expect(service.remove(userId, mockSubcategory.id)).rejects.toThrow(
        NotFoundException
      )
    })
  })
})
