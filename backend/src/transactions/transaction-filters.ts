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
import { BadRequestException } from '@nestjs/common'
import {
  TransactionSource,
  type Prisma,
  type TransactionType,
} from '../generated/prisma'

/** The query value that asks for « sans catégorie » / « sans sous-catégorie ». */
export const NO_CATEGORY = 'none'

/** An explicit id list is a link, not a bulk upload: keep the URL sane. */
export const MAX_TRANSACTION_IDS = 200

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A filter, parsed and typed. */
export interface TransactionFilters {
  type?: TransactionType
  startDate?: Date
  endDate?: Date
  /** A category, or `null` for the rows filed nowhere. */
  categoryId?: string | null
  /** A subcategory, or `null` for the rows of the category without one. */
  subcategoryId?: string | null
  isPointed?: boolean
  account?: string
  tagId?: string
  search?: string
  amountMin?: number
  amountMax?: number
  /**
   * A row a sync inserted or claimed, then lost its bank reference to —
   * cleared to "— aucun —", or by a correction still pending on the other
   * side of a swap. Still real, still wherever it landed; just waiting for a
   * person to say where it actually belongs.
   */
  needsBankReview?: boolean
  /**
   * The lines of one recurring charge, named by what survives a recompute —
   * its merchant and amount bucket — rather than by a row id that does not.
   */
  recurrence?: { merchantKey: string; amountBucket: number }
  /**
   * An exact list of rows, as a link from one settlement line or one
   * duplicate names them. Empty when the caller named only ids that could
   * not be ids: matching nothing is the honest answer, matching everything
   * would be a leak dressed as a list.
   */
  ids?: string[]
  /**
   * The expenses carrying a reimbursement request — of one person, or of
   * anyone — and, with `open`, only those where a remainder is still owed.
   * `open` needs the ledger, which a `where` alone cannot sum: the service
   * resolves it before building the query.
   */
  reimbursement?: { personId?: string; open: boolean }
  /** The expenses one settlement closed, and the income that paid them. */
  settlementId?: string
  /** The rows one CSV import wrote. */
  importHistoryId?: string
  /** The rows one bank sync run inserted or claimed. */
  syncRunId?: string
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
  needsBankReview?: string | boolean
  /** `<amountBucket>:<merchantKey>`, e.g. `15:com netflix`. */
  recurrence?: string
  /** Comma-separated in a query string, an array in a JSON body. */
  ids?: string | string[]
  personId?: string
  /** `open` or `all`; anything else reads as `all`. */
  reimbursement?: string
  settlementId?: string
  importId?: string
  syncRunId?: string
}

/**
 * The ids a caller named, deduplicated, the non-ids dropped. More than the
 * cap is refused rather than truncated: a silently shortened list would
 * show a wrong answer with a straight face.
 */
function parseIds(value: string | string[] | undefined): string[] | null {
  if (value === undefined) return null
  const raw = (Array.isArray(value) ? value : value.split(','))
    .map(id => id.trim())
    .filter(id => id !== '')
  if (raw.length === 0) return null
  if (raw.length > MAX_TRANSACTION_IDS) {
    throw new BadRequestException(
      `ids accepts at most ${MAX_TRANSACTION_IDS} values, got ${raw.length}`
    )
  }
  return [...new Set(raw.filter(id => UUID_PATTERN.test(id)))]
}

