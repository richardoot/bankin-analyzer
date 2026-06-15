import { IsInt, IsDateString, IsString, IsOptional, Min } from 'class-validator'

export class CreateImportHistoryDto {
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

  /** Total transactions in the file */
  @IsInt()
  @Min(0)
  totalInFile!: number

  /** Start date of imported transactions range */
  @IsDateString()
  dateRangeStart!: string

  /** End date of imported transactions range */
  @IsDateString()
  dateRangeEnd!: string

  /** Name of the imported file (optional) */
  @IsOptional()
  @IsString()
  fileName?: string
}
