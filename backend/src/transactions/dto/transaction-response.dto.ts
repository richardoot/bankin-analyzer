import { ApiProperty } from '@nestjs/swagger'
import { TransactionType } from '../../generated/prisma'

export class TransactionSettlementSummaryDto {
  /** Settlement ID */
  id!: string

  /** Person ID who is settling their reimbursements with this income */
  personId!: string

  /** Person name */
  personName!: string

  /** Amount of this income used to settle the person's reimbursements */
  amountUsed!: number
}

export class TransactionResponseDto {
  /** Transaction ID */
  id!: string

  /** Transaction date */
  date!: Date

  /** Transaction description */
  description!: string

  /** Transaction amount */
  amount!: number

  @ApiProperty({ enum: TransactionType, description: 'Transaction type' })
  type!: TransactionType

  /** Bank account ID (FK to Account.id) */
  accountId!: string

  /** Bank account name (kept for backward compatibility, mirrors Account.name) */
  account!: string

  /** Subcategory name */
  subcategory?: string | null

  /** Optional note */
  note?: string | null

  /** Is transaction reconciled */
  isPointed!: boolean

  /** Category ID */
  categoryId?: string | null

  /** Category name (when included) */
  categoryName?: string | undefined

  /** Subcategory ID */
  subcategoryId?: string | null

  /** Subcategory name (from relation) */
  subcategoryName?: string | null

  /** Category icon emoji */
  categoryIcon?: string | null

  /**
   * Settlements that use this income transaction to settle a person's
   * reimbursement requests. Only populated for INCOME transactions that have
   * at least one settlement.
   */
  @ApiProperty({ type: [TransactionSettlementSummaryDto], required: false })
  settlements?: TransactionSettlementSummaryDto[]

  /** Creation date */
  createdAt!: Date
}
