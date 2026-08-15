export class TagResponseDto {
  /** Tag ID */
  id!: string

  /** Tag name */
  name!: string

  /** Display color (hex) or null */
  color!: string | null

  /** Icon identifier or null */
  icon!: string | null

  /** Number of transactions carrying this tag */
  transactionCount!: number

  /** Excluded from the dashboard's everyday averages */
  isExceptional!: boolean

  /** First day of the suspended period (ISO date) or null */
  eventStartDate!: string | null

  /** Last day of the suspended period (ISO date) or null */
  eventEndDate!: string | null

  /** Total envelope allocated to this event, or null */
  budgetAmount!: number | null

  /** Creation date */
  createdAt!: Date

  /** Last update date */
  updatedAt!: Date
}
