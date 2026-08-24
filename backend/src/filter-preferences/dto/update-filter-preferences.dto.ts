import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsArray, IsOptional, IsBoolean } from 'class-validator'

/**
 * Hidden categories are addressed by Category id. Ids of categories that no
 * longer exist are accepted and simply match nothing — pruning them would make
 * a temporarily unresolvable id (a not-yet-synced import) drop a preference.
 */
export class UpdateFilterPreferencesDto {
  /** Hidden expense category ids (dashboard filter only) */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenExpenseCategoryIds?: string[]

  /** Hidden income category ids (dashboard filter only) */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenIncomeCategoryIds?: string[]

  /** Globally hidden expense category ids (hidden everywhere) */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  globalHiddenExpenseCategoryIds?: string[]

  /** Globally hidden income category ids (hidden everywhere) */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  globalHiddenIncomeCategoryIds?: string[]

  /** Whether the advanced filters panel is expanded */
  @IsOptional()
  @IsBoolean()
  isPanelExpanded?: boolean

  /**
   * Whether an import adopts the categories written in the file. Off, the
   * file's filing is ignored and transactions are placed among the categories
   * that already exist.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  importCategoriesFromFile?: boolean
}
