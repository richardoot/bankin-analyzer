import { ApiProperty } from '@nestjs/swagger'
import { AccountType } from '../../generated/prisma'

export class AccountDto {
  @ApiProperty({ description: 'Account ID' })
  id!: string

  @ApiProperty({ description: 'Account name' })
  name!: string

  @ApiProperty({
    description: 'Account type',
    enum: ['STANDARD', 'JOINT', 'INVESTMENT'],
  })
  type!: AccountType

  @ApiProperty({ description: 'Divisor for amounts (1 = normal, 2 = joint)' })
  divisor!: number

  @ApiProperty({
    description: 'Whether this account is excluded from budget calculations',
  })
  isExcludedFromBudget!: boolean

  @ApiProperty({
    description: 'Whether this account is excluded from statistics',
  })
  isExcludedFromStats!: boolean

  @ApiProperty({ description: 'Creation date' })
  createdAt!: Date

  @ApiProperty({ description: 'Last update date' })
  updatedAt!: Date
}
