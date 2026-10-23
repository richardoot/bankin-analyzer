import { ApiProperty } from '@nestjs/swagger'

/** A charge of an active recurrence still expected this month. */
export class DashboardUpcomingDto {
  /** The recurrence's id. */
  id!: string

  /** The service it pays for: the user's name for it, else its label's. */
  name!: string

  /** The user's share of its latest charge, positive. */
  amount!: number

  /**
   * The day it is expected, `YYYY-MM-DD`. Before `asOf` when it is late:
   * expected earlier this month and not charged yet, it still counts as to
   * come until the month ends.
   */
  nextExpected!: string

  /** The category of its latest charge, if any. */
  @ApiProperty({ type: String, nullable: true })
  categoryId!: string | null
}

/**
 * « Ce mois-ci »: the current month to date against the habit — the median
 * of the six closed months before it, the habit « Ce qui change » reads.
 * The reading and the reimbursement switches apply as on the summary
 * (stats-excluded accounts out, joint accounts divided, exceptional lines
 * out of the everyday reading, smoothed purchases by their slices in it);
 * the dashboard's period never does.
 */
export class DashboardMonthDto {
  /** The month read, `YYYY-MM`: the one `asOf` falls in. */
  month!: string

  /** The day of the month read at, 1 to 31. */
  asOfDay!: number

  /** How many days the month has. */
  daysInMonth!: number

  /**
   * The month's net expenses to date, in the reading: `everydayNetExpenses`
   * in « Vie courante », `netExpenses` in « Tout ».
   */
  spent!: number

  /**
   * The same figure month by month: the closed months the habit reads
   * (`habitMonths` of them, oldest first, six at most), then the current
   * month to date, last.
   */
  @ApiProperty({ type: [Number] })
  spentSeries!: number[]

  /**
   * The median of `spent` over the closed months the habit reads; null
   * under three of them — the history is too short for a habit.
   */
  @ApiProperty({ type: Number, nullable: true })
  habit!: number | null

  /**
   * The habit at this point of the month: `habit × asOfDay / daysInMonth`,
   * linear over the days. Null with `habit`.
   */
  @ApiProperty({ type: Number, nullable: true })
  habitToDate!: number | null

  /**
   * How many closed months the habit reads: the six before the current
   * month, fewer when the history does not cover them whole (a first month
   * counts from its 7th day at the latest, as the trends count it).
   */
  habitMonths!: number

  /** The month's income to date, net of the refunds it carries. */
  incomeReceived!: number

  /**
   * The median income of the closed months the habit reads; null under
   * three of them.
   */
  @ApiProperty({ type: Number, nullable: true })
  incomeExpected!: number | null

  /** The income of the closed months the habit reads, oldest first. */
  @ApiProperty({ type: [Number] })
  incomeSeries!: number[]

  /**
   * The active recurrences still expected this month: due between `asOf`
   * and the month's end, or due earlier this month with no charge of theirs
   * this month yet. By date, then by name. A recurrence whose latest charge
   * was on a stats-excluded account is left out.
   */
  @ApiProperty({ type: [DashboardUpcomingDto] })
  upcoming!: DashboardUpcomingDto[]

  /** The sum of `upcoming`. */
  upcomingTotal!: number

  /**
   * What is left to live on: `incomeExpected − spent − upcomingTotal`.
   * Negative when the month is already over it; null with `incomeExpected`.
   */
  @ApiProperty({ type: Number, nullable: true })
  remainingToLive!: number | null

  /**
   * `remainingToLive` as a share of `incomeExpected` (0.25 for 25 %),
   * rounded to four decimals; null without an expected income above zero.
   */
  @ApiProperty({ type: Number, nullable: true })
  remainingShare!: number | null
}
