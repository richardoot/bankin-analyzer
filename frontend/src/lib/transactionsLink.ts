/**
 * The one contract for « voir les transactions de … » links.
 *
 * ## Why it lives here
 *
 * Every screen that shows transactions, or a figure that adds some up, offers
 * a way to open the Transactions page on exactly what was being looked at.
 * The page reads its filters off the URL — and that URL used to be written by
 * hand in four places and parsed in a fifth. One misspelled key and the link
 * opened the page on whatever localStorage held, silently.
 *
 * So the format is defined once: `transactionsLink()` builds the route a
 * sender pushes, `parseTransactionsQuery()` reads it back on the page, and a
 * spec pins that the two agree. Named fields rather than query keys, so a
 * caller never learns the spelling of the URL.
 *
 * ## What a link means
 *
 * A link REPLACES the page's filters, the remembered ones included: the user
 * sees what they clicked, nothing else. A link that comes from an aggregate
 * (a Dashboard figure, a budget cell) carries `gross`: the list shows full
 * amounts, before the joint-account share and before reimbursements, and the
 * page says so. A link to an exact list (a person's debts, a settlement, an
 * import, a handful of ids) carries no such note.
 *
 * ## Smoothed purchases
 *
 * A figure read « Vie courante » counts a smoothed purchase by its monthly
 * slices, in the months they fall in, not at its date. Its link keeps the
 * window it filters on and names the purchases whose slices it counts in
 * `alsoIds`: the list shows those rows on top of the window's, even dated in
 * another month. A union, unlike `ids`, which narrows. The sender knows
 * which purchases (the budget statistics list them), so no date arithmetic
 * is repeated server-side.
 */
import type { LocationQuery, RouteLocationRaw } from 'vue-router'

export type TransactionsLinkType = 'EXPENSE' | 'INCOME' | 'TRANSFER'

/** The value that asks for « sans catégorie » / « sans sous-catégorie ». */
export const NO_CATEGORY = 'none'

/**
 * The rows carrying an exceptional event's tag: left out (`exclude`, the
 * « Vie courante » reading) or kept alone (`only`, the share it sets aside).
 */
export type ExceptionalFilter = 'exclude' | 'only'

/**
 * A row's nature — its subcategory's, else its category's default — and
 * its rhythm, as the Dashboard reads them; `none` is « à migrer ».
 */
export type NatureFilter = 'ESSENTIAL' | 'PLEASURE' | typeof NO_CATEGORY
export type RhythmFilter = 'COMMITTED' | 'VARIABLE' | typeof NO_CATEGORY

export const NATURE_LABEL: Record<NatureFilter, string> = {
  ESSENTIAL: 'Essentiel',
  PLEASURE: 'Plaisir',
  none: 'À migrer',
}

export const RHYTHM_LABEL: Record<RhythmFilter, string> = {
  COMMITTED: 'Engagé',
  VARIABLE: 'Variable',
  none: 'À migrer',
}

/** How the Transactions page names that filter, in a chip. */
export const EXCEPTIONAL_LABEL: Record<ExceptionalFilter, string> = {
  exclude: 'Hors événements exceptionnels',
  only: 'Événements exceptionnels seulement',
}

export const TRANSACTIONS_PAGE_SIZES = [20, 50, 100] as const

