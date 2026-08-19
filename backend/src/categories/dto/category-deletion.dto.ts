import { ApiProperty } from '@nestjs/swagger'
import { TransactionType } from '../../generated/prisma'

/**
 * Deleting a category never destroys a transaction — the FK is SET NULL, so
 * the spending stays and only its filing is lost. What *is* destroyed sits
 * around it: subcategories, budget plan lines, the reimbursement pairing.
 *
 * The summary lists every one of those links, so the dialog can state exactly
 * what happens instead of asking the user to trust a generic warning.
 */
export class BudgetPlanEntrySummaryDto {
  /** Plan the line belongs to */
  planName!: string

  /** Monthly amount budgeted for this category in that plan */
  amount!: number

  /** Plan window, so a past plan can be told apart from a running one */
  startDate!: Date

  endDate!: Date
}

export class CategoryDeletionSummaryDto {
  categoryId!: string

  /** Echoed so the dialog can ask the user to type it back */
  categoryName!: string

  @ApiProperty({ enum: TransactionType })
  type!: TransactionType

  /** Transactions that would lose their category. They are kept. */
  transactionCount!: number

  /** Oldest of those transactions, null when the category is unused */
  firstTransactionDate!: Date | null

  /** Most recent of those transactions, null when the category is unused */
  lastTransactionDate!: Date | null

  /** Subcategories deleted with the category, by name */
  @ApiProperty({ type: [String] })
  subcategoryNames!: string[]

  /**
   * Transactions among `transactionCount` that also carry a subcategory
   * label. That label is cleared too — it is a denormalized copy that the
   * dashboard groups on, and it would otherwise outlive its category.
   */
  labelledTransactionCount!: number

  /** Budget plan lines deleted with the category */
  @ApiProperty({ type: [BudgetPlanEntrySummaryDto] })
  budgetPlanEntries!: BudgetPlanEntrySummaryDto[]

  /** Reimbursement requests that would lose their category. They are kept. */
  reimbursementCount!: number

  /**
   * The category this one is paired with for reimbursements, if any. The
   * pairing is deleted; the paired category itself is untouched.
   */
  associatedCategoryName!: string | null

  /** Whether the category is currently hidden from the dashboard */
  isGloballyHidden!: boolean

  /** Whether the category is currently excluded from budgets */
  isExcludedFromBudget!: boolean
}

export class CategoryDeletionResultDto {
  /** Transactions that kept their amount but lost their category */
  uncategorizedTransactions!: number

  /** Subcategories removed with the category */
  deletedSubcategories!: number

  /** Budget plan lines removed with the category */
  deletedBudgetPlanEntries!: number
}
