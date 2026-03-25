import { ApiProperty } from '@nestjs/swagger'

export class ImportHistoryResponseDto {
  /** Import history ID */
  id!: string

  /** Import status */
  @ApiProperty({ enum: ['IN_PROGRESS', 'COMPLETED', 'FAILED'] })
  status!: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'

  /** Number of transactions imported */
  transactionsImported!: number

  /** Number of new categories created */
  categoriesCreated!: number

  /** Number of duplicates skipped */
  duplicatesSkipped!: number

  /** Total transactions in the file */
  totalInFile!: number

  /** Start date of imported transactions range */
  dateRangeStart!: Date | null

  /** End date of imported transactions range */
  dateRangeEnd!: Date | null

  /** List of accounts concerned */
  @ApiProperty({ type: [String] })
  accounts!: string[]

  /** Name of the imported file (optional) */
  fileName!: string | null

  /** Import date */
  createdAt!: Date
}
