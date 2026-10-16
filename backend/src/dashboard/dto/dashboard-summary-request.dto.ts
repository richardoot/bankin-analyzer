import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsDateString, IsBoolean } from 'class-validator'
import { Type } from 'class-transformer'

export class DashboardFiltersDto {
  /** Start date for filtering (ISO format: YYYY-MM-DD) */
  @IsOptional()
  @IsDateString()
  startDate?: string

  /** End date for filtering (ISO format: YYYY-MM-DD) */
  @IsOptional()
  @IsDateString()
  endDate?: string

  /**
   * Whether to deduct received reimbursements (the cash paid back on a
   * reimbursement request) from the expense transaction it hangs off.
   * @default true
   */
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  deductReimbursements?: boolean

  /**
   * Whether a debt still owed (PENDING / PARTIAL reimbursement requests) is
   * taken off the spending it hangs off. Omitted, the user's preference
   * applies — on by default; the field is for a caller that needs the other
   * reading, such as a comparison on gross figures.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  deductPendingReimbursements?: boolean

  /**
   * Whether to include per-category monthlyAmounts and subcategories
   * breakdown in the response. Adds extra aggregation work and slightly
   * larger payload.
   * @default false
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeCategoryBreakdown?: boolean
}
