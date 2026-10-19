import { ApiProperty } from '@nestjs/swagger'
import { TAG_EVENT_STATUSES, type TagEventStatus } from '../tag-status'

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

  /**
   * Where the event window stands relative to today (Paris calendar day,
   * bounds included). Null when the tag has no complete window.
   */
  @ApiProperty({ enum: TAG_EVENT_STATUSES, nullable: true })
  status!: TagEventStatus | null

  /** Creation date */
  createdAt!: Date

  /** Last update date */
  updatedAt!: Date
}
