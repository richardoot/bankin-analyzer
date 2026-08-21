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
   * Income category the user expected the money back on. A saisie hint and
   * nothing more since the deduction moved onto the expense transaction — it
   * drives no figure. Kept for the rows that already carry one.
   */
  categoryId!: string | null

  categoryName!: string | null

  /**
   * Category of the expense being repaid. This is the one that matters now:
   * it is where the credit is deducted, so it is how a debt should be
   * grouped and read.
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
