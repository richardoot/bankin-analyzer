import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  Matches,
} from 'class-validator'
import { toBoolean } from '../../trends/dto/trends-request.dto'

/**
 * What the « Ce mois-ci » band is read with: the dashboard's reading and
 * its two reimbursement switches, never its period — the band reads the
 * current month, to date.
 */
export class DashboardMonthQueryDto {
  /**
   * `everyday` (default) leaves the exceptional lines out and counts a
   * smoothed purchase by its slices, as the dashboard's « Vie courante »;
   * `real` reads everything at its date (« Tout »).
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

  /**
   * The day the month is read at, `YYYY-MM-DD`, included; today in Paris
   * when absent. For tests and for reading a past month as it stood.
   */
  @ApiPropertyOptional({ example: '2026-10-23' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
    message: 'asOf must be YYYY-MM-DD',
  })
  @IsDateString({ strict: true })
  asOf?: string
}
