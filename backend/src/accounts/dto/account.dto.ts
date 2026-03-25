import { ApiProperty } from '@nestjs/swagger'
import { AccountType } from '../../generated/prisma'

export class AccountDto {
  /** Account ID */
  id!: string

  /** Account name */
  name!: string

  /** Account type */
  @ApiProperty({ enum: ['STANDARD', 'JOINT', 'INVESTMENT'] })
  type!: AccountType

  /** Divisor for amounts (1 = normal, 2 = joint) */
  divisor!: number

  /** Whether this account is excluded from budget calculations */
  isExcludedFromBudget!: boolean

  /** Whether this account is excluded from statistics */
  isExcludedFromStats!: boolean

  /** Creation date */
  createdAt!: Date

  /** Last update date */
  updatedAt!: Date
}
