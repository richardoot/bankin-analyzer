import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ImportStatus, Prisma } from '../generated/prisma'
import type { ImportHistory } from '../generated/prisma'

export interface StartImportData {
  totalInFile: number
  fileName?: string | undefined
}

export interface FinalizeImportData {
  transactionsImported: number
  categoriesCreated: number
  duplicatesSkipped: number
  dateRangeStart: Date
  dateRangeEnd: Date
}

export interface CreateImportHistoryData {
  transactionsImported: number
  categoriesCreated: number
  duplicatesSkipped: number
  totalInFile: number
  dateRangeStart: Date
  dateRangeEnd: Date
  fileName?: string | undefined
}

/**
 * ImportHistory enriched with the list of account names touched by the
 * import. The list is computed on read by JOINing the import's transactions
 * back to the accounts relation, so it always reflects the current
 * `Account.name` (single source of truth — survives account renames).
 */
export type ImportHistoryWithAccounts = ImportHistory & { accounts: string[] }

/** Shape produced by the `$queryRaw` reads below — keeps column aliasing
 * centralised. */
interface ImportHistoryRow {
  id: string
  userId: string
  status: ImportStatus
  transactionsImported: number
  categoriesCreated: number
  duplicatesSkipped: number
  totalInFile: number
  dateRangeStart: Date | null
  dateRangeEnd: Date | null
  fileName: string | null
  createdAt: Date
  accounts: string[]
}

