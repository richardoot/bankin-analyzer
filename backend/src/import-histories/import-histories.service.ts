import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { ImportHistory } from '../generated/prisma'

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

  async getLatestImportDate(userId: string): Promise<Date | null> {
    const latest = await this.prisma.importHistory.findFirst({
      where: { userId },
      orderBy: { dateRangeEnd: 'desc' },
      select: { dateRangeEnd: true },
    })
    return latest?.dateRangeEnd ?? null
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
      },
    })
  }
}
