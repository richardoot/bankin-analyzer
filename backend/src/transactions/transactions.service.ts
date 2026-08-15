import { Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { CategoriesService } from '../categories/categories.service'
import { SubcategoriesService } from '../subcategories/subcategories.service'
import { AccountsService } from '../accounts/accounts.service'
import { AiSuggestionsService } from '../ai-suggestions/ai-suggestions.service'
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

// Relations included whenever transactions are read for the API. Settlements are
// only meaningful for INCOME transactions; the reimbursement details are fetched
// on demand via the settlements endpoint, so a lightweight summary is enough here.
const TRANSACTION_READ_INCLUDE = {
  category: true,
  subcategoryRef: true,
  accountRef: { select: { name: true } },
  settlementsAsIncome: {
    select: {
      id: true,
      amountUsed: true,
      personId: true,
      person: { select: { name: true } },
    },
  },
  tags: {
    select: {
      tag: {
        select: { id: true, name: true, color: true, icon: true },
      },
    },
  },
} as const

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
    private readonly subcategoriesService: SubcategoriesService,
    private readonly accountsService: AccountsService,
    private readonly aiSuggestionsService: AiSuggestionsService
  ) {}

  /**
   * Compute the v2 hash for a transaction. Uses the Account FK (`accountId`)
   * rather than the legacy `account` string. Matches the formula used by the
   * rehash migration script (`backend/src/scripts/rehash-transactions.ts`).
   *
   * The optional `uniqueKey` is appended after `description` and serves two
   * purposes:
   *   - `force-...` random nonce for `forceImport` mode (caller-generated).
   *   - `:N` deterministic suffix backfilled into existing duplicate rows.
   */
  private computeHash(
    userId: string,
    date: Date,
    amount: number,
    accountId: string,
    description: string,
    uniqueKey?: string
  ): string {
    const base = `${userId}|${date.toISOString()}|${amount}|${accountId}|${description}`
    const data = uniqueKey ? `${base}|${uniqueKey}` : base
    return createHash('sha256').update(data).digest('hex')
  }

  private generateUniqueKey(): string {
    return `force-${Date.now()}-${randomUUID().slice(0, 8)}`
  }

  /**
   * Upsert every Account referenced by `transactions` and return a name→id
   * map. Called early in both previewImport and importTransactions because
   * the hash formula requires the accountId.
   */
  private async buildAccountIdMap(
    userId: string,
    transactions: CreateTransactionDto[]
  ): Promise<Map<string, string>> {
    const uniqueAccountNames = [...new Set(transactions.map(tx => tx.account))]
    const accounts = await Promise.all(
      uniqueAccountNames.map(name =>
        this.accountsService.upsertByName(userId, name)
      )
    )
    return new Map(accounts.map(a => [a.name, a.id]))
  }

  /**
   * Compute hashes for all transactions in memory (no DB queries).
   *
   * Requires `accountIdByName` to be pre-populated by the caller — the caller
   * MUST upsert every unique account name before calling this so that every
   * `tx.account` resolves to an id. Missing ids throw.
   */
  private computeHashesWithData(
    userId: string,
    transactions: CreateTransactionDto[],
    accountIdByName: Map<string, string>
  ): HashData[] {
    return transactions.map((tx, index) => {
      const accountId = accountIdByName.get(tx.account)
      if (!accountId) {
        throw new Error(
          `Account upsert did not return an id for "${tx.account}". ` +
            'Caller must upsert all accounts before computing hashes.'
        )
      }
      return {
        index,
        hash: this.computeHash(
          userId,
          new Date(tx.date),
          tx.amount,
          accountId,
          tx.description
        ),
        tx,
        date: new Date(tx.date),
      }
    })
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
   * Convert DB Transaction to ExistingTransactionDto for API response.
   * Requires `accountRef` to be included in the originating query.
   */
  private toExistingDto(
    tx: Transaction & {
      category?: { name: string } | null
      accountRef: { name: string }
    }
  ): ExistingTransactionDto {
    return {
      id: tx.id,
      date: tx.date.toISOString(),
      description: tx.description,
      amount: Number(tx.amount),
      account: tx.accountRef.name,
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
      include: TRANSACTION_READ_INCLUDE,
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
      isPointed?: boolean
      account?: string
      tagId?: string
    }
  ): Promise<{ data: Transaction[]; total: number }> {
    const where = {
      userId,
      ...(filters?.type && { type: filters.type }),
      ...(filters?.categoryId && { categoryId: filters.categoryId }),
      ...(filters?.isPointed !== undefined && { isPointed: filters.isPointed }),
      ...(filters?.account && {
        accountRef: { name: filters.account },
      }),
      ...(filters?.tagId && {
        tags: { some: { tagId: filters.tagId } },
      }),
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
        include: TRANSACTION_READ_INCLUDE,
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
      include: TRANSACTION_READ_INCLUDE,
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

    // 1. Upsert accounts so we can resolve account names to ids for hashing.
    //    The hash formula depends on accountId, not on the legacy `account`
    //    string. Side effect: previewing an import with a new account name
    //    creates the Account row (same behaviour as a confirmed import).
    const accountIdByName = await this.buildAccountIdMap(userId, transactions)

    // 2. Compute all hashes in memory (no DB queries)
    const hashesData = this.computeHashesWithData(
      userId,
      transactions,
      accountIdByName
    )

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
      include: { category: true, accountRef: { select: { name: true } } },
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

    // 2. Upsert accounts upfront so we can resolve account names to ids for
    //    hashing. The hash formula depends on accountId, not the legacy
    //    `account` string, so the Account rows must exist before hashing.
    const accountIdByName = await this.buildAccountIdMap(userId, transactions)

    // 3. Compute hashes and batch lookup duplicates for normal transactions
    const hashesData = this.computeHashesWithData(
      userId,
      normalTxs,
      accountIdByName
    )
    const uniqueHashes = [...new Set(hashesData.map(h => h.hash))]

    const existingHashes = new Set(
      (
        await this.prisma.transaction.findMany({
          where: { hash: { in: uniqueHashes }, userId },
          select: { hash: true },
        })
      ).map(t => t.hash)
    )

    // 4. Filter non-duplicates (keep only first occurrence of each hash)
    const seenHashes = new Set<string>()
    const toImport: HashData[] = []

    for (const data of hashesData) {
      if (!existingHashes.has(data.hash) && !seenHashes.has(data.hash)) {
        toImport.push(data)
        seenHashes.add(data.hash)
      }
    }

    const duplicates = hashesData.length - toImport.length

    // 5. Prepare forced transactions (with uniqueKey for unique hash)
    const forcedData = forcedTxs.map(tx => {
      const accountId = accountIdByName.get(tx.account)
      if (!accountId) {
        throw new Error(
          `Account upsert did not return an id for "${tx.account}".`
        )
      }
      return {
        tx,
        date: new Date(tx.date),
        hash: this.computeHash(
          userId,
          new Date(tx.date),
          tx.amount,
          accountId,
          tx.description,
          this.generateUniqueKey()
        ),
      }
    })

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

    // 5b. Batch create/fetch subcategories
    const subcategoryInputs = allTxsToImport
      .filter(tx => tx.subcategory && tx.subcategory.trim())
      .map(tx => ({
        categoryId: categoryByName.get(tx.category)!.id,
        name: tx.subcategory!,
      }))

    const { subcategories } = await this.subcategoriesService.findOrCreateMany(
      userId,
      subcategoryInputs
    )
    const subcategoryMap = new Map(
      subcategories.map(s => [`${s.categoryId}|${s.name}`, s])
    )

    // 5b2. Fire-and-forget: generate icons for categories/subcategories without icons
    const catsWithoutIcons = categories.filter(c => !c.icon)
    const subsWithoutIcons = subcategories.filter(s => !s.icon)
    if (catsWithoutIcons.length > 0 || subsWithoutIcons.length > 0) {
      void this.aiSuggestionsService.generateAndSaveIcons(
        userId,
        catsWithoutIcons.map(c => ({ id: c.id, name: c.name })),
        subsWithoutIcons.map(s => ({ id: s.id, name: s.name }))
      )
    }

    // Note: accountIdByName was already built upfront (step 2). Reuse the
    // resolver here for the createMany payload.
    const resolveAccountId = (name: string): string => {
      const id = accountIdByName.get(name)
      if (!id) {
        throw new Error(
          `Account upsert did not return an id for "${name}". ` +
            'This indicates a critical inconsistency between the upserted ' +
            'accounts and the imported transactions.'
        )
      }
      return id
    }

    // 6. Bulk insert with createMany
    const dataToCreate = [
      ...toImport.map(({ hash, date, tx }) => {
        const categoryId = categoryByName.get(tx.category)!.id
        const subcategoryId =
          tx.subcategory && tx.subcategory.trim()
            ? (subcategoryMap.get(`${categoryId}|${tx.subcategory}`)?.id ??
              null)
            : null
        return {
          userId,
          accountId: resolveAccountId(tx.account),
          categoryId,
          subcategoryId,
          importHistoryId: importHistoryId ?? null,
          hash,
          date,
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          subcategory: tx.subcategory ?? null,
          note: tx.note ?? null,
          isPointed: tx.isPointed ?? false,
        }
      }),
      ...forcedData.map(({ hash, date, tx }) => {
        const categoryId = categoryByName.get(tx.category)!.id
        const subcategoryId =
          tx.subcategory && tx.subcategory.trim()
            ? (subcategoryMap.get(`${categoryId}|${tx.subcategory}`)?.id ??
              null)
            : null
        return {
          userId,
          accountId: resolveAccountId(tx.account),
          categoryId,
          subcategoryId,
          importHistoryId: importHistoryId ?? null,
          hash,
          date,
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          subcategory: tx.subcategory ?? null,
          note: tx.note ?? null,
          isPointed: tx.isPointed ?? false,
        }
      }),
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
    data: {
      note?: string
      categoryId?: string
      subcategoryId?: string | null
      isPointed?: boolean
    }
  ): Promise<Transaction> {
    await this.findOne(id, userId) // Verify ownership

    // Build update data, handling subcategoryId explicitly
    const updateData: {
      note?: string
      categoryId?: string
      subcategoryId?: string | null
      subcategory?: string | null
      isPointed?: boolean
    } = {}

    if (data.note !== undefined) updateData.note = data.note
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId
    if (data.isPointed !== undefined) updateData.isPointed = data.isPointed

    // Handle subcategoryId - update both the FK and the string field
    if (data.subcategoryId !== undefined) {
      updateData.subcategoryId = data.subcategoryId

      // Also update the subcategory string for backward compatibility
      if (data.subcategoryId) {
        const subcategory = await this.prisma.subcategory.findUnique({
          where: { id: data.subcategoryId },
        })
        updateData.subcategory = subcategory?.name ?? null
      } else {
        updateData.subcategory = null
      }
    }

    return this.prisma.transaction.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        subcategoryRef: true,
        accountRef: { select: { name: true } },
      },
    })
  }

  async bulkUpdate(
    userId: string,
    ids: string[],
    data: { categoryId?: string; isPointed?: boolean }
  ): Promise<{ updated: number }> {
    // Filter to only update transactions owned by the user
    const result = await this.prisma.transaction.updateMany({
      where: {
        id: { in: ids },
        userId,
      },
      data,
    })

    return { updated: result.count }
  }

  async delete(id: string, userId: string): Promise<Transaction> {
    await this.findOne(id, userId) // Verify ownership

    return this.prisma.transaction.delete({
      where: { id },
    })
  }
}