@Injectable()
export class ImportHistoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * SQL fragment that produces the `accounts` array column for a given
   * `import_history` row alias (defaulted to `ih`). Uses a sub-select to
   * stay efficient for list views with many imports.
   */
  private static readonly ACCOUNTS_SUBQUERY = Prisma.sql`
    COALESCE(
      ARRAY(
        SELECT DISTINCT a.name
        FROM "app"."transactions" t
        JOIN "app"."accounts" a ON a.id = t.account_id
        WHERE t.import_history_id = ih.id
        ORDER BY a.name
      ),
      '{}'::text[]
    )
  `

  async findAllByUser(userId: string): Promise<ImportHistoryWithAccounts[]> {
    return this.prisma.$queryRaw<ImportHistoryRow[]>(Prisma.sql`
      SELECT
        ih.id,
        ih.user_id AS "userId",
        ih.status,
        ih.transactions_imported AS "transactionsImported",
        ih.categories_created AS "categoriesCreated",
        ih.duplicates_skipped AS "duplicatesSkipped",
        ih.total_in_file AS "totalInFile",
        ih.date_range_start AS "dateRangeStart",
        ih.date_range_end AS "dateRangeEnd",
        ih.file_name AS "fileName",
        ih.created_at AS "createdAt",
        ${ImportHistoriesService.ACCOUNTS_SUBQUERY} AS accounts
      FROM "app"."import_histories" ih
      WHERE ih.user_id = ${userId}
      ORDER BY ih.created_at DESC
    `)
  }

  async findById(
    id: string,
    userId: string
  ): Promise<ImportHistoryWithAccounts | null> {
    const rows = await this.prisma.$queryRaw<ImportHistoryRow[]>(Prisma.sql`
      SELECT
        ih.id,
        ih.user_id AS "userId",
        ih.status,
        ih.transactions_imported AS "transactionsImported",
        ih.categories_created AS "categoriesCreated",
        ih.duplicates_skipped AS "duplicatesSkipped",
        ih.total_in_file AS "totalInFile",
        ih.date_range_start AS "dateRangeStart",
        ih.date_range_end AS "dateRangeEnd",
        ih.file_name AS "fileName",
        ih.created_at AS "createdAt",
        ${ImportHistoriesService.ACCOUNTS_SUBQUERY} AS accounts
      FROM "app"."import_histories" ih
      WHERE ih.id = ${id} AND ih.user_id = ${userId}
      LIMIT 1
    `)
    return rows[0] ?? null
  }

  async getLatestImportDate(userId: string): Promise<Date | null> {
    const latest = await this.prisma.importHistory.findFirst({
      where: { userId },
      orderBy: { dateRangeEnd: 'desc' },
      select: { dateRangeEnd: true },
    })
    return latest?.dateRangeEnd ?? null
  }

  async startImport(
    userId: string,
    data: StartImportData
  ): Promise<ImportHistoryWithAccounts> {
    const created = await this.prisma.importHistory.create({
      data: {
        userId,
        totalInFile: data.totalInFile,
        fileName: data.fileName ?? null,
        status: ImportStatus.IN_PROGRESS,
      },
    })
    // No transactions yet → accounts is empty by construction.
    return { ...created, accounts: [] }
  }

  async finalizeImport(
    id: string,
    userId: string,
    data: FinalizeImportData
  ): Promise<ImportHistoryWithAccounts> {
    const existing = await this.findById(id, userId)
    if (!existing) {
      throw new NotFoundException(`Import history ${id} not found`)
    }

    await this.prisma.importHistory.update({
      where: { id },
      data: {
        transactionsImported: data.transactionsImported,
        categoriesCreated: data.categoriesCreated,
        duplicatesSkipped: data.duplicatesSkipped,
        dateRangeStart: data.dateRangeStart,
        dateRangeEnd: data.dateRangeEnd,
        status: ImportStatus.COMPLETED,
      },
    })
    // Re-read so `accounts` reflects the transactions that were just imported.
    const updated = await this.findById(id, userId)
    // The findById above can only return null if the row was deleted between
    // the update and the re-read; this is essentially impossible inside a
    // request, so an explicit guard with the same NotFoundException is OK.
    if (!updated) {
      throw new NotFoundException(`Import history ${id} not found`)
    }
    return updated
  }

  async markAsFailed(
    id: string,
    userId: string
  ): Promise<ImportHistoryWithAccounts> {
    const existing = await this.findById(id, userId)
    if (!existing) {
      throw new NotFoundException(`Import history ${id} not found`)
    }

    const updated = await this.prisma.importHistory.update({
      where: { id },
      data: { status: ImportStatus.FAILED },
    })
    return { ...updated, accounts: existing.accounts }
  }

  async deleteImport(id: string, userId: string): Promise<void> {
    const existing = await this.findById(id, userId)
    if (!existing) {
      throw new NotFoundException(`Import history ${id} not found`)
    }

    // Delete transactions linked to this import first
    await this.prisma.transaction.deleteMany({
      where: { importHistoryId: id, userId },
    })

    // Then delete the import history. Categories and accounts are NOT cleaned
    // up: both are user-configured entities (icons, subcategories, budgets,
    // category associations on one side; account type/divisor/exclusion flags
    // on the other) and must never disappear as a side effect of removing an
    // import. Cleanup, if ever needed, must be an explicit user action.
    await this.prisma.importHistory.delete({
      where: { id },
    })
  }

  async create(
    userId: string,
    data: CreateImportHistoryData
  ): Promise<ImportHistoryWithAccounts> {
    const created = await this.prisma.importHistory.create({
      data: {
        userId,
        transactionsImported: data.transactionsImported,
        categoriesCreated: data.categoriesCreated,
        duplicatesSkipped: data.duplicatesSkipped,
        totalInFile: data.totalInFile,
        dateRangeStart: data.dateRangeStart,
        dateRangeEnd: data.dateRangeEnd,
        fileName: data.fileName ?? null,
        status: ImportStatus.COMPLETED,
      },
    })
    // Legacy "create" doesn't write transactions itself, so any pre-existing
    // ones with matching import_history_id (none, typically) would still be
    // picked up by findById. Safer to re-read than to assume `[]`.
    const enriched = await this.findById(created.id, userId)
    if (!enriched) {
      throw new NotFoundException(`Import history ${created.id} not found`)
    }
    return enriched
  }
}
