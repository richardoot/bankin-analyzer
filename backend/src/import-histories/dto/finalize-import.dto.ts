import { IsInt, IsDateString, Min } from 'class-validator'

export class FinalizeImportDto {
  /** Number of transactions imported */
  @IsInt()
  @Min(0)
  transactionsImported!: number

  /** Number of new categories created */
  @IsInt()
  @Min(0)
  categoriesCreated!: number

  /** Number of duplicates skipped */
  @IsInt()
  @Min(0)
  duplicatesSkipped!: number

  /** Start date of imported transactions range */
  @IsDateString()
  dateRangeStart!: string

  /** End date of imported transactions range */
  @IsDateString()
  dateRangeEnd!: string
}
