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
  /** Reimbursement request ID */
  @IsUUID()
  @IsNotEmpty()
  reimbursementId!: string

  /** Amount to settle for this reimbursement */
  @IsNumber()
  @IsPositive()
  amountSettled!: number

  /**
   * Mark this reimbursement as fully settled even though `amountSettled` does
   * not cover the remaining due. Only affects this line; the settlement still
   * consumes `amountSettled` from the income transaction.
   */
  @IsOptional()
  @IsBoolean()
  forceComplete?: boolean
}

export class CreateSettlementDto {
  /** Person ID receiving the settlement */
  @IsUUID()
  @IsNotEmpty()
  personId!: string

  /** Income transaction ID used as payment proof */
  @IsUUID()
  @IsNotEmpty()
  incomeTransactionId!: string

  /** List of reimbursements to settle */
  @ApiProperty({ type: [SettlementReimbursementItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SettlementReimbursementItemDto)
  reimbursements!: SettlementReimbursementItemDto[]

  /** Optional note */
  @IsOptional()
  @IsString()
  note?: string

  /**
   * Force mark every reimbursement of this settlement as completed even if the
   * amount is partial. Kept for backward compatibility; prefer the per-line
   * `forceComplete` on each item.
   */
  @IsOptional()
  @IsBoolean()
  forceComplete?: boolean
}
