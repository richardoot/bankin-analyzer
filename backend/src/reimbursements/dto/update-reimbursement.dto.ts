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

  /** Target category ID for income */
  @IsOptional()
  @IsUUID()
  categoryId?: string

  /** Note */
  @IsOptional()
  @IsString()
  note?: string
}
