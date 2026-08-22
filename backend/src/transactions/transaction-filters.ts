/**
 * The one description of "which transactions the user is looking at".
 *
 * ## Why it lives here
 *
 * The filter was expressed twice: the controller turned query strings into a
 * typed object, the service turned that object into a Prisma `where`. Both were
 * inline, so neither could be reused — and a bulk action that wants to target
 * *everything matching the current filter*, rather than the fifty ids that
 * happen to be on screen, needs exactly those two steps.
 *
 * Both functions are pure: no Prisma client, no request. That is what makes the
 * filter testable on its own, which matters because the rules below are not
 * obvious — signed amounts compared by magnitude, a date-only upper bound that
 * has to cover the whole day, a subcategory that means nothing without its
 * category.
 */
import type { Prisma, TransactionType } from '../generated/prisma'

/** A filter, parsed and typed. */
export interface TransactionFilters {
  type?: TransactionType
  startDate?: Date
  endDate?: Date
  categoryId?: string
  subcategoryId?: string
  isPointed?: boolean
  account?: string
  tagId?: string
  search?: string
  amountMin?: number
  amountMax?: number
}

/**
 * A filter as it arrives from the wire. Query strings give everything as
 * strings; a JSON body gives booleans and numbers already typed, so both forms
 * are accepted for the fields where that distinction shows up.
 */
export interface RawTransactionFilters {
  type?: TransactionType
  startDate?: string
  endDate?: string
  categoryId?: string
  subcategoryId?: string
  isPointed?: string | boolean
  account?: string
  tagId?: string
  search?: string
  amountMin?: string | number
  amountMax?: string | number
}

/**
 * Amount bounds are magnitudes: ignore anything non-numeric or negative.
 *
 * An empty string is absence, not zero. `Number('')` is 0, so `?amountMax=`
 * used to narrow the search to transactions of exactly 0 € — a filter nobody
 * asks for, reachable by clearing the field.
 */
function parseAmountBound(value: string | number | undefined): number | null {
  if (value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function parseTransactionFilters(
  raw: RawTransactionFilters
): TransactionFilters {
  const filters: TransactionFilters = {}

  if (raw.type) filters.type = raw.type
  if (raw.startDate) filters.startDate = new Date(raw.startDate)
  if (raw.endDate) {
    const end = new Date(raw.endDate)
    // A date-only bound (YYYY-MM-DD) parses to UTC midnight; extend it to the
    // end of that day so the whole day is included in the inclusive upper bound.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw.endDate))
      end.setUTCHours(23, 59, 59, 999)
    filters.endDate = end
  }
  if (raw.categoryId) filters.categoryId = raw.categoryId
  // A subcategory only exists inside a category, so narrowing by subcategory
  // without a category would be ambiguous: ignore it in that case.
  if (raw.categoryId && raw.subcategoryId)
    filters.subcategoryId = raw.subcategoryId
  if (raw.isPointed !== undefined)
    filters.isPointed =
      typeof raw.isPointed === 'boolean'
        ? raw.isPointed
        : raw.isPointed === 'true'
  if (raw.account) filters.account = raw.account
  if (raw.tagId) filters.tagId = raw.tagId
  if (raw.search && raw.search.trim()) filters.search = raw.search.trim()

  const min = parseAmountBound(raw.amountMin)
  if (min !== null) filters.amountMin = min
  const max = parseAmountBound(raw.amountMax)
  if (max !== null) filters.amountMax = max

  return filters
}

export function buildTransactionWhere(
  userId: string,
  filters?: TransactionFilters
): Prisma.TransactionWhereInput {
  // Conditions that either combine several fields (keyword OR) or express a
  // constraint on the signed amount are collected in an AND array so they
  // never collide with each other or with the top-level filters below.
  const and: Prisma.TransactionWhereInput[] = []

  const search = filters?.search?.trim()
  if (search) {
    and.push({
      OR: [
        { description: { contains: search, mode: 'insensitive' } },
        { note: { contains: search, mode: 'insensitive' } },
        { subcategory: { contains: search, mode: 'insensitive' } },
      ],
    })
  }

  // Amounts are stored signed (expenses negative, income positive) but the
  // user reasons in magnitude, so min/max filter the absolute value.
  if (filters?.amountMin !== undefined) {
    // |amount| >= min  ⇔  amount >= min OR amount <= -min
    and.push({
      OR: [
        { amount: { gte: filters.amountMin } },
        { amount: { lte: -filters.amountMin } },
      ],
    })
  }
  if (filters?.amountMax !== undefined) {
    // |amount| <= max  ⇔  -max <= amount <= max
    and.push({ amount: { gte: -filters.amountMax, lte: filters.amountMax } })
  }

  // Date window: each bound is optional and applied independently.
  const dateFilter: Prisma.DateTimeFilter = {}
  if (filters?.startDate) dateFilter.gte = filters.startDate
  if (filters?.endDate) dateFilter.lte = filters.endDate

  return {
    userId,
    ...(filters?.type && { type: filters.type }),
    ...(filters?.categoryId && { categoryId: filters.categoryId }),
    ...(filters?.subcategoryId && { subcategoryId: filters.subcategoryId }),
    ...(filters?.isPointed !== undefined && { isPointed: filters.isPointed }),
    ...(filters?.account && {
      accountRef: { name: filters.account },
    }),
    ...(filters?.tagId && {
      tags: { some: { tagId: filters.tagId } },
    }),
    ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
    ...(and.length > 0 && { AND: and }),
  }
}
