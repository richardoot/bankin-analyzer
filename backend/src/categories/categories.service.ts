import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma, TransactionType } from '../generated/prisma'
import type { Category } from '../generated/prisma'
import type { CreateCategoryDto, UpdateCategoryDto } from './dto'

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByUser(userId: string): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    })
  }

  async findOrCreate(
    userId: string,
    name: string,
    type: TransactionType
  ): Promise<Category> {
    const existing = await this.prisma.category.findUnique({
      where: {
        userId_name_type: { userId, name, type },
      },
    })

    if (existing) {
      return existing
    }

    return this.prisma.category.create({
      data: { userId, name, type },
    })
  }

  async create(userId: string, dto: CreateCategoryDto): Promise<Category> {
    return this.findOrCreate(userId, dto.name, dto.type)
  }

  /**
   * Update a category. Everything that points at a category does so by id —
   * transactions, budget plan entries, associations, hidden-category
   * preferences — so a rename carries over on its own, with nothing to replay.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateCategoryDto
  ): Promise<Category> {
    const category = await this.prisma.category.findFirst({
      where: { id, userId },
    })
    if (!category) {
      throw new NotFoundException(`Category ${id} not found`)
    }

    const data = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.isExcludedFromBudget !== undefined && {
        isExcludedFromBudget: dto.isExcludedFromBudget,
      }),
    }
    const isRenaming = dto.name !== undefined && dto.name !== category.name

    try {
      return await this.prisma.category.update({ where: { id }, data })
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        isRenaming
      ) {
        throw new ConflictException(
          `A category named "${dto.name}" already exists for this type.`
        )
      }
      throw err
    }
  }

  /**
   * Batch find or create multiple categories.
   * Much more efficient than calling findOrCreate() N times.
   * Returns all categories and count of newly created ones.
   */
  async findOrCreateMany(
    userId: string,
    categories: Array<{ name: string; type: TransactionType }>
  ): Promise<{ categories: Category[]; newCount: number }> {
    if (categories.length === 0) {
      return { categories: [], newCount: 0 }
    }

    // Deduplicate by name|type
    const uniqueCategories = [
      ...new Map(categories.map(c => [`${c.name}|${c.type}`, c])).values(),
    ]

    // 1. Find all existing categories in one query
    const existing = await this.prisma.category.findMany({
      where: {
        userId,
        OR: uniqueCategories.map(c => ({ name: c.name, type: c.type })),
      },
    })
    const existingSet = new Set(existing.map(c => `${c.name}|${c.type}`))

    // 2. Create missing ones in batch
    const toCreate = uniqueCategories.filter(
      c => !existingSet.has(`${c.name}|${c.type}`)
    )

    if (toCreate.length > 0) {
      await this.prisma.category.createMany({
        data: toCreate.map(c => ({ userId, name: c.name, type: c.type })),
        skipDuplicates: true,
      })
    }

    // 3. Return all categories and count of new ones
    const allCategories = await this.prisma.category.findMany({
      where: {
        userId,
        OR: uniqueCategories.map(c => ({ name: c.name, type: c.type })),
      },
    })

    return { categories: allCategories, newCount: toCreate.length }
  }

  async findWithoutIcons(userId: string) {
    return this.prisma.category.findMany({
      where: { userId, icon: null },
      select: { id: true, name: true },
    })
  }

  async findSubcategoriesWithoutIcons(userId: string) {
    return this.prisma.subcategory.findMany({
      where: { userId, icon: null },
      select: { id: true, name: true },
    })
  }
}
