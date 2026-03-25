import { IsNumber, IsPositive } from 'class-validator'

export class ReceivePaymentDto {
  /** Amount received */
  @IsNumber()
  @IsPositive()
  amount!: number
}
