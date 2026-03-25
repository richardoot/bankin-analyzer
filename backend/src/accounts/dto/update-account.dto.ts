import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsInt, IsBoolean, IsOptional, Min, Max } from 'class-validator'
import { AccountType } from '../../generated/prisma'

export class UpdateAccountDto {
  /** Account type */
  @ApiPropertyOptional({ enum: ['STANDARD', 'JOINT', 'INVESTMENT'] })
  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType

  /** Divisor for amounts (1 = normal, 2 = joint) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  divisor?: number

  /** Whether this account is excluded from budget calculations */
  @IsOptional()
  @IsBoolean()
  isExcludedFromBudget?: boolean

  /** Whether this account is excluded from statistics */
  @IsOptional()
  @IsBoolean()
  isExcludedFromStats?: boolean
}
