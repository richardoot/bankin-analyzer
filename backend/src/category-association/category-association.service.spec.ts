import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { ConflictException } from '@nestjs/common'
import { CategoryAssociationService } from './category-association.service'
import { PrismaService } from '../prisma/prisma.service'

describe('CategoryAssociationService', () => {
  let service: CategoryAssociationService

  const mockUserId = 'user-123'

  const mockPrismaService = {
    categoryAssociation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryAssociationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile()

    service = module.get<CategoryAssociationService>(CategoryAssociationService)

    vi.clearAllMocks()
  })

  describe('findAll', () => {
    it('should return all associations for a user', async () => {
      const mockAssociations = [
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense-1',
          incomeCategoryId: 'cat-income-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          expenseCategory: { name: 'Sante' },
          incomeCategory: { name: 'Remboursement Mutuelle' },
        },
      ]

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue(
        mockAssociations
      )

      const result = await service.findAll(mockUserId)

      expect(
        mockPrismaService.categoryAssociation.findMany
      ).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        include: {
          expenseCategory: true,
          incomeCategory: true,
        },
        orderBy: { createdAt: 'desc' },
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        id: 'assoc-1',
        expenseCategoryId: 'cat-expense-1',
        expenseCategoryName: 'Sante',
        incomeCategoryId: 'cat-income-1',
        incomeCategoryName: 'Remboursement Mutuelle',
      })
    })

    it('should return empty array when no associations', async () => {
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([])

      const result = await service.findAll(mockUserId)

      expect(result).toEqual([])
    })
  })

  describe('create', () => {
    it('should create a new association', async () => {
      mockPrismaService.categoryAssociation.findUnique.mockResolvedValue(null)
      mockPrismaService.categoryAssociation.create.mockResolvedValue({
        id: 'assoc-new',
        userId: mockUserId,
        expenseCategoryId: 'cat-expense-1',
        incomeCategoryId: 'cat-income-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        expenseCategory: { name: 'Sante' },
        incomeCategory: { name: 'Remboursement' },
      })

      const result = await service.create(mockUserId, {
        expenseCategoryId: 'cat-expense-1',
        incomeCategoryId: 'cat-income-1',
      })

      expect(result).toEqual({
        id: 'assoc-new',
        expenseCategoryId: 'cat-expense-1',
        expenseCategoryName: 'Sante',
        incomeCategoryId: 'cat-income-1',
        incomeCategoryName: 'Remboursement',
      })
    })

    it('should throw ConflictException if expense category already associated', async () => {
      mockPrismaService.categoryAssociation.findUnique.mockResolvedValueOnce({
        id: 'existing',
      })

      await expect(
        service.create(mockUserId, {
          expenseCategoryId: 'cat-expense-1',
          incomeCategoryId: 'cat-income-1',
        })
      ).rejects.toThrow(ConflictException)
    })

    it('should throw ConflictException if income category already associated', async () => {
      mockPrismaService.categoryAssociation.findUnique
        .mockResolvedValueOnce(null) // First call for expense category
        .mockResolvedValueOnce({ id: 'existing' }) // Second call for income category

      await expect(
        service.create(mockUserId, {
          expenseCategoryId: 'cat-expense-1',
          incomeCategoryId: 'cat-income-1',
        })
      ).rejects.toThrow(ConflictException)
    })
  })

  describe('delete', () => {
    it('should delete an association', async () => {
      mockPrismaService.categoryAssociation.deleteMany.mockResolvedValue({
        count: 1,
      })

      await service.delete(mockUserId, 'assoc-1')

      expect(
        mockPrismaService.categoryAssociation.deleteMany
      ).toHaveBeenCalledWith({
        where: {
          id: 'assoc-1',
          userId: mockUserId,
        },
      })
    })
  })

  describe('findByExpenseCategory', () => {
    it('should return association for expense category', async () => {
      mockPrismaService.categoryAssociation.findUnique.mockResolvedValue({
        id: 'assoc-1',
        userId: mockUserId,
        expenseCategoryId: 'cat-expense-1',
        incomeCategoryId: 'cat-income-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        expenseCategory: { name: 'Sante' },
        incomeCategory: { name: 'Remboursement' },
      })

      const result = await service.findByExpenseCategory(
        mockUserId,
        'cat-expense-1'
      )

      expect(result).toEqual({
        id: 'assoc-1',
        expenseCategoryId: 'cat-expense-1',
        expenseCategoryName: 'Sante',
        incomeCategoryId: 'cat-income-1',
        incomeCategoryName: 'Remboursement',
      })
    })

    it('should return null if no association found', async () => {
      mockPrismaService.categoryAssociation.findUnique.mockResolvedValue(null)

      const result = await service.findByExpenseCategory(
        mockUserId,
        'cat-expense-1'
      )

      expect(result).toBeNull()
    })
  })
})
