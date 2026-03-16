import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

/**
 * Query parameters for pagination
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20
}

/**
 * Pagination metadata in response
 */
export class PaginationMetaDto {
  @ApiProperty({ description: 'Total number of items' })
  total!: number

  @ApiProperty({ description: 'Current page number' })
  page!: number

  @ApiProperty({ description: 'Number of items per page' })
  limit!: number

  @ApiProperty({ description: 'Total number of pages' })
  totalPages!: number

  @ApiProperty({ description: 'Whether there is a next page' })
  hasNextPage!: boolean

  @ApiProperty({ description: 'Whether there is a previous page' })
  hasPreviousPage!: boolean
}

/**
 * Helper function to create pagination metadata
 */
export function createPaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMetaDto {
  const totalPages = Math.ceil(total / limit)
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }
}
