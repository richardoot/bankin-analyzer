import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsArray, IsOptional, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class CategoryAssociationDto {
  @IsString()
  expenseCategory!: string

  @IsString()
  incomeCategory!: string
}

export class DashboardFiltersDto {
  @ApiPropertyOptional({
    description: 'List of joint account names (amounts divided by 2)',
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
    description: 'Category associations for reimbursements',
    type: [CategoryAssociationDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryAssociationDto)
  categoryAssociations?: CategoryAssociationDto[]
}
