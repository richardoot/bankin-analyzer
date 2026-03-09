import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ImportStatus } from '../generated/prisma'
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
  accounts: string[]
}

export interface CreateImportHistoryData {
  transactionsImported: number
  categoriesCreated: number
  duplicatesSkipped: number
  totalInFile: number
  dateRangeStart: Date
  dateRangeEnd: Date
  accounts: string[]
  fileName?: string | undefined
}

@Injectable()
export class ImportHistoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByUser(userId: string): Promise<ImportHistory[]> {
    return this.prisma.importHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findById(id: string, userId: string): Promise<ImportHistory | null> {
    return this.prisma.importHistory.findFirst({
      where: { id, userId },
    })
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
  ): Promise<ImportHistory> {
    return this.prisma.importHistory.create({
      data: {
        userId,
        totalInFile: data.totalInFile,
        fileName: data.fileName ?? null,
        status: ImportStatus.IN_PROGRESS,
      },
    })
  }

  async finalizeImport(
    id: string,
    userId: string,
    data: FinalizeImportData
  ): Promise<ImportHistory> {
    const existing = await this.findById(id, userId)
    if (!existing) {
      throw new NotFoundException(`Import history ${id} not found`)
    }

    return this.prisma.importHistory.update({
      where: { id },
      data: {
        transactionsImported: data.transactionsImported,
        categoriesCreated: data.categoriesCreated,
        duplicatesSkipped: data.duplicatesSkipped,
        dateRangeStart: data.dateRangeStart,
        dateRangeEnd: data.dateRangeEnd,
        accounts: data.accounts,
        status: ImportStatus.COMPLETED,
      },
    })
  }

  async markAsFailed(id: string, userId: string): Promise<ImportHistory> {
    const existing = await this.findById(id, userId)
    if (!existing) {
      throw new NotFoundException(`Import history ${id} not found`)
    }

    return this.prisma.importHistory.update({
      where: { id },
      data: { status: ImportStatus.FAILED },
    })
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

    // Then delete the import history
    await this.prisma.importHistory.delete({
      where: { id },
    })
  }

  async create(
    userId: string,
    data: CreateImportHistoryData
  ): Promise<ImportHistory> {
    return this.prisma.importHistory.create({
      data: {
        userId,
        transactionsImported: data.transactionsImported,
        categoriesCreated: data.categoriesCreated,
        duplicatesSkipped: data.duplicatesSkipped,
        totalInFile: data.totalInFile,
        dateRangeStart: data.dateRangeStart,
        dateRangeEnd: data.dateRangeEnd,
        accounts: data.accounts,
        fileName: data.fileName ?? null,
        status: ImportStatus.COMPLETED,
      },
    })
  }
}
