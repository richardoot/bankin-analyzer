import { Injectable, ConflictException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type {
  CategoryAssociationDto,
  CreateCategoryAssociationDto,
} from './dto'

@Injectable()
export class CategoryAssociationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string): Promise<CategoryAssociationDto[]> {
    const associations = await this.prisma.categoryAssociation.findMany({
      where: { userId },
      include: {
        expenseCategory: true,
        incomeCategory: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return associations.map(association => ({
      id: association.id,
      expenseCategoryId: association.expenseCategoryId,
      expenseCategoryName: association.expenseCategory.name,
      incomeCategoryId: association.incomeCategoryId,
      incomeCategoryName: association.incomeCategory.name,
    }))
  }

  async create(
    userId: string,
    dto: CreateCategoryAssociationDto
  ): Promise<CategoryAssociationDto> {
    // Check if expense category already has an association
    const existingExpenseAssociation =
      await this.prisma.categoryAssociation.findUnique({
        where: {
          userId_expenseCategoryId: {
            userId,
            expenseCategoryId: dto.expenseCategoryId,
          },
        },
      })

    if (existingExpenseAssociation) {
      throw new ConflictException(
        'Cette catégorie de dépense est déjà associée à une catégorie de revenu'
      )
    }

    // Check if income category already has an association
    const existingIncomeAssociation =
      await this.prisma.categoryAssociation.findUnique({
        where: {
          userId_incomeCategoryId: {
            userId,
            incomeCategoryId: dto.incomeCategoryId,
          },
        },
      })

    if (existingIncomeAssociation) {
      throw new ConflictException(
        'Cette catégorie de revenu est déjà associée à une catégorie de dépense'
      )
    }

    const association = await this.prisma.categoryAssociation.create({
      data: {
        userId,
        expenseCategoryId: dto.expenseCategoryId,
        incomeCategoryId: dto.incomeCategoryId,
      },
      include: {
        expenseCategory: true,
        incomeCategory: true,
      },
    })

    return {
      id: association.id,
      expenseCategoryId: association.expenseCategoryId,
      expenseCategoryName: association.expenseCategory.name,
      incomeCategoryId: association.incomeCategoryId,
      incomeCategoryName: association.incomeCategory.name,
    }
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.prisma.categoryAssociation.deleteMany({
      where: {
        id,
        userId,
      },
    })
  }

  async findByExpenseCategory(
    userId: string,
    expenseCategoryId: string
  ): Promise<CategoryAssociationDto | null> {
    const association = await this.prisma.categoryAssociation.findUnique({
      where: {
        userId_expenseCategoryId: {
          userId,
          expenseCategoryId,
        },
      },
      include: {
        expenseCategory: true,
        incomeCategory: true,
      },
    })

    if (!association) {
      return null
    }

    return {
      id: association.id,
      expenseCategoryId: association.expenseCategoryId,
      expenseCategoryName: association.expenseCategory.name,
      incomeCategoryId: association.incomeCategoryId,
      incomeCategoryName: association.incomeCategory.name,
    }
  }
}
