import { ApiProperty } from '@nestjs/swagger'
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator'

export class UpdateReimbursementDto {
  @ApiProperty({ description: 'Person ID', required: false })
  @IsOptional()
  @IsUUID()
  personId?: string

  @ApiProperty({ description: 'Amount to be reimbursed', required: false })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number

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
