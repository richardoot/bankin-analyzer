import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsNotEmpty, IsString } from 'class-validator'
import { TransactionType } from '../../generated/prisma'

export class CreateCategoryDto {
  @ApiProperty({ description: 'Category name' })
  @IsString()
  @IsNotEmpty()
  name!: string

  @ApiProperty({ enum: TransactionType, description: 'Category type' })
  @IsEnum(TransactionType)
  type!: TransactionType
}
