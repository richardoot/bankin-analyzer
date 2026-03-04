import { ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CategoryAssociationDto {
  @IsString()
  expenseCategory!: string

  @IsString()
  incomeCategory!: string
}

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
    description: 'List of expense-to-income category associations',
    type: [CategoryAssociationDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryAssociationDto)
  categoryAssociations?: CategoryAssociationDto[]

  @ApiPropertyOptional({
    description: 'Whether the advanced filters panel is expanded',
  })
  @IsOptional()
  @IsBoolean()
  isPanelExpanded?: boolean
}