/** `15:com netflix` → the series; anything else is ignored. */
function parseRecurrence(
  value: string | undefined
): TransactionFilters['recurrence'] | null {
  const match = value?.match(/^(-?\d+):(.+)$/)
  if (!match?.[1] || !match[2]) return null
  return { amountBucket: Number(match[1]), merchantKey: match[2] }
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
  if (raw.categoryId === NO_CATEGORY) filters.categoryId = null
  else if (raw.categoryId) filters.categoryId = raw.categoryId
  // A subcategory only exists inside a category, so narrowing by subcategory
  // without a category would be ambiguous: ignore it in that case. Under
  // « sans catégorie » there is no subcategory to speak of either.
  if (filters.categoryId && raw.subcategoryId) {
    filters.subcategoryId =
      raw.subcategoryId === NO_CATEGORY ? null : raw.subcategoryId
  }
  if (raw.isPointed !== undefined)
    filters.isPointed =
      typeof raw.isPointed === 'boolean'
        ? raw.isPointed
        : raw.isPointed === 'true'
  if (raw.account) filters.account = raw.account
  if (raw.tagId) filters.tagId = raw.tagId
  if (raw.search && raw.search.trim()) filters.search = raw.search.trim()
  if (raw.needsBankReview !== undefined)
    filters.needsBankReview =
      typeof raw.needsBankReview === 'boolean'
        ? raw.needsBankReview
        : raw.needsBankReview === 'true'

  const recurrence = parseRecurrence(raw.recurrence)
  if (recurrence) filters.recurrence = recurrence

  const ids = parseIds(raw.ids)
  if (ids) filters.ids = ids

  if (raw.personId || raw.reimbursement) {
    filters.reimbursement = {
      ...(raw.personId && { personId: raw.personId }),
      open: raw.reimbursement === 'open',
    }
  }
  if (raw.settlementId) filters.settlementId = raw.settlementId
  if (raw.importId) filters.importHistoryId = raw.importId
  if (raw.syncRunId) filters.syncRunId = raw.syncRunId

  const min = parseAmountBound(raw.amountMin)
  if (min !== null) filters.amountMin = min
  const max = parseAmountBound(raw.amountMax)
  if (max !== null) filters.amountMax = max

  return filters
}

/**
 * What the service resolved before the query could be built: the rows an
 * open-debt filter names, read off the payment ledger.
 */
export interface ResolvedTransactionFilters {
  openDebtTransactionIds?: string[]
}

export function buildTransactionWhere(
  userId: string,
  filters?: TransactionFilters,
  resolved: ResolvedTransactionFilters = {}
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

  // An explicit list, and the open debts, both narrow by id: kept apart
  // here so a link naming both still means their intersection.
  if (filters?.ids) and.push({ id: { in: filters.ids } })

  if (filters?.reimbursement) {
    const { personId, open } = filters.reimbursement
    if (open) {
      if (!resolved.openDebtTransactionIds) {
        throw new Error(
          'An open-debt filter needs its transaction ids resolved first'
        )
      }
      and.push({ id: { in: resolved.openDebtTransactionIds } })
    } else {
      and.push({
        reimbursementRequests: { some: personId ? { personId } : {} },
      })
    }
  }

  if (filters?.settlementId) {
    const settlementId = filters.settlementId
    and.push({
      OR: [
        { settlementsAsIncome: { some: { id: settlementId } } },
        {
          reimbursementRequests: {
            some: { settlements: { some: { settlementId } } },
          },
        },
      ],
    })
  }

  // Date window: each bound is optional and applied independently.
  const dateFilter: Prisma.DateTimeFilter = {}
  if (filters?.startDate) dateFilter.gte = filters.startDate
  if (filters?.endDate) dateFilter.lte = filters.endDate

  return {
    userId,
    ...(filters?.type && { type: filters.type }),
    // `null` is a value here: the rows filed nowhere.
    ...(filters?.categoryId !== undefined && {
      categoryId: filters.categoryId,
    }),
    ...(filters?.subcategoryId !== undefined && {
      subcategoryId: filters.subcategoryId,
    }),
    ...(filters?.importHistoryId && {
      importHistoryId: filters.importHistoryId,
    }),
    ...(filters?.syncRunId && { syncRunId: filters.syncRunId }),
    ...(filters?.isPointed !== undefined && { isPointed: filters.isPointed }),
    ...(filters?.account && {
      accountRef: { name: filters.account },
    }),
    ...(filters?.tagId && {
      tags: { some: { tagId: filters.tagId } },
    }),
    ...(filters?.recurrence && {
      recurrences: { some: { recurrence: filters.recurrence } },
    }),
    ...(filters?.needsBankReview && {
      source: TransactionSource.BANK_API,
      externalId: null,
    }),
    ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
    ...(and.length > 0 && { AND: and }),
  }
}
