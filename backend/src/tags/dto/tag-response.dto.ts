import { ApiProperty } from '@nestjs/swagger'
import { TAG_EVENT_STATUSES, type TagEventStatus } from '../tag-status'

/** The family a tag belongs to, as much as a card needs to name it. */
export class TagFamilySummaryDto {
  id!: string
  name!: string
  color!: string | null
}

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

  /** The family this tag is an edition of, or null */
  familyId!: string | null

  /** That family, named, or null */
  @ApiProperty({ type: TagFamilySummaryDto, nullable: true })
  family!: TagFamilySummaryDto | null

  /** Creation date */
  createdAt!: Date

  /** Last update date */
  updatedAt!: Date
}
