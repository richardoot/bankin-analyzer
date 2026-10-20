export class TagFamilyResponseDto {
  /** Family ID */
  id!: string

  /** Family name */
  name!: string

  /** Display color (hex) or null */
  color!: string | null

  /** Icon identifier or null */
  icon!: string | null

  /** Envelope over a calendar year, or null */
  annualBudget!: number | null

  /** Number of tags in the family */
  tagCount!: number

  /** Creation date */
  createdAt!: Date

  /** Last update date */
  updatedAt!: Date
}
