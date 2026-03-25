import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsArray, IsOptional, IsDateString } from 'class-validator'

export class DashboardFiltersDto {
  /** List of hidden expense category names */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenExpenseCategories?: string[]

  /** List of hidden income category names */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenIncomeCategories?: string[]

  /** Start date for filtering (ISO format: YYYY-MM-DD) */
  @IsOptional()
  @IsDateString()
  startDate?: string

  /** End date for filtering (ISO format: YYYY-MM-DD) */
  @IsOptional()
  @IsDateString()
  endDate?: string
}
