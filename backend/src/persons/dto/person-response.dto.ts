export class PersonResponseDto {
  /** Person ID */
  id!: string

  /** Person name */
  name!: string

  /** Person email */
  email!: string | null

  /** Creation date */
  createdAt!: Date

  /** Last update date */
  updatedAt!: Date
}
