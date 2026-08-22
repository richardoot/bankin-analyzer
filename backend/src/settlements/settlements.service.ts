import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TransactionType } from '../generated/prisma'
import type { Settlement, Prisma } from '../generated/prisma'
import {
  LEDGER_EPSILON,
  creditedTotal,
  derivedStatusOf,
  paymentsOf,
  round2,
  splitCredit,
  type LedgerEntry,
} from '../reimbursements/reimbursement-ledger'
import type { CreateSettlementDto } from './dto'
import type {
  SettlementResponseDto,
  SettlementReimbursementResponseDto,
  TransactionAvailableAmountDto,
} from './dto'

type SettlementWithRelations = Settlement & {
  person: { name: string }
  incomeTransaction: {
    id: string
    date: Date
    description: string
    amount: Prisma.Decimal
  }
  reimbursements: Array<{
    id: string
    amountSettled: Prisma.Decimal
    reimbursement: {
      id: string
      amount: Prisma.Decimal
      transactionId: string
      transaction: {
        id: string
        date: Date
        description: string
        categoryId: string | null
        category: { name: string } | null
      }
    }
  }>
}

/** Prisma rows to the plain shape the ledger arithmetic works on. */
function toLedgerEntries(
  payments: Array<{ amount: Prisma.Decimal | number; kind: string }>
): LedgerEntry[] {
  return payments.map(payment => ({
    amount: Number(payment.amount),
    kind: payment.kind as LedgerEntry['kind'],
  }))
}

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponseDto(
    settlement: SettlementWithRelations
  ): SettlementResponseDto {
    return {
      id: settlement.id,
      personId: settlement.personId,
      personName: settlement.person.name,
      incomeTransactionId: settlement.incomeTransactionId,
      incomeTransactionDescription: settlement.incomeTransaction.description,
      incomeTransactionDate: settlement.incomeTransaction.date,
      incomeTransactionAmount: Number(settlement.incomeTransaction.amount),
      amountUsed: Number(settlement.amountUsed),
      note: settlement.note,
      createdAt: settlement.createdAt,
      reimbursements: settlement.reimbursements.map(
        (sr): SettlementReimbursementResponseDto => ({
          reimbursementId: sr.reimbursement.id,
          transactionId: sr.reimbursement.transactionId,
          transactionDescription: sr.reimbursement.transaction.description,
          transactionDate: sr.reimbursement.transaction.date,
          // The expense being repaid, not the income category the debt once
          // expected: since the deduction attaches to the expense transaction,
          // that is the only category this line is about.
          expenseCategoryId: sr.reimbursement.transaction.categoryId,
          expenseCategoryName:
            sr.reimbursement.transaction.category?.name ?? null,
          originalAmount: Number(sr.reimbursement.amount),
          amountSettled: Number(sr.amountSettled),
        })
      ),
    }
  }

  async findAll(
    userId: string,
    personId?: string
  ): Promise<SettlementResponseDto[]> {
    const settlements = await this.prisma.settlement.findMany({
      where: {
        userId,
        ...(personId && { personId }),
      },
      include: {
        person: { select: { name: true } },
        incomeTransaction: {
          select: {
            id: true,
            date: true,
            description: true,
            amount: true,
          },
        },
        reimbursements: {
          include: {
            reimbursement: {
              include: {
                transaction: {
                  select: {
                    id: true,
                    date: true,
                    description: true,
                    categoryId: true,
                    category: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return settlements.map(s =>
      this.toResponseDto(s as SettlementWithRelations)
    )
  }

  async findOne(id: string, userId: string): Promise<SettlementResponseDto> {
    const settlement = await this.prisma.settlement.findFirst({
      where: { id, userId },
      include: {
        person: { select: { name: true } },
        incomeTransaction: {
          select: {
            id: true,
            date: true,
            description: true,
            amount: true,
          },
        },
        reimbursements: {
          include: {
            reimbursement: {
              include: {
                transaction: {
                  select: {
                    id: true,
                    date: true,
                    description: true,
                    categoryId: true,
                    category: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!settlement) {
      throw new NotFoundException(`Settlement with ID ${id} not found`)
    }

    return this.toResponseDto(settlement as SettlementWithRelations)
  }

  async getAvailableAmount(
    transactionId: string,
    userId: string
  ): Promise<TransactionAvailableAmountDto> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      include: {
        settlementsAsIncome: {
          select: { amountUsed: true },
        },
      },
    })

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with ID ${transactionId} not found`
      )
    }

    if (transaction.type !== TransactionType.INCOME) {
      throw new BadRequestException(
        `Transaction ${transactionId} is not an INCOME transaction`
      )
    }

    const totalAmount = Number(transaction.amount)
    const usedAmount = transaction.settlementsAsIncome.reduce(
      (sum, s) => sum + Number(s.amountUsed),
      0
    )

    return {
      transactionId: transaction.id,
      totalAmount,
      usedAmount,
      availableAmount: totalAmount - usedAmount,
    }
  }

  async create(
    userId: string,
    dto: CreateSettlementDto
  ): Promise<SettlementResponseDto> {
    // 1. Verify income transaction exists, is INCOME type, and belongs to user
    const incomeTransaction = await this.prisma.transaction.findFirst({
      where: { id: dto.incomeTransactionId, userId },
    })

    if (!incomeTransaction) {
      throw new NotFoundException(
        `Transaction with ID ${dto.incomeTransactionId} not found`
      )
    }

    if (incomeTransaction.type !== TransactionType.INCOME) {
      throw new BadRequestException(
        `Transaction ${dto.incomeTransactionId} is not an INCOME transaction`
      )
    }

    // 2. Verify person exists and belongs to user
    const person = await this.prisma.person.findFirst({
      where: { id: dto.personId, userId },
    })

    if (!person) {
      throw new NotFoundException(`Person with ID ${dto.personId} not found`)
    }

    // 3. Verify all reimbursements exist, belong to user and to this person
    const reimbursementIds = dto.reimbursements.map(r => r.reimbursementId)
    const reimbursements = await this.prisma.reimbursementRequest.findMany({
      where: {
        id: { in: reimbursementIds },
        userId,
      },
      include: {
        // What the ledger already credits to each debt, which is what the
        // split below measures the new credit against.
        payments: { select: { amount: true, kind: true } },
      },
    })

    if (reimbursements.length !== dto.reimbursements.length) {
      throw new BadRequestException('Some reimbursements were not found')
    }

    // Check all reimbursements belong to the same person
    const invalidReimbursements = reimbursements.filter(
      r => r.personId !== dto.personId
    )
    if (invalidReimbursements.length > 0) {
      throw new BadRequestException(
        'All reimbursements must belong to the same person'
      )
    }

    // 4. Calculate total amount used
    const totalAmountUsed = dto.reimbursements.reduce(
      (sum, r) => sum + r.amountSettled,
      0
    )

    // 5. Verify available amount
    const { availableAmount } = await this.getAvailableAmount(
      dto.incomeTransactionId,
      userId
    )

    if (totalAmountUsed > availableAmount) {
      throw new BadRequestException(
        `Insufficient available amount. Available: ${availableAmount}, Requested: ${totalAmountUsed}`
      )
    }

    // 6. Resolve, for each line, the credit applied to the debt — split into
    // the cash it draws and the remainder it forgives.
    //
    // What each line has already been credited comes from the ledger, not from
    // `amountReceived`: the payments are the source of truth from here on, and
    // the column is only their sum, rewritten below in the same transaction.
    const ledgerByReimbursement = new Map(
      reimbursements.map(r => [
        r.id,
        creditedTotal(toLedgerEntries(r.payments)),
      ])
    )
    const reimbursementMap = new Map(reimbursements.map(r => [r.id, r]))

    const resolvedLines = dto.reimbursements.map(line => {
      const reimbursement = reimbursementMap.get(line.reimbursementId)
      // Already validated above; keep the type narrowing local.
      const debtAmount = reimbursement ? Number(reimbursement.amount) : 0
      const alreadyCredited =
        ledgerByReimbursement.get(line.reimbursementId) ?? 0

      const split = splitCredit({
        debtAmount,
        alreadyCredited,
        cash: line.amountSettled,
        forceComplete: line.forceComplete ?? dto.forceComplete ?? false,
      })

      const creditedAfter = round2(
        alreadyCredited + split.cash + split.writeOff
      )

      // Invariant: a debt cannot be credited beyond what it was for. Nothing
      // enforced this before, so an over-payment silently inflated the column.
      if (creditedAfter - debtAmount > LEDGER_EPSILON) {
        throw new BadRequestException(
          `Reimbursement ${line.reimbursementId} would be credited ${creditedAfter} for a debt of ${debtAmount}`
        )
      }

      return {
        reimbursementId: line.reimbursementId,
        split,
        creditedAfter,
        status: derivedStatusOf(debtAmount, creditedAfter),
      }
    })

    // 7. Create settlement in a transaction
    const settlement = await this.prisma.$transaction(async tx => {
      // The join rows keep recording the total credit, cash and forgiveness
      // together, exactly as before. They are the representation phase 6 will
      // drop; until then they are written alongside the ledger so a rollback
      // to the previous code finds the data it expects.
      const settlementReimbursements = resolvedLines.map(line => ({
        reimbursementId: line.reimbursementId,
        amountSettled: round2(line.split.cash + line.split.writeOff),
      }))

      // Create the settlement
      const created = await tx.settlement.create({
        data: {
          userId,
          personId: dto.personId,
          incomeTransactionId: dto.incomeTransactionId,
          amountUsed: totalAmountUsed,
          note: dto.note ?? null,
          reimbursements: {
            create: settlementReimbursements,
          },
        },
        include: {
          person: { select: { name: true } },
          incomeTransaction: {
            select: {
              id: true,
              date: true,
              description: true,
              amount: true,
            },
          },
          reimbursements: {
            include: {
              reimbursement: {
                include: {
                  transaction: {
                    select: {
                      id: true,
                      date: true,
                      description: true,
                      categoryId: true,
                      category: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      })

      // Record the ledger: one row per movement, so a deletion knows exactly
      // what was cash and what was forgiven instead of having to guess.
      for (const line of resolvedLines) {
        for (const entry of paymentsOf(line.split)) {
          await tx.reimbursementPayment.create({
            data: {
              userId,
              reimbursementId: line.reimbursementId,
              // A forgiven remainder is backed by no money, so it names no
              // transaction — that is what makes it reversible on its own.
              incomeTransactionId:
                entry.kind === 'CASH' ? dto.incomeTransactionId : null,
              amount: entry.amount,
              kind: entry.kind,
              settledAt: created.createdAt,
              settlementId: created.id,
            },
          })
        }

        // Derived, never decided: the column and the status are the ledger
        // read back. Phase 6 removes them entirely.
        await tx.reimbursementRequest.update({
          where: { id: line.reimbursementId },
          data: {
            amountReceived: line.creditedAfter,
            status: line.status,
          },
        })
      }

      return created
    })

    return this.toResponseDto(settlement as SettlementWithRelations)
  }

  async delete(id: string, userId: string): Promise<void> {
    // Find the settlement with its reimbursements
    const settlement = await this.prisma.settlement.findFirst({
      where: { id, userId },
      include: {
        reimbursements: {
          include: {
            reimbursement: true,
          },
        },
      },
    })

    if (!settlement) {
      throw new NotFoundException(`Settlement with ID ${id} not found`)
    }

    // Reverse the settlement in a transaction.
    //
    // Nothing is subtracted here. The settlement's payments are removed and
    // each affected debt is re-totalled from whatever payments remain, which is
    // what makes the reversal exact: the previous code subtracted a stored
    // `amountSettled` that mixed cash and forgiveness, and a force-completed
    // line therefore gave back more than it had ever taken — silently wiping an
    // earlier partial payment (see scripts/audit-forced-settlements.ts).
    await this.prisma.$transaction(async tx => {
      const affected = settlement.reimbursements.map(sr => sr.reimbursement)

      // Cascade would take these with the settlement, but they have to be gone
      // *before* the totals below are recomputed.
      await tx.reimbursementPayment.deleteMany({
        where: { settlementId: id },
      })

      for (const reimbursement of affected) {
        const remaining = await tx.reimbursementPayment.findMany({
          where: { reimbursementId: reimbursement.id },
          select: { amount: true, kind: true },
        })

        const credited = creditedTotal(toLedgerEntries(remaining))
        const debtAmount = Number(reimbursement.amount)

        await tx.reimbursementRequest.update({
          where: { id: reimbursement.id },
          data: {
            amountReceived: credited,
            status: derivedStatusOf(debtAmount, credited),
          },
        })
      }

      // Delete the settlement (cascades to SettlementReimbursement)
      await tx.settlement.delete({
        where: { id },
      })
    })
  }
}
