import { IsInt, IsDateString, IsOptional, Min } from 'class-validator'

export class FinalizeImportDto {
  /** Number of transactions imported */
  @IsInt()
  @Min(0)
  transactionsImported!: number

  /**
   * Number of new categories created. An import files into the catalogue
   * and creates none any more; the field stays optional for older clients.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  categoriesCreated?: number

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
