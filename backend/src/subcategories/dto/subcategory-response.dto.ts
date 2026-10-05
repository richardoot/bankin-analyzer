import { ApiPropertyOptional } from '@nestjs/swagger'
import { CategoryNature, CategoryRhythm } from '../../generated/prisma'
import type { Subcategory } from '../../generated/prisma'

export class SubcategoryResponseDto {
  /** Subcategory ID */
  id!: string

  /** Parent category ID */
  categoryId!: string

  /** Subcategory name */
  name!: string

  /** Creation date */
  createdAt!: Date

  /** Subcategory icon emoji */
  icon?: string | null

  /** The catalogue entry this row is, or null for one the user added. */
  catalogKey!: string | null

  /** A catalogue subcategory cannot be renamed or deleted. */
  isLocked!: boolean

  /** Constrained or chosen. Null on income and transfer subcategories. */
  @ApiPropertyOptional({ enum: CategoryNature, nullable: true })
  nature!: CategoryNature | null

  /** Runs on its own or follows the user. Null on income and transfer subcategories. */
  @ApiPropertyOptional({ enum: CategoryRhythm, nullable: true })
  rhythm!: CategoryRhythm | null
}

/** The row as the API states it: no `userId`, and the lock spelled out. */
export function toSubcategoryResponse(
  subcategory: Subcategory
): SubcategoryResponseDto {
  return {
    id: subcategory.id,
    categoryId: subcategory.categoryId,
    name: subcategory.name,
    createdAt: subcategory.createdAt,
    icon: subcategory.icon,
    catalogKey: subcategory.catalogKey,
    isLocked: subcategory.catalogKey !== null,
    nature: subcategory.nature,
    rhythm: subcategory.rhythm,
  }
}

/**
 * Deleting a subcategory never loses a transaction: the rows filed under it
 * fall back to the category's "Autre" — or, under a legacy category that has
 * none, to the category alone.
 */
export class SubcategoryDeletionResultDto {
  /** Transactions re-filed away from the deleted subcategory */
  refiledTransactions!: number

  /** Where they went, or null when they now sit at the category alone */
  fallbackSubcategoryId!: string | null

  fallbackSubcategoryName!: string | null
}
