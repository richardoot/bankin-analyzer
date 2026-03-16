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
  ExistingTransactionDto,
} from './dto'

// Internal type for batch processing
interface HashData {
  index: number
  hash: string
  tx: CreateTransactionDto
  date: Date
}

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

  /**
   * Compute hashes for all transactions in memory (no DB queries)
   */
  private computeHashesWithData(
    userId: string,
    transactions: CreateTransactionDto[]
  ): HashData[] {
    return transactions.map((tx, index) => ({
      index,
      hash: this.computeHash(
        userId,
        new Date(tx.date),
        tx.amount,
        tx.account,
        tx.description
      ),
      tx,
      date: new Date(tx.date),
    }))
  }

  /**
   * Convert HashData to UploadedTransactionDto for API response
   */
  private toUploadedDto(data: HashData): UploadedTransactionDto {
    return {
      index: data.index,
      date: data.tx.date,
      description: data.tx.description,
      amount: data.tx.amount,
      account: data.tx.account,
      category: data.tx.category,
      type: data.tx.type,
      ...(data.tx.subcategory && { subcategory: data.tx.subcategory }),
      ...(data.tx.note && { note: data.tx.note }),
    }
  }

  /**
   * Convert DB Transaction to ExistingTransactionDto for API response
   */
  private toExistingDto(
    tx: Transaction & { category?: { name: string } | null }
  ): ExistingTransactionDto {
    return {
      id: tx.id,
      date: tx.date.toISOString(),
      description: tx.description,
      amount: Number(tx.amount),
      account: tx.account,
      type: tx.type,
      createdAt: tx.createdAt.toISOString(),
      ...(tx.category?.name && { categoryName: tx.category.name }),
      ...(tx.subcategory && { subcategory: tx.subcategory }),
      ...(tx.note && { note: tx.note }),
    }
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

  async findAllByUserPaginated(
    userId: string,
    pagination: { page: number; limit: number },
    filters?: {
      type?: TransactionType
      startDate?: Date
      endDate?: Date
      categoryId?: string
    }
  ): Promise<{ data: Transaction[]; total: number }> {
    const where = {
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
    }

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: { category: true },
        orderBy: { date: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      this.prisma.transaction.count({ where }),
    ])

    return { data, total }
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

  /**
   * Preview import with batch hash lookups for better performance.
   * Reduces N DB queries to 1 single query.
   */
  async previewImport(
    userId: string,
    transactions: CreateTransactionDto[]
  ): Promise<ImportPreviewResultDto> {
    if (transactions.length === 0) {
      return {
        newCount: 0,
        internalDuplicateCount: 0,
        externalDuplicateCount: 0,
        total: 0,
        internalDuplicates: [],
        externalDuplicates: [],
      }
    }

    // 1. Compute all hashes in memory (no DB queries)
    const hashesData = this.computeHashesWithData(userId, transactions)

    // 2. Detect INTERNAL duplicates (same hash in this batch)
    const hashToIndices = new Map<string, number[]>()
    for (const { index, hash } of hashesData) {
      const existing = hashToIndices.get(hash) || []
      existing.push(index)
      hashToIndices.set(hash, existing)
    }

    // 3. Collect unique hashes for DB query
    const uniqueHashes = [...hashToIndices.keys()]

    // 4. ONE SINGLE query to check existence in DB
    const existingInDb = await this.prisma.transaction.findMany({
      where: {
        hash: { in: uniqueHashes },
        userId,
      },
      include: { category: true },
    })
    const existingHashSet = new Set(existingInDb.map(t => t.hash))
    const existingByHash = new Map(existingInDb.map(t => [t.hash, t]))

    // 5. Build results
    const internalDuplicates: InternalDuplicateDto[] = []
    const externalDuplicates: ExternalDuplicateDto[] = []
    let newCount = 0

    for (const [hash, indices] of hashToIndices) {
      const txsData = indices
        .map(i => hashesData[i])
        .filter((d): d is HashData => d !== undefined)

      // Case: EXTERNAL duplicate (exists in DB)
      if (existingHashSet.has(hash)) {
        const existing = existingByHash.get(hash)!
        for (const data of txsData) {
          externalDuplicates.push({
            hash,
            uploaded: this.toUploadedDto(data),
            existing: this.toExistingDto(existing),
          })
        }
        continue
      }

      // Case: INTERNAL duplicate (>1 occurrence of same hash)
      if (indices.length > 1) {
        internalDuplicates.push({
          hash,
          indices,
          transactions: txsData.map(d => this.toUploadedDto(d)),
        })
        continue
      }

      // Case: New unique transaction
      newCount++
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

  /**
   * Import transactions with batch operations for better performance.
   * Reduces N*3 DB queries to ~4 queries total.
   * @param importHistoryId - Optional import history ID to link transactions
   */
  async importTransactions(
    userId: string,
    transactions: CreateTransactionDto[],
    importHistoryId?: string
  ): Promise<ImportResultDto> {
    if (transactions.length === 0) {
      return { imported: 0, duplicates: 0, total: 0 }
    }

    // 1. Separate normal transactions from forceImport ones
    const normalTxs: CreateTransactionDto[] = []
    const forcedTxs: CreateTransactionDto[] = []

    for (const tx of transactions) {
      if (tx.forceImport) {
        forcedTxs.push(tx)
      } else {
        normalTxs.push(tx)
      }
    }

    // 2. Batch lookup for normal transactions
    const hashesData = this.computeHashesWithData(userId, normalTxs)
    const uniqueHashes = [...new Set(hashesData.map(h => h.hash))]

    const existingHashes = new Set(
      (
        await this.prisma.transaction.findMany({
          where: { hash: { in: uniqueHashes }, userId },
          select: { hash: true },
        })
      ).map(t => t.hash)
    )

    // 3. Filter non-duplicates (keep only first occurrence of each hash)
    const seenHashes = new Set<string>()
    const toImport: HashData[] = []

    for (const data of hashesData) {
      if (!existingHashes.has(data.hash) && !seenHashes.has(data.hash)) {
        toImport.push(data)
        seenHashes.add(data.hash)
      }
    }

    const duplicates = hashesData.length - toImport.length

    // 4. Prepare forced transactions (with uniqueKey for unique hash)
    const forcedData = forcedTxs.map(tx => ({
      tx,
      date: new Date(tx.date),
      hash: this.computeHash(
        userId,
        new Date(tx.date),
        tx.amount,
        tx.account,
        tx.description,
        this.generateUniqueKey()
      ),
    }))

    // 5. Batch create/fetch all categories
    const allTxsToImport = [...toImport.map(t => t.tx), ...forcedTxs]

    if (allTxsToImport.length === 0) {
      return { imported: 0, duplicates, total: transactions.length }
    }

    const categoryInputs = allTxsToImport.map(tx => ({
      name: tx.category,
      type: tx.type,
    }))

    const { categories } = await this.categoriesService.findOrCreateMany(
      userId,
      categoryInputs
    )
    const categoryByName = new Map(categories.map(c => [c.name, c]))

    // 6. Bulk insert with createMany
    const dataToCreate = [
      ...toImport.map(({ hash, date, tx }) => ({
        userId,
        categoryId: categoryByName.get(tx.category)!.id,
        importHistoryId: importHistoryId ?? null,
        hash,
        date,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        account: tx.account,
        subcategory: tx.subcategory ?? null,
        note: tx.note ?? null,
        isPointed: tx.isPointed ?? false,
      })),
      ...forcedData.map(({ hash, date, tx }) => ({
        userId,
        categoryId: categoryByName.get(tx.category)!.id,
        importHistoryId: importHistoryId ?? null,
        hash,
        date,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        account: tx.account,
        subcategory: tx.subcategory ?? null,
        note: tx.note ?? null,
        isPointed: tx.isPointed ?? false,
      })),
    ]

    await this.prisma.transaction.createMany({
      data: dataToCreate,
      skipDuplicates: true,
    })

    return {
      imported: dataToCreate.length,
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
