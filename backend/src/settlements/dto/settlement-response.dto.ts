import { ApiProperty } from '@nestjs/swagger'

export class SettlementReimbursementResponseDto {
  @ApiProperty({ description: 'Reimbursement request ID' })
  reimbursementId!: string

  @ApiProperty({ description: 'Original transaction ID (expense)' })
  transactionId!: string

  @ApiProperty({ description: 'Original transaction description' })
  transactionDescription!: string

  @ApiProperty({ description: 'Original transaction date' })
  transactionDate!: Date

  @ApiProperty({ description: 'Category ID', nullable: true })
  categoryId!: string | null

  @ApiProperty({ description: 'Category name', nullable: true })
  categoryName!: string | null

  @ApiProperty({ description: 'Original reimbursement amount' })
  originalAmount!: number

  @ApiProperty({ description: 'Amount settled in this settlement' })
  amountSettled!: number
}

export class SettlementResponseDto {
  @ApiProperty({ description: 'Settlement ID' })
  id!: string

  @ApiProperty({ description: 'Person ID' })
  personId!: string

  @ApiProperty({ description: 'Person name' })
  personName!: string

  @ApiProperty({ description: 'Income transaction ID used as payment' })
  incomeTransactionId!: string

  @ApiProperty({ description: 'Income transaction description' })
  incomeTransactionDescription!: string

  @ApiProperty({ description: 'Income transaction date' })
  incomeTransactionDate!: Date

  @ApiProperty({ description: 'Income transaction total amount' })
  incomeTransactionAmount!: number

  @ApiProperty({ description: 'Amount used from this transaction' })
  amountUsed!: number

  @ApiProperty({ description: 'Note', nullable: true })
  note!: string | null

  @ApiProperty({ description: 'Settlement creation date' })
  createdAt!: Date

  @ApiProperty({
    description: 'Reimbursements included in this settlement',
    type: [SettlementReimbursementResponseDto],
  })
  reimbursements!: SettlementReimbursementResponseDto[]
}

export class TransactionAvailableAmountDto {
  @ApiProperty({ description: 'Transaction ID' })
  transactionId!: string

  @ApiProperty({ description: 'Total transaction amount' })
  totalAmount!: number

  @ApiProperty({ description: 'Amount already used in settlements' })
  usedAmount!: number

  @ApiProperty({ description: 'Amount still available for settlements' })
  availableAmount!: number
}
