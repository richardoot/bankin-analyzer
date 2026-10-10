export class RecurrenceDto {
  id!: string
  /** The user's subscription this series is; null for a series only detected */
  subscriptionId!: string | null
  merchantKey!: string
  amountBucket!: number
  /** The most frequent bank label, made readable */
  label!: string
  /** The service it pays for: the user's name, or the one read from its labels */
  name!: string
  /** The user gave the name; false when it was read from the labels */
  named!: boolean
  categoryId!: string | null
  categoryName!: string | null
  categoryIcon!: string | null
  subcategoryId!: string | null
  subcategoryName!: string | null
  /** The subcategory's nature, or its category's default */
  nature!: 'ESSENTIAL' | 'PLEASURE' | null
  period!: 'WEEKLY' | 'FOUR_WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  amount!: number
  monthlyEquivalent!: number
  occurrences!: number
  /** Everything the series has cost, at every price it ran at */
  totalPaid!: number
  firstDate!: string
  lastDate!: string
  nextExpected!: string
  status!: 'ACTIVE' | 'STOPPED' | 'CANDIDATE'
  /** The user said it is a recurring charge */
  confirmed!: boolean
}

export class RecurrenceCategoryTotalDto {
  categoryId!: string | null
  name!: string | null
  monthlyTotal!: number
}

export class RecurrenceNatureTotalsDto {
  essential!: number
  pleasure!: number
  unclassified!: number
}

/** A subscription the list names apart: set aside, or followed without a series. */
export class SubscriptionSummaryDto {
  id!: string
  /** The user's name for it, or the merchant it was made for */
  name!: string
  state!: 'CONFIRMED' | 'DISMISSED'
  createdAt!: string
}

export class RecurrenceListDto {
  recurrences!: RecurrenceDto[]
  /** Monthly equivalent of every active recurrence */
  monthlyTotal!: number
  byCategory!: RecurrenceCategoryTotalDto[]
  byNature!: RecurrenceNatureTotalsDto
  /** What the user set aside, to take it back */
  dismissed!: SubscriptionSummaryDto[]
  /** Followed subscriptions no series answers any more */
  orphans!: SubscriptionSummaryDto[]
  /** When the list was last recomputed; null before the first recompute */
  computedAt!: string | null
}
