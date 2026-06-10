import { ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsEnum,
  IsInt,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Min,
  Max,
} from 'class-validator'
import { Transform } from 'class-transformer'
import { AccountType } from '../../generated/prisma'

export class UpdateAccountDto {
  /**
   * New account name. Trimmed server-side. Must be unique per user (the DB
   * enforces a UNIQUE(user_id, name) constraint).
   */
  @ApiPropertyOptional({
    description: 'New account name (trimmed, unique per user)',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value
  )
  @Length(1, 100)
  name?: string

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
