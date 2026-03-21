import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Account, AccountType } from '../generated/prisma'
import { UpdateAccountDto } from './dto'

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all accounts for a user
   */
  async findAllByUser(userId: string): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    })
  }

  /**
   * Get a specific account
   */
  async findOne(userId: string, accountId: string): Promise<Account> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
    })

    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`)
    }

    return account
  }

  /**
   * Get an account by name
   */
  async findByName(userId: string, name: string): Promise<Account | null> {
    return this.prisma.account.findUnique({
      where: {
        userId_name: { userId, name },
      },
    })
  }

  /**
   * Update an account
   */
  async update(
    userId: string,
    accountId: string,
    dto: UpdateAccountDto
  ): Promise<Account> {
    // Verify account exists and belongs to user
    await this.findOne(userId, accountId)

    // If type is changing to JOINT, set divisor to 2
    // If type is changing to STANDARD, set divisor to 1
    let divisor = dto.divisor
    if (dto.type !== undefined && divisor === undefined) {
      if (dto.type === AccountType.JOINT) {
        divisor = 2
      } else if (dto.type === AccountType.STANDARD) {
        divisor = 1
      }
    }

    // If type is INVESTMENT, set isExcludedFromBudget to true by default
    let isExcludedFromBudget = dto.isExcludedFromBudget
    if (
      dto.type === AccountType.INVESTMENT &&
      isExcludedFromBudget === undefined
    ) {
      isExcludedFromBudget = true
    }

    return this.prisma.account.update({
      where: { id: accountId },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(divisor !== undefined && { divisor }),
        ...(isExcludedFromBudget !== undefined && { isExcludedFromBudget }),
        ...(dto.isExcludedFromStats !== undefined && {
          isExcludedFromStats: dto.isExcludedFromStats,
        }),
      },
    })
  }

  /**
   * Create or get an account by name
   * Used when importing transactions
   */
  async upsertByName(userId: string, name: string): Promise<Account> {
    return this.prisma.account.upsert({
      where: {
        userId_name: { userId, name },
      },
      create: {
        userId,
        name,
        type: AccountType.STANDARD,
        divisor: 1,
      },
      update: {},
    })
  }

  /**
   * Get the divisor for a specific account
   * Returns 1 if account not found (default behavior)
   */
  async getDivisor(userId: string, accountName: string): Promise<number> {
    const account = await this.findByName(userId, accountName)
    return account?.divisor ?? 1
  }

  /**
   * Check if account is excluded from budget
   */
  async isExcludedFromBudget(
    userId: string,
    accountName: string
  ): Promise<boolean> {
    const account = await this.findByName(userId, accountName)
    return account?.isExcludedFromBudget ?? false
  }

  /**
   * Check if account is excluded from stats
   */
  async isExcludedFromStats(
    userId: string,
    accountName: string
  ): Promise<boolean> {
    const account = await this.findByName(userId, accountName)
    return account?.isExcludedFromStats ?? false
  }

  /**
   * Get all accounts with their divisors as a map
   * Useful for batch processing
   */
  async getAccountDivisorsMap(userId: string): Promise<Map<string, number>> {
    const accounts = await this.findAllByUser(userId)
    return new Map(accounts.map(a => [a.name, a.divisor]))
  }
}
