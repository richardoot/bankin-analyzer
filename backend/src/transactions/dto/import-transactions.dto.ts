import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator'
import { CreateTransactionDto } from './create-transaction.dto'

export class ImportTransactionsDto {
  @ApiProperty({
    type: [CreateTransactionDto],
    description: 'Transactions to import',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionDto)
  transactions!: CreateTransactionDto[]

  /** Import history ID to link transactions to */
  @IsOptional()
  @IsString()
  importHistoryId?: string
}

export class ImportResultDto {
  /** Number of new transactions imported */
  imported!: number

  /** Number of duplicate transactions ignored */
  duplicates!: number

  /** Total transactions sent */
  total!: number
}
