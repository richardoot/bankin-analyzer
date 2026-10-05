import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { forgetCategoryInPreferences } from './forget-in-preferences'
import { Prisma, TransactionType } from '../generated/prisma'
import type { Category } from '../generated/prisma'
import type {
  CategoryDeletionResultDto,
  CategoryDeletionSummaryDto,
  UpdateCategoryDto,
} from './dto'

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByUser(userId: string): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    })
  }

  /**
   * The categories bearing these names, and nothing for the ones that do
   * not exist. Categories are not created from a name any more — the
   * vocabulary is the catalogue's — so a CSV naming a heading the user does
   * not have leaves that transaction unfiled, visible and one click away
   * from a real filing, rather than minting a category nobody decided on.
   */
  async findManyByName(
    userId: string,
    refs: Array<{ name: string; type: TransactionType }>
  ): Promise<Category[]> {
    const unique = [
      ...new Map(
        refs
          .filter(ref => ref.name && ref.name.trim())
          .map(ref => [`${ref.name}|${ref.type}`, ref])
      ).values(),
    ]
    if (unique.length === 0) return []
    return this.prisma.category.findMany({
      where: {
        userId,
        OR: unique.map(ref => ({ name: ref.name, type: ref.type })),
      },
    })
  }

  /**
   * A catalogue row is the application's vocabulary, not the user's: it
   * cannot be renamed, re-iconed or deleted. Legacy rows still can, until
   * the migration assistant has emptied them.
   */
  private static assertUnlocked(category: Category, action: string): void {
    if (category.catalogKey !== null) {
      throw new ForbiddenException(
        `"${category.name}" belongs to the catalogue and cannot be ${action}`
      )
    }
  }

  /**
   * Update a category. Everything that points at a category does so by id —
   * transactions, budget plan entries, hidden-category
   * preferences — so a rename carries over on its own, with nothing to replay.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateCategoryDto
  ): Promise<Category> {
    const category = await this.findOwned(userId, id)
    CategoriesService.assertUnlocked(category, 'renamed')

    const data = {
      ...(dto.name !== undefined && { name: dto.name }),
    }
    const isRenaming = dto.name !== undefined && dto.name !== category.name

    try {
      return await this.prisma.category.update({ where: { id }, data })
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        isRenaming
      ) {
        throw new ConflictException(
          `A category named "${dto.name}" already exists for this type.`
        )
      }
      throw err
    }
  }

  /**
   * Everything the dialog needs to state what deleting this category does.
   * Transactions and reimbursement requests are *kept* — their FK is SET NULL,
   * so only the filing is lost. Subcategories, budget plan lines and the
   * reimbursement pairing are destroyed by the cascade.
   */
  async getDeletionSummary(
    userId: string,
    id: string
  ): Promise<CategoryDeletionSummaryDto> {
    const category = await this.findOwned(userId, id)

    const [
      aggregate,
      labelledTransactionCount,
      subcategories,
      entries,
      reimbursementCount,
      preferences,
    ] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { categoryId: id, userId },
        _count: { _all: true },
        _min: { date: true },
        _max: { date: true },
      }),
      this.prisma.transaction.count({
        where: { categoryId: id, userId, NOT: { subcategory: null } },
      }),
      this.prisma.subcategory.findMany({
        where: { categoryId: id },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.budgetPlanEntry.findMany({
        where: { categoryId: id, budgetPlan: { userId } },
        select: {
          amount: true,
          budgetPlan: {
            select: { name: true, startDate: true, endDate: true },
          },
        },
        orderBy: { budgetPlan: { startDate: 'desc' } },
      }),
      // Counted through the expense they hang off: a debt no longer carries a
      // category of its own since phase 6, it reads the transaction's. The
      // warning it feeds stays true — they remain due, and the filing they
      // lose is the one they borrow.
      this.prisma.reimbursementRequest.count({
        where: { userId, transaction: { categoryId: id } },
      }),
      this.prisma.filterPreferences.findUnique({ where: { userId } }),
    ])

    const isExpense = category.type === TransactionType.EXPENSE
    const globalHidden = isExpense
      ? (preferences?.globalHiddenExpenseCategoryIds ?? [])
      : (preferences?.globalHiddenIncomeCategoryIds ?? [])

    return {
      categoryId: category.id,
      categoryName: category.name,
      type: category.type,
      transactionCount: aggregate._count._all,
      firstTransactionDate: aggregate._min.date,
      lastTransactionDate: aggregate._max.date,
      subcategoryNames: subcategories.map(s => s.name),
      labelledTransactionCount,
      budgetPlanEntries: entries.map(entry => ({
        planName: entry.budgetPlan.name,
        amount: entry.amount.toNumber(),
        startDate: entry.budgetPlan.startDate,
        endDate: entry.budgetPlan.endDate,
      })),
      reimbursementCount,
      isGloballyHidden: globalHidden.includes(id),
    }
  }

  /**
   * Delete a category. The FKs carry most of the work — subcategories, budget
   * plan lines and the reimbursement pairing cascade away, transactions and
   * reimbursement requests are detached — but two things need doing by hand:
   *
   *  - `Transaction.subcategory` is a denormalized label the dashboard groups
   *    on. The subcategory row cascades away, this copy would not, and the
   *    orphan label would keep showing under the uncategorized bucket.
   *  - the hidden-category preferences hold plain ids with no FK, so the
   *    deleted id would linger there.
   */
  async remove(userId: string, id: string): Promise<CategoryDeletionResultDto> {
    const category = await this.findOwned(userId, id)
    CategoriesService.assertUnlocked(category, 'deleted')

    return this.prisma.$transaction(async tx => {
      const [uncategorizedTransactions, deletedSubcategories, entryCount] =
        await Promise.all([
          tx.transaction.count({ where: { categoryId: id, userId } }),
          tx.subcategory.count({ where: { categoryId: id } }),
          tx.budgetPlanEntry.count({
            where: { categoryId: id, budgetPlan: { userId } },
          }),
        ])

      if (uncategorizedTransactions > 0) {
        // `subcategoryId` is nulled here rather than left to its ON DELETE SET
        // NULL: having already updated these rows in this transaction, letting
        // the subcategory cascade fix them up afterwards trips
        // `transactions_subcategory_id_fkey`. Detaching them upfront leaves the
        // cascade nothing to do.
        await tx.transaction.updateMany({
          where: { categoryId: id, userId },
          data: { subcategory: null, subcategoryId: null },
        })
      }

      await forgetCategoryInPreferences(tx, userId, id, category.type)
      await tx.category.delete({ where: { id } })

      return {
        uncategorizedTransactions,
        deletedSubcategories,
        deletedBudgetPlanEntries: entryCount,
      }
    })
  }

  private async findOwned(userId: string, id: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({
      where: { id, userId },
    })
    if (!category) {
      throw new NotFoundException(`Category ${id} not found`)
    }
    return category
  }

  async findWithoutIcons(userId: string) {
    return this.prisma.category.findMany({
      where: { userId, icon: null },
      select: { id: true, name: true },
    })
  }

  async findSubcategoriesWithoutIcons(userId: string) {
    return this.prisma.subcategory.findMany({
      where: { userId, icon: null },
      select: { id: true, name: true },
    })
  }
}