export interface TransactionsLinkFilters {
  type?: TransactionsLinkType | undefined
  /** A category id, or `NO_CATEGORY` for the rows filed nowhere. */
  categoryId?: string | undefined
  /** Only meaningful with a real `categoryId`; `NO_CATEGORY` for none. */
  subcategoryId?: string | undefined
  /** The account's name, as the page's select knows it. */
  account?: string | undefined
  tagId?: string | undefined
  /** `YYYY-MM`: expanded to `from` / `to` covering the whole month. */
  month?: string | undefined
  /** `YYYY-MM-DD`, inclusive. */
  from?: string | undefined
  to?: string | undefined
  /** Magnitudes, as the page's amount fields hold them. */
  min?: string | number | undefined
  max?: string | number | undefined
  q?: string | undefined
  notPointed?: boolean | undefined
  /** Rows a bank sync lost the reference to. */
  review?: boolean | undefined
  /** `<amountBucket>:<merchantKey>`, with the series' name for the chip. */
  recurrence?: string | undefined
  recurrenceLabel?: string | undefined
  /** The expenses one person owes something on. */
  personId?: string | undefined
  /** `open`: a remainder is still owed; `all`: every debt, settled too. */
  reimbursement?: 'open' | 'all' | undefined
  /** The expenses this settlement closed, and the income that paid them. */
  settlementId?: string | undefined
  /** The rows one CSV import wrote. */
  importId?: string | undefined
  /** The rows one bank sync run inserted or claimed. */
  syncRunId?: string | undefined
  /** An exact list of rows. */
  ids?: string[] | undefined
  /** The rows of an exceptional event, left out or kept alone. */
  exceptional?: ExceptionalFilter | undefined
  /** Essentiel, Plaisir, or « à migrer ». */
  nature?: NatureFilter | undefined
  /** Engagé, Variable, or « à migrer ». */
  rhythm?: RhythmFilter | undefined
  /**
   * Any of these categories — `NO_CATEGORY` among them for the rows filed
   * nowhere. Only links carry a list; the page's select picks one.
   */
  categoryIds?: string[] | undefined
  /** The lines of any of these series, each `<amountBucket>:<merchantKey>`. */
  recurrences?: string[] | undefined
  /** Only the rows smoothed over several months (« Lissées »). */
  amortized?: boolean | undefined
  /**
   * Rows shown on top of what the other filters match: the smoothed
   * purchases a « Vie courante » figure counts by their slices.
   */
  alsoIds?: string[] | undefined
  /** What the context banner says, when the filters alone would not. */
  label?: string | undefined
  /** The figure the link came from was netted and shared; the list is not. */
  gross?: boolean | undefined
  sort?: 'date' | 'amount' | undefined
  dir?: 'asc' | 'desc' | undefined
  size?: number | undefined
  page?: number | undefined
}

/**
 * Every key the page reads. Any one of them present means « this link carries
 * a view » and localStorage keeps quiet — `recurrenceLabel` or `sort` alone
 * included, so a link is never half-applied over remembered filters.
 */
export const TRANSACTIONS_QUERY_KEYS = [
  'type',
  'category',
  'subcategory',
  'account',
  'tag',
  'notPointed',
  'review',
  'recurrence',
  'recurrenceLabel',
  'q',
  'from',
  'to',
  'min',
  'max',
  'person',
  'reimbursement',
  'settlement',
  'import',
  'syncRun',
  'ids',
  'exceptional',
  'nature',
  'rhythm',
  'categories',
  'recurrences',
  'amortized',
  'also',
  'label',
  'gross',
  'sort',
  'dir',
  'size',
  'page',
] as const

export type TransactionsQueryKey = (typeof TRANSACTIONS_QUERY_KEYS)[number]

export type TransactionsQuery = Partial<Record<TransactionsQueryKey, string>>

/** The first value of a query entry, or null when absent or blank. */
export function firstQueryParam(value: unknown): string | null {
  const single = Array.isArray(value) ? value[0] : value
  return typeof single === 'string' && single !== '' ? single : null
}

