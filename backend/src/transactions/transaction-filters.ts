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

/**
 * Whether a row carries an exceptional event's tag. `exclude` is the
 * « Vie courante » reading of the Dashboard and the Budget, `only` the part
 * of a figure those readings set aside.
 */
export const EXCEPTIONAL_FILTERS = ['exclude', 'only'] as const
export type ExceptionalFilter = (typeof EXCEPTIONAL_FILTERS)[number]

/**
 * A row's nature: its subcategory's, else its category's default — the
 * COALESCE the Dashboard's spending structure reads. `none` is « à migrer »:
 * neither says anything.
 */
export const NATURE_FILTERS = ['ESSENTIAL', 'PLEASURE', NO_CATEGORY] as const
export type NatureFilter = (typeof NATURE_FILTERS)[number]

/**
 * A row's rhythm as the Dashboard reads it: COMMITTED for a line of an active
 * or stopped recurrence whatever its subcategory says, else its
 * subcategory's rhythm, else its category's default. `none`: none of those.
 */
export const RHYTHM_FILTERS = ['COMMITTED', 'VARIABLE', NO_CATEGORY] as const
export type RhythmFilter = (typeof RHYTHM_FILTERS)[number]

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
  /**
   * The rows carrying at least one of the user's exceptional tags (`only`),
   * or none of them (`exclude`) — the same test the Dashboard and the
   * Budget apply to tell an event from everyday life.
   */
  exceptional?: ExceptionalFilter
  /** Essentiel, Plaisir, or neither (« à migrer »). */
  nature?: NatureFilter
  /** Engagé, Variable, or neither (« à migrer »). */
  rhythm?: RhythmFilter
  /**
   * The rows filed under any of these categories — `null` in the list for
   * the rows filed nowhere. Empty when nothing usable was named: matching
   * nothing, as with `ids`.
   */
  categoryIds?: (string | null)[]
  /** The lines of any of these recurring charges, named as `recurrence`. */
  recurrences?: { merchantKey: string; amountBucket: number }[]
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
  /** `exclude` or `only`; anything else is refused. */
  exceptional?: string
  /** `ESSENTIAL`, `PLEASURE` or `none`; anything else is refused. */
  nature?: string
  /** `COMMITTED`, `VARIABLE` or `none`; anything else is refused. */
  rhythm?: string
  /** Comma-separated in a query string, an array in a JSON body. */
  categoryIds?: string | string[]
  /** `<amountBucket>:<merchantKey>` each; comma-separated or an array. */
  recurrences?: string | string[]
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

/**
 * A list as a query string or a JSON body gives it, trimmed, blanks out,
 * capped like `ids`: refused beyond, never truncated. Null when absent.
 */
