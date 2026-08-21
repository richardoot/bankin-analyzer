import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TransactionType } from '../generated/prisma'
import type {
  CategoryAssociationDto,
  CreateCategoryAssociationDto,
} from './dto'

@Injectable()
export class CategoryAssociationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A category of `type` the caller actually owns.
   *
   * The foreign keys alone accept any existing category id, including another
   * user's: without this check a crafted request could pair a stranger's
   * category and then read its name back through `findAll`. The type is
   * verified in the same pass, since an association whose sides are not one
   * EXPENSE and one INCOME cannot describe a reimbursement at all.
   */
  private async findOwnedCategory(
    userId: string,
    categoryId: string,
    type: TransactionType
  ): Promise<{ id: string; name: string }> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { id: true, name: true, type: true },
    })

    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`)
    }

    if (category.type !== type) {
      throw new BadRequestException(
        `Category ${category.name} is of type ${category.type}, expected ${type}`
      )
    }

    return { id: category.id, name: category.name }
  }

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
    // Ownership and type first: a request naming a stranger's category must
    // fail before it can create a row that leaks the name back.
    await Promise.all([
      this.findOwnedCategory(
        userId,
        dto.expenseCategoryId,
        TransactionType.EXPENSE
      ),
      this.findOwnedCategory(
        userId,
        dto.incomeCategoryId,
        TransactionType.INCOME
      ),
    ])

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
