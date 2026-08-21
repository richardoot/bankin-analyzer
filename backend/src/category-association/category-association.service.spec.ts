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
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    category: {
      findFirst: vi.fn(),
    },
  }

  /**
   * Categories the ownership check resolves against. `create` looks both sides
   * up before doing anything else, so without them every create spec would
   * fail on the guard rather than on what it means to assert. Ownership and
   * type rejections are covered end-to-end in
   * test/category-associations.e2e-spec.ts, where real SQL can tell one user's
   * rows from another's.
   */
  const knownCategories: Record<string, { name: string; type: string }> = {
    'cat-expense-1': { name: 'Sante', type: 'EXPENSE' },
    'cat-income-1': { name: 'Remboursement Mutuelle', type: 'INCOME' },
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

    mockPrismaService.category.findFirst.mockImplementation(
      (args: { where: { id: string } }) => {
        const known = knownCategories[args.where.id]
        return Promise.resolve(known ? { id: args.where.id, ...known } : null)
      }
    )
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
      mockPrismaService.categoryAssociation.findFirst.mockResolvedValue(null)
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

    it('allows one income category to feed several expense categories', async () => {
      // The bijection is gone: "Remboursement sante" can repay both Sante and
      // Pharmacie, which used to force a dummy income category per expense one.
      mockPrismaService.categoryAssociation.findFirst.mockResolvedValue(null)
      mockPrismaService.categoryAssociation.create.mockResolvedValue({
        id: 'assoc-second',
        userId: mockUserId,
        expenseCategoryId: 'cat-expense-1',
        incomeCategoryId: 'cat-income-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        expenseCategory: { name: 'Pharmacie' },
        incomeCategory: { name: 'Remboursement Mutuelle' },
      })

      await expect(
        service.create(mockUserId, {
          expenseCategoryId: 'cat-expense-1',
          incomeCategoryId: 'cat-income-1',
        })
      ).resolves.toBeDefined()
    })

    it('still refuses the very same pairing twice', async () => {
      mockPrismaService.categoryAssociation.findFirst.mockResolvedValue({
        id: 'existing',
      })

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
})
