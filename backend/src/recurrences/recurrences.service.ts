import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import * as Sentry from '@sentry/nestjs'
import { PrismaService } from '../prisma/prisma.service'
import { recordEvent, timed } from '../common/metrics'
import { merchantKey } from '../ai-suggestions/merchant-memory'
import { Prisma } from '../generated/prisma'
import type { Subscription, SubscriptionState } from '../generated/prisma'
import {
  recomputeRecurrences,
  refreshRecurrences,
} from './recurrence.recompute'
import type {
  LinkTransactionDto,
  MarkTransactionRecurringDto,
  RenameRecurrenceDto,
  RecurrenceDto,
  RecurrenceListDto,
  SetRecurrenceDecisionDto,
  SubscriptionSummaryDto,
} from './dto'

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

@Injectable()
export class RecurrencesService {
  private readonly logger = new Logger(RecurrencesService.name)

  constructor(private readonly prisma: PrismaService) {}

  /** Detect again and replace the user's recurrences. */
  async recompute(userId: string): Promise<void> {
    await recomputeRecurrences(this.prisma, userId)
  }

  /**
   * Rebuild the cache if the ledger changed since it was built, or a day
   * passed — what every reader of the cache calls first. Database triggers
   * keep track of the changes, whichever path made them.
   */
  async refresh(userId: string): Promise<void> {
    const { result: rebuilt, durationMs } = await timed(
      'recurrences',
      'recurrence refresh',
      () => refreshRecurrences(this.prisma, userId)
    )
    // Only a rebuild is worth a line: the freshness check alone is one read.
    if (rebuilt) {
      recordEvent(this.logger, 'recurrence_rebuild', { userId, durationMs })
    }
  }

  /**
   * The same, for a reader whose own answer must not fail because of it —
   * the dashboard, a tag's analysis, a sync. A cache one step behind is
   * better than no answer.
   */
  async refreshQuietly(userId: string): Promise<void> {
    try {
      await this.refresh(userId)
    } catch (error) {
      // Swallowed for the reader, never for us: an answer built on a stale
      // cache must still show up in Sentry.
      Sentry.captureException(error, { tags: { feature: 'recurrences' } })
      this.logger.error(
        `Recurrence refresh failed for user ${userId}`,
        error instanceof Error ? error.stack : String(error)
      )
    }
  }

