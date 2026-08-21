import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ReimbursementStatus, TransactionType } from '../generated/prisma'
import type { ReimbursementRequest, Prisma } from '../generated/prisma'
import {
  LEDGER_EPSILON,
  creditedTotal,
  derivedStatusOf,
  round2,
} from './reimbursement-ledger'
import type {
  CreateReimbursementDto,
  UpdateReimbursementDto,
  ReimbursementResponseDto,
} from './dto'

type ReimbursementWithRelations = ReimbursementRequest & {
  person: { name: string }
  category: { name: string } | null
  transaction?: {
    id: string
    date: Date
    description: string
    amount: Prisma.Decimal
  }
}

@Injectable()
export class ReimbursementsService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponseDto(
    reimbursement: ReimbursementWithRelations,
    includeTransaction = false
  ): ReimbursementResponseDto {
    const amount = Number(reimbursement.amount)
    const amountReceived = Number(reimbursement.amountReceived)

    const response: ReimbursementResponseDto = {
      id: reimbursement.id,
      transactionId: reimbursement.transactionId,
      personId: reimbursement.personId,
      personName: reimbursement.person.name,
      categoryId: reimbursement.categoryId,
      categoryName: reimbursement.category?.name ?? null,
      amount,
      amountReceived,
      amountRemaining: amount - amountReceived,
      status: reimbursement.status,
      note: reimbursement.note,
      createdAt: reimbursement.createdAt,
      updatedAt: reimbursement.updatedAt,
    }

    if (includeTransaction && reimbursement.transaction) {
      response.transaction = {
        id: reimbursement.transaction.id,
        date: reimbursement.transaction.date,
        description: reimbursement.transaction.description,
        amount: Number(reimbursement.transaction.amount),
      }
    }

    return response
  }

  /**
   * Refuse to owe more on an expense than it cost.
   *
   * Only the frontend capped this, through a `remainingAmount` it computed
   * itself — so any other caller could pile up debts adding to more than the
   * spending they claim to repay, and the deduction would then exceed the
   * expense it applies to.
   *
   * `excludeId` lets an update measure against its siblings rather than
   * against its own former self.
   */
  private async assertWithinTransactionAmount(
    transactionId: string,
    transactionAmount: Prisma.Decimal,
    requestedAmount: number,
    excludeId?: string
  ): Promise<void> {
    const spent = Math.abs(Number(transactionAmount))
    const siblings = await this.prisma.reimbursementRequest.aggregate({
      where: {
        transactionId,
        ...(excludeId && { id: { not: excludeId } }),
      },
      _sum: { amount: true },
    })

    const alreadyClaimed = Number(siblings._sum.amount ?? 0)
    const total = alreadyClaimed + requestedAmount

    if (total - spent > LEDGER_EPSILON) {
      throw new BadRequestException(
        `Reimbursements on this transaction would total ${round2(total)} for a spending of ${round2(spent)}`
      )
    }
  }

  async findAllByUser(
    userId: string,
    filters?: {
      status?: ReimbursementStatus
      includeTransaction?: boolean
    }
  ): Promise<ReimbursementResponseDto[]> {
    const reimbursements = await this.prisma.reimbursementRequest.findMany({
      where: {
        userId,
        ...(filters?.status && { status: filters.status }),
      },
      include: {
        person: { select: { name: true } },
        category: { select: { name: true } },
        ...(filters?.includeTransaction && {
          transaction: {
            select: {
              id: true,
              date: true,
              description: true,
              amount: true,
            },
          },
        }),
      },
      orderBy: { createdAt: 'desc' },
    })

    return reimbursements.map(r =>
      this.toResponseDto(
        r as ReimbursementWithRelations,
        filters?.includeTransaction
      )
    )
  }

  async findByTransaction(
    transactionId: string,
    userId: string
  ): Promise<ReimbursementResponseDto[]> {
    const reimbursements = await this.prisma.reimbursementRequest.findMany({
      where: { transactionId, userId },
      include: {
        person: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return reimbursements.map(r =>
      this.toResponseDto(r as ReimbursementWithRelations)
    )
  }

  async findByPerson(
    personId: string,
    userId: string
  ): Promise<ReimbursementResponseDto[]> {
    const reimbursements = await this.prisma.reimbursementRequest.findMany({
      where: { personId, userId },
      include: {
        person: { select: { name: true } },
        category: { select: { name: true } },
        transaction: {
          select: {
            id: true,
            date: true,
            description: true,
            amount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return reimbursements.map(r =>
      this.toResponseDto(r as ReimbursementWithRelations, true)
    )
  }

  async findOne(
    id: string,
    userId: string,
    includeTransaction = false
  ): Promise<ReimbursementResponseDto> {
    const reimbursement = await this.prisma.reimbursementRequest.findFirst({
      where: { id, userId },
      include: {
        person: { select: { name: true } },
        category: { select: { name: true } },
        ...(includeTransaction && {
          transaction: {
            select: {
              id: true,
              date: true,
              description: true,
              amount: true,
            },
          },
        }),
      },
    })

    if (!reimbursement) {
      throw new NotFoundException(
        `Reimbursement request with ID ${id} not found`
      )
    }

    return this.toResponseDto(
      reimbursement as ReimbursementWithRelations,
      includeTransaction
    )
  }

  async create(
    userId: string,
    dto: CreateReimbursementDto
  ): Promise<ReimbursementResponseDto> {
    // Verify transaction exists and belongs to user
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: dto.transactionId, userId },
    })

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with ID ${dto.transactionId} not found`
      )
    }

    // A reimbursement repays a spending. The target model anchors the whole
    // deduction on that expense — its category, its date, its account — so a
    // request hanging off anything else has nothing to reduce.
    if (transaction.type !== TransactionType.EXPENSE) {
      throw new BadRequestException(
        `Transaction ${dto.transactionId} is not an EXPENSE transaction`
      )
    }

    await this.assertWithinTransactionAmount(
      dto.transactionId,
      transaction.amount,
      dto.amount
    )

    // Verify person exists and belongs to user
    const person = await this.prisma.person.findFirst({
      where: { id: dto.personId, userId },
    })

    if (!person) {
      throw new NotFoundException(`Person with ID ${dto.personId} not found`)
    }

    // Verify category exists if provided
    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, userId },
      })

      if (!category) {
        throw new NotFoundException(
          `Category with ID ${dto.categoryId} not found`
        )
      }
    }

    const reimbursement = await this.prisma.reimbursementRequest.create({
      data: {
        userId,
        transactionId: dto.transactionId,
        personId: dto.personId,
        categoryId: dto.categoryId ?? null,
        amount: dto.amount,
        note: dto.note ?? null,
      },
      include: {
        person: { select: { name: true } },
        category: { select: { name: true } },
      },
    })

    return this.toResponseDto(reimbursement as ReimbursementWithRelations)
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateReimbursementDto
  ): Promise<ReimbursementResponseDto> {
    // Verify reimbursement exists and belongs to user
    const existing = await this.prisma.reimbursementRequest.findFirst({
      where: { id, userId },
      include: {
        transaction: { select: { amount: true } },
        payments: { select: { amount: true, kind: true } },
      },
    })

    if (!existing) {
      throw new NotFoundException(
        `Reimbursement request with ID ${id} not found`
      )
    }

    if (dto.amount !== undefined) {
      await this.assertWithinTransactionAmount(
        existing.transactionId,
        existing.transaction.amount,
        dto.amount,
        id
      )

      // Lowering a debt below what has already been credited to it would
      // leave the ledger claiming more than the debt was ever for, and the
      // derived status would read COMPLETED on a figure that makes no sense.
      const credited = creditedTotal(
        existing.payments.map(payment => ({
          amount: Number(payment.amount),
          kind: payment.kind as 'CASH' | 'WRITE_OFF',
        }))
      )
      if (credited - dto.amount > LEDGER_EPSILON) {
        throw new BadRequestException(
          `Reimbursement already credited ${round2(credited)}, cannot be lowered to ${round2(dto.amount)}`
        )
      }
    }

    // Verify person if being updated
    if (dto.personId) {
      const person = await this.prisma.person.findFirst({
        where: { id: dto.personId, userId },
      })

      if (!person) {
        throw new NotFoundException(`Person with ID ${dto.personId} not found`)
      }
    }

    // Verify category if being updated
    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, userId },
      })

      if (!category) {
        throw new NotFoundException(
          `Category with ID ${dto.categoryId} not found`
        )
      }
    }

    const reimbursement = await this.prisma.reimbursementRequest.update({
      where: { id },
      data: {
        ...(dto.personId !== undefined && { personId: dto.personId }),
        ...(dto.amount !== undefined && {
          amount: dto.amount,
          // The status is a reading of the ledger against the debt, so moving
          // the debt re-reads it: raising a settled one reopens it as PARTIAL.
          status: derivedStatusOf(
            dto.amount,
            creditedTotal(
              existing.payments.map(payment => ({
                amount: Number(payment.amount),
                kind: payment.kind as 'CASH' | 'WRITE_OFF',
              }))
            )
          ),
        }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
      include: {
        person: { select: { name: true } },
        category: { select: { name: true } },
      },
    })

    return this.toResponseDto(reimbursement as ReimbursementWithRelations)
  }

  // REMOVED: receivePayment. Crediting `amountReceived` outside the settlement
  // ledger left the amount unbacked by any income transaction and beyond the
  // reach of `SettlementsService.delete`. Use a settlement instead — it records
  // which transaction the money came from, and reverses exactly.

  async delete(id: string, userId: string): Promise<void> {
    // Verify reimbursement exists and belongs to user
    const existing = await this.prisma.reimbursementRequest.findFirst({
      where: { id, userId },
    })

    if (!existing) {
      throw new NotFoundException(
        `Reimbursement request with ID ${id} not found`
      )
    }

    await this.prisma.reimbursementRequest.delete({
      where: { id },
    })
  }
}
