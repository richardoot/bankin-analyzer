import { ApiProperty } from '@nestjs/swagger'
import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsDateString,
} from 'class-validator'
import { TransactionType } from '../../generated/prisma'

export class CreateTransactionDto {
  /** Transaction date (ISO format) */
  @IsDateString()
  date!: string

  /** Transaction description */
  @IsString()
  description!: string

  /** Transaction amount */
  @IsNumber()
  amount!: number

  /** Category name */
  @IsString()
  category!: string

  /** Bank account name */
  @IsString()
  account!: string

  @ApiProperty({ enum: TransactionType, description: 'Transaction type' })
  @IsEnum(TransactionType)
  type!: TransactionType

  /** Subcategory name */
  @IsOptional()
  @IsString()
  subcategory?: string

  /** Optional note */
  @IsOptional()
  @IsString()
  note?: string

  /** Is transaction reconciled */
  @IsOptional()
  @IsBoolean()
  isPointed?: boolean

  /** Force import even if duplicate detected (backend generates unique key) */
  @IsOptional()
  @IsBoolean()
  forceImport?: boolean
}
