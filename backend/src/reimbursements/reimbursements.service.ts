import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ReimbursementStatus, TransactionType } from '../generated/prisma'
import type {
  ReimbursementRequest,
  Prisma,
  PaymentKind,
} from '../generated/prisma'
import {
  LEDGER_EPSILON,
  creditedTotal,
  derivedStatusOf,
  round2,
  toLedgerEntries,
} from './reimbursement-ledger'
import type {
  CreateReimbursementDto,
  UpdateReimbursementDto,
  ReimbursementResponseDto,
} from './dto'

type ReimbursementWithRelations = ReimbursementRequest & {
  person: { name: string }
  /** The ledger the credit and the status are read from. */
  payments: { amount: Prisma.Decimal; kind: PaymentKind }[]
  transaction: {
    id: string
    date: Date
    description: string
    amount: Prisma.Decimal
    category: { id: string; name: string } | null
  }
}

/**
 * The relations every response needs. The expense transaction is always
 * loaded, and always with its category: that category is where the credit is
 * deducted, so it belongs on the debt itself rather than being an optional
 * extra. `includeTransaction` now only decides whether the transaction *block*
 * is echoed back, not whether the expense category is known.
 */
const RESPONSE_INCLUDE = {
  person: { select: { name: true } },
  // Not an optional extra: `amountReceived` and `status` are read off these,
  // so a response without them would report every debt as untouched.
  payments: { select: { amount: true, kind: true } },
  transaction: {
    select: {
      id: true,
      date: true,
      description: true,
      amount: true,
      category: { select: { id: true, name: true } },
    },
  },
} as const

@Injectable()
export class ReimbursementsService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponseDto(
    reimbursement: ReimbursementWithRelations,
    includeTransaction = false
  ): ReimbursementResponseDto {
    const amount = Number(reimbursement.amount)
    // Read off the ledger, not off a column: since phase 6 there is no second
    // copy to fall out of step with the payments.
    const amountReceived = creditedTotal(
      toLedgerEntries(reimbursement.payments)
    )

    const response: ReimbursementResponseDto = {
      id: reimbursement.id,
      transactionId: reimbursement.transactionId,
      personId: reimbursement.personId,
      personName: reimbursement.person.name,
      expenseCategoryId: reimbursement.transaction.category?.id ?? null,
      expenseCategoryName: reimbursement.transaction.category?.name ?? null,
      amount,
      amountReceived,
      amountRemaining: round2(amount - amountReceived),
      status: derivedStatusOf(amount, amountReceived),
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
      where: { userId },
      include: RESPONSE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })

    // Filtered after the fact, not in the WHERE clause: since phase 6 the
    // status is a reading of the ledger and no column holds it, so there is
    // nothing for the database to compare. Sending it anyway is what Prisma
    // would reject at runtime — the spread that used to do it typechecked
    // fine.
    const responses = reimbursements.map(r =>
      this.toResponseDto(
        r as ReimbursementWithRelations,
        filters?.includeTransaction
      )
    )

    return filters?.status
      ? responses.filter(response => response.status === filters.status)
      : responses
  }

  async findByTransaction(
    transactionId: string,
    userId: string
  ): Promise<ReimbursementResponseDto[]> {
    const reimbursements = await this.prisma.reimbursementRequest.findMany({
      where: { transactionId, userId },
      include: RESPONSE_INCLUDE,
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
      include: RESPONSE_INCLUDE,
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
      include: RESPONSE_INCLUDE,
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

    const reimbursement = await this.prisma.reimbursementRequest.create({
      data: {
        userId,
        transactionId: dto.transactionId,
        personId: dto.personId,
        amount: dto.amount,
        note: dto.note ?? null,
      },
      include: RESPONSE_INCLUDE,
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
      const credited = creditedTotal(toLedgerEntries(existing.payments))
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

    const reimbursement = await this.prisma.reimbursementRequest.update({
      where: { id },
      data: {
        ...(dto.personId !== undefined && { personId: dto.personId }),
        // No status to rewrite alongside the amount: moving the debt moves what
        // the ledger reads against, and the reading happens on the way out.
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
      include: RESPONSE_INCLUDE,
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
