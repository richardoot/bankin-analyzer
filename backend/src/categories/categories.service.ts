import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma, TransactionType } from '../generated/prisma'
import type { Category } from '../generated/prisma'
import type {
  CategoryDeletionResultDto,
  CategoryDeletionSummaryDto,
  CreateCategoryDto,
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

  async findOrCreate(
    userId: string,
    name: string,
    type: TransactionType
  ): Promise<Category> {
    const existing = await this.prisma.category.findUnique({
      where: {
        userId_name_type: { userId, name, type },
      },
    })

    if (existing) {
      return existing
    }

    return this.prisma.category.create({
      data: { userId, name, type },
    })
  }

  async create(userId: string, dto: CreateCategoryDto): Promise<Category> {
    return this.findOrCreate(userId, dto.name, dto.type)
  }

  /**
   * Update a category. Everything that points at a category does so by id —
   * transactions, budget plan entries, associations, hidden-category
   * preferences — so a rename carries over on its own, with nothing to replay.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateCategoryDto
  ): Promise<Category> {
    const category = await this.findOwned(userId, id)

    const data = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.isExcludedFromBudget !== undefined && {
        isExcludedFromBudget: dto.isExcludedFromBudget,
      }),
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
      association,
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
      this.prisma.reimbursementRequest.count({
        where: { categoryId: id, userId },
      }),
      this.prisma.categoryAssociation.findFirst({
        where: {
          userId,
          OR: [{ expenseCategoryId: id }, { incomeCategoryId: id }],
        },
        include: {
          expenseCategory: { select: { name: true } },
          incomeCategory: { select: { name: true } },
        },
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
      // The association names one category on each side; report the other one.
      associatedCategoryName: association
        ? isExpense
          ? association.incomeCategory.name
          : association.expenseCategory.name
        : null,
      isGloballyHidden: globalHidden.includes(id),
      isExcludedFromBudget: category.isExcludedFromBudget,
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

      await this.forgetInFilterPreferences(tx, userId, id, category.type)
      await tx.category.delete({ where: { id } })

      return {
        uncategorizedTransactions,
        deletedSubcategories,
        deletedBudgetPlanEntries: entryCount,
      }
    })
  }

  /** Drop a deleted category's id from the hidden lists, which carry no FK. */
  private async forgetInFilterPreferences(
    tx: Prisma.TransactionClient,
    userId: string,
    categoryId: string,
    type: TransactionType
  ): Promise<void> {
    const preferences = await tx.filterPreferences.findUnique({
      where: { userId },
    })
    if (!preferences) return

    const isExpense = type === TransactionType.EXPENSE
    const hidden = isExpense
      ? preferences.hiddenExpenseCategoryIds
      : preferences.hiddenIncomeCategoryIds
    const globalHidden = isExpense
      ? preferences.globalHiddenExpenseCategoryIds
      : preferences.globalHiddenIncomeCategoryIds

    if (!hidden.includes(categoryId) && !globalHidden.includes(categoryId)) {
      return
    }

    const without = (ids: string[]): string[] =>
      ids.filter(candidate => candidate !== categoryId)

    await tx.filterPreferences.update({
      where: { userId },
      data: isExpense
        ? {
            hiddenExpenseCategoryIds: without(hidden),
            globalHiddenExpenseCategoryIds: without(globalHidden),
          }
        : {
            hiddenIncomeCategoryIds: without(hidden),
            globalHiddenIncomeCategoryIds: without(globalHidden),
          },
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

  /**
   * Batch find or create multiple categories.
   * Much more efficient than calling findOrCreate() N times.
   * Returns all categories and count of newly created ones.
   */
  async findOrCreateMany(
    userId: string,
    categories: Array<{ name: string; type: TransactionType }>
  ): Promise<{ categories: Category[]; newCount: number }> {
    if (categories.length === 0) {
      return { categories: [], newCount: 0 }
    }

    // Deduplicate by name|type
    const uniqueCategories = [
      ...new Map(categories.map(c => [`${c.name}|${c.type}`, c])).values(),
    ]

    // 1. Find all existing categories in one query
    const existing = await this.prisma.category.findMany({
      where: {
        userId,
        OR: uniqueCategories.map(c => ({ name: c.name, type: c.type })),
      },
    })
    const existingSet = new Set(existing.map(c => `${c.name}|${c.type}`))

    // 2. Create missing ones in batch
    const toCreate = uniqueCategories.filter(
      c => !existingSet.has(`${c.name}|${c.type}`)
    )

    if (toCreate.length > 0) {
      await this.prisma.category.createMany({
        data: toCreate.map(c => ({ userId, name: c.name, type: c.type })),
        skipDuplicates: true,
      })
    }

    // 3. Return all categories and count of new ones
    const allCategories = await this.prisma.category.findMany({
      where: {
        userId,
        OR: uniqueCategories.map(c => ({ name: c.name, type: c.type })),
      },
    })

    return { categories: allCategories, newCount: toCreate.length }
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
