import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsInt, IsBoolean, IsOptional, Min, Max } from 'class-validator'
import { AccountType } from '../../generated/prisma'

export class UpdateAccountDto {
  @ApiPropertyOptional({
    description: 'Account type',
    enum: ['STANDARD', 'JOINT', 'INVESTMENT'],
  })
  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType

  @ApiPropertyOptional({
    description: 'Divisor for amounts (1 = normal, 2 = joint)',
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  divisor?: number

  @ApiPropertyOptional({
    description: 'Whether this account is excluded from budget calculations',
  })
  @IsOptional()
  @IsBoolean()
  isExcludedFromBudget?: boolean

  @ApiPropertyOptional({
    description: 'Whether this account is excluded from statistics',
  })
  @IsOptional()
  @IsBoolean()
  isExcludedFromStats?: boolean
}
