import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { Subcategory } from '../generated/prisma'
import type { CreateSubcategoryDto } from './dto'

@Injectable()
export class SubcategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all subcategories for a user
   */
  async findAllByUser(userId: string): Promise<Subcategory[]> {
    return this.prisma.subcategory.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    })
  }

  /**
   * Get subcategories for a specific category
   */
  async findByCategoryId(
    userId: string,
    categoryId: string
  ): Promise<Subcategory[]> {
    return this.prisma.subcategory.findMany({
      where: { userId, categoryId },
      orderBy: { name: 'asc' },
    })
  }

  /**
   * Find or create a single subcategory
   */
  async findOrCreate(
    userId: string,
    categoryId: string,
    name: string
  ): Promise<Subcategory> {
    const existing = await this.prisma.subcategory.findUnique({
      where: {
        categoryId_name: { categoryId, name },
      },
    })

    if (existing) {
      return existing
    }

    return this.prisma.subcategory.create({
      data: { userId, categoryId, name },
    })
  }

  /**
   * Create a new subcategory
   */
  async create(
    userId: string,
    dto: CreateSubcategoryDto
  ): Promise<Subcategory> {
    return this.findOrCreate(userId, dto.categoryId, dto.name)
  }

  /**
   * Batch find or create multiple subcategories.
   * Much more efficient than calling findOrCreate() N times.
   * Returns all subcategories and count of newly created ones.
   */
  async findOrCreateMany(
    userId: string,
    subcategories: Array<{ categoryId: string; name: string }>
  ): Promise<{ subcategories: Subcategory[]; newCount: number }> {
    if (subcategories.length === 0) {
      return { subcategories: [], newCount: 0 }
    }

    // Filter out empty names
    const validSubcategories = subcategories.filter(
      s => s.name && s.name.trim()
    )

    if (validSubcategories.length === 0) {
      return { subcategories: [], newCount: 0 }
    }

    // Deduplicate by categoryId|name
    const uniqueSubcategories = [
      ...new Map(
        validSubcategories.map(s => [`${s.categoryId}|${s.name}`, s])
      ).values(),
    ]

    // 1. Find all existing subcategories in one query
    const existing = await this.prisma.subcategory.findMany({
      where: {
        userId,
        OR: uniqueSubcategories.map(s => ({
          categoryId: s.categoryId,
          name: s.name,
        })),
      },
    })
    const existingSet = new Set(existing.map(s => `${s.categoryId}|${s.name}`))

    // 2. Create missing ones in batch
    const toCreate = uniqueSubcategories.filter(
      s => !existingSet.has(`${s.categoryId}|${s.name}`)
    )

    if (toCreate.length > 0) {
      await this.prisma.subcategory.createMany({
        data: toCreate.map(s => ({
          userId,
          categoryId: s.categoryId,
          name: s.name,
        })),
        skipDuplicates: true,
      })
    }

    // 3. Return all subcategories and count of new ones
    const allSubcategories = await this.prisma.subcategory.findMany({
      where: {
        userId,
        OR: uniqueSubcategories.map(s => ({
          categoryId: s.categoryId,
          name: s.name,
        })),
      },
    })

    return { subcategories: allSubcategories, newCount: toCreate.length }
  }
}
