import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import { TransactionType } from '../../generated/prisma'
import type { MigrationAction } from '../category-migration.plan'
import { BudgetPlanEntrySummaryDto } from './category-deletion.dto'

/**
 * One line of the mapping table.
 *
 * The pipe runs with `forbidNonWhitelisted`, so every field has to be declared
 * here or the whole request is rejected. Validation stops at the shape: whether
 * the arrangement is *possible* is decided by `planCategoryMigration`, which
 * knows the two categories.
 */
export class MigrationActionDto {
  /** Null stands for the transactions with no subcategory. */
  @ValidateIf(o => (o as MigrationActionDto).sourceSubcategoryId !== null)
  @IsString()
  @IsNotEmpty()
  sourceSubcategoryId!: string | null

  @ApiProperty({ enum: ['MOVE', 'MERGE', 'KEEP'] })
  @IsIn(['MOVE', 'MERGE', 'KEEP'])
  action!: 'MOVE' | 'MERGE' | 'KEEP'

  /** Required by MERGE, meaningless otherwise. */
  @ValidateIf(o => (o as MigrationActionDto).action === 'MERGE')
  @IsString()
  @IsNotEmpty()
  targetSubcategoryId?: string
}

/**
 * Everything the mapping screen needs to arrive already decided.
 *
 * The preview does not just report counts: it carries the default decision for
 * every line, so confirming without touching anything does what the user
 * expects — each subcategory recreated in the destination, except where a name
 * collision leaves no choice.
 */
export class MigrationSourceSubcategoryDto {
  id!: string

  name!: string

  /** Transactions of the source category filed under it */
  transactionCount!: number

  /**
   * True when the destination already has a subcategory of this name. The row
   * cannot be moved — `@@unique([categoryId, name])` forbids the duplicate —
   * so the screen offers merging and says why.
   */
  nameTakenInTarget!: boolean
}

export class MigrationTargetSubcategoryDto {
  id!: string

  name!: string
}

export class CategoryMigrationPreviewDto {
  sourceCategoryId!: string

  sourceCategoryName!: string

  targetCategoryId!: string

  targetCategoryName!: string

  @ApiProperty({ enum: TransactionType })
  type!: TransactionType

  sourceSubcategories!: MigrationSourceSubcategoryDto[]

  /** Candidates a source subcategory can be merged into */
  targetSubcategories!: MigrationTargetSubcategoryDto[]

  /** Transactions of the source category with no subcategory at all */
  uncategorizedCount!: number

  /**
   * One decision per source subcategory, plus one for the unfiled transactions
   * when there are any. Sent back as-is when the user just confirms.
   */
  @ApiProperty({
    description:
      'Default decision per line: MOVE, MERGE (with targetSubcategoryId) or KEEP',
  })
  defaultActions!: MigrationAction[]

  /**
   * Budget lines of the source category. They survive the move but lose the
   * spending that faced them — the only effect the mapping table cannot show.
   */
  budgetPlanEntries!: BudgetPlanEntrySummaryDto[]
}

export class MigrateCategoryDto {
  @IsString()
  @IsNotEmpty()
  targetCategoryId!: string

  @ApiProperty({
    type: [MigrationActionDto],
    description:
      'One entry per source subcategory, plus one with a null id for the ' +
      'unfiled transactions. Omitting a line is rejected rather than defaulted.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MigrationActionDto)
  actions!: MigrationActionDto[]
}

export class CategoryMigrationResultDto {
  sourceCategoryId!: string

  targetCategoryId!: string

  movedTransactions!: number

  /** Subcategories reparented, ids intact */
  movedSubcategories!: number

  /** Subcategories folded into an existing one and removed */
  mergedSubcategories!: number

  keptTransactions!: number

  keptSubcategories!: number

  /** The source category is kept either way; this only says which case it is. */
  sourceLeftEmpty!: boolean
}
