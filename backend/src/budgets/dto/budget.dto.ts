import { ApiProperty } from '@nestjs/swagger'
import {
  IsString,
  IsNumber,
  IsArray,
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

  /** Total amount over the period */
  totalAmount!: number

  /** Number of transactions */
  transactionCount!: number

  /** Average per month */
  averagePerMonth!: number

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
}
