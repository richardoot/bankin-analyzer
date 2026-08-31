import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Account, AccountType, Prisma } from '../generated/prisma'
import {
  AccountDeletionResultDto,
  AccountDeletionSummaryDto,
  UpdateAccountDto,
} from './dto'

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
   * What deleting this account would cost, so the UI can spell it out before
   * asking for a confirmation. Read-only: nothing is changed here.
   */
  async getDeletionSummary(
    userId: string,
    accountId: string
  ): Promise<AccountDeletionSummaryDto> {
    const account = await this.findOne(userId, accountId)

    const [aggregate, reimbursementCount, settlementCount] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { accountId, userId },
        _count: { _all: true },
        _min: { date: true },
        _max: { date: true },
      }),
      this.prisma.reimbursementRequest.count({
        where: { userId, transaction: { accountId } },
      }),
      this.prisma.settlement.count({
        where: { userId, incomeTransaction: { accountId } },
      }),
    ])

    return {
      accountId: account.id,
      accountName: account.name,
      transactionCount: aggregate._count._all,
      firstTransactionDate: aggregate._min.date,
      lastTransactionDate: aggregate._max.date,
      reimbursementCount,
      settlementCount,
    }
  }

  /**
   * Delete an account and, with it, the transactions booked on it — and only
   * those: categories, subcategories, tags, persons and budget plans are
   * user-configured entities shared across accounts, so they stay untouched
   * (same rule as deleting an import).
   *
   * Reimbursements can straddle two accounts — an expense advanced on account A
   * repaid by an income received on account B — and the credit has to go when
   * the money does. Since phase 6 the database sees to it: deleting an income
   * transaction cascades to the settlement it funded, and from there to the
   * payments, which is where every figure a debt reports is now read from.
   * What used to be a hand-written reversal is a foreign key.
   */
  async remove(
    userId: string,
    accountId: string
  ): Promise<AccountDeletionResultDto> {
    await this.findOne(userId, accountId)

    return this.prisma.$transaction(async tx => {
      const transactionCount = await tx.transaction.count({
        where: { accountId, userId },
      })

      if (transactionCount > 0) {
        const emptiedSettlementIds = await this.settlementsLosingAllDebts(
          tx,
          accountId
        )

        await tx.transaction.deleteMany({ where: { accountId, userId } })

        // The cascade removed their last line; the settlement itself is now an
        // empty shell reserving money on a surviving income transaction.
        if (emptiedSettlementIds.length > 0) {
          await tx.settlement.deleteMany({
            where: { id: { in: emptiedSettlementIds } },
          })
        }
      }

      await tx.account.delete({ where: { id: accountId } })

      return { deletedTransactions: transactionCount }
    })
  }

  /**
   * Settlements whose every reimbursement line is carried by the doomed
   * account, and whose income transaction survives elsewhere. Their
   * `amountUsed` would otherwise keep reserving cash on that surviving income
   * for a debt nobody owes any more.
   *
   * Settlements that lose only *some* of their lines are left alone on
   * purpose: `amountUsed` counts cash, while a line's `amountSettled` may also
   * include a forgiven remainder, so subtracting one from the other could free
   * money that was never spent.
   */
  private async settlementsLosingAllDebts(
    tx: Prisma.TransactionClient,
    accountId: string
  ): Promise<string[]> {
    const candidates = await tx.settlement.findMany({
      where: {
        incomeTransaction: { accountId: { not: accountId } },
        reimbursements: {
          some: { reimbursement: { transaction: { accountId } } },
        },
      },
      include: {
        reimbursements: {
          select: {
            reimbursement: {
              select: { transaction: { select: { accountId: true } } },
            },
          },
        },
      },
    })

    return candidates
      .filter(settlement =>
        settlement.reimbursements.every(
          line => line.reimbursement.transaction.accountId === accountId
        )
      )
      .map(settlement => settlement.id)
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
