import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ReimbursementStatus } from '../generated/prisma'
import type { ReimbursementRequest, Prisma } from '../generated/prisma'
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
    })

    if (!existing) {
      throw new NotFoundException(
        `Reimbursement request with ID ${id} not found`
      )
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
        ...(dto.amount !== undefined && { amount: dto.amount }),
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

  async receivePayment(
    id: string,
    userId: string,
    amount: number
  ): Promise<ReimbursementResponseDto> {
    // Verify reimbursement exists and belongs to user
    const existing = await this.prisma.reimbursementRequest.findFirst({
      where: { id, userId },
    })

    if (!existing) {
      throw new NotFoundException(
        `Reimbursement request with ID ${id} not found`
      )
    }

    const currentReceived = Number(existing.amountReceived)
    const totalAmount = Number(existing.amount)
    const newReceived = currentReceived + amount

    // Determine new status
    let newStatus: ReimbursementStatus
    if (newReceived >= totalAmount) {
      newStatus = ReimbursementStatus.COMPLETED
    } else if (newReceived > 0) {
      newStatus = ReimbursementStatus.PARTIAL
    } else {
      newStatus = ReimbursementStatus.PENDING
    }

    const reimbursement = await this.prisma.reimbursementRequest.update({
      where: { id },
      data: {
        amountReceived: newReceived,
        status: newStatus,
      },
      include: {
        person: { select: { name: true } },
        category: { select: { name: true } },
      },
    })

    return this.toResponseDto(reimbursement as ReimbursementWithRelations)
  }

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
