import { ApiProperty } from '@nestjs/swagger'

export class ImportHistoryResponseDto {
  @ApiProperty({ description: 'Import history ID' })
  id!: string

  @ApiProperty({ description: 'Number of transactions imported' })
  transactionsImported!: number

  @ApiProperty({ description: 'Number of new categories created' })
  categoriesCreated!: number

  @ApiProperty({ description: 'Number of duplicates skipped' })
  duplicatesSkipped!: number

  @ApiProperty({ description: 'Total transactions in the file' })
  totalInFile!: number

  @ApiProperty({ description: 'Start date of imported transactions range' })
  dateRangeStart!: Date

  @ApiProperty({ description: 'End date of imported transactions range' })
  dateRangeEnd!: Date

  @ApiProperty({ type: [String], description: 'List of accounts concerned' })
  accounts!: string[]

  @ApiProperty({
    nullable: true,
    description: 'Name of the imported file (optional)',
  })
  fileName!: string | null

  @ApiProperty({ description: 'Import date' })
  createdAt!: Date
}
