import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { CategoryAssociationController } from './category-association.controller'
import { CategoryAssociationService } from './category-association.service'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import type { CategoryAssociationDto } from './dto'
import type { User } from '../generated/prisma'

describe('CategoryAssociationController', () => {
  let controller: CategoryAssociationController
  let service: CategoryAssociationService

  const mockUser: User = {
    id: 'user-123',
    supabaseId: 'supabase-123',
    email: 'test@test.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockAssociation: CategoryAssociationDto = {
    id: 'assoc-1',
    expenseCategoryId: 'cat-expense-1',
    expenseCategoryName: 'Sante',
    incomeCategoryId: 'cat-income-1',
    incomeCategoryName: 'Remboursement Mutuelle',
  }

  const mockCategoryAssociationService = {
    findAll: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoryAssociationController],
      providers: [
        {
          provide: CategoryAssociationService,
          useValue: mockCategoryAssociationService,
        },
      ],
    })
      .overrideGuard(SupabaseGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<CategoryAssociationController>(
      CategoryAssociationController
    )
    service = module.get<CategoryAssociationService>(CategoryAssociationService)
  })

  describe('findAll', () => {
    it('should return all associations for the user', async () => {
      mockCategoryAssociationService.findAll.mockResolvedValue([
        mockAssociation,
      ])

      const result = await controller.findAll(mockUser)

      expect(service.findAll).toHaveBeenCalledWith(mockUser.id)
      expect(result).toEqual([mockAssociation])
    })

    it('should return empty array when no associations', async () => {
      mockCategoryAssociationService.findAll.mockResolvedValue([])

      const result = await controller.findAll(mockUser)

      expect(result).toEqual([])
    })
  })

  describe('create', () => {
    it('should create a new association', async () => {
      mockCategoryAssociationService.create.mockResolvedValue(mockAssociation)

      const result = await controller.create(mockUser, {
        expenseCategoryId: 'cat-expense-1',
        incomeCategoryId: 'cat-income-1',
      })

      expect(service.create).toHaveBeenCalledWith(mockUser.id, {
        expenseCategoryId: 'cat-expense-1',
        incomeCategoryId: 'cat-income-1',
      })
      expect(result).toEqual(mockAssociation)
    })
  })

  describe('delete', () => {
    it('should delete an association', async () => {
      mockCategoryAssociationService.delete.mockResolvedValue(undefined)

      await controller.delete(mockUser, 'assoc-1')

      expect(service.delete).toHaveBeenCalledWith(mockUser.id, 'assoc-1')
    })
  })
})
