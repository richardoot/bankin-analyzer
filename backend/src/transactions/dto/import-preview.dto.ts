import { ApiProperty } from '@nestjs/swagger'
import { TransactionType } from '../../generated/prisma'

/**
 * Transaction from the uploaded import (for comparison)
 */
export class UploadedTransactionDto {
  /** Index in the uploaded array */
  index!: number

  /** Transaction date (ISO format) */
  date!: string

  /** Transaction description */
  description!: string

  /** Transaction amount */
  amount!: number

  /** Bank account name */
  account!: string

  /** Category name */
  category!: string

  @ApiProperty({ enum: TransactionType, description: 'Transaction type' })
  type!: TransactionType

  /** Subcategory name */
  subcategory?: string

  /** Optional note */
  note?: string
}

/**
 * Existing transaction in DB (for comparison)
 */
export class ExistingTransactionDto {
  /** Transaction ID */
  id!: string

  /** Transaction date (ISO format) */
  date!: string

  /** Transaction description */
  description!: string

  /** Transaction amount */
  amount!: number

  /** Bank account name */
  account!: string

  /** Category name */
  categoryName?: string

  @ApiProperty({ enum: TransactionType, description: 'Transaction type' })
  type!: TransactionType

  /** Subcategory name */
  subcategory?: string

  /** Optional note */
  note?: string

  /** Creation date (ISO format) */
  createdAt!: string
}

/**
 * Internal duplicate: 2+ identical transactions within the SAME import
 */
export class InternalDuplicateDto {
  /** Hash of the duplicate transactions */
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
  /** Hash of the duplicate transaction */
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
  /** Number of new transactions (no duplicates) */
  newCount!: number

  /** Number of internal duplicate groups (within import) */
  internalDuplicateCount!: number

  /** Number of external duplicates (existing in DB) */
  externalDuplicateCount!: number

  /** Total transactions analyzed */
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
