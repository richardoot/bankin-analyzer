import { ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsString,
  IsArray,
  IsOptional,
  IsDateString,
  IsBoolean,
} from 'class-validator'
import { Type } from 'class-transformer'

export class DashboardFiltersDto {
  /**
   * Hidden expense category ids. Transactions with no category are addressed
   * by the `UNCATEGORIZED_CATEGORY_ID` sentinel.
   */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenExpenseCategoryIds?: string[]

  /** Hidden income category ids (same sentinel rule as expenses) */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenIncomeCategoryIds?: string[]

  /** Start date for filtering (ISO format: YYYY-MM-DD) */
  @IsOptional()
  @IsDateString()
  startDate?: string

  /** End date for filtering (ISO format: YYYY-MM-DD) */
  @IsOptional()
  @IsDateString()
  endDate?: string

  /**
   * Whether to deduct received reimbursements (income transactions in
   * reimbursement categories linked via CategoryAssociation) from expense
   * totals.
   * @default true
   */
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  deductReimbursements?: boolean

  /**
   * Whether to deduct pending/partial reimbursement requests (from the
   * ReimbursementRequest table) from expense totals. Only the remaining
   * amount (amount − amountReceived) of PENDING/PARTIAL requests whose
   * linked transaction falls within the date range is deducted.
   * @default false
   */
  @ApiPropertyOptional({ default: false })
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
