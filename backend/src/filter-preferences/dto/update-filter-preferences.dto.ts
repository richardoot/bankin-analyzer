import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsBoolean } from 'class-validator'

export class UpdateFilterPreferencesDto {
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

  /**
   * Whether a debt still owed is taken off the spending it hangs off, on the
   * dashboard and in the budget. Off, both show the gross spending until the
   * debt is settled.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  deductPendingReimbursements?: boolean
}
