/**
 * Deleting an account is the only destructive action of the preferences page:
 * it takes the account's whole transaction history with it. These two DTOs
 * exist so the UI can show *what* is about to be lost before asking for a
 * confirmation, and report *what* was actually removed afterwards.
 */

export class AccountDeletionSummaryDto {
  /** Account about to be deleted */
  accountId!: string

  /** Account name, echoed so the UI can ask the user to type it back */
  accountName!: string

  /** Transactions that would be deleted along with the account */
  transactionCount!: number

  /** Date of the oldest transaction, null when the account is empty */
  firstTransactionDate!: Date | null

  /** Date of the most recent transaction, null when the account is empty */
  lastTransactionDate!: Date | null

  /** Reimbursement requests carried by those transactions */
  reimbursementCount!: number

  /**
   * Settlements funded by an income transaction of this account. Deleting them
   * gives the credited debts back their pending balance.
   */
  settlementCount!: number
}

export class AccountDeletionResultDto {
  /** Transactions removed with the account */
  deletedTransactions!: number
}
