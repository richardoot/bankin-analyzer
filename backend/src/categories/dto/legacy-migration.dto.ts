import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import { TransactionType } from '../../generated/prisma'
import type { LegacyAction } from '../legacy-migration.plan'

/**
 * One decision of the assistant's table. The pipe runs with
 * `forbidNonWhitelisted`, so every field has to be declared here. Validation
 * stops at the shape: whether the arrangement is possible is decided by
 * `planLegacyMigration`, which knows the category and the catalogue.
 */
export class LegacyDecisionDto {
  /** Null stands for the transactions filed at the legacy category alone. */
  @ValidateIf(o => (o as LegacyDecisionDto).sourceSubcategoryId !== null)
  @IsString()
  @IsNotEmpty()
  sourceSubcategoryId!: string | null

  @ApiProperty({ enum: ['CATALOG', 'CUSTOM', 'UNFILE', 'KEEP'] })
  @IsIn(['CATALOG', 'CUSTOM', 'UNFILE', 'KEEP'])
  action!: LegacyAction

  /** CATALOG and CUSTOM: the catalogue category, by key. */
  @ValidateIf(o =>
    ['CATALOG', 'CUSTOM'].includes((o as LegacyDecisionDto).action)
  )
  @IsString()
  @IsNotEmpty()
  categoryKey?: string | null

  /** CATALOG: the catalogue subcategory, by key; omitted files at the category. */
  @IsOptional()
  @ValidateIf(o => (o as LegacyDecisionDto).subcategoryKey !== null)
  @IsString()
  subcategoryKey?: string | null

  /** CUSTOM: the user's own subcategory, by name; existing or created. */
  @ValidateIf(o => (o as LegacyDecisionDto).action === 'CUSTOM')
  @IsString()
  @IsNotEmpty()
  subcategoryName?: string | null

  /** A tag of the user's, attached to every transaction the line moves or unfiles. */
  @IsOptional()
  @ValidateIf(o => (o as LegacyDecisionDto).tagId !== null)
  @IsString()
  tagId?: string | null
}

export class LegacyMigrationRequestDto {
  @ApiProperty({
    type: [LegacyDecisionDto],
    description:
      'One entry per legacy subcategory, plus one with a null id for the ' +
      'transactions filed at the category alone. A missing line is rejected.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LegacyDecisionDto)
  decisions!: LegacyDecisionDto[]
}

export class LegacySuggestionDto {
  @ApiProperty({ enum: ['CATALOG', 'UNFILE'] })
  action!: 'CATALOG' | 'UNFILE'

  categoryKey!: string | null

  categoryName!: string | null

  subcategoryKey!: string | null

  subcategoryName!: string | null

  /** A context the legacy heading encoded, to carry over as a tag. */
  tagName!: string | null

  /** What the guess rests on: the pair, the subcategory name, a catalogue label, the category name. */
  basis!: string
}

export class LegacyLineDto {
  /** Null stands for the transactions filed at the legacy category alone. */
  sourceSubcategoryId!: string | null

  /** The legacy subcategory name, null for the category-alone line. */
  name!: string | null

  transactionCount!: number

  @ApiPropertyOptional({ type: LegacySuggestionDto, nullable: true })
  suggestion!: LegacySuggestionDto | null
}

export class LegacyCategoryDto {
  id!: string

  name!: string

  @ApiProperty({ enum: TransactionType })
  type!: TransactionType

  icon!: string | null

  transactionCount!: number

  /** Hidden from the dashboard by preference — the old way of neutralising transfers. */
  isHidden!: boolean

  budgetPlanEntryCount!: number

  @ApiProperty({ type: [LegacyLineDto] })
  lines!: LegacyLineDto[]
}

export class LegacyOverviewDto {
  @ApiProperty({ type: [LegacyCategoryDto] })
  categories!: LegacyCategoryDto[]

  /** Transactions still filed under a legacy category, all of them. */
  totalTransactions!: number
}

export class LegacyMoveDto {
  sourceSubcategoryId!: string | null

  sourceSubcategoryName!: string | null

  transactionCount!: number

  categoryName!: string

  /** Null when the rows land at the category alone. */
  subcategoryName!: string | null

  /** True when the subcategory does not exist yet and will be created. */
  createsSubcategory!: boolean

  /** True when the legacy subcategory row itself moves, id intact. */
  reparentsSubcategory!: boolean

  /** True when the rows enter a transfer category and change type. */
  changesType!: boolean

  tagId!: string | null
}

export class LegacyUnfileDto {
  sourceSubcategoryId!: string | null

  sourceSubcategoryName!: string | null

  transactionCount!: number

  tagId!: string | null
}

export class LegacyBudgetEntryOutcomeDto {
  planName!: string

  amount!: number

  /** Where the envelope goes, or null when it is dropped. */
  targetCategoryName!: string | null

  /** True when the target already has an envelope in that plan: the two are summed. */
  mergesIntoExisting!: boolean
}

export class LegacyMigrationPreviewDto {
  sourceCategoryId!: string

  sourceCategoryName!: string

  @ApiProperty({ type: [LegacyMoveDto] })
  moves!: LegacyMoveDto[]

  @ApiProperty({ type: [LegacyUnfileDto] })
  unfiles!: LegacyUnfileDto[]

  keptTransactions!: number

  movedTransactions!: number

  unfiledTransactions!: number

  typeChangedTransactions!: number

  /** True once nothing is kept: the empty legacy category goes with its rows. */
  deletesSourceCategory!: boolean

  @ApiProperty({ type: [LegacyBudgetEntryOutcomeDto] })
  budgetEntries!: LegacyBudgetEntryOutcomeDto[]

  /** The legacy category was hidden by preference; that preference goes with it. */
  dropsHiddenPreference!: boolean
}

export class LegacyMigrationResultDto {
  sourceCategoryId!: string

  movedTransactions!: number

  unfiledTransactions!: number

  keptTransactions!: number

  typeChangedTransactions!: number

  createdSubcategories!: number

  reparentedSubcategories!: number

  deletedSubcategories!: number

  taggedTransactions!: number

  budgetEntriesMoved!: number

  budgetEntriesMerged!: number

  budgetEntriesDropped!: number

  hiddenPreferenceDropped!: boolean

  sourceDeleted!: boolean
}
