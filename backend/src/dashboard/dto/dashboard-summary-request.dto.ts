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
