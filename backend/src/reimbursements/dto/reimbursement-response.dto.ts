import { ApiProperty } from '@nestjs/swagger'
import { ReimbursementStatus } from '../../generated/prisma'

export class TransactionSummaryDto {
  /** Transaction ID */
  id!: string

  /** Transaction date */
  date!: Date

  /** Transaction description */
  description!: string

  /** Transaction amount */
  amount!: number
}

export class ReimbursementResponseDto {
  /** Reimbursement request ID */
  id!: string

  /** Transaction ID */
  transactionId!: string

  /** Person ID */
  personId!: string

  /** Person name */
  personName!: string

  /**
   * Category of the expense being repaid — the only one a debt has. The income
   * category it used to carry alongside drove no figure and was null on every
   * row created after 9a1ebc5; phase 6 dropped the column.
   */
  expenseCategoryId!: string | null

  expenseCategoryName!: string | null

  /** Amount to be reimbursed */
  amount!: number

  /** Amount already received */
  amountReceived!: number

  /** Amount remaining to be received */
  amountRemaining!: number

  /** Reimbursement status */
  @ApiProperty({ enum: ReimbursementStatus })
  status!: ReimbursementStatus

  /** Note */
  note!: string | null

  /** Creation date */
  createdAt!: Date

  /** Last update date */
  updatedAt!: Date

  /** Transaction details */
  transaction?: TransactionSummaryDto
}
