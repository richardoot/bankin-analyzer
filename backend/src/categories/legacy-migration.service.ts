import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { MigrationPlanError } from './category-migration.plan'
import {
  LegacyCategoryNotFound,
  applyLegacyPlan,
  describeSideEffects,
  readLegacyOverview,
  readLegacySource,
  readTargets,
} from './legacy-migration.apply'
import { planLegacyMigration } from './legacy-migration.plan'
import type { LegacyDecision } from './legacy-migration.plan'
import type {
  LegacyMigrationPreviewDto,
  LegacyMigrationResultDto,
  LegacyOverviewDto,
} from './dto'

/**
 * The migration assistant: what is left from before the catalogue, where
 * each piece most likely goes, what a given arrangement would do, and doing
 * it. Thin on purpose — the decisions are in `legacy-migration.plan.ts`, the
 * database work in `legacy-migration.apply.ts`, both shared with the script
 * that replays a mapping file on a restored copy of production.
 */
@Injectable()
export class LegacyMigrationService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(userId: string): Promise<LegacyOverviewDto> {
    const categories = await readLegacyOverview(this.prisma, userId)
    return {
      categories,
      totalTransactions: categories.reduce(
        (sum, c) => sum + c.transactionCount,
        0
      ),
    }
  }

  /** The user's tags among `ids`, so a decision cannot name someone else's. */
  private async assertOwnedTags(
    userId: string,
    decisions: LegacyDecision[]
  ): Promise<void> {
    const ids = [
      ...new Set(
        decisions.map(d => d.tagId).filter((id): id is string => !!id)
      ),
    ]
    if (ids.length === 0) return
    const owned = await this.prisma.tag.findMany({
      where: { userId, id: { in: ids } },
      select: { id: true },
    })
    const missing = ids.filter(id => !owned.some(tag => tag.id === id))
    if (missing.length > 0) {
      throw new NotFoundException(`Tag ${missing[0]} not found`)
    }
  }

  async preview(
    userId: string,
    categoryId: string,
    decisions: LegacyDecision[]
  ): Promise<LegacyMigrationPreviewDto> {
    await this.assertOwnedTags(userId, decisions)
    const [source, targets] = await this.read(userId, categoryId)
    const plan = this.plan(source, targets, decisions)
    const effects = await describeSideEffects(
      this.prisma,
      userId,
      source,
      plan,
      targets
    )

    return {
      sourceCategoryId: source.id,
      sourceCategoryName: source.name,
      moves: plan.moves.map(move => ({
        sourceSubcategoryId: move.sourceSubcategoryId,
        sourceSubcategoryName: move.sourceSubcategoryName,
        transactionCount: move.transactionCount,
        categoryName: move.filing.categoryName,
        subcategoryName: move.filing.subcategory?.name ?? null,
        createsSubcategory: move.filing.subcategory?.kind === 'create',
        reparentsSubcategory: move.filing.subcategory?.kind === 'reparent',
        changesType: move.filing.type !== source.type,
        tagId: move.tagId,
      })),
      unfiles: plan.unfiles.map(unfile => ({
        sourceSubcategoryId: unfile.sourceSubcategoryId,
        sourceSubcategoryName: unfile.sourceSubcategoryName,
        transactionCount: unfile.transactionCount,
        tagId: unfile.tagId,
      })),
      keptTransactions: plan.keptTransactionCount,
      movedTransactions: plan.movedTransactionCount,
      unfiledTransactions: plan.unfiledTransactionCount,
      typeChangedTransactions: plan.typeChangedTransactionCount,
      deletesSourceCategory: plan.deletesSourceCategory,
      ...effects,
    }
  }

  async migrate(
    userId: string,
    categoryId: string,
    decisions: LegacyDecision[]
  ): Promise<LegacyMigrationResultDto> {
    await this.assertOwnedTags(userId, decisions)

    const outcome = await this.prisma.$transaction(async tx => {
      const [source, targets] = await Promise.all([
        this.readSource(tx, userId, categoryId),
        readTargets(tx, userId),
      ])
      const plan = this.plan(source, targets, decisions)
      return applyLegacyPlan(tx, userId, source, plan, targets)
    })

    return { sourceCategoryId: categoryId, ...outcome }
  }

  private async read(userId: string, categoryId: string) {
    return Promise.all([
      this.readSource(this.prisma, userId, categoryId),
      readTargets(this.prisma, userId),
    ])
  }

  private async readSource(
    client: Parameters<typeof readLegacySource>[0],
    userId: string,
    categoryId: string
  ) {
    try {
      return await readLegacySource(client, userId, categoryId)
    } catch (error) {
      if (error instanceof LegacyCategoryNotFound) {
        throw new NotFoundException(error.message)
      }
      throw error
    }
  }

  private plan(
    source: Awaited<ReturnType<typeof readLegacySource>>,
    targets: Awaited<ReturnType<typeof readTargets>>,
    decisions: LegacyDecision[]
  ) {
    try {
      return planLegacyMigration(source, targets, decisions)
    } catch (error) {
      // A rejected plan is the user's arrangement being impossible, not a bug.
      if (error instanceof MigrationPlanError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }
  }
}
