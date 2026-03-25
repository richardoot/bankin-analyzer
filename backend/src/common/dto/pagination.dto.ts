import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

/**
 * Query parameters for pagination
 */
export class PaginationQueryDto {
  /** Page number (1-indexed) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  /** Number of items per page */
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
  /** Total number of items */
  total!: number

  /** Current page number */
  page!: number

  /** Number of items per page */
  limit!: number

  /** Total number of pages */
  totalPages!: number

  /** Whether there is a next page */
  hasNextPage!: boolean

  /** Whether there is a previous page */
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
