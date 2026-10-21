/**
 * What « Ce qui change » reads (agent-os/product/spending-trends.md). Shaped
 * by `trend.detection.ts`, which returns these fields as they are.
 */

export class TrendUnitDto {
  /** `category`, `subcategory`, `structure` (a share) or `uncategorized` (lines to file) */
  type!: 'category' | 'subcategory' | 'structure' | 'uncategorized'
  /** The category or subcategory id; `pleasure` or `committed` for a share; `uncategorized` */
  id!: string
  /** The category a link opens the unit in: itself, or a subcategory's parent; null for a share and the lines to file */
  categoryId!: string | null
  name!: string
  /** The subcategory's icon, else its category's; null for a share and the lines to file */
  icon!: string | null
}

export class TrendPeriodDto {
  /** `YYYY-MM-DD`, included */
  start!: string
  /** `YYYY-MM-DD`, included */
  end!: string
}

export class TrendWindowsDto {
  /** The month read */
  current!: TrendPeriodDto
  /** The months of the reference */
  reference!: TrendPeriodDto
}

export class TrendInsightDto {
  /** `amount` (1), `frequency` (2), `basket` (3), `share` (4), `uncategorized` (5) */
  kind!: 'amount' | 'frequency' | 'basket' | 'share' | 'uncategorized'
  unit!: TrendUnitDto
  direction!: 'up' | 'down'
  /** `success` only for a drop on a pleasure and variable unit */
  tone!: 'neutral' | 'success'
  /**
   * The measure of the month read: euros (amount, basket), lines
   * (frequency, lines to file), percent of the total (share)
   */
  current!: number
  /** The reference's measure; for the lines to file, every line of the month */
  reference!: number
  delta!: number
  /** Relative gap in percent; null on a share, on the lines to file, or on a zero reference */
  deltaPct!: number | null
  /** The sentence the card shows, in French */
  sentence!: string
  windows!: TrendWindowsDto
  /** The measure over the 6 months before and the month read, oldest first */
  series!: number[]
  /** The gap in euros, what the list is sorted by */
  score!: number
}

export class TrendsResponseDto {
  /** `YYYY-MM` */
  month!: string
  reading!: 'everyday' | 'real'
  /** The window read, shortened to the history when it must be */
  window!: number
  /** Complete months of history before the month read; habit trends need 3 */
  completeMonths!: number
  /** Every trend that passes its thresholds; the lines to file first, then by score */
  insights!: TrendInsightDto[]
  /** « Rien de notable en septembre : … » when no habit moved; null otherwise */
  quietSentence!: string | null
  /** The closed months the card can read, latest first */
  availableMonths!: string[]
  /** The written digest (lot 5); always null for now */
  digest!: null
}
