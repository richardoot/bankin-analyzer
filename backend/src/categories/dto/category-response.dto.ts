import { ApiProperty } from '@nestjs/swagger'
import { TransactionType } from '../../generated/prisma'

export class CategoryResponseDto {
  @ApiProperty({ description: 'Category ID' })
  id!: string

  @ApiProperty({ description: 'Category name' })
  name!: string

  @ApiProperty({ enum: TransactionType, description: 'Category type' })
  type!: TransactionType

  @ApiProperty({ description: 'Creation date' })
  createdAt!: Date
}
