import { ApiProperty } from '@nestjs/swagger'
import { ReimbursementStatus } from '../../generated/prisma'

export class TransactionSummaryDto {
  @ApiProperty({ description: 'Transaction ID' })
  id!: string

  @ApiProperty({ description: 'Transaction date' })
  date!: Date

  @ApiProperty({ description: 'Transaction description' })
  description!: string

  @ApiProperty({ description: 'Transaction amount' })
  amount!: number
}

export class ReimbursementResponseDto {
  @ApiProperty({ description: 'Reimbursement request ID' })
  id!: string

  @ApiProperty({ description: 'Transaction ID' })
  transactionId!: string

  @ApiProperty({ description: 'Person ID' })
  personId!: string

  @ApiProperty({ description: 'Person name' })
  personName!: string

  @ApiProperty({ description: 'Target category ID', nullable: true })
  categoryId!: string | null

  @ApiProperty({ description: 'Target category name', nullable: true })
  categoryName!: string | null

  @ApiProperty({ description: 'Amount to be reimbursed' })
  amount!: number

  @ApiProperty({ description: 'Amount already received' })
  amountReceived!: number

  @ApiProperty({ description: 'Amount remaining to be received' })
  amountRemaining!: number

  @ApiProperty({
    enum: ReimbursementStatus,
    description: 'Reimbursement status',
  })
  status!: ReimbursementStatus

  @ApiProperty({ description: 'Note', nullable: true })
  note!: string | null

  @ApiProperty({ description: 'Creation date' })
  createdAt!: Date

  @ApiProperty({ description: 'Last update date' })
  updatedAt!: Date

  @ApiProperty({
    description: 'Transaction details',
    required: false,
    type: TransactionSummaryDto,
  })
  transaction?: TransactionSummaryDto
}
