import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { TransactionType } from '../../generated/prisma'

/**
 * Transaction from the uploaded import (for comparison)
 */
export class UploadedTransactionDto {
  @ApiProperty({ description: 'Index in the uploaded array' })
  index!: number

  @ApiProperty({ description: 'Transaction date (ISO format)' })
  date!: string

  @ApiProperty({ description: 'Transaction description' })
  description!: string

  @ApiProperty({ description: 'Transaction amount' })
  amount!: number

  @ApiProperty({ description: 'Bank account name' })
  account!: string

  @ApiProperty({ description: 'Category name' })
  category!: string

  @ApiProperty({ enum: TransactionType, description: 'Transaction type' })
  type!: TransactionType

  @ApiPropertyOptional({ description: 'Subcategory name' })
  subcategory?: string

  @ApiPropertyOptional({ description: 'Optional note' })
  note?: string
}

/**
 * Existing transaction in DB (for comparison)
 */
export class ExistingTransactionDto {
  @ApiProperty({ description: 'Transaction ID' })
  id!: string

  @ApiProperty({ description: 'Transaction date (ISO format)' })
  date!: string

  @ApiProperty({ description: 'Transaction description' })
  description!: string

  @ApiProperty({ description: 'Transaction amount' })
  amount!: number

  @ApiProperty({ description: 'Bank account name' })
  account!: string

  @ApiPropertyOptional({ description: 'Category name' })
  categoryName?: string

  @ApiProperty({ enum: TransactionType, description: 'Transaction type' })
  type!: TransactionType

  @ApiPropertyOptional({ description: 'Subcategory name' })
  subcategory?: string

  @ApiPropertyOptional({ description: 'Optional note' })
  note?: string

  @ApiProperty({ description: 'Creation date (ISO format)' })
  createdAt!: string
}

/**
 * Internal duplicate: 2+ identical transactions within the SAME import
 */
export class InternalDuplicateDto {
  @ApiProperty({ description: 'Hash of the duplicate transactions' })
  hash!: string

  @ApiProperty({
    description: 'Indices of duplicate transactions in the import array',
    type: [Number],
  })
  indices!: number[]

  @ApiProperty({
    description: 'The duplicate transactions',
    type: [UploadedTransactionDto],
  })
  transactions!: UploadedTransactionDto[]
}

/**
 * External duplicate: transaction from import already exists in DB
 */
export class ExternalDuplicateDto {
  @ApiProperty({ description: 'Hash of the duplicate transaction' })
  hash!: string

  @ApiProperty({
    description: 'Transaction from the import',
    type: UploadedTransactionDto,
  })
  uploaded!: UploadedTransactionDto

  @ApiProperty({
    description: 'Existing transaction in DB',
    type: ExistingTransactionDto,
  })
  existing!: ExistingTransactionDto
}

/**
 * Result of the import preview analysis
 */
export class ImportPreviewResultDto {
  @ApiProperty({ description: 'Number of new transactions (no duplicates)' })
  newCount!: number

  @ApiProperty({
    description: 'Number of internal duplicate groups (within import)',
  })
  internalDuplicateCount!: number

  @ApiProperty({
    description: 'Number of external duplicates (existing in DB)',
  })
  externalDuplicateCount!: number

  @ApiProperty({ description: 'Total transactions analyzed' })
  total!: number

  @ApiProperty({
    description: 'Internal duplicates (identical transactions within import)',
    type: [InternalDuplicateDto],
  })
  internalDuplicates!: InternalDuplicateDto[]

  @ApiProperty({
    description: 'External duplicates (transactions already in DB)',
    type: [ExternalDuplicateDto],
  })
  externalDuplicates!: ExternalDuplicateDto[]
}
