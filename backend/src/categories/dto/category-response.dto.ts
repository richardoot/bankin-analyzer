import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  CategoryNature,
  CategoryRhythm,
  TransactionType,
} from '../../generated/prisma'
import type { Category } from '../../generated/prisma'

export class CategoryResponseDto {
  /** Category ID */
  id!: string

  /** Category name */
  name!: string

  /** Category type */
  @ApiProperty({ enum: TransactionType })
  type!: TransactionType

  /** Creation date */
  createdAt!: Date

  /** Category icon emoji */
  icon?: string | null

  /**
   * The catalogue entry this row is, or null for a legacy category created
   * before the catalogue and waiting to be migrated into it.
   */
  catalogKey!: string | null

  /**
   * A catalogue row cannot be renamed, re-iconed or deleted: the vocabulary
   * is the application's, not the user's. Legacy rows still can, until the
   * migration assistant has emptied them.
   */
  isLocked!: boolean

  /**
   * Defaults for a transaction filed at the category alone — the attributes
   * of its "Autre" subcategory. Null on income and transfer categories.
   */
  @ApiPropertyOptional({ enum: CategoryNature, nullable: true })
  defaultNature!: CategoryNature | null

  @ApiPropertyOptional({ enum: CategoryRhythm, nullable: true })
  defaultRhythm!: CategoryRhythm | null
}

/** The row as the API states it: no `userId`, and the lock spelled out. */
export function toCategoryResponse(category: Category): CategoryResponseDto {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    createdAt: category.createdAt,
    icon: category.icon,
    catalogKey: category.catalogKey,
    isLocked: category.catalogKey !== null,
    defaultNature: category.defaultNature,
    defaultRhythm: category.defaultRhythm,
  }
}
