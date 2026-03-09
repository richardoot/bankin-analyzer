import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsDateString, IsArray, IsString, Min } from 'class-validator'

export class FinalizeImportDto {
  @ApiProperty({ description: 'Number of transactions imported' })
  @IsInt()
  @Min(0)
  transactionsImported!: number

  @ApiProperty({ description: 'Number of new categories created' })
  @IsInt()
  @Min(0)
  categoriesCreated!: number

  @ApiProperty({ description: 'Number of duplicates skipped' })
  @IsInt()
  @Min(0)
  duplicatesSkipped!: number

  @ApiProperty({ description: 'Start date of imported transactions range' })
  @IsDateString()
  dateRangeStart!: string

  @ApiProperty({ description: 'End date of imported transactions range' })
  @IsDateString()
  dateRangeEnd!: string

  @ApiProperty({ type: [String], description: 'List of accounts concerned' })
  @IsArray()
  @IsString({ each: true })
  accounts!: string[]
}
