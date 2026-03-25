import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsArray, IsOptional, IsBoolean } from 'class-validator'

export class UpdateFilterPreferencesDto {
  /** List of hidden expense category names (dashboard filter only) */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenExpenseCategories?: string[]

  /** List of hidden income category names (dashboard filter only) */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenIncomeCategories?: string[]

  /** List of globally hidden expense category names (hidden everywhere) */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  globalHiddenExpenseCategories?: string[]

  /** List of globally hidden income category names (hidden everywhere) */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  globalHiddenIncomeCategories?: string[]

  /** Whether the advanced filters panel is expanded */
  @IsOptional()
  @IsBoolean()
  isPanelExpanded?: boolean
}