function parseList(
  name: string,
  value: string | string[] | undefined
): string[] | null {
  if (value === undefined) return null
  const raw = (Array.isArray(value) ? value : value.split(','))
    .map(item => item.trim())
    .filter(item => item !== '')
  if (raw.length === 0) return null
  if (raw.length > MAX_TRANSACTION_IDS) {
    throw new BadRequestException(
      `${name} accepts at most ${MAX_TRANSACTION_IDS} values, got ${raw.length}`
    )
  }
  return [...new Set(raw)]
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
 * One of a closed set of values, or nothing. A value outside the set is
 * refused rather than ignored: ignored, the link would open on more rows than
 * the figure it came from, and nothing on screen would say so.
 */
function parseChoice<T extends string>(
  name: string,
  value: string | undefined,
  allowed: readonly T[]
): T | null {
  if (value === undefined || value === '') return null
  if ((allowed as readonly string[]).includes(value)) return value as T
  throw new BadRequestException(
    `${name} must be one of ${allowed.join(', ')}, got '${value}'`
  )
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

  // Category ids are uuids; `none` stands for the rows filed nowhere.
  // What is neither is dropped, and a list left empty matches nothing.
  const categoryIds = parseList('categoryIds', raw.categoryIds)
  if (categoryIds) {
    filters.categoryIds = categoryIds
      .filter(id => id === NO_CATEGORY || UUID_PATTERN.test(id))
      .map(id => (id === NO_CATEGORY ? null : id))
  }
  const recurrences = parseList('recurrences', raw.recurrences)
  if (recurrences) {
    filters.recurrences = recurrences.flatMap(key => parseRecurrence(key) ?? [])
  }

  if (raw.personId || raw.reimbursement) {
    filters.reimbursement = {
      ...(raw.personId && { personId: raw.personId }),
      open: raw.reimbursement === 'open',
    }
  }
  if (raw.settlementId) filters.settlementId = raw.settlementId
  if (raw.importId) filters.importHistoryId = raw.importId
  if (raw.syncRunId) filters.syncRunId = raw.syncRunId

  const exceptional = parseChoice(
    'exceptional',
    raw.exceptional,
    EXCEPTIONAL_FILTERS
  )
  if (exceptional) filters.exceptional = exceptional
  const nature = parseChoice('nature', raw.nature, NATURE_FILTERS)
  if (nature) filters.nature = nature
  const rhythm = parseChoice('rhythm', raw.rhythm, RHYTHM_FILTERS)
  if (rhythm) filters.rhythm = rhythm

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

/**
 * `COALESCE(sc.<field>, c.<default>) = value`, or both null for `none`, as a
 * Prisma condition. A row with no subcategory, or one whose subcategory says
 * nothing, falls back to its category; a row with no category says nothing.
 */
function attributeIs(
  field: 'nature' | 'rhythm',
  value: string | null
): Prisma.TransactionWhereInput {
  const fallback = field === 'nature' ? 'defaultNature' : 'defaultRhythm'
  const subcategorySaysNothing: Prisma.TransactionWhereInput = {
    OR: [
      { subcategoryId: null },
      { subcategoryRef: { is: { [field]: null } } },
    ],
  }
  if (value === null) {
    return {
      AND: [
        subcategorySaysNothing,
        {
          OR: [
            { categoryId: null },
            { category: { is: { [fallback]: null } } },
          ],
        },
      ],
    }
  }
  return {
    OR: [
      { subcategoryRef: { is: { [field]: value } } },
      {
        AND: [
          subcategorySaysNothing,
          { category: { is: { [fallback]: value } } },
        ],
      },
    ],
  }
}

/**
 * A line of a recurrence that proves a commitment — ACTIVE or STOPPED, never
 * a CANDIDATE — the `rtx` join of the Dashboard's rhythm.
 */
function provenRecurrence(
  userId: string
): Prisma.RecurrenceTransactionWhereInput {
  return {
    recurrence: { userId, status: { in: ['ACTIVE', 'STOPPED'] } },
  }
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

  // Same test as the `exceptional_tx` CTE of the Dashboard and the Budget:
  // one of the user's own tags, flagged exceptional. Kept in the AND list so
  // it combines with a `tagId` filter instead of overwriting it.
  if (filters?.exceptional) {
    const exceptionalTag = { tag: { userId, isExceptional: true } }
    and.push({
      tags:
        filters.exceptional === 'only'
          ? { some: exceptionalTag }
          : { none: exceptionalTag },
    })
  }

  // Lists from a link: any of the named categories, any of the named
  // series. In AND, so a single `categoryId` or `recurrence` still narrows.
  if (filters?.categoryIds) {
    const real = filters.categoryIds.filter((id): id is string => id !== null)
    const either: Prisma.TransactionWhereInput[] = []
    if (real.length > 0) either.push({ categoryId: { in: real } })
    if (real.length < filters.categoryIds.length)
      either.push({ categoryId: null })
    and.push(either.length > 0 ? { OR: either } : { id: { in: [] } })
  }
  if (filters?.recurrences) {
    and.push(
      filters.recurrences.length > 0
        ? {
            recurrences: {
              some: {
                recurrence: { userId, OR: filters.recurrences },
              },
            },
          }
        : { id: { in: [] } }
    )
  }

  if (filters?.nature) {
    and.push(
      attributeIs(
        'nature',
        filters.nature === NO_CATEGORY ? null : filters.nature
      )
    )
  }

  // The rhythm the Dashboard reads: a proven recurrence makes a line
  // committed, whatever its subcategory says; only the lines outside one
  // fall back to the subcategory, then the category.
  if (filters?.rhythm) {
    const recurring = provenRecurrence(userId)
    if (filters.rhythm === 'COMMITTED') {
      and.push({
        OR: [
          { recurrences: { some: recurring } },
          attributeIs('rhythm', 'COMMITTED'),
        ],
      })
    } else {
      and.push({
        AND: [
          { recurrences: { none: recurring } },
          attributeIs(
            'rhythm',
            filters.rhythm === NO_CATEGORY ? null : filters.rhythm
          ),
        ],
      })
    }
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
