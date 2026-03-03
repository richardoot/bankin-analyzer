import { Injectable, NotFoundException } from '@nestjs/common'
import { createHash } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { CategoriesService } from '../categories/categories.service'
import type { Transaction, TransactionType } from '../generated/prisma'
import type { CreateTransactionDto, ImportResultDto } from './dto'

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService
  ) {}

  private computeHash(
    userId: string,
    date: Date,
    amount: number,
    account: string
  ): string {
    const data = `${userId}|${date.toISOString()}|${amount}|${account}`
    return createHash('sha256').update(data).digest('hex')
  }

  async findAllByUser(
    userId: string,
    filters?: {
      type?: TransactionType
      startDate?: Date
      endDate?: Date
      categoryId?: string
    }
  ): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({
      where: {
        userId,
        ...(filters?.type && { type: filters.type }),
        ...(filters?.categoryId && { categoryId: filters.categoryId }),
        ...(filters?.startDate &&
          filters?.endDate && {
            date: {
              gte: filters.startDate,
              lte: filters.endDate,
            },
          }),
      },
      include: { category: true },
      orderBy: { date: 'desc' },
    })
  }

  async findOne(id: string, userId: string): Promise<Transaction> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: { category: true },
    })

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`)
    }

    return transaction
  }

  async importTransactions(
    userId: string,
    transactions: CreateTransactionDto[]
  ): Promise<ImportResultDto> {
    let imported = 0
    let duplicates = 0

    for (const tx of transactions) {
      const date = new Date(tx.date)
      const hash = this.computeHash(userId, date, tx.amount, tx.account)

      // Check if transaction already exists
      const existing = await this.prisma.transaction.findUnique({
        where: { hash },
      })

      if (existing) {
        duplicates++
        continue
      }

      // Find or create category
      const category = await this.categoriesService.findOrCreate(
        userId,
        tx.category,
        tx.type
      )

      // Create transaction
      await this.prisma.transaction.create({
        data: {
          userId,
          categoryId: category.id,
          hash,
          date,
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          account: tx.account,
          subcategory: tx.subcategory ?? null,
          note: tx.note ?? null,
          isPointed: tx.isPointed ?? false,
        },
      })

      imported++
    }

    return {
      imported,
      duplicates,
      total: transactions.length,
    }
  }

  async update(
    id: string,
    userId: string,
    data: { note?: string; categoryId?: string }
  ): Promise<Transaction> {
    await this.findOne(id, userId) // Verify ownership

    return this.prisma.transaction.update({
      where: { id },
      data,
      include: { category: true },
    })
  }

  async delete(id: string, userId: string): Promise<Transaction> {
    await this.findOne(id, userId) // Verify ownership

    return this.prisma.transaction.delete({
      where: { id },
    })
  }
}
