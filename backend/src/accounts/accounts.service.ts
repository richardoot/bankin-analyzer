import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Account, AccountType, Prisma } from '../generated/prisma'
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
   * Update an account. When renaming, the new name is enforced unique per
   * user by the DB constraint; conflicts surface as ConflictException.
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

    try {
      return await this.prisma.account.update({
        where: { id: accountId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(divisor !== undefined && { divisor }),
          ...(isExcludedFromBudget !== undefined && { isExcludedFromBudget }),
          ...(dto.isExcludedFromStats !== undefined && {
            isExcludedFromStats: dto.isExcludedFromStats,
          }),
        },
      })
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        dto.name !== undefined
      ) {
        throw new ConflictException(
          `An account named "${dto.name}" already exists.`
        )
      }
      throw err
    }
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
}
