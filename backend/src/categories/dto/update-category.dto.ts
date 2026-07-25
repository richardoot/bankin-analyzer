import { IsBoolean, IsOptional } from 'class-validator'

export class UpdateCategoryDto {
  /** Exclude this category from budget statistics and plans */
  @IsOptional()
  @IsBoolean()
  isExcludedFromBudget?: boolean
}
