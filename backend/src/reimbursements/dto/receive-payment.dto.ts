import { ApiProperty } from '@nestjs/swagger'
import { IsNumber, IsPositive } from 'class-validator'

export class ReceivePaymentDto {
  @ApiProperty({ description: 'Amount received' })
  @IsNumber()
  @IsPositive()
  amount!: number
}
