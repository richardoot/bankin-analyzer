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

export class TransactionTagSummaryDto {
  /** Tag ID */
  id!: string

  /** Tag name */
  name!: string

  /** Display color (hex) or null */
  color!: string | null

  /** Icon identifier or null */
  icon!: string | null
}

/** The recurring charge a transaction belongs to, as the list shows it. */
export class TransactionRecurrenceSummaryDto {
  /** ACTIVE: running. STOPPED: ended; the line was one of its charges. */
  status!: 'ACTIVE' | 'STOPPED'

  period!: 'WEEKLY' | 'FOUR_WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

  /** With `amountBucket`, the key the transactions filter takes. */
  merchantKey!: string

  amountBucket!: number

  label!: string

  /** The service it pays for, as the recurrences page names it. */
  name!: string

  /** The user attached this line by hand; it can be detached. */
  linked!: boolean
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

  /**
   * Over how many months the expense is smoothed in the everyday reading,
   * from the month of its date (2 to 60). Null: counted whole at its date.
   */
  @ApiProperty({ type: Number, nullable: true, minimum: 2, maximum: 60 })
  amortizationMonths!: number | null

  /**
   * The one smoothing duration proposed for its subcategory (High-tech 24,
   * Maison et déco 48, Entretien et réparation 12…), 12 when the
   * subcategory says nothing. Expenses only.
   */
  @ApiProperty({ type: Number, required: false, minimum: 2, maximum: 60 })
  suggestedAmortizationMonths?: number

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

  /** Tags attached to this transaction */
  @ApiProperty({ type: [TransactionTagSummaryDto], required: false })
  tags?: TransactionTagSummaryDto[]

  /**
   * The subscription or other recurring charge this line is part of, when
   * detection or the user said so. A candidate, seen twice only, is not one
   * yet and is left out.
   */
  @ApiProperty({ type: TransactionRecurrenceSummaryDto, required: false })
  recurrence?: TransactionRecurrenceSummaryDto

  /** Creation date */
  createdAt!: Date
}
