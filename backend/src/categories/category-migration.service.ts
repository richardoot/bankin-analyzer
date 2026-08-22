import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { Category, Prisma } from '../generated/prisma'
import {
  defaultMigrationActions,
  planCategoryMigration,
  MigrationPlanError,
  NO_SUBCATEGORY,
  type MigrationAction,
  type MigrationPlan,
} from './category-migration.plan'
import type {
  CategoryMigrationPreviewDto,
  CategoryMigrationResultDto,
} from './dto'

/**
 * Moving one category's transactions into another.
 *
 * Kept out of `CategoriesService`, which is CRUD: the decisions live in
 * `category-migration.plan.ts` and this class only carries them out. Everything
 * below is the database half — ownership checks, and one transaction that
 * either does the whole move or none of it.
 *
 * The source category is never deleted, even when it ends up empty. Emptying
 * and removing are separate intentions, and removing already has its own
 * confirmation flow.
 */
@Injectable()
export class CategoryMigrationService {
  constructor(private readonly prisma: PrismaService) {}

  private async findOwned(userId: string, id: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({
      where: { id, userId },
    })
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`)
    }
    return category
  }

  /**
   * The two categories, checked as a pair.
   *
   * A category has a type, and the transactions inside it do too, so pouring
   * expenses into an income category would produce rows filed under a heading
   * of the wrong sign — visible nowhere the user would think to look.
   */
  private async findPair(
    userId: string,
    sourceId: string,
    targetId: string
  ): Promise<{ source: Category; target: Category }> {
    if (sourceId === targetId) {
      throw new BadRequestException('A category cannot be moved into itself')
    }
    const [source, target] = await Promise.all([
      this.findOwned(userId, sourceId),
      this.findOwned(userId, targetId),
    ])
    if (source.type !== target.type) {
      throw new BadRequestException(
        `Cannot move a ${source.type} category into an ${target.type} one`
      )
    }
    return { source, target }
  }

  /** Subcategories of a category, with how many of its transactions use each. */
  private async readSubcategories(
    userId: string,
    categoryId: string
  ): Promise<{ id: string; name: string; transactionCount: number }[]> {
    const subcategories = await this.prisma.subcategory.findMany({
      where: { categoryId, userId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    const counts = await this.prisma.transaction.groupBy({
      by: ['subcategoryId'],
      where: { categoryId, userId, subcategoryId: { not: null } },
      _count: { _all: true },
    })
    const countById = new Map(counts.map(c => [c.subcategoryId, c._count._all]))

    return subcategories.map(s => ({
      ...s,
      transactionCount: countById.get(s.id) ?? 0,
    }))
  }

  async preview(
    userId: string,
    sourceId: string,
    targetId: string
  ): Promise<CategoryMigrationPreviewDto> {
    const { source, target } = await this.findPair(userId, sourceId, targetId)

    const [
      sourceSubcategories,
      targetSubcategories,
      uncategorizedCount,
      entries,
    ] = await Promise.all([
      this.readSubcategories(userId, sourceId),
      this.prisma.subcategory.findMany({
        where: { categoryId: targetId, userId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.transaction.count({
        where: { categoryId: sourceId, userId, subcategoryId: null },
      }),
      this.prisma.budgetPlanEntry.findMany({
        where: { categoryId: sourceId, budgetPlan: { userId } },
        select: {
          amount: true,
          budgetPlan: {
            select: { name: true, startDate: true, endDate: true },
          },
        },
        orderBy: { budgetPlan: { startDate: 'desc' } },
      }),
    ])

    const takenNames = new Set(targetSubcategories.map(s => s.name))

    return {
      sourceCategoryId: source.id,
      sourceCategoryName: source.name,
      targetCategoryId: target.id,
      targetCategoryName: target.name,
      type: source.type,
      sourceSubcategories: sourceSubcategories.map(s => ({
        ...s,
        // Surfaced so the screen can explain why that line has no choice.
        nameTakenInTarget: takenNames.has(s.name),
      })),
      targetSubcategories,
      uncategorizedCount,
      defaultActions: defaultMigrationActions(
        sourceSubcategories,
        targetSubcategories,
        uncategorizedCount
      ),
      // The plan lines of the source keep their amount but lose the spending
      // that faced them — the one effect not visible in the mapping table.
      budgetPlanEntries: entries.map(entry => ({
        planName: entry.budgetPlan.name,
        amount: entry.amount.toNumber(),
        startDate: entry.budgetPlan.startDate,
        endDate: entry.budgetPlan.endDate,
      })),
    }
  }

  async migrate(
    userId: string,
    sourceId: string,
    targetId: string,
    actions: MigrationAction[]
  ): Promise<CategoryMigrationResultDto> {
    const { source, target } = await this.findPair(userId, sourceId, targetId)

    const [sourceSubcategories, targetSubcategories, uncategorizedCount] =
      await Promise.all([
        this.readSubcategories(userId, sourceId),
        this.prisma.subcategory.findMany({
          where: { categoryId: targetId, userId },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.transaction.count({
          where: { categoryId: sourceId, userId, subcategoryId: null },
        }),
      ])

    let plan: MigrationPlan
    try {
      plan = planCategoryMigration({
        sourceSubcategories,
        targetSubcategories,
        uncategorizedCount,
        actions,
      })
    } catch (error) {
      // A rejected plan is the user's arrangement being impossible, not a bug.
      if (error instanceof MigrationPlanError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }

    const movedTransactions = await this.prisma.$transaction(async tx =>
      this.applyPlan(tx, userId, sourceId, targetId, plan)
    )

    return {
      sourceCategoryId: source.id,
      targetCategoryId: target.id,
      movedTransactions,
      movedSubcategories: plan.movedSubcategoryIds.length,
      mergedSubcategories: plan.merges.length,
      keptTransactions: plan.keptTransactionCount,
      keptSubcategories: plan.keptSubcategoryIds.length,
      // Emptying a category is not asking for it to go: it stays either way,
      // and this only reports which of the two happened.
      sourceLeftEmpty:
        plan.keptTransactionCount === 0 && plan.keptSubcategoryIds.length === 0,
    }
  }

  private async applyPlan(
    tx: Prisma.TransactionClient,
    userId: string,
    sourceId: string,
    targetId: string,
    plan: MigrationPlan
  ): Promise<number> {
    let moved = 0

    for (const merge of plan.merges) {
      // The denormalized label travels with the row: the dashboard groups on
      // it, so leaving the old one behind would show a heading the destination
      // category does not have.
      const { count } = await tx.transaction.updateMany({
        where: {
          userId,
          categoryId: sourceId,
          subcategoryId: merge.sourceSubcategoryId,
        },
        data: {
          categoryId: targetId,
          subcategoryId: merge.targetSubcategoryId,
          subcategory: merge.targetSubcategoryName,
        },
      })
      moved += count
      // Now empty, and keeping it would leave a duplicate name in the source.
      await tx.subcategory.delete({ where: { id: merge.sourceSubcategoryId } })
    }

    if (plan.movedSubcategoryIds.length > 0) {
      const { count } = await tx.transaction.updateMany({
        where: {
          userId,
          categoryId: sourceId,
          subcategoryId: { in: plan.movedSubcategoryIds },
        },
        data: { categoryId: targetId },
      })
      moved += count
      // Reparented rather than recreated, so ids and labels stay valid.
      await tx.subcategory.updateMany({
        where: { id: { in: plan.movedSubcategoryIds }, userId },
        data: { categoryId: targetId },
      })
    }

    if (plan.movesUncategorized) {
      const target = plan.uncategorizedTarget
      const { count } = await tx.transaction.updateMany({
        where: { userId, categoryId: sourceId, subcategoryId: NO_SUBCATEGORY },
        data: target
          ? {
              categoryId: targetId,
              subcategoryId: target.id,
              subcategory: target.name,
            }
          : { categoryId: targetId },
      })
      moved += count
    }

    return moved
  }
}
