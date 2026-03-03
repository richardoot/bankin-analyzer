import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { Category, TransactionType } from '../generated/prisma'
import type { CreateCategoryDto } from './dto'

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
}
