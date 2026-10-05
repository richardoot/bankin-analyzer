/**
 * Loading the shared merchant memory, and not loading it again for a while.
 *
 * The aggregate groups every filed purchase and receipt in the database by
 * label and catalogue key. It is one query, cheap at today's size and
 * bounded at any size by the number of distinct labels, but it answers the
 * same thing for every sync and every import, so it is kept for a few
 * minutes rather than run on each. A filing made a minute ago does not need
 * to be shared knowledge a minute later.
 *
 * Only aggregates leave the database: label, sign, key, a count, and the
 * opaque id of the user who made them — folded into a count of users as the
 * memory is built. See `merchant-memory.ts` for what that means and why.
 */

import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '../generated/prisma'
import { PrismaService } from '../prisma/prisma.service'
import {
  buildMerchantMemory,
  type MerchantFilingRow,
  type MerchantMemory,
} from './merchant-memory'

const CACHE_TTL_MS = 10 * 60 * 1000

@Injectable()
export class MerchantMemoryService {
  private readonly logger = new Logger(MerchantMemoryService.name)
  private cached: { memory: MerchantMemory; at: number } | null = null

  constructor(private readonly prisma: PrismaService) {}

  async load(): Promise<MerchantMemory> {
    const now = Date.now()
    if (this.cached && now - this.cached.at < CACHE_TTL_MS) {
      return this.cached.memory
    }
    try {
      const rows = await this.prisma.$queryRaw<MerchantFilingRow[]>(Prisma.sql`
        SELECT
          t.description,
          t.type::text AS type,
          c.catalog_key AS "categoryKey",
          s.catalog_key AS "subcategoryKey",
          COUNT(*)::int AS count,
          t.user_id AS "userId"
        FROM app.transactions t
        JOIN app.categories c ON c.id = t.category_id
        LEFT JOIN app.subcategories s ON s.id = t.subcategory_id
        WHERE c.catalog_key IS NOT NULL
          AND t.type IN ('EXPENSE', 'INCOME')
        GROUP BY t.description, t.type, c.catalog_key, s.catalog_key, t.user_id
      `)
      const memory = buildMerchantMemory(rows)
      this.cached = { memory, at: now }
      return memory
    } catch (error) {
      // A memory that cannot be read is an empty memory: the rules and the
      // model still run, and nothing is filed wrong for want of it.
      this.logger.error('Merchant memory could not be loaded', error)
      return new Map()
    }
  }

  /** For the tests, and for a run that must see the latest filings. */
  forget(): void {
    this.cached = null
  }
}
