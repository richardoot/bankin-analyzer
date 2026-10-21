import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsOptional, Matches } from 'class-validator'
import { TREND_RULES } from '../trend.detection'

/**
 * A query string carries `true` and `false` as text, and `Boolean('false')`
 * is true: only the two words, and real booleans, are read.
 */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true
  if (value === 'false') return false
  return value
}

export class TrendsQueryDto {
  /**
   * The month read, `YYYY-MM`; the last closed month (in Paris) when absent.
   * The current month is refused: two thirds of a month always read as a
   * drop.
   */
  @ApiPropertyOptional({ example: '2026-09' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month?: string

  /**
   * The reference: the median of this many complete months before the month
   * read, shortened to the history when it is shorter.
   * @default 6
   */
  @ApiPropertyOptional({ enum: TREND_RULES.windows, default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([...TREND_RULES.windows])
  window?: 3 | 6 | 12

  /**
   * `everyday` (default) leaves the exceptional lines out and counts a
   * smoothed purchase by its slices, as the dashboard's « Vie courante »;
   * `real` reads everything at its date.
   */
  @ApiPropertyOptional({ enum: ['everyday', 'real'], default: 'everyday' })
  @IsOptional()
  @IsIn(['everyday', 'real'])
  reading?: 'everyday' | 'real'

  /**
   * Whether received reimbursements are taken off the expense they repay,
   * as on the dashboard.
   * @default true
   */
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  deductReimbursements?: boolean

  /**
   * Whether a debt still owed is taken off the spending it hangs off.
   * Omitted, the user's preference applies, as on the dashboard.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  deductPendingReimbursements?: boolean
}
