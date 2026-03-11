import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ReimbursementStatus, TransactionType } from '../generated/prisma'
import type { Settlement, Prisma } from '../generated/prisma'
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
      categoryId: string | null
      transaction: {
        id: string
        date: Date
        description: string
      }
      category: { name: string } | null
    }
  }>
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
          categoryId: sr.reimbursement.categoryId,
          categoryName: sr.reimbursement.category?.name ?? null,
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
                  },
                },
                category: { select: { name: true } },
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
                  },
                },
                category: { select: { name: true } },
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

    // 6. Create settlement in a transaction
    const settlement = await this.prisma.$transaction(async tx => {
      // Build reimbursement data with correct amounts
      const reimbursementMap = new Map(reimbursements.map(r => [r.id, r]))
      const settlementReimbursements = dto.reimbursements.map(r => {
        const reimb = reimbursementMap.get(r.reimbursementId)
        // If forceComplete, store the full original amount as amountSettled
        const amountSettled =
          dto.forceComplete && reimb ? Number(reimb.amount) : r.amountSettled
        return {
          reimbursementId: r.reimbursementId,
          amountSettled,
        }
      })

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
                    },
                  },
                  category: { select: { name: true } },
                },
              },
            },
          },
        },
      })

      // Update each reimbursement's amountReceived and status
      for (const r of dto.reimbursements) {
        const reimb = reimbursementMap.get(r.reimbursementId)
        if (!reimb) continue // Already validated above
        const newAmountReceived = Number(reimb.amountReceived) + r.amountSettled
        const originalAmount = Number(reimb.amount)

        let newStatus: ReimbursementStatus
        if (dto.forceComplete || newAmountReceived >= originalAmount) {
          // Force complete OR full amount received
          newStatus = ReimbursementStatus.COMPLETED
        } else if (newAmountReceived > 0) {
          newStatus = ReimbursementStatus.PARTIAL
        } else {
          newStatus = ReimbursementStatus.PENDING
        }

        // If forceComplete, set amountReceived to full amount
        const finalAmountReceived = dto.forceComplete
          ? originalAmount
          : newAmountReceived

        await tx.reimbursementRequest.update({
          where: { id: r.reimbursementId },
          data: {
            amountReceived: finalAmountReceived,
            status: newStatus,
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

    // Reverse the settlement in a transaction
    await this.prisma.$transaction(async tx => {
      // Reverse amounts on each reimbursement
      for (const sr of settlement.reimbursements) {
        const reimb = sr.reimbursement
        const newAmountReceived = Math.max(
          0,
          Number(reimb.amountReceived) - Number(sr.amountSettled)
        )
        const originalAmount = Number(reimb.amount)

        let newStatus: ReimbursementStatus
        if (newAmountReceived >= originalAmount) {
          newStatus = ReimbursementStatus.COMPLETED
        } else if (newAmountReceived > 0) {
          newStatus = ReimbursementStatus.PARTIAL
        } else {
          newStatus = ReimbursementStatus.PENDING
        }

        await tx.reimbursementRequest.update({
          where: { id: reimb.id },
          data: {
            amountReceived: newAmountReceived,
            status: newStatus,
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
