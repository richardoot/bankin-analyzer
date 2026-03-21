import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsArray, IsOptional, IsBoolean } from 'class-validator'

export class UpdateFilterPreferencesDto {
  @ApiPropertyOptional({
    description:
      'List of hidden expense category names (dashboard filter only)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenExpenseCategories?: string[]

  @ApiPropertyOptional({
    description: 'List of hidden income category names (dashboard filter only)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenIncomeCategories?: string[]

  @ApiPropertyOptional({
    description:
      'List of globally hidden expense category names (hidden everywhere)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  globalHiddenExpenseCategories?: string[]

  @ApiPropertyOptional({
    description:
      'List of globally hidden income category names (hidden everywhere)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  globalHiddenIncomeCategories?: string[]

  @ApiPropertyOptional({
    description: 'Whether the advanced filters panel is expanded',
  })
  @IsOptional()
  @IsBoolean()
  isPanelExpanded?: boolean
}
