import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator'

export class SettlementReimbursementItemDto {
  @ApiProperty({ description: 'Reimbursement request ID' })
  @IsUUID()
  @IsNotEmpty()
  reimbursementId!: string

  @ApiProperty({ description: 'Amount to settle for this reimbursement' })
  @IsNumber()
  @IsPositive()
  amountSettled!: number
}

export class CreateSettlementDto {
  @ApiProperty({ description: 'Person ID receiving the settlement' })
  @IsUUID()
  @IsNotEmpty()
  personId!: string

  @ApiProperty({ description: 'Income transaction ID used as payment proof' })
  @IsUUID()
  @IsNotEmpty()
  incomeTransactionId!: string

  @ApiProperty({
    description: 'List of reimbursements to settle',
    type: [SettlementReimbursementItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SettlementReimbursementItemDto)
  reimbursements!: SettlementReimbursementItemDto[]

  @ApiProperty({ description: 'Optional note', required: false })
  @IsOptional()
  @IsString()
  note?: string

  @ApiProperty({
    description:
      'Force mark reimbursements as completed even if amount is partial',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  forceComplete?: boolean
}
