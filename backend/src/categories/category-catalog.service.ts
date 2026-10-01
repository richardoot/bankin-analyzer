import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  isEmptySummary,
  provisionCatalogForUser,
} from './category-catalog.provisioning'
import type { ProvisioningSummary } from './category-catalog.provisioning'

/**
 * Gives a user the catalogue. Thin on purpose: the decisions are in
 * `category-catalog.plan.ts`, the database work in
 * `category-catalog.provisioning.ts`, and both are shared with the script
 * that provisions the accounts created before the catalogue existed.
 */
@Injectable()
export class CategoryCatalogService {
  private readonly logger = new Logger(CategoryCatalogService.name)

  constructor(private readonly prisma: PrismaService) {}

  async ensureCatalog(userId: string): Promise<ProvisioningSummary> {
    const summary = await provisionCatalogForUser(this.prisma, userId)
    if (!isEmptySummary(summary)) {
      this.logger.log(
        `Catalogue provisioned for user ${userId}: ` +
          `${summary.createdCategories} categories created, ` +
          `${summary.adoptedCategories} adopted, ` +
          `${summary.createdSubcategories} subcategories created, ` +
          `${summary.adoptedSubcategories} adopted`
      )
    }
    return summary
  }
}
