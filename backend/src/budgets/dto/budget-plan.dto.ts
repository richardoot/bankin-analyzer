import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  ValidateNested,
  IsDateString,
  Min,
  MinLength,
  MaxLength,
  ValidateIf,
} from 'class-validator'
import { Type } from 'class-transformer'

// ── Response DTOs ──────────────────────────────────────────────────────────

export class BudgetPlanEntryResponseDto {
  id!: string

  categoryId!: string

  categoryName!: string

  categoryIcon?: string | null

  amount!: number
}

export class BudgetPlanResponseDto {
  id!: string

  name!: string

  /** ISO date (YYYY-MM-DD), 1st of a month */
  startDate!: string

  /** ISO date (YYYY-MM-DD), last day of a month */
  endDate!: string

  /** Number of months the plan covers */
  monthCount!: number

  /** Total of all entry amounts */
  totalAmount!: number

  /** Monthly amount decided for savings / investment. Null when not set. */
  savingsTarget?: number | null

  /** Monthly income assumed when the plan was drawn up. Null when not set. */
  referenceIncome?: number | null

  /**
   * Budget left for one-off projects over the whole plan:
   * `(referenceIncome − savingsTarget − totalAmount) × monthCount`.
   *
   * Null unless both `referenceIncome` and `savingsTarget` are set. May be
   * negative — that is the signal that the plan is not financeable, and it is
   * deliberately not clamped to zero.
   */
  projectReserve?: number | null

  @ApiProperty({ type: [BudgetPlanEntryResponseDto] })
  entries!: BudgetPlanEntryResponseDto[]

  createdAt!: string

  updatedAt!: string
}

/** Lightweight plan summary used in the history list. */
export class BudgetPlanSummaryDto {
  id!: string

  name!: string

  startDate!: string

  endDate!: string

  monthCount!: number

  totalAmount!: number

  entryCount!: number

  createdAt!: string
}

// ── Request DTOs ───────────────────────────────────────────────────────────

export class CreateBudgetPlanEntryDto {
  @IsString()
  categoryId!: string

  @IsNumber()
  @Min(0)
  amount!: number
}

export class CreateBudgetPlanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string

  /** ISO date (YYYY-MM-DD); must be the 1st of a month */
  @IsDateString()
  startDate!: string

  /** ISO date (YYYY-MM-DD); must be the last day of a month */
  @IsDateString()
  endDate!: string

  /** Monthly savings target. Omit to leave the plan without an equation. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  savingsTarget?: number

  /** Monthly income assumed at planning time. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  referenceIncome?: number

  @ApiProperty({ type: [CreateBudgetPlanEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBudgetPlanEntryDto)
  entries!: CreateBudgetPlanEntryDto[]
}

export class UpdateBudgetPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string

  /** Pass null to clear the target. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  savingsTarget?: number | null

  /** Pass null to clear the reference. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  referenceIncome?: number | null

  @ApiPropertyOptional({ type: [CreateBudgetPlanEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBudgetPlanEntryDto)
  entries?: CreateBudgetPlanEntryDto[]
}
