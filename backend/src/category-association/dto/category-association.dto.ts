import { IsString, IsUUID } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CategoryAssociationDto {
  @ApiProperty({ description: 'Unique identifier' })
  id!: string

  @ApiProperty({ description: 'Expense category ID' })
  expenseCategoryId!: string

  @ApiProperty({ description: 'Expense category name' })
  expenseCategoryName!: string

  @ApiProperty({ description: 'Income category ID' })
  incomeCategoryId!: string

  @ApiProperty({ description: 'Income category name' })
  incomeCategoryName!: string
}

export class CreateCategoryAssociationDto {
  @ApiProperty({ description: 'Expense category ID' })
  @IsString()
  @IsUUID()
  expenseCategoryId!: string

  @ApiProperty({ description: 'Income category ID' })
  @IsString()
  @IsUUID()
  incomeCategoryId!: string
}
