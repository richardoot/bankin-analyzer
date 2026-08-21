import { ApiProperty } from '@nestjs/swagger'

/** One debt a suggested transfer could settle. */
export class SuggestedDebtDto {
  reimbursementId!: string

  /** The expense being repaid, as the bank worded it. */
  description!: string

  /** Date of that expense — the cascade settles the oldest first. */
  expenseDate!: Date

  categoryId!: string | null

  categoryName!: string | null

  amountRemaining!: number
}

/**
 * An incoming transfer that looks like it repays someone, with the reasons the
 * guess was made. Purely advisory: confirming it creates an ordinary
 * settlement, and nothing happens until the user does.
 */
export class SettlementSuggestionDto {
  transactionId!: string

  date!: Date

  description!: string

  /** Cash on the transaction that no settlement has drawn yet. */
  availableAmount!: number

  personId!: string

  personName!: string

  /**
   * Ranking weight, not a probability. Only meaningful for ordering: a higher
   * score means more signals agreed, nothing more.
   */
  score!: number

  /**
   * Why this pair was suggested — `name` (the payer shows in the wording),
   * `category` (the transfer landed in a category paired with the expense's),
   * `amount` (the cash matches what is owed). Shown to the user, because a
   * suggestion whose reasoning is hidden cannot be judged.
   */
  @ApiProperty({ enum: ['name', 'category', 'amount'], isArray: true })
  reasons!: Array<'name' | 'category' | 'amount'>

  @ApiProperty({ type: [SuggestedDebtDto] })
  debts!: SuggestedDebtDto[]

  /** What the transfer would cover: its cash, capped by what is owed. */
  coverage!: number
}
