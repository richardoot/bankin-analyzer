import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
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
  @ApiProperty({ description: 'Transaction date (ISO format)' })
  @IsDateString()
  date!: string

  @ApiProperty({ description: 'Transaction description' })
  @IsString()
  description!: string

  @ApiProperty({ description: 'Transaction amount' })
  @IsNumber()
  amount!: number

  @ApiProperty({ description: 'Category name' })
  @IsString()
  category!: string

  @ApiProperty({ description: 'Bank account name' })
  @IsString()
  account!: string

  @ApiProperty({ enum: TransactionType, description: 'Transaction type' })
  @IsEnum(TransactionType)
  type!: TransactionType

  @ApiPropertyOptional({ description: 'Subcategory name' })
  @IsOptional()
  @IsString()
  subcategory?: string

  @ApiPropertyOptional({ description: 'Optional note' })
  @IsOptional()
  @IsString()
  note?: string

  @ApiPropertyOptional({ description: 'Is transaction reconciled' })
  @IsOptional()
  @IsBoolean()
  isPointed?: boolean
}
