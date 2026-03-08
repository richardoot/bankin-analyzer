import { Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { CategoriesService } from '../categories/categories.service'
import type { Transaction, TransactionType } from '../generated/prisma'
import type {
  CreateTransactionDto,
  ImportResultDto,
  ImportPreviewResultDto,
  UploadedTransactionDto,
  InternalDuplicateDto,
  ExternalDuplicateDto,
} from './dto'

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
    account: string,
    description: string,
    uniqueKey?: string
  ): string {
    const base = `${userId}|${date.toISOString()}|${amount}|${account}|${description}`
    const data = uniqueKey ? `${base}|${uniqueKey}` : base
    return createHash('sha256').update(data).digest('hex')
  }

  private generateUniqueKey(): string {
    return `force-${Date.now()}-${randomUUID().slice(0, 8)}`
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

  async previewImport(
    userId: string,
    transactions: CreateTransactionDto[]
  ): Promise<ImportPreviewResultDto> {
    const externalDuplicates: ExternalDuplicateDto[] = []
    const internalDuplicatesMap = new Map<
      string,
      { indices: number[]; transactions: UploadedTransactionDto[] }
    >()
    const processedHashes = new Set<string>()
    let newCount = 0

    for (const [i, tx] of transactions.entries()) {
      const date = new Date(tx.date)
      const hash = this.computeHash(
        userId,
        date,
        tx.amount,
        tx.account,
        tx.description
      )

      const uploadedTx: UploadedTransactionDto = {
        index: i,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        account: tx.account,
        category: tx.category,
        type: tx.type,
        ...(tx.subcategory && { subcategory: tx.subcategory }),
        ...(tx.note && { note: tx.note }),
      }

      // Check for INTERNAL duplicate (already seen in this import)
      if (processedHashes.has(hash)) {
        const existing = internalDuplicatesMap.get(hash)
        if (existing) {
          existing.indices.push(i)
          existing.transactions.push(uploadedTx)
        }
        continue
      }

      processedHashes.add(hash)

      // Check for EXTERNAL duplicate (exists in DB)
      const existingInDb = await this.prisma.transaction.findUnique({
        where: { hash },
        include: { category: true },
      })

      if (existingInDb) {
        externalDuplicates.push({
          hash,
          uploaded: uploadedTx,
          existing: {
            id: existingInDb.id,
            date: existingInDb.date.toISOString(),
            description: existingInDb.description,
            amount: Number(existingInDb.amount),
            account: existingInDb.account,
            type: existingInDb.type,
            createdAt: existingInDb.createdAt.toISOString(),
            ...(existingInDb.category?.name && {
              categoryName: existingInDb.category.name,
            }),
            ...(existingInDb.subcategory && {
              subcategory: existingInDb.subcategory,
            }),
            ...(existingInDb.note && { note: existingInDb.note }),
          },
        })
      } else {
        // First occurrence, prepare for internal duplicate detection
        internalDuplicatesMap.set(hash, {
          indices: [i],
          transactions: [uploadedTx],
        })
        newCount++
      }
    }

    // Filter to keep only actual internal duplicates (>1 occurrence)
    const internalDuplicates: InternalDuplicateDto[] = []
    for (const [hash, data] of internalDuplicatesMap) {
      if (data.indices.length > 1) {
        internalDuplicates.push({
          hash,
          indices: data.indices,
          transactions: data.transactions,
        })
        // Adjust newCount: first occurrence was counted but it's a duplicate group
        newCount--
      }
    }

    return {
      newCount,
      internalDuplicateCount: internalDuplicates.length,
      externalDuplicateCount: externalDuplicates.length,
      total: transactions.length,
      internalDuplicates,
      externalDuplicates,
    }
  }

  async importTransactions(
    userId: string,
    transactions: CreateTransactionDto[]
  ): Promise<ImportResultDto> {
    let imported = 0
    let duplicates = 0

    for (const tx of transactions) {
      const date = new Date(tx.date)

      // If forceImport is true, generate a unique key to bypass duplicate detection
      const uniqueKey = tx.forceImport ? this.generateUniqueKey() : undefined
      const hash = this.computeHash(
        userId,
        date,
        tx.amount,
        tx.account,
        tx.description,
        uniqueKey
      )

      // Check if transaction already exists (will never match if forceImport=true)
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
