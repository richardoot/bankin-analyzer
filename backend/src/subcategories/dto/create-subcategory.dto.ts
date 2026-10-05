import { ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator'
import { CategoryNature, CategoryRhythm } from '../../generated/prisma'

/**
 * A subcategory the user adds inside a catalogue category — the one place
 * the vocabulary stays theirs. Under an expense category it carries a nature
 * and a rhythm like every other; left out, they default to the category's
 * own (those of its "Autre"), so a subcategory typed in a hurry from the
 * filing dialog is never left without them.
 */
export class CreateSubcategoryDto {
  /** Parent category ID */
  @IsUUID()
  @IsNotEmpty()
  categoryId!: string

  /** Subcategory name */
  @IsString()
  @IsNotEmpty()
  name!: string

  /** Constrained or chosen. Expense categories only; defaults to the parent's. */
  @ApiPropertyOptional({ enum: CategoryNature })
  @IsOptional()
  @IsEnum(CategoryNature)
  nature?: CategoryNature

  /** Runs on its own or follows the user. Expense categories only; defaults to the parent's. */
  @ApiPropertyOptional({ enum: CategoryRhythm })
  @IsOptional()
  @IsEnum(CategoryRhythm)
  rhythm?: CategoryRhythm
}
