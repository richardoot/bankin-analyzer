import { Injectable } from '@nestjs/common'
import { FilterPreferencesService } from '../filter-preferences/filter-preferences.service'
import { Prisma } from '../generated/prisma'
import {
  REIMBURSEMENT_CREDIT_JOINS,
  netAmountSql,
  reimbursementCreditCtes,
  visibleRowSql,
} from '../reimbursements/reimbursement-credit.sql'

/**
 * The SQL pieces that make a tag's figures read like the dashboard's and the
 * budget's, to splice into one query over `app.transactions t` joined to
 * `app.accounts a`:
 *
 *  - `ctes`, the reimbursement ledger, for the `WITH` clause;
 *  - `joins`, right after the transactions join;
 *  - `amount`, what a line counts, positive for an expense and an income
 *    alike: net of the reimbursements, then divided by the account divisor;
 *  - `visible`, a predicate keeping out an income entirely drawn to repay
 *    debts, whose expenses are already netted.
 */
export interface TagNetting {
  ctes: Prisma.Sql
  joins: Prisma.Sql
  amount: Prisma.Sql
  visible: Prisma.Sql
}

/**
 * Resolves the netting rule for a user. A tag page has no filters: cash
 * received is always deducted, and a debt still owed follows the user's
 * preference, as the dashboard does by default.
 */
@Injectable()
export class TagNettingService {
  constructor(private readonly filterPreferences: FilterPreferencesService) {}

  async forUser(userId: string): Promise<TagNetting> {
    const deductPending =
      await this.filterPreferences.deductsPendingByDefault(userId)
    return tagNettingSql(userId, { deductReceived: true, deductPending })
  }
}

/** The pieces for a given rule, without reading any preference. */
export function tagNettingSql(
  userId: string,
  options: { deductReceived: boolean; deductPending: boolean }
): TagNetting {
  return {
    ctes: reimbursementCreditCtes(userId),
    joins: REIMBURSEMENT_CREDIT_JOINS,
    amount: netAmountSql(options),
    visible: visibleRowSql(options),
  }
}
