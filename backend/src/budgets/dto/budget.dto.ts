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
  /**
   * The subcategory this line sums, or null for the category's rows filed
   * under none — what a link to the line's transactions names.
   */
  @ApiProperty({ type: String, nullable: true })
  subcategoryId!: string | null

  /** Subcategory name, read off the subcategory (empty string if none) */
  subcategory!: string

  /** Total amount over the period */
  totalAmount!: number

  /** Number of transactions */
  transactionCount!: number

  /** Average per month */
  averagePerMonth!: number

  /**
   * Everyday counterpart of `totalAmount`: exceptional rows out, smoothed
   * purchases spread into their slices. Only on a line a smoothed purchase
   * touches this period; elsewhere the line has no everyday split of its own.
   */
  everydayAmount?: number

  /** `everydayAmount` over the period. Same presence rule. */
  everydayAveragePerMonth?: number

  /** Slices of smoothed purchases falling in the period. Same presence rule. */
  amortizedAmount?: number
}

/**
 * A smoothed purchase whose slices or date touch the period: what the
 * « Achats lissés en cours » list and the link to the source need.
 */
export class AmortizedPurchaseDto {
  transactionId!: string

  description!: string

  /** The purchase's own date, `YYYY-MM-DD`. */
  date!: string

  /** Number of monthly slices. */
  months!: number

  /** Net of reimbursements and divided: what the slices sum to. */
  netAmount!: number

  /** The regular slice; the last one absorbs the rounding gap. */
  monthlyAmount!: number

  /** `YYYY-MM` of the first and last slice. */
  firstMonth!: string

  lastMonth!: string

  @ApiProperty({ type: String, nullable: true })
  categoryId!: string | null

  @ApiProperty({ type: String, nullable: true })
  subcategoryId!: string | null

  /** Sum of its slices falling in the period. */
  amountInPeriod!: number

  /** `YYYY-MM` of each of those slices, chronological. */
  @ApiProperty({ type: [String] })
  sliceMonthsInPeriod!: string[]

  /** The purchase itself is dated in the period, so the real reading counts it whole. */
  dateInPeriod!: boolean
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

  /**
   * Share of `totalAmount` carried by transactions tagged as exceptional
   * (holiday, birthday, competition). Expense categories only.
   */
  exceptionalAmount?: number

  /**
   * `totalAmount` minus `exceptionalAmount` — the recurring lifestyle, which
   * is what a monthly budget envelope should be sized on — with each smoothed
   * purchase traded for its slices falling in the period.
   */
  everydayAmount?: number

  /**
   * `everydayAmount` divided by the same `periodMonths` as `averagePerMonth`.
   * A category no exceptional event ever touched reads identically in both.
   */
  everydayAveragePerMonth?: number

  /** Everyday counterpart of `monthlyAmounts`, same indexes and length. */
  everydayMonthlyAmounts?: number[]

  /**
   * Slices of smoothed purchases in `everydayAmount` — the « dont X €
   * lissés ». Only when a smoothed purchase touches the category.
   */
  amortizedAmount?: number

  /**
   * Same, per month, matching `monthLabels`. Only with the monthly breakdown
   * and when a smoothed purchase touches the category.
   */
  amortizedMonthlyAmounts?: number[]

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

  /**
   * Total expense carried by exceptional events over the period, net of
   * reimbursements. `totalExpenses` minus this is everyday spending.
   */
  totalExceptionalExpenses?: number

  /**
   * Smoothed purchases touching the period, in date order. Absent when there
   * is none.
   */
  @ApiPropertyOptional({ type: [AmortizedPurchaseDto] })
  amortizedPurchases?: AmortizedPurchaseDto[]

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
   * Whether to deduct received reimbursements (the cash paid back on a
   * reimbursement request) from the expense transaction it hangs off. The
   * deduction is computed server-side.
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

  /**
   * When true, deductPendingReimbursements considers ALL active pending
   * reimbursement requests for the user (regardless of when the linked
   * expense transaction was made). Useful for budget planning where the
   * statistics window is in the past but pending reimbursements are
   * "current" and should always be subtracted from a future budget plan.
   *
   * Has no effect unless deductPendingReimbursements is also true.
   * @default false
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeAllPendingReimbursements?: boolean
}
