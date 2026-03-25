import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsNotEmpty, IsString } from 'class-validator'
import { TransactionType } from '../../generated/prisma'

export class CreateCategoryDto {
  /** Category name */
  @IsString()
  @IsNotEmpty()
  name!: string

  /** Category type */
  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  type!: TransactionType
}
