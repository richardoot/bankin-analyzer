import { ApiProperty } from '@nestjs/swagger'
import { TransactionType } from '../../generated/prisma'

export class CategoryResponseDto {
  /** Category ID */
  id!: string

  /** Category name */
  name!: string

  /** Category type */
  @ApiProperty({ enum: TransactionType })
  type!: TransactionType

  /** Creation date */
  createdAt!: Date

  /** Category icon emoji */
  icon?: string | null
}