/** `2026-10` → the first and last day of that month. */
export function monthWindow(
  month: string
): { from: string; to: string } | null {
  const match = month.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const index = Number(match[2])
  if (index < 1 || index > 12) return null
  const lastDay = new Date(Date.UTC(year, index, 0)).getUTCDate()
  const mm = String(index).padStart(2, '0')
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${lastDay}` }
}

function trimmed(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined
  const text = String(value).trim()
  return text === '' ? undefined : text
}

/**
 * The most values a list may carry: the server refuses more rather than
 * truncate. A sender with a longer list offers no link.
 */
export const MAX_LINK_LIST = 200

/** A list trimmed, blanks out, duplicates out, in its first order. */
function cleanList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map(v => v.trim()).filter(v => v !== ''))]
}

/**
 * The filters as query parameters, blanks and defaults left out. Pure and
 * deterministic: two equal filter sets give two equal queries, which is what
 * lets the page tell a link from its own URL mirroring.
 */
export function transactionsQuery(
  filters: TransactionsLinkFilters
): TransactionsQuery {
  const query: TransactionsQuery = {}
  if (filters.type) query.type = filters.type
  const category = trimmed(filters.categoryId)
  if (category) {
    query.category = category
    const subcategory = trimmed(filters.subcategoryId)
    // « Sans catégorie » has no subcategory to speak of.
    if (subcategory && category !== NO_CATEGORY) query.subcategory = subcategory
  }
  const account = trimmed(filters.account)
  if (account) query.account = account
  const tag = trimmed(filters.tagId)
  if (tag) query.tag = tag
  if (filters.notPointed) query.notPointed = '1'
  if (filters.review) query.review = '1'
  const recurrence = trimmed(filters.recurrence)
  if (recurrence) {
    query.recurrence = recurrence
    const recurrenceLabel = trimmed(filters.recurrenceLabel)
    if (recurrenceLabel) query.recurrenceLabel = recurrenceLabel
  }
  const q = trimmed(filters.q)
  if (q) query.q = q
  const window = filters.month ? monthWindow(filters.month) : null
  const from = window?.from ?? trimmed(filters.from)
  const to = window?.to ?? trimmed(filters.to)
  if (from) query.from = from
  if (to) query.to = to
  const min = trimmed(filters.min)
  if (min !== undefined) query.min = min
  const max = trimmed(filters.max)
  if (max !== undefined) query.max = max
  const person = trimmed(filters.personId)
  if (person) query.person = person
  if (filters.reimbursement) query.reimbursement = filters.reimbursement
  const settlement = trimmed(filters.settlementId)
  if (settlement) query.settlement = settlement
  const importId = trimmed(filters.importId)
  if (importId) query.import = importId
  const syncRun = trimmed(filters.syncRunId)
  if (syncRun) query.syncRun = syncRun
  const ids = (filters.ids ?? []).map(id => id.trim()).filter(id => id !== '')
  if (ids.length > 0) query.ids = ids.join(',')
  if (filters.exceptional) query.exceptional = filters.exceptional
  if (filters.nature) query.nature = filters.nature
  if (filters.rhythm) query.rhythm = filters.rhythm
  const categories = cleanList(filters.categoryIds)
  if (categories.length > 0) query.categories = categories.join(',')
  const recurrences = cleanList(filters.recurrences)
  if (recurrences.length > 0) query.recurrences = recurrences.join(',')
  if (filters.amortized) query.amortized = '1'
  const also = cleanList(filters.alsoIds)
  if (also.length > 0) query.also = also.join(',')
  const label = trimmed(filters.label)
  if (label) query.label = label
  if (filters.gross) query.gross = '1'
  if (filters.sort && filters.sort !== 'date') query.sort = filters.sort
  if (filters.dir && filters.dir !== 'desc') query.dir = filters.dir
  if (
    filters.size !== undefined &&
    filters.size !== 20 &&
    (TRANSACTIONS_PAGE_SIZES as readonly number[]).includes(filters.size)
  )
    query.size = String(filters.size)
  if (filters.page !== undefined && filters.page > 1)
    query.page = String(Math.floor(filters.page))
  return query
}

/** The route a sender pushes: `router.push(transactionsLink({ … }))`. */
export function transactionsLink(
  filters: TransactionsLinkFilters = {}
): RouteLocationRaw {
  return { path: '/transactions', query: transactionsQuery(filters) }
}

/**
 * The filters a URL carries, normalised: a month already expanded, a
 * subcategory dropped without its category, unknown values ignored. The
 * inverse of `transactionsQuery` — `parse(query(f))` is `f` normalised.
 */
export function parseTransactionsQuery(
  query: LocationQuery | TransactionsQuery
): TransactionsLinkFilters {
  const get = (key: TransactionsQueryKey): string | null =>
    firstQueryParam((query as Record<string, unknown>)[key])
  const filters: TransactionsLinkFilters = {}

  const type = get('type')
  if (type === 'EXPENSE' || type === 'INCOME' || type === 'TRANSFER')
    filters.type = type
  const category = get('category')
  if (category) {
    filters.categoryId = category
    const subcategory = get('subcategory')
    if (subcategory && category !== NO_CATEGORY)
      filters.subcategoryId = subcategory
  }
  const account = get('account')
  if (account) filters.account = account
  const tag = get('tag')
  if (tag) filters.tagId = tag
  if (get('notPointed') === '1') filters.notPointed = true
  if (get('review') === '1') filters.review = true
  const recurrence = get('recurrence')
  if (recurrence) {
    filters.recurrence = recurrence
    const recurrenceLabel = get('recurrenceLabel')
    if (recurrenceLabel) filters.recurrenceLabel = recurrenceLabel
  }
  const q = get('q')
  if (q?.trim()) filters.q = q.trim()
  const from = get('from')
  if (from) filters.from = from
  const to = get('to')
  if (to) filters.to = to
  const min = get('min')
  if (min?.trim()) filters.min = min.trim()
  const max = get('max')
  if (max?.trim()) filters.max = max.trim()
  const person = get('person')
  if (person) filters.personId = person
  const reimbursement = get('reimbursement')
  if (reimbursement === 'open' || reimbursement === 'all')
    filters.reimbursement = reimbursement
  const settlement = get('settlement')
  if (settlement) filters.settlementId = settlement
  const importId = get('import')
  if (importId) filters.importId = importId
  const syncRun = get('syncRun')
  if (syncRun) filters.syncRunId = syncRun
  const ids = (get('ids') ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(id => id !== '')
  if (ids.length > 0) filters.ids = ids
  const exceptional = get('exceptional')
  if (exceptional === 'exclude' || exceptional === 'only')
    filters.exceptional = exceptional
  const nature = get('nature')
  if (nature === 'ESSENTIAL' || nature === 'PLEASURE' || nature === NO_CATEGORY)
    filters.nature = nature
  const rhythm = get('rhythm')
  if (rhythm === 'COMMITTED' || rhythm === 'VARIABLE' || rhythm === NO_CATEGORY)
    filters.rhythm = rhythm
  const categories = cleanList((get('categories') ?? '').split(','))
  if (categories.length > 0) filters.categoryIds = categories
  const recurrences = cleanList((get('recurrences') ?? '').split(','))
  if (recurrences.length > 0) filters.recurrences = recurrences
  if (get('amortized') === '1') filters.amortized = true
  const also = cleanList((get('also') ?? '').split(','))
  if (also.length > 0) filters.alsoIds = also
  const label = get('label')
  if (label?.trim()) filters.label = label.trim()
  if (get('gross') === '1') filters.gross = true
  if (get('sort') === 'amount') filters.sort = 'amount'
  if (get('dir') === 'asc') filters.dir = 'asc'
  const size = Number(get('size'))
  if ((TRANSACTIONS_PAGE_SIZES as readonly number[]).includes(size))
    filters.size = size
  const page = parseInt(get('page') ?? '', 10)
  if (Number.isFinite(page) && page > 1) filters.page = page

  return filters
}

/** Whether a URL carries a view at all — any known key, blanks excluded. */
export function hasTransactionsQuery(query: LocationQuery): boolean {
  return TRANSACTIONS_QUERY_KEYS.some(
    key => firstQueryParam(query[key]) !== null
  )
}

/**
 * Whether the filters name a *context* — something the page's own controls
 * cannot express, so the banner has to: a person, a settlement, an import,
 * a sync run, an explicit list, or a label the sender chose.
 */
export function isTransactionsContext(
  filters: TransactionsLinkFilters
): boolean {
  return Boolean(
    filters.label ||
    filters.personId ||
    filters.reimbursement ||
    filters.settlementId ||
    filters.importId ||
    filters.syncRunId ||
    (filters.ids && filters.ids.length > 0) ||
    (filters.alsoIds && filters.alsoIds.length > 0)
  )
}

/** Two queries that would open the same view. */
export function sameTransactionsQuery(
  a: TransactionsQuery,
  b: TransactionsQuery
): boolean {
  return TRANSACTIONS_QUERY_KEYS.every(key => (a[key] ?? '') === (b[key] ?? ''))
}
