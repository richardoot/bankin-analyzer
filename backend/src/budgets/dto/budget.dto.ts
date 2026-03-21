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
  @ApiProperty()
  id!: string

  @ApiProperty()
  categoryId!: string

  @ApiProperty()
  categoryName!: string

  @ApiProperty()
  amount!: number
}

export class CategoryAverageDto {
  @ApiProperty()
  categoryId!: string

  @ApiProperty()
  categoryName!: string

  @ApiProperty({ description: 'Total amount over the period' })
  totalAmount!: number

  @ApiProperty({ description: 'Number of transactions' })
  transactionCount!: number

  @ApiProperty({ description: 'Average per month' })
  averagePerMonth!: number
}

export class BudgetStatisticsResponseDto {
  @ApiProperty({ description: 'Number of months in the period' })
  periodMonths!: number

  @ApiProperty({ type: [CategoryAverageDto] })
  expensesByCategory!: CategoryAverageDto[]

  @ApiProperty({
    type: [CategoryAverageDto],
    description: 'Excludes reimbursement income categories',
  })
  incomeByCategory!: CategoryAverageDto[]

  @ApiProperty({ description: 'Total expenses over the period' })
  totalExpenses!: number

  @ApiProperty({ description: 'Total income over the period' })
  totalIncome!: number

  @ApiProperty({ description: 'Average monthly expenses' })
  averageMonthlyExpenses!: number

  @ApiProperty({ description: 'Average monthly income' })
  averageMonthlyIncome!: number
}

// Request DTOs

export class CreateBudgetDto {
  @ApiProperty()
  @IsString()
  categoryId!: string

  @ApiProperty()
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
  @ApiProperty({ description: 'Start date (ISO format)' })
  @IsDateString()
  startDate!: string

  @ApiProperty({ description: 'End date (ISO format)' })
  @IsDateString()
  endDate!: string
}
