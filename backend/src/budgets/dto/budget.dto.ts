import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsString,
  IsNumber,
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
  IsDateString,
  Min,
} from 'class-validator'
import { Type } from 'class-transformer'

// Response DTOs

export class BudgetResponseDto {
  id!: string

  categoryId!: string

  categoryName!: string

  amount!: number

  categoryIcon?: string | null
}

export class SubcategoryAverageDto {
  /** Subcategory name */
  subcategory!: string

  /** Total amount over the period */
  totalAmount!: number

  /** Number of transactions */
  transactionCount!: number

  /** Average per month */
  averagePerMonth!: number
}

export class CategoryAverageDto {
  categoryId!: string

  categoryName!: string

  categoryIcon?: string | null

  /** Total amount over the period */
  totalAmount!: number

  /** Number of transactions */
  transactionCount!: number

  /** Average per month */
  averagePerMonth!: number

  /** Amount deducted via received reimbursements (income transactions in reimbursement categories) */
  reimbursement?: number

  /** Amount deducted via pending/partial reimbursement requests not yet received */
  pendingReimbursement?: number

  /** Monthly amounts over the period (chronological order). Only included when includeMonthlyBreakdown is true. */
  monthlyAmounts?: number[]

  /** Breakdown by subcategory */
  @ApiProperty({ type: [SubcategoryAverageDto] })
  subcategories?: SubcategoryAverageDto[]
}

export class BudgetStatisticsResponseDto {
  /** Number of months in the period */
  periodMonths!: number

  @ApiProperty({ type: [CategoryAverageDto] })
  expensesByCategory!: CategoryAverageDto[]

  /** Excludes reimbursement income categories */
  @ApiProperty({ type: [CategoryAverageDto] })
  incomeByCategory!: CategoryAverageDto[]

  /** Total expenses over the period */
  totalExpenses!: number

  /** Total income over the period */
  totalIncome!: number

  /** Average monthly expenses */
  averageMonthlyExpenses!: number

  /** Average monthly income */
  averageMonthlyIncome!: number

  /** Total received reimbursements deducted from expenses */
  totalReimbursements?: number

  /** Total pending reimbursements deducted from expenses */
  totalPendingReimbursements?: number

  /** Month labels corresponding to monthlyAmounts indexes (e.g. ['2025-04', '2025-05', ...]). Only included when includeMonthlyBreakdown is true. */
  monthLabels?: string[]
}

// Request DTOs

export class CreateBudgetDto {
  @IsString()
  categoryId!: string

  @IsNumber()
  @Min(0)
  amount!: number
}

export class UpsertBudgetsDto {
  @ApiProperty({ type: [CreateBudgetDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBudgetDto)
  budgets!: CreateBudgetDto[]
}

export class BudgetStatisticsFiltersDto {
  /** Start date (ISO format) */
  @IsDateString()
  startDate!: string

  /** End date (ISO format) */
  @IsDateString()
  endDate!: string

  /**
   * Whether to deduct received reimbursements (income transactions in
   * reimbursement categories linked via CategoryAssociation) from expense
   * category totals. The deduction is computed server-side.
   * @default true
   */
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  deductReimbursements?: boolean

  /**
   * Whether to deduct pending/partial reimbursement requests (from the
   * ReimbursementRequest table) from expense category totals. Only the
   * remaining amount (amount − amountReceived) of PENDING/PARTIAL requests
   * whose linked transaction falls within the date range is deducted.
   * @default false
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  deductPendingReimbursements?: boolean

  /**
   * Whether to include monthly amount breakdown per category.
   * When true, each CategoryAverageDto includes a `monthlyAmounts` array
   * with one value per month in the period (chronological order).
   * @default false
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeMonthlyBreakdown?: boolean
}
