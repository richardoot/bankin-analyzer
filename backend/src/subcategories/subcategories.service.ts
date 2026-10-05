import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TransactionType } from '../generated/prisma'
import type {
  Category,
  CategoryNature,
  CategoryRhythm,
  Subcategory,
} from '../generated/prisma'
import { OTHER_SUFFIX } from '../categories/catalog'
import type { CreateSubcategoryDto, SubcategoryDeletionResultDto } from './dto'

/** What a subcategory carries under a given parent. */
interface Attributes {
  nature: CategoryNature | null
  rhythm: CategoryRhythm | null
}

/**
 * Subcategories are the one level the user still writes to. Categories come
 * from the catalogue; inside one, the user may add their own headings, and
 * those headings carry the attributes every calculation reads — chosen by
 * the user, or defaulted from the parent.
 */
@Injectable()
export class SubcategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByUser(userId: string): Promise<Subcategory[]> {
    return this.prisma.subcategory.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    })
  }

  async findByCategoryId(
    userId: string,
    categoryId: string
  ): Promise<Subcategory[]> {
    return this.prisma.subcategory.findMany({
      where: { userId, categoryId },
      orderBy: { name: 'asc' },
    })
  }

  private async findOwnedCategory(
    userId: string,
    categoryId: string
  ): Promise<Category> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
    })
    if (!category) {
      throw new NotFoundException(`Category ${categoryId} not found`)
    }
    return category
  }

  /**
   * The attributes a new subcategory takes under `parent`.
   *
   * A transfer category is flat by design — "Virement interne / Autre" would
   * be a heading with nothing to distinguish it from — so nothing is created
   * under one. An income subcategory carries no attributes, and asking for
   * some is a mistake worth reporting rather than ignoring. An expense
   * subcategory takes what was asked, or the parent's defaults: those of its
   * "Autre", which is exactly what a transaction filed at the category alone
   * would get.
   */
  private static attributesUnder(
    parent: Category,
    wanted: { nature?: CategoryNature; rhythm?: CategoryRhythm }
  ): Attributes {
    if (parent.type === TransactionType.TRANSFER) {
      throw new ForbiddenException(
        `"${parent.name}" is a transfer category: transfers are filed at the category alone`
      )
    }
    if (parent.type === TransactionType.INCOME) {
      if (wanted.nature !== undefined || wanted.rhythm !== undefined) {
        throw new BadRequestException(
          'Only expense subcategories carry a nature and a rhythm'
        )
      }
      return { nature: null, rhythm: null }
    }
    return {
      nature: wanted.nature ?? parent.defaultNature,
      rhythm: wanted.rhythm ?? parent.defaultRhythm,
    }
  }

  /**
   * Add a subcategory under a category the user owns, or hand back the one
   * already bearing that name: the filing dialog creates on the fly, and
   * typing an existing name there must select it, not fail.
   */
  async create(
    userId: string,
    dto: CreateSubcategoryDto
  ): Promise<Subcategory> {
    const parent = await this.findOwnedCategory(userId, dto.categoryId)
    const attributes = SubcategoriesService.attributesUnder(parent, dto)

    const existing = await this.prisma.subcategory.findUnique({
      where: { categoryId_name: { categoryId: parent.id, name: dto.name } },
    })
    if (existing) return existing

    return this.prisma.subcategory.create({
      data: {
        userId,
        categoryId: parent.id,
        name: dto.name,
        ...attributes,
      },
    })
  }

  /**
   * Batch find-or-create, for the CSV import: the file names subcategories
   * the user already has, and the odd new one. Each new row takes its
   * parent's defaults; a name under a category the user does not own, or
   * under a transfer category, is silently left out — the import then files
   * that transaction at the category alone.
   */
  async findOrCreateMany(
    userId: string,
    subcategories: Array<{ categoryId: string; name: string }>
  ): Promise<{ subcategories: Subcategory[]; newCount: number }> {
    const valid = subcategories.filter(s => s.name && s.name.trim())
    if (valid.length === 0) return { subcategories: [], newCount: 0 }

    const unique = [
      ...new Map(valid.map(s => [`${s.categoryId}|${s.name}`, s])).values(),
    ]

    const parents = await this.prisma.category.findMany({
      where: {
        userId,
        id: { in: [...new Set(unique.map(s => s.categoryId))] },
        type: { not: TransactionType.TRANSFER },
      },
    })
    const parentById = new Map(parents.map(p => [p.id, p]))
    const wanted = unique.filter(s => parentById.has(s.categoryId))
    if (wanted.length === 0) return { subcategories: [], newCount: 0 }

    const where = {
      userId,
      OR: wanted.map(s => ({ categoryId: s.categoryId, name: s.name })),
    }
    const existing = await this.prisma.subcategory.findMany({ where })
    const existingKeys = new Set(existing.map(s => `${s.categoryId}|${s.name}`))

    const toCreate = wanted.filter(
      s => !existingKeys.has(`${s.categoryId}|${s.name}`)
    )
    if (toCreate.length > 0) {
      await this.prisma.subcategory.createMany({
        data: toCreate.map(s => {
          const parent = parentById.get(s.categoryId)!
          const attributes = SubcategoriesService.attributesUnder(parent, {})
          return {
            userId,
            categoryId: s.categoryId,
            name: s.name,
            ...attributes,
          }
        }),
        skipDuplicates: true,
      })
    }

    const all = await this.prisma.subcategory.findMany({ where })
    return { subcategories: all, newCount: toCreate.length }
  }

  /**
   * Delete a subcategory the user added. The transactions under it are
   * re-filed to the category's "Autre" — the heading a transaction filed at
   * the category alone already reads its attributes from — so nothing loses
   * its category, and nothing loses its nature or rhythm either. A legacy
   * category has no "Autre"; there, the rows fall back to the category alone.
   */
  async remove(
    userId: string,
    id: string
  ): Promise<SubcategoryDeletionResultDto> {
    const subcategory = await this.prisma.subcategory.findFirst({
      where: { id, userId },
      include: { category: { select: { catalogKey: true } } },
    })
    if (!subcategory) {
      throw new NotFoundException(`Subcategory ${id} not found`)
    }
    if (subcategory.catalogKey !== null) {
      throw new ForbiddenException(
        `"${subcategory.name}" belongs to the catalogue and cannot be deleted`
      )
    }

    const parentKey = subcategory.category.catalogKey
    const fallback = parentKey
      ? await this.prisma.subcategory.findFirst({
          where: {
            categoryId: subcategory.categoryId,
            catalogKey: parentKey + OTHER_SUFFIX,
          },
        })
      : null

    return this.prisma.$transaction(async tx => {
      const refiled = await tx.transaction.updateMany({
        where: { subcategoryId: id, userId },
        data: {
          subcategoryId: fallback?.id ?? null,
          subcategory: fallback?.name ?? null,
        },
      })
      await tx.subcategory.delete({ where: { id } })
      return {
        refiledTransactions: refiled.count,
        fallbackSubcategoryId: fallback?.id ?? null,
        fallbackSubcategoryName: fallback?.name ?? null,
      }
    })
  }
}
