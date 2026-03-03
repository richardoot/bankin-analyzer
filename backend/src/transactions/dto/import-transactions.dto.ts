import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, ValidateNested } from 'class-validator'
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
}

export class ImportResultDto {
  @ApiProperty({ description: 'Number of new transactions imported' })
  imported!: number

  @ApiProperty({ description: 'Number of duplicate transactions ignored' })
  duplicates!: number

  @ApiProperty({ description: 'Total transactions sent' })
  total!: number
}
