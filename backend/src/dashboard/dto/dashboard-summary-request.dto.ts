import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsArray, IsOptional, IsDateString } from 'class-validator'

export class DashboardFiltersDto {
  @ApiPropertyOptional({
    description: 'List of hidden expense category names',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenExpenseCategories?: string[]

  @ApiPropertyOptional({
    description: 'List of hidden income category names',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenIncomeCategories?: string[]

  @ApiPropertyOptional({
    description: 'Start date for filtering (ISO format: YYYY-MM-DD)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string

  @ApiPropertyOptional({
    description: 'End date for filtering (ISO format: YYYY-MM-DD)',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string
}
