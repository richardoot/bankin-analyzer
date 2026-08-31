import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator'

export class CreateReimbursementDto {
  /** Transaction ID */
  @IsUUID()
  @IsNotEmpty()
  transactionId!: string

  /** Person ID */
  @IsUUID()
  @IsNotEmpty()
  personId!: string

  /** Amount to be reimbursed */
  @IsNumber()
  @IsPositive()
  amount!: number

  /** Note */
  @IsOptional()
  @IsString()
  note?: string
}
