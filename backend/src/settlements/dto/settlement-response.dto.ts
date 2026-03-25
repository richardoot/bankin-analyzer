import { ApiProperty } from '@nestjs/swagger'

export class SettlementReimbursementResponseDto {
  /** Reimbursement request ID */
  reimbursementId!: string

  /** Original transaction ID (expense) */
  transactionId!: string

  /** Original transaction description */
  transactionDescription!: string

  /** Original transaction date */
  transactionDate!: Date

  /** Category ID */
  categoryId!: string | null

  /** Category name */
  categoryName!: string | null

  /** Original reimbursement amount */
  originalAmount!: number

  /** Amount settled in this settlement */
  amountSettled!: number
}

export class SettlementResponseDto {
  /** Settlement ID */
  id!: string

  /** Person ID */
  personId!: string

  /** Person name */
  personName!: string

  /** Income transaction ID used as payment */
  incomeTransactionId!: string

  /** Income transaction description */
  incomeTransactionDescription!: string

  /** Income transaction date */
  incomeTransactionDate!: Date

  /** Income transaction total amount */
  incomeTransactionAmount!: number

  /** Amount used from this transaction */
  amountUsed!: number

  /** Note */
  note!: string | null

  /** Settlement creation date */
  createdAt!: Date

  /** Reimbursements included in this settlement */
  @ApiProperty({ type: [SettlementReimbursementResponseDto] })
  reimbursements!: SettlementReimbursementResponseDto[]
}

export class TransactionAvailableAmountDto {
  /** Transaction ID */
  transactionId!: string

  /** Total transaction amount */
  totalAmount!: number

  /** Amount already used in settlements */
  usedAmount!: number

  /** Amount still available for settlements */
  availableAmount!: number
}
