import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsArray, IsOptional, IsBoolean } from 'class-validator'

export class UpdateFilterPreferencesDto {
  @ApiPropertyOptional({
    description: 'List of joint account names (amounts will be divided by 2)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  jointAccounts?: string[]

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
    description: 'Whether the advanced filters panel is expanded',
  })
  @IsOptional()
  @IsBoolean()
  isPanelExpanded?: boolean
}
