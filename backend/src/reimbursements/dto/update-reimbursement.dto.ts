import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator'

export class UpdateReimbursementDto {
  /** Person ID */
  @IsOptional()
  @IsUUID()
  personId?: string

  /** Amount to be reimbursed */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number

  /** Note */
  @IsOptional()
  @IsString()
  note?: string
}
