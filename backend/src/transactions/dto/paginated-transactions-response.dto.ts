import { ApiProperty } from '@nestjs/swagger'
import { PaginationMetaDto } from '../../common/dto/pagination.dto'
import { TransactionResponseDto } from './transaction-response.dto'

export class PaginatedTransactionsResponseDto {
  @ApiProperty({
    type: [TransactionResponseDto],
    description: 'List of transactions',
  })
  data!: TransactionResponseDto[]

  @ApiProperty({
    type: PaginationMetaDto,
    description: 'Pagination metadata',
  })
  meta!: PaginationMetaDto
}