  async list(userId: string): Promise<RecurrenceListDto> {
    await this.refresh(userId)
    const [rows, subscriptions] = await Promise.all([
      this.prisma.recurrence.findMany({
        where: { userId },
        orderBy: [{ monthlyEquivalent: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.subscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const categoryIds = [
      ...new Set(rows.flatMap(r => (r.categoryId ? [r.categoryId] : []))),
    ]
    const subcategoryIds = [
      ...new Set(rows.flatMap(r => (r.subcategoryId ? [r.subcategoryId] : []))),
    ]
    const [categories, subcategories, divisorById] = await Promise.all([
      this.prisma.category.findMany({
        where: { userId, id: { in: categoryIds } },
        select: { id: true, name: true, icon: true, defaultNature: true },
      }),
      this.prisma.subcategory.findMany({
        where: { userId, id: { in: subcategoryIds } },
        select: { id: true, name: true, nature: true },
      }),
      this.latestDivisors(userId),
    ])
    const categoryById = new Map(categories.map(c => [c.id, c]))
    const subcategoryById = new Map(subcategories.map(s => [s.id, s]))
    const subscriptionById = new Map(subscriptions.map(s => [s.id, s]))

    const recurrences: RecurrenceDto[] = rows.map(row => {
      const category = row.categoryId
        ? categoryById.get(row.categoryId)
        : undefined
      const subcategory = row.subcategoryId
        ? subcategoryById.get(row.subcategoryId)
        : undefined
      const subscription = row.subscriptionId
        ? subscriptionById.get(row.subscriptionId)
        : undefined
      return {
        id: row.id,
        subscriptionId: row.subscriptionId,
        merchantKey: row.merchantKey,
        amountBucket: row.amountBucket,
        label: row.label,
        name: row.name || row.label,
        named: Boolean(subscription?.name),
        categoryId: category ? row.categoryId : null,
        categoryName: category?.name ?? null,
        categoryIcon: category?.icon ?? null,
        subcategoryId: subcategory ? row.subcategoryId : null,
        subcategoryName: subcategory?.name ?? null,
        nature: subcategory?.nature ?? category?.defaultNature ?? null,
        period: row.period,
        amount: Number(row.amount),
        monthlyEquivalent: Number(row.monthlyEquivalent),
        occurrences: row.occurrences,
        totalPaid: Number(row.totalPaid),
        firstDate: row.firstDate.toISOString(),
        lastDate: row.lastDate.toISOString(),
        nextExpected: row.nextExpected.toISOString(),
        status: row.status,
        confirmed: subscription?.state === 'CONFIRMED',
        divisor: divisorById.get(row.id) ?? 1,
      }
    })

    const active = recurrences.filter(r => r.status === 'ACTIVE')
    const byCategory = new Map<
      string,
      { categoryId: string | null; name: string | null; monthlyTotal: number }
    >()
    const byNature = { essential: 0, pleasure: 0, unclassified: 0 }
    for (const recurrence of active) {
      const key = recurrence.categoryId ?? ''
      const entry = byCategory.get(key) ?? {
        categoryId: recurrence.categoryId,
        name: recurrence.categoryName,
        monthlyTotal: 0,
      }
      entry.monthlyTotal += recurrence.monthlyEquivalent
      byCategory.set(key, entry)
      if (recurrence.nature === 'ESSENTIAL') {
        byNature.essential += recurrence.monthlyEquivalent
      } else if (recurrence.nature === 'PLEASURE') {
        byNature.pleasure += recurrence.monthlyEquivalent
      } else {
        byNature.unclassified += recurrence.monthlyEquivalent
      }
    }

    const withSeries = new Set(rows.flatMap(r => r.subscriptionId ?? []))
    return {
      recurrences,
      monthlyTotal: roundCents(
        active.reduce((sum, r) => sum + r.monthlyEquivalent, 0)
      ),
      byCategory: [...byCategory.values()]
        .map(entry => ({
          ...entry,
          monthlyTotal: roundCents(entry.monthlyTotal),
        }))
        .sort((a, b) => b.monthlyTotal - a.monthlyTotal),
      byNature: {
        essential: roundCents(byNature.essential),
        pleasure: roundCents(byNature.pleasure),
        unclassified: roundCents(byNature.unclassified),
      },
      dismissed: subscriptions
        .filter(s => s.state === 'DISMISSED')
        .map(summarize),
      // Followed, but no series answers them any more: said, never lost.
      orphans: subscriptions
        .filter(s => s.state === 'CONFIRMED' && !withSeries.has(s.id))
        .map(summarize),
      computedAt: rows[0]?.computedAt.toISOString() ?? null,
    }
  }

  /**
   * By recurrence, the divisor of the account its latest charge was paid
   * from: what tells a joint-account series apart in the list.
   */
  private async latestDivisors(userId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<
      { recurrence_id: string; divisor: number }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (rt.recurrence_id)
        rt.recurrence_id, a.divisor
      FROM app.recurrence_transactions rt
      JOIN app.recurrences r ON r.id = rt.recurrence_id
      JOIN app.transactions t ON t.id = rt.transaction_id
      JOIN app.accounts a ON a.id = t.account_id
      WHERE r.user_id = ${userId}
      ORDER BY rt.recurrence_id, t.date DESC, t.id DESC
    `)
    return new Map(rows.map(row => [row.recurrence_id, Number(row.divisor)]))
  }

  /**
   * The subscription a series key names, made on the user's first gesture
   * about it. Found by the spellings and prices it recognises, which
   * recomputes widen; a key for every price finds or makes one covering
   * every price.
   */
  private async subscriptionFor(
    userId: string,
    key: { merchantKey: string; amountBucket: number | null },
    born: { state: SubscriptionState }
  ): Promise<Subscription> {
    const candidates = await this.prisma.subscription.findMany({
      where: {
        userId,
        merchantKeys: { has: key.merchantKey },
        ...(key.amountBucket === null
          ? { amountBuckets: { isEmpty: true } }
          : {
              OR: [
                { amountBuckets: { has: key.amountBucket } },
                { amountBuckets: { isEmpty: true } },
              ],
            }),
      },
      orderBy: { createdAt: 'asc' },
    })
    // A subscription for this very price before one for every price.
    const exact =
      key.amountBucket === null
        ? candidates[0]
        : (candidates.find(s =>
            s.amountBuckets.includes(key.amountBucket ?? -1)
          ) ?? candidates[0])
    if (exact) return exact
    return this.prisma.subscription.create({
      data: {
        userId,
        state: born.state,
        merchantKeys: [key.merchantKey],
        amountBuckets: key.amountBucket === null ? [] : [key.amountBucket],
      },
    })
  }

  /** The subscription behind a listed series: its own, or one made for it. */
  private async subscriptionOfSeries(
    userId: string,
    key: { merchantKey: string; amountBucket: number | null },
    born: { state: SubscriptionState }
  ): Promise<Subscription> {
    if (key.amountBucket !== null) {
      const row = await this.prisma.recurrence.findFirst({
        where: {
          userId,
          merchantKey: key.merchantKey,
          amountBucket: key.amountBucket,
        },
        select: { subscription: true },
      })
      if (row?.subscription) return row.subscription
    }
    return this.subscriptionFor(userId, key, born)
  }

  /**
   * Follow or set aside a series, then recompute so the list and the
   * dashboard reflect it at once.
   */
  async setDecision(
    userId: string,
    dto: SetRecurrenceDecisionDto
  ): Promise<RecurrenceListDto> {
    const subscription = await this.subscriptionOfSeries(
      userId,
      { merchantKey: dto.merchantKey, amountBucket: dto.amountBucket ?? null },
      { state: dto.decision }
    )
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { state: dto.decision },
    })
    await this.recompute(userId)
    return this.list(userId)
  }

  /**
   * The user says this expense is a recurring charge — typically an annual
   * plan paid once so far, which detection cannot see until it renews.
   * A followed subscription of its merchant and price, on the rhythm the
   * user gave, which the renewal will join.
   */
  async markTransaction(
    userId: string,
    dto: MarkTransactionRecurringDto
  ): Promise<RecurrenceListDto> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: dto.transactionId, userId },
      select: { description: true, amount: true, type: true },
    })
    if (!transaction) {
      throw new NotFoundException(
        `Transaction with ID ${dto.transactionId} not found`
      )
    }
    const amount = Number(transaction.amount)
    if (transaction.type !== 'EXPENSE' || amount >= 0) {
      throw new BadRequestException('Only an expense can be a recurring charge')
    }
    const key = merchantKey(transaction.description)
    if (key === '') {
      throw new BadRequestException(
        'This label names no merchant to follow the charge by'
      )
    }

    const subscription = await this.subscriptionFor(
      userId,
      { merchantKey: key, amountBucket: Math.round(Math.abs(amount)) },
      { state: 'CONFIRMED' }
    )
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { state: 'CONFIRMED', period: dto.period },
    })
    await this.recompute(userId)
    return this.list(userId)
  }

  /**
   * Name a series: the user's name replaces the one read from its labels
   * everywhere it shows. An empty name goes back to the labels. Naming a
   * series nobody had a say about makes it a followed subscription.
   */
  async rename(
    userId: string,
    dto: RenameRecurrenceDto
  ): Promise<RecurrenceListDto> {
    const subscription = await this.subscriptionOfSeries(
      userId,
      { merchantKey: dto.merchantKey, amountBucket: dto.amountBucket ?? null },
      { state: 'CONFIRMED' }
    )
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { name: dto.name?.trim() || null },
    })
    await this.recompute(userId)
    return this.list(userId)
  }

  /**
   * Attach an expense to a series it does not look like — a renewal paid
   * another way, under another label, at another price. Only an expense of
   * the user's own, to a series the user can see.
   */
  async link(
    userId: string,
    dto: LinkTransactionDto
  ): Promise<RecurrenceListDto> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: dto.transactionId, userId },
      select: { type: true, amount: true },
    })
    if (!transaction) {
      throw new NotFoundException(
        `Transaction with ID ${dto.transactionId} not found`
      )
    }
    if (transaction.type !== 'EXPENSE' || Number(transaction.amount) >= 0) {
      throw new BadRequestException(
        'Only an expense can join a recurring charge'
      )
    }
    const series = await this.prisma.recurrence.findFirst({
      where: {
        userId,
        merchantKey: dto.merchantKey,
        amountBucket: dto.amountBucket,
      },
      select: { id: true },
    })
    if (!series) throw new NotFoundException('Recurring charge not found')

    const subscription = await this.subscriptionOfSeries(
      userId,
      { merchantKey: dto.merchantKey, amountBucket: dto.amountBucket },
      { state: 'CONFIRMED' }
    )
    await this.prisma.subscriptionLink.upsert({
      where: { transactionId: dto.transactionId },
      create: {
        userId,
        transactionId: dto.transactionId,
        subscriptionId: subscription.id,
      },
      update: { subscriptionId: subscription.id },
    })
    await this.recompute(userId)
    return this.list(userId)
  }

  /** Detach an expense: it goes back to what detection makes of it. */
  async unlink(
    userId: string,
    transactionId: string
  ): Promise<RecurrenceListDto> {
    await this.prisma.subscriptionLink.deleteMany({
      where: { userId, transactionId },
    })
    await this.recompute(userId)
    return this.list(userId)
  }

  /**
   * Forget a subscription — a dismissal taken back, a followed one no
   * series answers any more. Its series, if any, goes back to what
   * detection says; the payments attached to it are detached.
   */
  async deleteSubscription(
    userId: string,
    id: string
  ): Promise<RecurrenceListDto> {
    const { count } = await this.prisma.subscription.deleteMany({
      where: { id, userId },
    })
    if (count === 0) throw new NotFoundException('Subscription not found')
    await this.recompute(userId)
    return this.list(userId)
  }
}

function summarize(subscription: Subscription): SubscriptionSummaryDto {
  return {
    id: subscription.id,
    name: subscription.name ?? subscription.merchantKeys[0] ?? '',
    state: subscription.state,
    createdAt: subscription.createdAt.toISOString(),
  }
}
