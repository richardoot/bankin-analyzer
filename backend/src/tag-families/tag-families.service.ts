import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type { TagFamily } from '../generated/prisma'
import type {
  CreateTagFamilyDto,
  TagFamilyResponseDto,
  UpdateTagFamilyDto,
} from './dto'

const WITH_TAG_COUNT = { _count: { select: { tags: true } } } as const

function toResponse(
  family: TagFamily & { _count?: { tags: number } }
): TagFamilyResponseDto {
  return {
    id: family.id,
    name: family.name,
    color: family.color,
    icon: family.icon,
    annualBudget:
      family.annualBudget === null ? null : Number(family.annualBudget),
    tagCount: family._count?.tags ?? 0,
    createdAt: family.createdAt,
    updatedAt: family.updatedAt,
  }
}

function isDuplicateName(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
}

/**
 * Families of tags: a genre above the tag (« Voyages », « HYROX »), defined
 * by the user. A family is only a grouping: deleting it leaves its tags
 * without one, which the foreign key does (ON DELETE SET NULL).
 */
@Injectable()
export class TagFamiliesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByUser(userId: string): Promise<TagFamilyResponseDto[]> {
    const families = await this.prisma.tagFamily.findMany({
      where: { userId },
      include: WITH_TAG_COUNT,
      orderBy: { name: 'asc' },
    })
    return families.map(toResponse)
  }

  async findOne(id: string, userId: string): Promise<TagFamilyResponseDto> {
    const family = await this.prisma.tagFamily.findFirst({
      where: { id, userId },
      include: WITH_TAG_COUNT,
    })
    if (!family) throw new NotFoundException(`Tag family ${id} not found`)
    return toResponse(family)
  }

  async create(
    userId: string,
    dto: CreateTagFamilyDto
  ): Promise<TagFamilyResponseDto> {
    const name = dto.name.trim()
    try {
      const family = await this.prisma.tagFamily.create({
        data: {
          userId,
          name,
          color: dto.color ?? null,
          icon: dto.icon ?? null,
          annualBudget: dto.annualBudget ?? null,
        },
        include: WITH_TAG_COUNT,
      })
      return toResponse(family)
    } catch (e) {
      if (isDuplicateName(e)) {
        throw new ConflictException(
          `A tag family named "${name}" already exists`
        )
      }
      throw e
    }
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateTagFamilyDto
  ): Promise<TagFamilyResponseDto> {
    await this.assertOwned(id, userId)
    const name = dto.name?.trim()
    try {
      const family = await this.prisma.tagFamily.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(dto.color !== undefined && { color: dto.color }),
          ...(dto.icon !== undefined && { icon: dto.icon }),
          ...(dto.annualBudget !== undefined && {
            annualBudget: dto.annualBudget,
          }),
        },
        include: WITH_TAG_COUNT,
      })
      return toResponse(family)
    } catch (e) {
      if (isDuplicateName(e)) {
        throw new ConflictException(
          `A tag family named "${name}" already exists`
        )
      }
      throw e
    }
  }

  /** Its tags are kept, without a family: the foreign key sets them to null. */
  async delete(id: string, userId: string): Promise<void> {
    await this.assertOwned(id, userId)
    await this.prisma.tagFamily.delete({ where: { id } })
  }

  /**
   * 404 rather than 403 for someone else's family: its existence is not the
   * caller's business.
   */
  async assertOwned(id: string, userId: string): Promise<void> {
    const family = await this.prisma.tagFamily.findFirst({
      where: { id, userId },
      select: { id: true },
    })
    if (!family) throw new NotFoundException(`Tag family ${id} not found`)
  }
}
