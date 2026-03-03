import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { TransactionType } from '../../generated/prisma'

export class TransactionResponseDto {
  @ApiProperty({ description: 'Transaction ID' })
  id!: string

  @ApiProperty({ description: 'Transaction date' })
  date!: Date

  @ApiProperty({ description: 'Transaction description' })
  description!: string

  @ApiProperty({ description: 'Transaction amount' })
  amount!: number

  @ApiProperty({ enum: TransactionType, description: 'Transaction type' })
  type!: TransactionType

  @ApiProperty({ description: 'Bank account name' })
  account!: string

  @ApiPropertyOptional({ description: 'Subcategory name' })
  subcategory?: string | null

  @ApiPropertyOptional({ description: 'Optional note' })
  note?: string | null

  @ApiProperty({ description: 'Is transaction reconciled' })
  isPointed!: boolean

  @ApiPropertyOptional({ description: 'Category ID' })
  categoryId?: string | null

  @ApiPropertyOptional({ description: 'Category name (when included)' })
  categoryName?: string | undefined

  @ApiProperty({ description: 'Creation date' })
  createdAt!: Date
}
