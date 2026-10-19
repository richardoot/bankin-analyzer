import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'
import { TagAnalysisCategoryDto } from '../../tags/dto/tag-analysis.dto'
import { TAG_EVENT_STATUSES } from '../../tags/tag-status'
import type { TagEventStatus } from '../../tags/tag-status'

/**
 * Which year a transaction belongs to. `event`: the year its dated tag starts
 * in (a trip of January 2027 paid in November 2026 is a 2027 expense), the
 * transaction's own year for a tag without a window. `cash`: the
 * transaction's own year, always.
 */
export const TAG_FAMILY_ANALYSIS_BASES = ['event', 'cash'] as const
export type TagFamilyAnalysisBasis = (typeof TAG_FAMILY_ANALYSIS_BASES)[number]

export class TagFamilyAnalysisQueryDto {
  /** Only this year, in the chosen basis. The whole family when absent. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year?: number

  /** `event` (default) or `cash`. */
  @IsOptional()
  @IsIn(TAG_FAMILY_ANALYSIS_BASES)
  basis?: TagFamilyAnalysisBasis
}

/** The family itself, for the page header. */
export class TagFamilyAnalysisFamilyDto {
  id!: string
  name!: string
  color!: string | null
  icon!: string | null

  /** Envelope over a calendar year, or null. */
  annualBudget!: number | null
}

/** One year of the family, in the chosen basis. */
export class TagFamilyAnalysisYearDto {
  year!: number

  /** Expenses (absolute, joint-account-adjusted). */
  expenses!: number

  /** Income (joint-account-adjusted). */
  income!: number

  /** Transactions counted, each once. */
  transactionCount!: number
}

/** One tag of the family, over the transactions of the chosen scope. */
export class TagFamilyAnalysisTagDto {
  id!: string
  name!: string
  color!: string | null
  icon!: string | null
  isExceptional!: boolean

  /** Where a dated tag stands today; null for a tag without a window. */
  @ApiProperty({ enum: TAG_EVENT_STATUSES, nullable: true })
  status!: TagEventStatus | null

  /** ISO date (YYYY-MM-DD) of the window, or null. */
  eventStartDate!: string | null
  eventEndDate!: string | null

  /** Days of the window, both bounds included; null without a window. */
  days!: number | null

  /** Expenses carrying this tag in scope (absolute, joint-account-adjusted). */
  spent!: number

  /** `spent / days`; null without a window. */
  spentPerDay!: number | null

  /**
   * What the edition cost on top of an ordinary stretch of the same length,
   * as on the tag's own analysis. Null without a window, and for an edition
   * the scope only partly covers (paid across two years, read in cash).
   */
  surplus!: number | null

  /** Envelope set on the tag itself, or null. */
  budgetAmount!: number | null

  /** Transactions carrying this tag in scope (expenses and income). */
  transactionCount!: number

  /**
   * True when some of the tag's transactions fall outside the scope: an
   * edition paid across two years, read in cash for one of them.
   */
  isPartial!: boolean
}

/** One edition named in the comparison. */
export class TagFamilyEditionRefDto {
  id!: string
  name!: string
  spent!: number
}

/**
 * The family's dated editions weighed against each other: those of the scope
 * with at least one transaction, the editions the scope only partly covers
 * left out.
 */
export class TagFamilyEditionComparisonDto {
  editionCount!: number
  averageSpent!: number
  medianSpent!: number

  /** Total spent over total days of window: a long edition weighs more. */
  averagePerDay!: number

  mostExpensive!: TagFamilyEditionRefDto
  leastExpensive!: TagFamilyEditionRefDto
}

/**
 * The union of a family's tags, each transaction counted once however many
 * of the family's tags it carries.
 */
export class TagFamilyAnalysisDto {
  family!: TagFamilyAnalysisFamilyDto

  @ApiProperty({ enum: TAG_FAMILY_ANALYSIS_BASES })
  basis!: TagFamilyAnalysisBasis

  /** The year asked for, or null for the whole family. */
  year!: number | null

  /** Every year the family touches in the chosen basis, ascending. */
  availableYears!: number[]

  /** Expenses in scope (absolute, joint-account-adjusted). */
  totalExpenses!: number

  /** Income in scope (joint-account-adjusted). */
  totalIncome!: number

  /** income - expenses. */
  net!: number

  /** Transactions in scope, each once. */
  transactionCount!: number

  /** Sum of the tags' surplus; null when none of them has one. */
  totalSurplus!: number | null

  /** Per-category breakdown, sorted by amount desc. */
  @ApiProperty({ type: [TagAnalysisCategoryDto] })
  byCategory!: TagAnalysisCategoryDto[]

  /** Per-year breakdown in the chosen basis, within the scope, ascending. */
  @ApiProperty({ type: [TagFamilyAnalysisYearDto] })
  byYear!: TagFamilyAnalysisYearDto[]

  /**
   * One line per tag in scope: every tag of the family without a year; with
   * one, the tags having a transaction in it, plus in event basis the dated
   * tags starting in it. Dated tags first, by window start descending.
   */
  @ApiProperty({ type: [TagFamilyAnalysisTagDto] })
  tags!: TagFamilyAnalysisTagDto[]

  /** Null when no edition is in scope. */
  @ApiProperty({ type: TagFamilyEditionComparisonDto, nullable: true })
  comparison!: TagFamilyEditionComparisonDto | null
}
