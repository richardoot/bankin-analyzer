/**
 * What « Ce qui change » reads (agent-os/product/spending-trends.md). Shaped
 * by `trend.detection.ts`, which returns these fields as they are.
 */

export class TrendUnitDto {
  /**
   * `category`, `subcategory`, `structure` (a share), `uncategorized` (lines
   * to file), `merchant` (trends 6 to 8), `recurrence` (trends 9 and 10) or
   * `savings` (trend 15). A shift (11) is a `category`, its two
   * subcategories in `parts`.
   */
  type!:
    | 'category'
    | 'subcategory'
    | 'structure'
    | 'uncategorized'
    | 'merchant'
    | 'recurrence'
    | 'savings'
  /**
   * The category or subcategory id; `pleasure` or `committed` for a share;
   * `uncategorized`; a merchant's main `merchantKey`; a recurrence's
   * `<amountBucket>:<merchantKey>`, the Transactions page's `recurrence` filter;
   * `savings`
   */
  id!: string
  /**
   * The category a link opens the unit in: itself, a subcategory's parent,
   * the one a merchant or a recurrence is mostly filed in; null for a share
   * and the lines to file
   */
  categoryId!: string | null
  /** For a merchant or a recurrence, the service's name read from its labels (or the user's) */
  name!: string
  /** The subcategory's icon, else its category's; null for a share and the lines to file */
  icon!: string | null
  /** A merchant only: the word the Transactions page's text search finds it by */
  search?: string
  /** Savings only: the transfer categories (emergency, project, investment) its link opens */
  categoryIds?: string[]
}

/** One of the two subcategories a shift (trend 11) links, the one down first */
export class TrendPartDto {
  /** The subcategory */
  unit!: TrendUnitDto
  /** The trend it had on its own: `amount`, `frequency`, `basket` or `lostHabit` */
  kind!: string
  direction!: 'up' | 'down'
  /** Its gap in that measure: lines for a frequency, euros otherwise */
  delta!: number
  /** Its amount's gap in euros, whatever the kind */
  amountDelta!: number
}

/** A long comparison the history is still too short for */
export class TrendHorizonDto {
  kind!: 'drift' | 'record' | 'yearAgo' | 'savings'
  /** Complete months it reads, the month read included: 6, 12, 13 or 6 */
  months!: number
  /** How many are still missing */
  missing!: number
  /** « La comparaison avec l'an dernier demande 13 mois complets : il en manque 2. » */
  sentence!: string
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
  /**
   * `amount` (1), `frequency` (2, and 6 on a merchant), `basket` (3),
   * `share` (4), `uncategorized` (5), `newHabit` (7), `lostHabit` (8),
   * `subscription` (9: `up` appeared, `down` stopped), `price` (10),
   * `shift` (11), `drift` (12), `record` (13), `yearAgo` (14), `savings` (15)
   */
  kind!:
    | 'amount'
    | 'frequency'
    | 'basket'
    | 'share'
    | 'uncategorized'
    | 'newHabit'
    | 'lostHabit'
    | 'subscription'
    | 'price'
    | 'shift'
    | 'drift'
    | 'record'
    | 'yearAgo'
    | 'savings'
  unit!: TrendUnitDto
  direction!: 'up' | 'down'
  /** `success` only for a drop on a pleasure and variable unit; never on a recurrence */
  tone!: 'neutral' | 'success'
  /**
   * The measure of the month read: euros (amount, basket), lines
   * (frequency, lines to file; distinct days on a merchant), percent of the
   * total (share), days since it began (new habit), 0 (lost habit), the
   * monthly equivalent (subscription appeared; 0 once stopped), the price
   * of a charge (price); the category's euros for a shift, a drift, a
   * record and the same month a year before; the savings rate in percent of
   * the income over the last three months (savings)
   */
  current!: number
  /**
   * The reference's measure; for the lines to file, every line of the month;
   * the first month of the six for a drift, the median of the eleven months
   * before for a record, the same month a year before, the rate of the
   * three months before for savings
   */
  reference!: number
  /** For a drift, the fitted change over its six months in euros; points for savings */
  delta!: number
  /**
   * Relative gap in percent; for a drift, the slope in percent of its
   * six-month mean per month; null on a share, on the lines to file, on a
   * habit or a subscription that came or went, on savings, or on a zero
   * reference
   */
  deltaPct!: number | null
  /** The sentence the card shows, in French */
  sentence!: string
  windows!: TrendWindowsDto
  /** The measure over the 6 months before and the month read, oldest first */
  series!: number[]
  /**
   * The gap in euros, what the list is sorted by: for a merchant's
   * frequency Δ days × reference basket; a new habit's month, a lost
   * habit's usual month; a subscription's monthly equivalent, a price's Δ
   * monthly equivalent; the larger of a shift's two gaps; a drift's fitted
   * change over six months; Δ points × the quarter's monthly income for
   * savings
   */
  score!: number
  /** A shift (11): the subcategory that went down, then the one that went up */
  parts?: TrendPartDto[]
  /**
   * The month read is the highest or lowest of twelve (13): on a record, and
   * on the amount or drift line of the category a record enriches
   */
  record?: 'high' | 'low'
  /** Savings (15): what is left to live on per month, the quarter and the one before */
  remainingToLive?: { current: number; reference: number }
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
  /**
   * The long comparisons (drift, savings, record, same month a year before)
   * this month's history cannot make yet; empty once it can
   */
  horizons!: TrendHorizonDto[]
  /**
   * Always null here: the written digest (lot 5) has its own request,
   * `GET /trends/digest`, so the list never waits for the model
   */
  digest!: null
}

/** The paragraph Claude wrote from a closed month's trends (lot 5) */
export class MonthlyDigestDto {
  /** `YYYY-MM` */
  month!: string
  reading!: 'everyday' | 'real'
  /** The window asked for: 3, 6 or 12 */
  window!: number
  /** Three to five sentences in French, every number one of the trends' */
  text!: string
  /** The model that wrote it, e.g. `claude-haiku-5-5` */
  model!: string
  /** ISO 8601 */
  generatedAt!: string
}

export class TrendDigestResponseDto {
  /**
   * Null when there is no paragraph to show: no history yet, nothing
   * moved, or the model failed, refused or wrote a number the trends do
   * not carry. Never an error: the card shows the list alone.
   */
  digest!: MonthlyDigestDto | null
}
