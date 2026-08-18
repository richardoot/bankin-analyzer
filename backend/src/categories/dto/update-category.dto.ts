import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator'
import { Transform } from 'class-transformer'

export class UpdateCategoryDto {
  /**
   * New category name. Trimmed server-side. Must be unique per user *and per
   * type* (the DB enforces a UNIQUE(user_id, name, type) constraint), so an
   * expense and an income category may share a name.
   */
  @ApiPropertyOptional({
    description: 'New category name (trimmed, unique per user and type)',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value
  )
  @Length(1, 100)
  name?: string

  /** Exclude this category from budget statistics and plans */
  @IsOptional()
  @IsBoolean()
  isExcludedFromBudget?: boolean
}
