import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type {
  BudgetPlanResponseDto,
  BudgetPlanSummaryDto,
  CreateBudgetPlanDto,
  CreateBudgetPlanEntryDto,
  UpdateBudgetPlanDto,
} from './dto'

@Injectable()
export class BudgetPlansService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Public API ───────────────────────────────────────────────────────────

  async findAllForUser(userId: string): Promise<BudgetPlanSummaryDto[]> {
    const plans = await this.prisma.budgetPlan.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
      include: { entries: true },
    })

    return plans.map(p => ({
      id: p.id,
      name: p.name,
      startDate: this.formatDate(p.startDate),
      endDate: this.formatDate(p.endDate),
      monthCount: this.monthCount(p.startDate, p.endDate),
      totalAmount: this.round(
        p.entries.reduce((sum, e) => sum + Number(e.amount), 0)
      ),
      entryCount: p.entries.length,
      createdAt: p.createdAt.toISOString(),
    }))
  }

  async findCurrentForUser(
    userId: string
  ): Promise<BudgetPlanResponseDto | null> {
    const today = this.startOfDayUtc(new Date())
    const plan = await this.prisma.budgetPlan.findFirst({
      where: {
        userId,
        startDate: { lte: today },
        endDate: { gte: today },
      },
      include: this.entriesInclude(),
      orderBy: { startDate: 'desc' },
    })

    return plan ? this.toResponseDto(plan) : null
  }

  async findOne(
    userId: string,
    planId: string
  ): Promise<BudgetPlanResponseDto> {
    const plan = await this.prisma.budgetPlan.findFirst({
      where: { id: planId, userId },
      include: this.entriesInclude(),
    })
    if (!plan) {
      throw new NotFoundException(`Budget plan ${planId} not found`)
    }
    return this.toResponseDto(plan)
  }

  async create(
    userId: string,
    dto: CreateBudgetPlanDto
  ): Promise<BudgetPlanResponseDto> {
    const startDate = this.parseDate(dto.startDate, 'startDate')
    const endDate = this.parseDate(dto.endDate, 'endDate')
    this.assertMonthBoundaries(startDate, endDate)
    await this.assertNoOverlap(userId, startDate, endDate)
    await this.assertCategoriesOwned(userId, dto.entries)

    const plan = await this.prisma.budgetPlan.create({
      data: {
        userId,
        name: dto.name.trim(),
        startDate,
        endDate,
        savingsTarget: dto.savingsTarget ?? null,
        referenceIncome: dto.referenceIncome ?? null,
        entries: {
          create: dto.entries.map(e => ({
            categoryId: e.categoryId,
            amount: e.amount,
          })),
        },
      },
      include: this.entriesInclude(),
    })

    return this.toResponseDto(plan)
  }

  async update(
    userId: string,
    planId: string,
    dto: UpdateBudgetPlanDto
  ): Promise<BudgetPlanResponseDto> {
    const existing = await this.prisma.budgetPlan.findFirst({
      where: { id: planId, userId },
    })
    if (!existing) {
      throw new NotFoundException(`Budget plan ${planId} not found`)
    }

    const newStart = dto.startDate
      ? this.parseDate(dto.startDate, 'startDate')
      : existing.startDate
    const newEnd = dto.endDate
      ? this.parseDate(dto.endDate, 'endDate')
      : existing.endDate

    if (dto.startDate || dto.endDate) {
      this.assertMonthBoundaries(newStart, newEnd)
      await this.assertNoOverlap(userId, newStart, newEnd, planId)
    }

    if (dto.entries) {
      await this.assertCategoriesOwned(userId, dto.entries)
    }

    const plan = await this.prisma.$transaction(async tx => {
      await tx.budgetPlan.update({
        where: { id: planId },
        data: {
          name: dto.name?.trim() ?? existing.name,
          startDate: newStart,
          endDate: newEnd,
          // `undefined` leaves the column alone, `null` clears it — so an
          // update that only touches the entries keeps the equation intact.
          ...(dto.savingsTarget !== undefined
            ? { savingsTarget: dto.savingsTarget }
            : {}),
          ...(dto.referenceIncome !== undefined
            ? { referenceIncome: dto.referenceIncome }
            : {}),
        },
      })

      if (dto.entries) {
        await tx.budgetPlanEntry.deleteMany({ where: { budgetPlanId: planId } })
        if (dto.entries.length > 0) {
          await tx.budgetPlanEntry.createMany({
            data: dto.entries.map(e => ({
              budgetPlanId: planId,
              categoryId: e.categoryId,
              amount: e.amount,
            })),
          })
        }
      }

      return tx.budgetPlan.findUniqueOrThrow({
        where: { id: planId },
        include: this.entriesInclude(),
      })
    })

    return this.toResponseDto(plan)
  }

  async delete(userId: string, planId: string): Promise<void> {
    const existing = await this.prisma.budgetPlan.findFirst({
      where: { id: planId, userId },
      select: { id: true },
    })
    if (!existing) {
      throw new NotFoundException(`Budget plan ${planId} not found`)
    }
    await this.prisma.budgetPlan.delete({ where: { id: planId } })
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private entriesInclude() {
    return {
      entries: {
        include: { category: true },
        orderBy: { category: { name: 'asc' as const } },
      },
    }
  }

  private toResponseDto(plan: {
    id: string
    name: string
    startDate: Date
    endDate: Date
    savingsTarget?: { toString(): string } | number | null
    referenceIncome?: { toString(): string } | number | null
    createdAt: Date
    updatedAt: Date
    entries: {
      id: string
      categoryId: string
      amount: { toString(): string } | number
      category: { name: string; icon: string | null }
    }[]
  }): BudgetPlanResponseDto {
    const entries = plan.entries.map(e => ({
      id: e.id,
      categoryId: e.categoryId,
      categoryName: e.category.name,
      categoryIcon: e.category.icon ?? null,
      amount: Number(e.amount),
    }))
    const totalAmount = this.round(
      entries.reduce((sum, e) => sum + e.amount, 0)
    )

    const monthCount = this.monthCount(plan.startDate, plan.endDate)
    const savingsTarget =
      plan.savingsTarget === null || plan.savingsTarget === undefined
        ? null
        : Number(plan.savingsTarget)
    const referenceIncome =
      plan.referenceIncome === null || plan.referenceIncome === undefined
        ? null
        : Number(plan.referenceIncome)

    // What the plan leaves for one-off projects. Never clamped: a negative
    // reserve means the plan does not add up, and that is the whole point.
    const projectReserve =
      savingsTarget === null || referenceIncome === null
        ? null
        : this.round(
            (referenceIncome - savingsTarget - totalAmount) * monthCount
          )

    return {
      id: plan.id,
      name: plan.name,
      startDate: this.formatDate(plan.startDate),
      endDate: this.formatDate(plan.endDate),
      monthCount,
      totalAmount,
      savingsTarget,
      referenceIncome,
      projectReserve,
      entries,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    }
  }

  /** Parse a YYYY-MM-DD date string into a UTC midnight Date. */
  private parseDate(value: string, field: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) {
      throw new BadRequestException(
        `${field} must be a YYYY-MM-DD date (got "${value}")`
      )
    }
    const year = Number(match[1])
    const month = Number(match[2]) - 1
    const day = Number(match[3])
    const date = new Date(Date.UTC(year, month, day))
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException(`${field} is not a valid calendar date`)
    }
    return date
  }

  private formatDate(date: Date): string {
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  private startOfDayUtc(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    )
  }

  /**
   * Throws unless startDate is the 1st of a month, endDate is the last day
   * of a month, and endDate >= startDate.
   */
  private assertMonthBoundaries(startDate: Date, endDate: Date): void {
    if (startDate.getUTCDate() !== 1) {
      throw new BadRequestException(
        'startDate must be the 1st of a month (whole-month plans only)'
      )
    }
    const dayAfterEnd = new Date(
      Date.UTC(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth(),
        endDate.getUTCDate() + 1
      )
    )
    if (dayAfterEnd.getUTCDate() !== 1) {
      throw new BadRequestException(
        'endDate must be the last day of a month (whole-month plans only)'
      )
    }
    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('endDate must be on or after startDate')
    }
  }

  /** Number of whole months between (inclusive) startDate and endDate. */
  private monthCount(startDate: Date, endDate: Date): number {
    const months =
      (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
      (endDate.getUTCMonth() - startDate.getUTCMonth()) +
      1
    return Math.max(1, months)
  }

  /**
   * Throws ConflictException if any other plan from the same user overlaps
   * the given range. Two ranges [aStart..aEnd] and [bStart..bEnd] overlap
   * iff aStart <= bEnd and aEnd >= bStart.
   */
  private async assertNoOverlap(
    userId: string,
    startDate: Date,
    endDate: Date,
    excludePlanId?: string
  ): Promise<void> {
    const overlap = await this.prisma.budgetPlan.findFirst({
      where: {
        userId,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        ...(excludePlanId ? { NOT: { id: excludePlanId } } : {}),
      },
      select: { id: true, name: true, startDate: true, endDate: true },
    })
    if (overlap) {
      throw new ConflictException(
        `Plan range overlaps existing plan "${overlap.name}" (${this.formatDate(overlap.startDate)} → ${this.formatDate(overlap.endDate)})`
      )
    }
  }

  /**
   * Throws BadRequestException if any entry references a category that does
   * not belong to the user, or if duplicate categoryIds are provided. Empty
   * entry list is allowed.
   */
  private async assertCategoriesOwned(
    userId: string,
    entries: CreateBudgetPlanEntryDto[]
  ): Promise<void> {
    if (entries.length === 0) return

    const ids = entries.map(e => e.categoryId)
    const uniqueIds = new Set(ids)
    if (uniqueIds.size !== ids.length) {
      throw new BadRequestException(
        'Entries must not contain duplicate categoryIds'
      )
    }

    const found = await this.prisma.category.findMany({
      where: { id: { in: Array.from(uniqueIds) }, userId },
      select: { id: true },
    })
    const foundIds = new Set(found.map(c => c.id))
    const missing = Array.from(uniqueIds).filter(id => !foundIds.has(id))
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown or non-owned categoryIds: ${missing.join(', ')}`
      )
    }
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100
  }
}
