import { ApiProperty } from '@nestjs/swagger'
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator'

export class CreateReimbursementDto {
  @ApiProperty({ description: 'Transaction ID' })
  @IsUUID()
  @IsNotEmpty()
  transactionId!: string

  @ApiProperty({ description: 'Person ID' })
  @IsUUID()
  @IsNotEmpty()
  personId!: string

  @ApiProperty({ description: 'Amount to be reimbursed' })
  @IsNumber()
  @IsPositive()
  amount!: number

  @ApiProperty({
    description: 'Target category ID for income',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @ApiProperty({ description: 'Note', required: false })
  @IsOptional()
  @IsString()
  note?: string
}
