import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000'

const SESSION_TIMEOUT_MS = 10000

// Custom error for authentication failures
export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * The browser could not reach the server at all — offline, DNS, CORS, a
 * server that is down. `fetch` reports it as a bare `TypeError: Failed to
 * fetch`, which is neither French nor something the user can act on.
 */
export class NetworkError extends Error {
  constructor() {
    super(
      'Le serveur est injoignable. Vérifiez votre connexion puis réessayez.'
    )
    this.name = 'NetworkError'
  }
}

/** `fetch`, with a network failure turned into a `NetworkError`. */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (err) {
    // An abort is the caller's own decision, not a failure to report.
    if (err instanceof TypeError) throw new NetworkError()
    throw err
  }
}

export interface DbUser {
  id: string
  supabaseId: string
  email: string
  createdAt: string
  updatedAt: string
}

export interface ImportTransactionDto {
  date: string
  description: string
  amount: number
  category: string
  subcategory?: string
  account: string
  type: 'EXPENSE' | 'INCOME'
  note?: string
  isPointed?: boolean
  forceImport?: boolean
}

// Import Preview DTOs
export interface UploadedTransactionDto {
  index: number
  date: string
  description: string
  amount: number
  account: string
  category: string
  type: 'EXPENSE' | 'INCOME'
  subcategory?: string
  note?: string
}

export interface ExistingTransactionDto {
  id: string
  date: string
  description: string
  amount: number
  account: string
  categoryName?: string
  type: 'EXPENSE' | 'INCOME'
  subcategory?: string
  note?: string
  createdAt: string
}

export interface InternalDuplicateDto {
  hash: string
  indices: number[]
  transactions: UploadedTransactionDto[]
}

export interface ExternalDuplicateDto {
  hash: string
  uploaded: UploadedTransactionDto
  existing: ExistingTransactionDto
}

export interface ImportPreviewResultDto {
  newCount: number
  internalDuplicateCount: number
  externalDuplicateCount: number
  total: number
  internalDuplicates: InternalDuplicateDto[]
  externalDuplicates: ExternalDuplicateDto[]
}

export interface ImportResultDto {
  imported: number
  duplicates: number
  total: number
}

export type CategoryNature = 'ESSENTIAL' | 'PLEASURE'
export type CategoryRhythm = 'COMMITTED' | 'VARIABLE'

export interface CategoryDto {
  id: string
  name: string
  type: 'EXPENSE' | 'INCOME'
  icon?: string | null
  createdAt: string
  /** The catalogue entry this row is; null for a legacy category awaiting migration. */
  catalogKey?: string | null
  /** A catalogue category cannot be renamed, re-iconed or deleted. */
  isLocked?: boolean
  /** Defaults for a transaction filed at the category alone. Null outside expenses. */
  defaultNature?: CategoryNature | null
  defaultRhythm?: CategoryRhythm | null
}

/** One budget plan line lost with the category. */
export interface BudgetPlanEntrySummaryDto {
  planName: string
  amount: number
  startDate: string
  endDate: string
}

/**
 * Everything attached to a category, so the confirmation dialog can state what
 * deleting it does. Transactions and reimbursement requests are kept and only
 * lose their filing; the rest is destroyed.
 */
export interface CategoryDeletionSummaryDto {
  categoryId: string
  categoryName: string
  type: 'EXPENSE' | 'INCOME'
  transactionCount: number
  firstTransactionDate: string | null
  lastTransactionDate: string | null
  subcategoryNames: string[]
  labelledTransactionCount: number
  budgetPlanEntries: BudgetPlanEntrySummaryDto[]
  reimbursementCount: number
}

// ── Legacy migration (the assistant) ─────────────────────────────────────────

export type LegacyAction = 'CATALOG' | 'CUSTOM' | 'UNFILE' | 'KEEP'

/** One decision of the assistant's table. */
export interface LegacyDecisionDto {
  /** Null stands for the transactions filed at the legacy category alone. */
  sourceSubcategoryId: string | null
  action: LegacyAction
  /** CATALOG and CUSTOM: the catalogue category, by key. */
  categoryKey?: string | null
  /** CATALOG: the catalogue subcategory, by key; omitted files at the category. */
  subcategoryKey?: string | null
  /** CUSTOM: the user's own subcategory, by name; existing or created. */
  subcategoryName?: string | null
  /** A tag attached to every transaction the line moves or unfiles. */
  tagId?: string | null
}

export interface LegacySuggestionDto {
  action: 'CATALOG' | 'UNFILE'
  categoryKey: string | null
  categoryName: string | null
  subcategoryKey: string | null
  subcategoryName: string | null
  /** A context the legacy heading encoded, to carry over as a tag. */
  tagName: string | null
  /** What the guess rests on: pair, subcategory, catalog-label, category. */
  basis: string
}

export interface LegacyLineDto {
  sourceSubcategoryId: string | null
  /** Null for the transactions filed at the category alone. */
  name: string | null
  transactionCount: number
  suggestion: LegacySuggestionDto | null
}

export interface LegacyCategoryDto {
  id: string
  name: string
  type: 'EXPENSE' | 'INCOME'
  icon: string | null
  /**
   * True for a catalogue category whose lines are the subcategories
   * provisioning left beside its own, without a key: it is tidied, not
   * migrated, and stays.
   */
  isCatalog: boolean
  catalogKey: string | null
  transactionCount: number
  budgetPlanEntryCount: number
  lines: LegacyLineDto[]
}

export interface LegacyOverviewDto {
  categories: LegacyCategoryDto[]
  totalTransactions: number
}

export interface LegacyMoveDto {
  sourceSubcategoryId: string | null
  sourceSubcategoryName: string | null
  transactionCount: number
  categoryName: string
  subcategoryName: string | null
  createsSubcategory: boolean
  reparentsSubcategory: boolean
  changesType: boolean
  tagId: string | null
}

export interface LegacyUnfileDto {
  sourceSubcategoryId: string | null
  sourceSubcategoryName: string | null
  transactionCount: number
  tagId: string | null
}

export interface LegacyBudgetEntryOutcomeDto {
  planName: string
  amount: number
  targetCategoryName: string | null
  mergesIntoExisting: boolean
}

export interface LegacyMigrationPreviewDto {
  sourceCategoryId: string
  sourceCategoryName: string
  moves: LegacyMoveDto[]
  unfiles: LegacyUnfileDto[]
  keptTransactions: number
  movedTransactions: number
  unfiledTransactions: number
  typeChangedTransactions: number
  deletesSourceCategory: boolean
  budgetEntries: LegacyBudgetEntryOutcomeDto[]
}

export interface LegacyMigrationResultDto {
  sourceCategoryId: string
  movedTransactions: number
  unfiledTransactions: number
  keptTransactions: number
  typeChangedTransactions: number
  createdSubcategories: number
  reparentedSubcategories: number
  deletedSubcategories: number
  taggedTransactions: number
  budgetEntriesMoved: number
  budgetEntriesMerged: number
  budgetEntriesDropped: number
  sourceDeleted: boolean
}

/** What deleting a subcategory did to the rows filed under it. */
export interface SubcategoryDeletionResultDto {
  refiledTransactions: number
  fallbackSubcategoryId: string | null
  fallbackSubcategoryName: string | null
}

export interface CategoryDeletionResultDto {
  uncategorizedTransactions: number
  deletedSubcategories: number
  deletedBudgetPlanEntries: number
}

export interface SubcategoryDto {
  id: string
  categoryId: string
  name: string
  icon?: string | null
  createdAt: string
  /** The catalogue entry this row is; null for one the user added. */
  catalogKey?: string | null
  /** A catalogue subcategory cannot be renamed or deleted. */
  isLocked?: boolean
  /** Null on income and transfer subcategories. */
  nature?: CategoryNature | null
  rhythm?: CategoryRhythm | null
}

export interface TransactionSettlementSummaryDto {
  id: string
  personId: string
  personName: string
  amountUsed: number
}

export interface TransactionTagSummaryDto {
  id: string
  name: string
  color: string | null
  icon: string | null
}

export type TransactionKind = 'EXPENSE' | 'INCOME' | 'TRANSFER'

export interface TransactionDto {
  id: string
  date: string
  description: string
  amount: number
  type: TransactionKind
  accountId: string
  account: string
  subcategory?: string | null
  note?: string | null
  isPointed: boolean
  /**
   * Over how many months the expense is smoothed in the everyday reading,
   * from the month of its date (2 to 60). Null: counted whole at its date.
   */
  amortizationMonths?: number | null
  /**
   * The one smoothing duration the server proposes for its subcategory
   * (High-tech 24, Maison et déco 48, Entretien et réparation 12…), 12 when
   * the subcategory says nothing. Expenses only.
   */
  suggestedAmortizationMonths?: number
  categoryId?: string | null
  // Mirrors the backend, which omits the key entirely when the transaction has
  // no category. Under `exactOptionalPropertyTypes` an absent property and one
  // explicitly set to `undefined` are different types, so this says both — as
  // its `| null` neighbours already do in their own way.
  categoryName?: string | undefined
  subcategoryId?: string | null
  subcategoryName?: string | null
  categoryIcon?: string | null
  /** Settlements using this income to settle a person's reimbursements (INCOME only) */
  settlements?: TransactionSettlementSummaryDto[]
  /** Tags attached to this transaction */
  tags?: TransactionTagSummaryDto[]
  /** The subscription or recurring charge this line is part of */
  recurrence?: TransactionRecurrenceSummaryDto
  createdAt: string
}

/** The recurring charge a transaction belongs to (never a candidate). */
export interface TransactionRecurrenceSummaryDto {
  status: 'ACTIVE' | 'STOPPED'
  period: RecurrencePeriod
  merchantKey: string
  amountBucket: number
  label: string
  /** The service it pays for, as the recurrences page names it */
  name: string
  /** Attached by hand; it can be detached */
  linked: boolean
}

// Pagination types
export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}

/**
 * Filters for the transaction list. Every field is optional *and* accepts
 * `undefined`: to a query string, "absent" and "explicitly nothing" are the
 * same instruction, and callers build these objects by nulling fields out.
 */
export interface TransactionQueryParams {
  page?: number | undefined
  limit?: number | undefined
  type?: TransactionKind | undefined
  startDate?: string | undefined
  endDate?: string | undefined
  categoryId?: string | undefined
  subcategoryId?: string | undefined
  isPointed?: boolean | undefined
  account?: string | undefined
  tagId?: string | undefined
  /** The rows carrying at least one tag of this family, each once. */
  tagFamilyId?: string | undefined
  search?: string | undefined
  amountMin?: number | undefined
  amountMax?: number | undefined
  /**
   * Only rows a bank sync inserted or claimed and then lost the reference
   * to — cleared to "aucun", or a correction still pending on the other
   * side of a swap.
   */
  needsBankReview?: boolean | undefined
  /** The lines of one recurring charge: `<amountBucket>:<merchantKey>`. */
  recurrence?: string | undefined
  /** An exact list of rows (at most 200). */
  ids?: string[] | undefined
  /** The expenses this person owes something on; see `reimbursement`. */
  personId?: string | undefined
  /** `open`: a remainder is still owed; `all`: settled debts too. */
  reimbursement?: 'open' | 'all' | undefined
  /** The expenses one settlement closed, and the income that paid them. */
  settlementId?: string | undefined
  /** The rows one CSV import wrote. */
  importId?: string | undefined
  /** The rows one bank sync run inserted or claimed. */
  syncRunId?: string | undefined
  /**
   * `exclude`: none of the user's exceptional tags — the « Vie courante »
   * reading; `only`: at least one.
   */
  exceptional?: 'exclude' | 'only' | undefined
  /** The subcategory's nature, else the category's; `none`: « à migrer ». */
  nature?: 'ESSENTIAL' | 'PLEASURE' | 'none' | undefined
  /**
   * COMMITTED for a line of a recurrence, else the subcategory's rhythm,
   * else the category's; `none`: « à migrer ».
   */
  rhythm?: 'COMMITTED' | 'VARIABLE' | 'none' | undefined
  /** Any of these categories, `none` for the unfiled rows (at most 200). */
  categoryIds?: string[] | undefined
  /** The lines of any of these series, `<amountBucket>:<merchantKey>`. */
  recurrences?: string[] | undefined
  /** Only the rows smoothed over several months. */
  amortized?: boolean | undefined
  /**
   * Rows shown on top of what the other filters match (at most 200): the
   * smoothed purchases a « Vie courante » figure counts by their slices
   * although they are dated elsewhere.
   */
  alsoIds?: string[] | undefined
  sortBy?: 'date' | 'amount' | undefined
  sortOrder?: 'asc' | 'desc' | undefined
}

export interface FilterPreferencesDto {
  isPanelExpanded: boolean
  /**
   * Whether an import adopts the categories written in the file. On by
   * default. Off, the file's filing is ignored and each transaction is placed
   * among the categories that already exist — nothing new is created either
   * way.
   */
  importCategoriesFromFile: boolean
  /**
   * Whether a debt still owed is taken off the spending it hangs off, on the
   * dashboard and in the budget. On by default: a reimbursement request says
   * the money comes back, and a loan to a relative is not consumption.
   */
  deductPendingReimbursements: boolean
}

// Account types
export type AccountType = 'STANDARD' | 'JOINT' | 'INVESTMENT'

export interface AccountDto {
  id: string
  name: string
  type: AccountType
  divisor: number
  isExcludedFromBudget: boolean
  isExcludedFromStats: boolean
  createdAt: string
  updatedAt: string
}

export interface UpdateAccountDto {
  name?: string
  type?: AccountType
  divisor?: number
  isExcludedFromBudget?: boolean
  isExcludedFromStats?: boolean
}

/** What deleting an account would take away — shown before confirming. */
export interface AccountDeletionSummaryDto {
  accountId: string
  accountName: string
  transactionCount: number
  firstTransactionDate: string | null
  lastTransactionDate: string | null
  reimbursementCount: number
  settlementCount: number
}

export interface AccountDeletionResultDto {
  deletedTransactions: number
}

export interface PersonDto {
  id: string
  name: string
  email: string | null
  createdAt: string
  updatedAt: string
}

export interface CreatePersonDto {
  name: string
  email?: string
}

export interface UpdatePersonDto {
  name?: string
  email?: string
}

/** Where a dated tag's window stands relative to today (Paris day). */
export type TagEventStatus = 'upcoming' | 'ongoing' | 'past'

export interface TagDto {
  id: string
  name: string
  color: string | null
  icon: string | null
  transactionCount: number
  /** Excluded from the dashboard's everyday averages */
  isExceptional: boolean
  /** Period during which everyday life is suspended (YYYY-MM-DD) */
  eventStartDate: string | null
  eventEndDate: string | null
  /** Total envelope allocated to the event (never a monthly amount) */
  budgetAmount: number | null
  /** Computed by the server; null when the tag has no complete window */
  status: TagEventStatus | null
  /** The family this tag is an edition of, or null */
  familyId: string | null
  /** That family, named, or null */
  family: TagFamilySummaryDto | null
  createdAt: string
  updatedAt: string
}

/** A family as a tag names it. */
export interface TagFamilySummaryDto {
  id: string
  name: string
  color: string | null
}

/**
 * A genre above the tag (« Voyages », « HYROX »), defined by the user. One
 * level only; deleting it keeps its tags, without a family.
 */
export interface TagFamilyDto {
  id: string
  name: string
  color: string | null
  icon: string | null
  /** Envelope over a calendar year, or null */
  annualBudget: number | null
  tagCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateTagFamilyDto {
  name: string
  color?: string
  icon?: string
  /** Envelope over a calendar year, ≥ 0 */
  annualBudget?: number
}

export interface UpdateTagFamilyDto {
  name?: string
  /** null clears the colour */
  color?: string | null
  /** null clears the envelope */
  annualBudget?: number | null
}

export interface CreateTagDto {
  name: string
  color?: string
  icon?: string
  isExceptional?: boolean
  eventStartDate?: string
  eventEndDate?: string
  budgetAmount?: number
  familyId?: string
}

export interface UpdateTagDto {
  name?: string
  color?: string
  icon?: string
  isExceptional?: boolean
  /** null clears the date */
  eventStartDate?: string | null
  eventEndDate?: string | null
  /** null clears the envelope */
  budgetAmount?: number | null
  /** null takes the tag out of its family */
  familyId?: string | null
}

/** One project (exceptional tag) weighed against its envelope. */
export interface TagBudgetSummaryItemDto {
  id: string
  name: string
  color: string | null
  icon: string | null
  eventStartDate: string | null
  eventEndDate: string | null
  budgetAmount: number | null
  /** Tagged expenses inside the window, net of tagged income */
  spent: number
}

/**
 * A family with an annual envelope, charged against the window as a whole:
 * its prorated envelope replaces its tags' own envelopes.
 */
export interface TagBudgetSummaryFamilyDto {
  id: string
  name: string
  color: string | null
  icon: string | null
  annualBudget: number
  /** annualBudget × months of the window / 12 */
  proratedBudget: number
  /** Its exceptional tags' spending in the window, each transaction once */
  spent: number
  /** Its exceptional tags overlapping the window; may be empty */
  items: TagBudgetSummaryItemDto[]
}

export interface TagBudgetSummaryDto {
  /** Projects outside any family with an annual envelope */
  items: TagBudgetSummaryItemDto[]
  /** Every family with an annual envelope, a tag in the window or not */
  families: TagBudgetSummaryFamilyDto[]
  /**
   * What the window commits: the items' envelopes plus each family's
   * prorated envelope — the only figure the reserve is charged with
   */
  totalBudget: number
  totalSpent: number
}

export interface TagAnalysisCategoryDto {
  categoryId: string | null
  categoryName: string
  categoryIcon: string | null
  type: 'EXPENSE' | 'INCOME'
  amount: number
  transactionCount: number
  /** Everyday reference projected onto the event duration (expenses only) */
  baselineAmount?: number
  /** amount - baselineAmount */
  surplusAmount?: number
}

export interface TagAnalysisBaselineDto {
  startDate: string
  endDate: string
  everydayDays: number
  eventDays: number
}

export interface TagAnalysisMonthDto {
  month: string
  expenses: number
  income: number
}

export interface TagAnalysisDto {
  tag: {
    id: string
    name: string
    color: string | null
    icon: string | null
    isExceptional: boolean
    eventStartDate: string | null
    eventEndDate: string | null
    budgetAmount: number | null
    /** The family the tag is filed under, or null */
    family: TagFamilySummaryDto | null
  }
  totalExpenses: number
  totalIncome: number
  net: number
  transactionCount: number
  firstDate: string | null
  lastDate: string | null
  byCategory: TagAnalysisCategoryDto[]
  byMonth: TagAnalysisMonthDto[]
  /** null when the tag declares no event period (additive event) */
  baseline: TagAnalysisBaselineDto | null
  /** Sum of the per-category surplus; null when no baseline applies */
  totalSurplus: number | null
}

/**
 * Which year a transaction of a family belongs to: `event`, the year its
 * dated tag starts in (a January trip paid in November is the trip's year);
 * `cash`, the year it was paid.
 */
export type TagFamilyAnalysisBasis = 'event' | 'cash'

export interface TagFamilyAnalysisYearDto {
  year: number
  expenses: number
  income: number
  transactionCount: number
}

/** One tag of a family, over its transactions in the chosen scope. */
export interface TagFamilyAnalysisTagDto {
  id: string
  name: string
  color: string | null
  icon: string | null
  isExceptional: boolean
  status: TagEventStatus | null
  eventStartDate: string | null
  eventEndDate: string | null
  /** Days of the window, both bounds included; null without a window */
  days: number | null
  spent: number
  spentPerDay: number | null
  /** The edition's surplus, as on its own page; null without a window or in part */
  surplus: number | null
  budgetAmount: number | null
  transactionCount: number
  /** Some of its transactions fall outside the scope (paid across two years) */
  isPartial: boolean
}

export interface TagFamilyEditionRefDto {
  id: string
  name: string
  spent: number
}

/** The dated editions of the scope weighed against each other. */
export interface TagFamilyEditionComparisonDto {
  editionCount: number
  averageSpent: number
  medianSpent: number
  /** Total spent over total days of window */
  averagePerDay: number
  mostExpensive: TagFamilyEditionRefDto
  leastExpensive: TagFamilyEditionRefDto
}

/** The union of a family's tags, each transaction counted once. */
export interface TagFamilyAnalysisDto {
  family: {
    id: string
    name: string
    color: string | null
    icon: string | null
    annualBudget: number | null
  }
  basis: TagFamilyAnalysisBasis
  year: number | null
  /** Every year the family touches in the chosen basis, ascending */
  availableYears: number[]
  totalExpenses: number
  totalIncome: number
  net: number
  transactionCount: number
  /** Sum of the tags' surplus; null when none has one */
  totalSurplus: number | null
  byCategory: TagAnalysisCategoryDto[]
  byYear: TagFamilyAnalysisYearDto[]
  tags: TagFamilyAnalysisTagDto[]
  comparison: TagFamilyEditionComparisonDto | null
  /**
   * The envelope over the year asked for, read in event basis whatever
   * `basis`; null without an envelope or without a year
   */
  envelope: TagFamilyEnvelopeDto | null
}

/** The annual envelope weighed against one year, in event basis. */
export interface TagFamilyEnvelopeDto {
  annualBudget: number
  year: number
  spentEventBasis: number
  /** Negative on an overrun */
  remaining: number
}

export interface TransactionSummaryDto {
  id: string
  date: string
  description: string
  amount: number
}

export interface ReimbursementDto {
  id: string
  transactionId: string
  personId: string
  personName: string
  /**
   * Category of the expense being repaid — the only one a debt has. It used to
   * carry an income category alongside; that drove no figure and the backend
   * dropped the column in phase 6.
   */
  expenseCategoryId: string | null
  expenseCategoryName: string | null
  amount: number
  amountReceived: number
  amountRemaining: number
  status: 'PENDING' | 'PARTIAL' | 'COMPLETED'
  note: string | null
  /** The settlements that credited this debt, oldest first. */
  settlementIds: string[]
  /** The income transactions the cash came from, oldest first. */
  incomeTransactionIds: string[]
  createdAt: string
  updatedAt: string
  transaction?: TransactionSummaryDto
}

export interface CreateReimbursementDto {
  transactionId: string
  personId: string
  amount: number
  note?: string
}

// Settlement DTOs
export interface SettlementReimbursementItemDto {
  reimbursementId: string
  amountSettled: number
  /** Mark this line as fully settled even though amountSettled falls short */
  forceComplete?: boolean
}

export interface CreateSettlementDto {
  personId: string
  incomeTransactionId: string
  reimbursements: SettlementReimbursementItemDto[]
  note?: string
  forceComplete?: boolean
}

export interface SettlementReimbursementResponseDto {
  reimbursementId: string
  transactionId: string
  transactionDescription: string
  transactionDate: string
  /**
   * The expense being repaid. Not the income category the debt once expected:
   * the deduction attaches to the expense transaction, so that is the only
   * category this line is about.
   */
  expenseCategoryId: string | null
  expenseCategoryName: string | null
  originalAmount: number
  amountSettled: number
}

export interface SettlementDto {
  id: string
  personId: string
  personName: string
  incomeTransactionId: string
  incomeTransactionDescription: string
  incomeTransactionDate: string
  incomeTransactionAmount: number
  amountUsed: number
  note: string | null
  createdAt: string
  reimbursements: SettlementReimbursementResponseDto[]
}

export interface TransactionAvailableAmountDto {
  transactionId: string
  totalAmount: number
  usedAmount: number
  availableAmount: number
}

export interface ImportHistoryDto {
  id: string
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  transactionsImported: number
  categoriesCreated: number
  duplicatesSkipped: number
  totalInFile: number
  dateRangeStart: string | null
  dateRangeEnd: string | null
  accounts: string[]
  fileName: string | null
  createdAt: string
}

export interface StartImportDto {
  totalInFile: number
  fileName?: string
}

export interface FinalizeImportDto {
  transactionsImported: number
  /** Retired: an import creates no category since the catalogue. */
  categoriesCreated?: number
  duplicatesSkipped: number
  dateRangeStart: string
  dateRangeEnd: string
}

export interface CreateImportHistoryDto {
  transactionsImported: number
  categoriesCreated: number
  duplicatesSkipped: number
  totalInFile: number
  dateRangeStart: string
  dateRangeEnd: string
  fileName?: string
}

// Dashboard DTOs
export interface MonthlyDataDto {
  month: string
  label: string
  expenses: number
  netExpenses: number
  income: number
  /** Share of the month's expenses tagged as exceptional */
  exceptionalExpenses: number
  /**
   * netExpenses minus the exceptional share, each smoothed purchase traded
   * for its slices
   */
  everydayNetExpenses: number
  /**
   * Slices of smoothed purchases in `everydayNetExpenses`. Only on a month a
   * smoothed purchase touches — such a month may carry nothing real at all.
   */
  amortizedExpenses?: number
}

export interface SubcategoryDataDto {
  /** The subcategory this line sums, or null for the rows filed under none. */
  subcategoryId: string | null
  /** Its name; empty for none. */
  subcategory: string
  icon?: string | null
  amount: number
  transactionCount: number
  averagePerMonth: number
  /**
   * Everyday counterpart of `amount`: exceptional rows out, smoothed
   * purchases spread into their slices. Only on a line a smoothed purchase
   * touches; elsewhere read `amount`.
   */
  everydayAmount?: number
  /** `everydayAmount` per month. Same presence rule. */
  everydayAveragePerMonth?: number
  /** Slices of smoothed purchases on the line. Same presence rule. */
  amortizedAmount?: number
}

export interface CategoryDataDto {
  /** Category id, or UNCATEGORIZED_CATEGORY_ID for uncategorized rows */
  categoryId: string
  /** Display name only — never use it as a key */
  category: string
  amount: number
  icon?: string | null
  transactionCount?: number
  averagePerMonth?: number
  monthlyAmounts?: number[]
  subcategories?: SubcategoryDataDto[]
  reimbursement?: number
  pendingReimbursement?: number
  /** Share of `amount` carried by exceptional events */
  exceptionalAmount?: number
  /** amount - exceptionalAmount: the recurring part */
  everydayAmount?: number
  /** Everyday amount over the same months as averagePerMonth */
  everydayAveragePerMonth?: number
  /** Per-month everyday amounts, matching monthLabels */
  everydayMonthlyAmounts?: number[]
  /**
   * Slices of smoothed purchases in `everydayAmount` — the « dont X €
   * lissés ». Only when a smoothed purchase touches the category.
   */
  amortizedAmount?: number
  /** Same, per month, matching monthLabels. Same presence rule. */
  amortizedMonthlyAmounts?: number[]
}

export interface ExceptionalEventDto {
  id: string
  name: string
  color: string | null
  icon: string | null
  amount: number
}

/**
 * Id standing for transactions with no category. Not a real Category, but the
 * filter panel lists that bucket and must be able to hide it like any other.
 */
export const UNCATEGORIZED_CATEGORY_ID = '__uncategorized__'

export type RecurrencePeriod =
  'WEEKLY' | 'FOUR_WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
export type RecurrenceStatus = 'ACTIVE' | 'STOPPED' | 'CANDIDATE'
export type RecurrenceDecisionKind = 'CONFIRMED' | 'DISMISSED'

/** A charge that comes back on its own, as detection reads it. */
export interface RecurrenceDto {
  id: string
  /** The user's subscription this series is; null when only detected */
  subscriptionId: string | null
  merchantKey: string
  amountBucket: number
  /** The most frequent bank label, made readable */
  label: string
  /** The service it pays for: the user's name, or the one read from its labels */
  name: string
  /** The user gave the name */
  named: boolean
  categoryId: string | null
  categoryName: string | null
  categoryIcon: string | null
  subcategoryId: string | null
  subcategoryName: string | null
  nature: CategoryNature | null
  period: RecurrencePeriod
  amount: number
  monthlyEquivalent: number
  occurrences: number
  /** Everything the series has cost, at every price it ran at. */
  totalPaid: number
  firstDate: string
  lastDate: string
  nextExpected: string
  status: RecurrenceStatus
  confirmed: boolean
  /** Divisor of the account the latest charge was paid from; above 1 for a joint account. */
  divisor: number
}

/** A subscription the list names apart: set aside, or followed without a series. */
export interface SubscriptionSummaryDto {
  id: string
  /** The user's name for it, or the merchant it was made for */
  name: string
  state: RecurrenceDecisionKind
  createdAt: string
}

export interface RecurrenceListDto {
  recurrences: RecurrenceDto[]
  monthlyTotal: number
  byCategory: Array<{
    categoryId: string | null
    name: string | null
    monthlyTotal: number
  }>
  byNature: { essential: number; pleasure: number; unclassified: number }
  /** What the user set aside, to take it back */
  dismissed: SubscriptionSummaryDto[]
  /** Followed subscriptions no series answers any more */
  orphans: SubscriptionSummaryDto[]
  computedAt: string | null
}

/** How the transactions page names one series in its filter. */
export function recurrenceFilterKey(recurrence: {
  amountBucket: number
  merchantKey: string
}): string {
  return `${recurrence.amountBucket}:${recurrence.merchantKey}`
}

/** A category as offered in the filter panel: addressed by id, shown by name. */
export interface CategoryOptionDto {
  id: string
  name: string
}

export interface DashboardFiltersDto {
  startDate?: string
  endDate?: string
  deductReimbursements?: boolean
  deductPendingReimbursements?: boolean
  includeCategoryBreakdown?: boolean
}

/**
 * Expenses read through the two attributes of their subcategory: constrained
 * or chosen, running on its own or following the user. `unknown*` holds what
 * predates the catalogue and carries no attribute yet.
 */
export interface SpendingStructureDto {
  essential: number
  pleasure: number
  unknownNature: number
  committed: number
  variable: number
  unknownRhythm: number
  /** The part of `committed` made of lines of a detected recurrence. */
  recurring: number
  total: number
}

/**
 * One tag family over the current calendar year (in Paris), in event basis:
 * a line belongs to the year its dated tag starts in, and counts once.
 */
export interface TagFamilyOfYearDto {
  id: string
  name: string
  color: string | null
  icon: string | null
  year: number
  /** Gross expenses, divided, stats-excluded accounts ignored. */
  spent: number
  annualBudget: number | null
  /** `annualBudget - spent`, negative over; null without an envelope. */
  remaining: number | null
  transactionCount: number
  tagCount: number
}

export interface DashboardSummaryDto {
  monthlyData: MonthlyDataDto[]
  expensesByCategory: CategoryDataDto[]
  incomeByCategory: CategoryDataDto[]
  totalExpenses: number
  totalIncome: number
  allExpenseCategories: CategoryOptionDto[]
  allIncomeCategories: CategoryOptionDto[]
  availableAccounts: string[]
  periodMonths?: number
  monthLabels?: string[]
  totalExceptionalExpenses: number
  exceptionalEvents: ExceptionalEventDto[]
  /** The month as it was: every expense, exceptional ones included. */
  spendingStructure?: SpendingStructureDto
  /** The lifestyle: the same, without the exceptional share. */
  everydaySpendingStructure?: SpendingStructureDto
  /** What the period kept: `totalIncome − totalExpenses`, negative in deficit. */
  savings?: number
  /** Money that left the everyday accounts towards savings, net of withdrawals: informational, no rate reads it. */
  savingsTransfers?: number
  /** `savings / totalIncome`, null without income. */
  savingsRate?: number | null
  /** Income minus committed everyday spending: what the period leaves once it is paid. */
  remainingToLive?: number | null
  /** What is still owed to the user across every open debt, a stock in full euros. */
  pendingReceivables?: number
  /**
   * The tag families with expenses in the current calendar year, whatever
   * the period, biggest first. Absent on an older server.
   */
  tagFamiliesOfYear?: TagFamilyOfYearDto[]
  /** Real expenses of that year: the share's denominator. Null without families. */
  realExpensesOfYear?: number | null
}

// Budget plan DTOs
export interface BudgetPlanEntryDto {
  id: string
  categoryId: string
  categoryName: string
  categoryIcon?: string | null
  amount: number
}

export interface BudgetPlanDto {
  id: string
  name: string
  /** ISO date YYYY-MM-DD, 1st of a month */
  startDate: string
  /** ISO date YYYY-MM-DD, last day of a month */
  endDate: string
  monthCount: number
  totalAmount: number
  /** Monthly amount decided for savings / investment. */
  savingsTarget?: number | null
  /** Monthly income assumed when the plan was drawn up. */
  referenceIncome?: number | null
  /**
   * Budget left for one-off projects over the whole plan. Null when the
   * equation is incomplete; negative when the plan is not financeable.
   */
  projectReserve?: number | null
  entries: BudgetPlanEntryDto[]
  createdAt: string
  updatedAt: string
}

export interface BudgetPlanSummaryDto {
  id: string
  name: string
  startDate: string
  endDate: string
  monthCount: number
  totalAmount: number
  entryCount: number
  createdAt: string
}

export interface CreateBudgetPlanEntryDto {
  categoryId: string
  amount: number
}

export interface CreateBudgetPlanDto {
  name: string
  startDate: string
  endDate: string
  savingsTarget?: number
  referenceIncome?: number
  entries: CreateBudgetPlanEntryDto[]
}

export interface UpdateBudgetPlanDto {
  name?: string
  startDate?: string
  endDate?: string
  /** null clears the target. */
  savingsTarget?: number | null
  /** null clears the reference. */
  referenceIncome?: number | null
  entries?: CreateBudgetPlanEntryDto[]
}

export interface SubcategoryAverageDto {
  /** The subcategory this line sums, or null for the rows filed under none. */
  subcategoryId: string | null
  /** Its name; empty for none. */
  subcategory: string
  totalAmount: number
  transactionCount: number
  averagePerMonth: number
  /**
   * Everyday counterpart of `totalAmount`: exceptional rows out, smoothed
   * purchases spread into their slices. Only on a line a smoothed purchase
   * touches this period; elsewhere read `totalAmount`.
   */
  everydayAmount?: number
  /** `everydayAmount` over the period. Same presence rule. */
  everydayAveragePerMonth?: number
  /** Slices of smoothed purchases falling in the period. Same presence rule. */
  amortizedAmount?: number
}

/**
 * A smoothed purchase whose slices or date touch the period: what the
 * « Achats lissés en cours » list and the links to the source need.
 */
export interface AmortizedPurchaseDto {
  transactionId: string
  description: string
  /** The purchase's own date, `YYYY-MM-DD`. */
  date: string
  /** Number of monthly slices. */
  months: number
  /** Net of reimbursements and divided: what the slices sum to. */
  netAmount: number
  /** The regular slice; the last one absorbs the rounding gap. */
  monthlyAmount: number
  /** `YYYY-MM` of the first and last slice. */
  firstMonth: string
  lastMonth: string
  categoryId: string | null
  subcategoryId: string | null
  /** Sum of its slices falling in the period. */
  amountInPeriod: number
  /** `YYYY-MM` of each of those slices, chronological. */
  sliceMonthsInPeriod: string[]
  /** The purchase itself is dated in the period: the real reading counts it whole. */
  dateInPeriod: boolean
}

export interface CategoryAverageDto {
  categoryId: string
  categoryName: string
  categoryIcon?: string | null
  totalAmount: number
  transactionCount: number
  averagePerMonth: number
  reimbursement?: number
  pendingReimbursement?: number
  monthlyAmounts?: number[]
  /** Share of `totalAmount` carried by exceptional events. Expenses only. */
  exceptionalAmount?: number
  /** `totalAmount` minus `exceptionalAmount` — the recurring lifestyle. */
  everydayAmount?: number
  /** Same divisor as `averagePerMonth`; equal to it when no event applies. */
  everydayAveragePerMonth?: number
  /** Everyday counterpart of `monthlyAmounts`, same indexes. */
  everydayMonthlyAmounts?: number[]
  /**
   * Slices of smoothed purchases in `everydayAmount` — the « dont X €
   * lissés ». Only when a smoothed purchase touches the category, which may
   * then carry nothing real at all (`transactionCount` 0).
   */
  amortizedAmount?: number
  /** Same, per month, matching `monthLabels`. Same presence rule. */
  amortizedMonthlyAmounts?: number[]
  subcategories?: SubcategoryAverageDto[]
}

export interface BudgetStatisticsFiltersDto {
  startDate: string
  endDate: string
  deductReimbursements?: boolean
  deductPendingReimbursements?: boolean
  includeMonthlyBreakdown?: boolean
  /**
   * When true, all currently active pending reimbursement requests are
   * deducted, regardless of when the linked expense was made. Useful for
   * forward-looking budget planning where the stats window is in the past
   * but the user wants every outstanding pending to be subtracted.
   */
  includeAllPendingReimbursements?: boolean
}

export interface BudgetStatisticsDto {
  periodMonths: number
  expensesByCategory: CategoryAverageDto[]
  incomeByCategory: CategoryAverageDto[]
  totalExpenses: number
  totalIncome: number
  averageMonthlyExpenses: number
  averageMonthlyIncome: number
  totalReimbursements?: number
  totalPendingReimbursements?: number
  /** Expense carried by exceptional events over the period, net. */
  totalExceptionalExpenses?: number
  /** Smoothed purchases touching the period, in date order. Absent when none. */
  amortizedPurchases?: AmortizedPurchaseDto[]
  monthLabels?: string[]
}

/**
 * Get session with timeout protection.
 * Prevents hanging when getSession() doesn't resolve after inactivity.
 */
async function getSessionWithTimeout(): Promise<Session | null> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () =>
        reject(new AuthError('Session timeout - veuillez rafraichir la page')),
      SESSION_TIMEOUT_MS
    )
  })

  const sessionPromise = supabase.auth
    .getSession()
    .then(({ data }) => data.session)

  return Promise.race([sessionPromise, timeoutPromise])
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const session = await getSessionWithTimeout()

  if (!session?.access_token) {
    throw new AuthError('No active session')
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  }
}

/**
 * Fetch wrapper that handles 401 errors by refreshing the token and retrying.
 * Throws AuthError if refresh fails.
 */
/**
 * The server's own message when it has one — a rejected migration says why,
 * and that reason is the whole point of the response — else the fallback.
 */
async function errorMessageOf(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown }
    if (typeof body.message === 'string' && body.message) return body.message
    if (Array.isArray(body.message) && typeof body.message[0] === 'string') {
      return body.message[0]
    }
  } catch {
    // no body, or not JSON
  }
  return fallback
}

async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // First attempt
  const headers = await getAuthHeaders()
  let response = await send(url, { ...options, headers })

  // If 401, try to refresh token and retry
  if (response.status === 401) {
    const { error } = await supabase.auth.refreshSession()

    if (error) {
      // Refresh failed - session is invalid
      throw new AuthError('Session expirée, veuillez vous reconnecter')
    }

    // Retry with new token
    const newHeaders = await getAuthHeaders()
    response = await send(url, { ...options, headers: newHeaders })
  }

  return response
}

/**
 * Same retry-on-401 behaviour as `fetchWithAuth`, but without forcing
 * `Content-Type: application/json` — a `FormData` body needs the browser's
 * own multipart boundary, and setting the header by hand loses it.
 */
async function fetchWithAuthForFormData(
  url: string,
  options: RequestInit
): Promise<Response> {
  async function authHeader(): Promise<HeadersInit> {
    const session = await getSessionWithTimeout()
    if (!session?.access_token) throw new AuthError('No active session')
    return { Authorization: `Bearer ${session.access_token}` }
  }

  let response = await send(url, { ...options, headers: await authHeader() })

  if (response.status === 401) {
    const { error } = await supabase.auth.refreshSession()
    if (error) {
      throw new AuthError('Session expirée, veuillez vous reconnecter')
    }
    response = await send(url, { ...options, headers: await authHeader() })
  }

  return response
}

/**
 * Try to extract a NestJS error message from a non-OK response. Falls back
 * to a generic message if the body is empty or not JSON.
 */
async function readErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  let message = fallback
  try {
    const body = (await response.json()) as {
      message?: string | string[]
      requestId?: string
    }
    if (Array.isArray(body.message)) message = body.message.join(', ')
    else if (typeof body.message === 'string') message = body.message
    // A 5xx carries the id its log line is filed under. Shown to the user
    // so that "it failed" can become "it failed, here is the reference".
    if (response.status >= 500 && typeof body.requestId === 'string') {
      message += ` (réf. ${body.requestId})`
    }
  } catch {
    // body wasn't JSON; ignore
  }
  return message
}

// ---------------------------------------------------------------------------
// Bank sync
// ---------------------------------------------------------------------------

/** A bank account, as the bank describes it and the user has decided about it. */
export interface DiscoveredAccountDto {
  linkId: string
  externalAccountId: string
  accountName: string
  product: string | null
  /** ISO 20022: `CACC` current account, `CARD` card account. */
  cashAccountType: string | null
  iban: string | null
  accountId: string | null
  accountLabel: string | null
  isIngested: boolean
  /**
   * Le dernier solde lu à la synchro — absent tant qu'aucune synchro n'en a
   * rapporté (un import CSV n'en produit jamais).
   */
  balance: {
    amount: number
    currency: string | null
    at: string | null
  } | null
  /** What the transactions suggest, when there is history to reason from. */
  suggestion: {
    accountId: string
    accountLabel: string
    matches: number
  } | null
  /** Present when the account should be left alone, and why. */
  warning: string | null
}

export interface BankConnectionDto {
  id: string
  aspspName: string
  aspspCountry: string
  status: string
  consentValidUntil: string | null
  lastSyncAt: string | null
  /** Ce que la dernière synchro en échec a dit — null après un succès. */
  lastSyncError: string | null
  lastSyncErrorAt: string | null
  /** What pressing sync would do right now. */
  action: 'fetch' | 'skip' | 'reconnect'
  reason: string
  daysUntilConsentExpires: number | null
  accounts: DiscoveredAccountDto[]
}

export interface SyncOutcomeDto {
  connectionId: string
  fetched: number
  claimed: number
  inserted: number
  skippedDuplicates: number
  skippedAmbiguous: number
  /** Older than the account's own earliest known transaction — never inserted. */
  skippedTooOld: number
  accountsRead: number
}

/** What correcting a bank account's mapping did to what an earlier sync wrote. */
export interface ReassignmentOutcomeDto {
  /** Inserted under the old account; nothing on the new one matched it. */
  moved: number
  /** Inserted under the old account; the new one already had it via CSV. */
  merged: number
  /**
   * Lost its bank reference, kept everything else: a CSV row claimed by
   * coincidence on the old account, or — when the link is cleared entirely —
   * an inserted row with nowhere left to belong. Never deleted: the
   * transaction still happened, whichever account it ends up filed under.
   */
  unlinked: number
  /** Left untouched: gained a tag, reimbursement, settlement or payment since. */
  blockedByWork: number
  /** Left untouched: more than one equally good match, or none worth trusting. */
  ambiguous: number
}

/** One past sync, and what pressing "Annuler" on it would find. */
export interface BankSyncRunDto {
  id: string
  aspspName: string
  fetchedAt: string
  /** Still attributed to this run right now — 0 once it's been undone. */
  inserted: number
  claimed: number
  /** Set once this run has been undone. */
  undoneAt: string | null
  /** MANUAL pour un clic, SCHEDULED pour la synchro quotidienne. */
  trigger: string
}

/** What undoing a run did, or would do. */
export interface UndoRunOutcomeDto {
  /** Inserted by this run, removed the same way it arrived. */
  deleted: number
  /** Claimed by this run, restored to how it stood before — never deleted. */
  unlinked: number
  /** Left untouched: gained a reimbursement, tag, settlement or payment since. */
  blocked: number
}

/** « Ce qui change »: what moves in a closed month, against the habit. */
export type TrendWindow = 3 | 6 | 12
export type TrendReading = 'everyday' | 'real'
/**
 * 1 `amount`, 2 and 6 `frequency` (6 on a merchant), 3 `basket`, 4 `share`,
 * 5 `uncategorized`, 7 `newHabit`, 8 `lostHabit`, 9 `subscription` (`up`
 * appeared, `down` stopped), 10 `price`, 11 `shift`, 12 `drift`, 13
 * `record`, 14 `yearAgo`, 15 `savings`.
 */
export type TrendKind =
  | 'amount'
  | 'frequency'
  | 'basket'
  | 'share'
  | 'uncategorized'
  | 'newHabit'
  | 'lostHabit'
  | 'subscription'
  | 'price'
  | 'shift'
  | 'drift'
  | 'record'
  | 'yearAgo'
  | 'savings'

export interface TrendUnitDto {
  type:
    | 'category'
    | 'subcategory'
    | 'structure'
    | 'uncategorized'
    | 'merchant'
    | 'recurrence'
    | 'savings'
  /**
   * Category or subcategory id; `pleasure` / `committed` for a share; a
   * merchant's key; a recurrence's `<amountBucket>:<merchantKey>`, the
   * Transactions page's `recurrence` filter
   */
  id: string
  /** The category a link opens: itself, or a subcategory's parent */
  categoryId: string | null
  name: string
  icon: string | null
  /** A merchant only: the word the Transactions page searches it by */
  search?: string
}

/** One of the two subcategories a shift (11) links, the one down first */
export interface TrendPartDto {
  unit: TrendUnitDto
  kind: string
  direction: 'up' | 'down'
  /** Lines for a frequency, euros otherwise */
  delta: number
  amountDelta: number
}

/** A long comparison the history is still too short for */
export interface TrendHorizonDto {
  kind: 'drift' | 'record' | 'yearAgo' | 'savings'
  /** Complete months it reads, the month read included */
  months: number
  missing: number
  sentence: string
}

export interface TrendPeriodDto {
  /** `YYYY-MM-DD`, both included */
  start: string
  end: string
}

export interface TrendInsightDto {
  kind: TrendKind
  unit: TrendUnitDto
  direction: 'up' | 'down'
  /** `success` only for a drop on a pleasure and variable unit */
  tone: 'neutral' | 'success'
  current: number
  reference: number
  delta: number
  /**
   * null on a share or savings (points), on the lines to file, or a zero
   * reference; for a drift, percent per month
   */
  deltaPct: number | null
  sentence: string
  windows: { current: TrendPeriodDto; reference: TrendPeriodDto }
  /** Seven months, oldest first, the month read last */
  series: number[]
  score: number
  /** A shift: the subcategory down, then the one up */
  parts?: TrendPartDto[]
  /** The highest or lowest of twelve months: a record, or the line it enriches */
  record?: 'high' | 'low'
  /** Savings: income less the everyday committed spending per month, the quarter and the one before */
  remainingToLive?: { current: number; reference: number }
}

export interface TrendsResponseDto {
  /** `YYYY-MM` */
  month: string
  reading: TrendReading
  /** The window read, shortened to the history when it must be */
  window: number
  completeMonths: number
  insights: TrendInsightDto[]
  quietSentence: string | null
  /**
   * The two largest gaps in words, without a figure: « Septembre : plus
   * d'achats en restaurant, et vous avez mis plus de côté. »; null when no
   * habit moved
   */
  headline: string | null
  /** The closed months the card can read, latest first */
  availableMonths: string[]
  /** The long comparisons the history cannot make yet; empty once it can */
  horizons: TrendHorizonDto[]
  /** Always null here: the paragraph has its own request, `getTrendDigest` */
  digest: null
}

/** The paragraph Claude wrote from a closed month's trends */
export interface TrendDigestDto {
  /** `YYYY-MM` */
  month: string
  reading: TrendReading
  window: number
  /** Three to five sentences, every number one of the trends' */
  text: string
  /** e.g. `claude-haiku-5-5` */
  model: string
  /** ISO 8601 */
  generatedAt: string
}

export interface TrendsQuery {
  month?: string | undefined
  window?: TrendWindow | undefined
  reading?: TrendReading | undefined
  deductReimbursements?: boolean | undefined
  deductPendingReimbursements?: boolean | undefined
}

/** The trends' filters as a query string, `?…` or nothing. */
function trendsSearch(query: TrendsQuery): string {
  const params = new URLSearchParams()
  if (query.month) params.set('month', query.month)
  if (query.window) params.set('window', String(query.window))
  if (query.reading) params.set('reading', query.reading)
  if (query.deductReimbursements !== undefined)
    params.set('deductReimbursements', String(query.deductReimbursements))
  if (query.deductPendingReimbursements !== undefined)
    params.set(
      'deductPendingReimbursements',
      String(query.deductPendingReimbursements)
    )
  const search = params.toString()
  return search ? `?${search}` : ''
}

export const api = {
  // ── Bank sync ─────────────────────────────────────────────────────────────

  /**
   * Whether this server can sync at all.
   *
   * Asked before offering to connect a bank: a backend whose owner never set
   * up Enable Banking serves everything else normally, and an interface that
   * offered the button anyway would only produce a puzzling failure.
   */
  async getBankSyncStatus(): Promise<{ configured: boolean }> {
    const response = await fetchWithAuth(`${API_BASE_URL}/bank-sync/status`)
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          "Impossible de lire l'état de la synchronisation bancaire"
        )
      )
    return response.json() as Promise<{ configured: boolean }>
  },

  /** This user's own Enable Banking application, if they have set one up. */
  async getEnableBankingCredential(): Promise<{
    applicationId: string | null
  }> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/bank-sync/credentials`
    )
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          'Impossible de lire votre application Enable Banking'
        )
      )
    return response.json() as Promise<{ applicationId: string | null }>
  },

  /**
   * Save this user's Enable Banking application id and .pem private key.
   *
   * `active` is what Enable Banking reports about the application: saved
   * while still inactive is a valid save, but every bank-facing call will
   * be refused until it is activated from the Control Panel.
   */
  async saveEnableBankingCredential(
    applicationId: string,
    pemFile: File
  ): Promise<{
    applicationId: string | null
    active?: boolean
    environment?: 'SANDBOX' | 'PRODUCTION'
  }> {
    const body = new FormData()
    body.append('applicationId', applicationId)
    body.append('file', pemFile)

    const response = await fetchWithAuthForFormData(
      `${API_BASE_URL}/bank-sync/credentials`,
      { method: 'PUT', body }
    )
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          "Impossible d'enregistrer votre application Enable Banking"
        )
      )
    return response.json() as Promise<{
      applicationId: string | null
      active?: boolean
      environment?: 'SANDBOX' | 'PRODUCTION'
    }>
  },

  /** Remove this user's own Enable Banking application. */
  async removeEnableBankingCredential(): Promise<void> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/bank-sync/credentials`,
      { method: 'DELETE' }
    )
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          'Impossible de supprimer votre application Enable Banking'
        )
      )
  },

  /** The banks that can be connected, for a person choosing one. */
  async getBanks(
    country = 'FR'
  ): Promise<
    { name: string; country: string; beta: boolean; logo: string | null }[]
  > {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/bank-sync/aspsps?country=${encodeURIComponent(country)}`
    )
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          'Impossible de charger la liste des banques'
        )
      )
    return response.json() as Promise<
      { name: string; country: string; beta: boolean; logo: string | null }[]
    >
  },

  async getBankConnections(): Promise<BankConnectionDto[]> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/bank-sync/connections`
    )
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          'Impossible de charger vos connexions bancaires'
        )
      )
    return response.json() as Promise<BankConnectionDto[]>
  },

  /**
   * Accounts still carrying a row a sync claimed and then lost the
   * reference to — cleared to "aucun", or a correction still pending on the
   * other side of a swap.
   */
  async getBankSyncNeedsReview(): Promise<
    { accountId: string; accountLabel: string; count: number }[]
  > {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/bank-sync/needs-review`
    )
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          'Impossible de charger les comptes à vérifier'
        )
      )
    return response.json() as Promise<
      { accountId: string; accountLabel: string; count: number }[]
    >
  },

  /** Every sync this user has run, most recent first. */
  async getBankSyncRuns(): Promise<BankSyncRunDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/bank-sync/runs`)
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          "Impossible de charger l'historique des synchronisations"
        )
      )
    return response.json() as Promise<BankSyncRunDto[]>
  },

  /** What undoing a run would do, without doing it. */
  async previewUndoBankSyncRun(runId: string): Promise<UndoRunOutcomeDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/bank-sync/runs/${runId}/undo/preview`,
      { method: 'POST' }
    )
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          "Impossible de calculer l'annulation de cette synchronisation"
        )
      )
    return response.json() as Promise<UndoRunOutcomeDto>
  },

  /** Undo a sync run: delete what it inserted, unlink what it only claimed. */
  async undoBankSyncRun(runId: string): Promise<UndoRunOutcomeDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/bank-sync/runs/${runId}/undo`,
      { method: 'POST' }
    )
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          "Impossible d'annuler cette synchronisation"
        )
      )
    return response.json() as Promise<UndoRunOutcomeDto>
  },

  /** Begin authorising a bank; returns where to send the user. */
  async startBankAuthorization(input: {
    aspspName: string
    country?: string
    redirectUrl: string
  }): Promise<{ url: string; state: string }> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/bank-sync/connections`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    )
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          "Impossible de lancer l'autorisation bancaire"
        )
      )
    return response.json() as Promise<{ url: string; state: string }>
  },

  /** Exchange the code the redirect carried, and discover the accounts. */
  async completeBankAuthorization(
    code: string,
    state?: string
  ): Promise<BankConnectionDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/bank-sync/connections/callback`,
      { method: 'POST', body: JSON.stringify({ code, state }) }
    )
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          "Impossible de finaliser l'autorisation bancaire"
        )
      )
    return response.json() as Promise<BankConnectionDto>
  },

  /** Say what a bank account is, and whether to read from it. */
  async updateBankAccountLink(
    linkId: string,
    input: { accountId?: string | null; isIngested?: boolean }
  ): Promise<DiscoveredAccountDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/bank-sync/links/${linkId}`,
      { method: 'PATCH', body: JSON.stringify(input) }
    )
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          'Impossible de modifier le compte bancaire'
        )
      )
    return response.json() as Promise<DiscoveredAccountDto>
  },

  /**
   * What correcting a link's account would do, without doing it.
   *
   * Only worth calling before showing anything: when every count comes back
   * zero, the link never wrote anything under the old account and the change
   * can go straight through.
   */
  async previewLinkReassignment(
    linkId: string,
    accountId: string | null
  ): Promise<ReassignmentOutcomeDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/bank-sync/links/${linkId}/reassignment/preview`,
      { method: 'POST', body: JSON.stringify({ accountId }) }
    )
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          'Impossible de calculer cette correction'
        )
      )
    return response.json() as Promise<ReassignmentOutcomeDto>
  },

  /** Correct a link's account, and everything an earlier sync wrote under it. */
  async reassignLink(
    linkId: string,
    accountId: string | null
  ): Promise<ReassignmentOutcomeDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/bank-sync/links/${linkId}/reassignment`,
      { method: 'POST', body: JSON.stringify({ accountId }) }
    )
    if (!response.ok)
      throw new Error(
        await readErrorMessage(response, 'Impossible de corriger ce compte')
      )
    return response.json() as Promise<ReassignmentOutcomeDto>
  },

  /** Read the bank now. */
  async syncBankConnection(connectionId: string): Promise<SyncOutcomeDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/bank-sync/connections/${connectionId}/sync`,
      { method: 'POST' }
    )
    if (!response.ok)
      throw new Error(
        await readErrorMessage(
          response,
          'Impossible de synchroniser cette banque'
        )
      )
    return response.json() as Promise<SyncOutcomeDto>
  },

  async getMe(): Promise<DbUser> {
    const response = await fetchWithAuth(`${API_BASE_URL}/users/me`)

    if (!response.ok) {
      throw new Error('Impossible de charger votre profil')
    }

    return response.json() as Promise<DbUser>
  },

  async deleteAccount(): Promise<void> {
    const response = await fetchWithAuth(`${API_BASE_URL}/users/me`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Impossible de supprimer le compte')
    }
  },

  async previewImport(
    transactions: ImportTransactionDto[]
  ): Promise<ImportPreviewResultDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/transactions/import/preview`,
      {
        method: 'POST',
        body: JSON.stringify({ transactions }),
      }
    )

    if (!response.ok) {
      throw new Error("Impossible d'analyser le fichier")
    }

    return response.json() as Promise<ImportPreviewResultDto>
  },

  async importTransactions(
    transactions: ImportTransactionDto[],
    importHistoryId?: string
  ): Promise<ImportResultDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/transactions/import`,
      {
        method: 'POST',
        body: JSON.stringify({ transactions, importHistoryId }),
      }
    )

    if (!response.ok) {
      throw new Error("Impossible d'importer les transactions")
    }

    return response.json() as Promise<ImportResultDto>
  },

  async getCategories(): Promise<CategoryDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/categories`)

    if (!response.ok) {
      throw new Error('Impossible de charger les catégories')
    }

    return response.json() as Promise<CategoryDto[]>
  },

  async createCategory(dto: {
    name: string
    type: 'EXPENSE' | 'INCOME'
  }): Promise<CategoryDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/categories`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error('Impossible de créer la catégorie')
    }

    return response.json() as Promise<CategoryDto>
  },

  async updateCategory(
    id: string,
    dto: { name?: string }
  ): Promise<CategoryDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      // A rename can clash with an existing category; the server explains
      // which one, so the message is worth surfacing verbatim.
      let message = 'Impossible de modifier la catégorie'
      try {
        const payload = (await response.json()) as { message?: string }
        if (payload?.message) message = payload.message
      } catch {
        // Body wasn't JSON — fall back to the generic message.
      }
      throw new Error(message)
    }

    return response.json() as Promise<CategoryDto>
  },

  async getCategoryDeletionSummary(
    id: string
  ): Promise<CategoryDeletionSummaryDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/categories/${id}/deletion-summary`
    )

    if (!response.ok) {
      throw new Error("Impossible de calculer l'impact de la suppression")
    }

    return response.json() as Promise<CategoryDeletionSummaryDto>
  },

  async deleteCategory(id: string): Promise<CategoryDeletionResultDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/categories/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Erreur lors de la suppression de la catégorie')
    }

    return response.json() as Promise<CategoryDeletionResultDto>
  },

  // Subcategories API
  /**
   * Every subcategory the user owns, in one round-trip. The settings page
   * needs the counts for all categories at once, so fetching per category
   * would mean one request per row.
   */
  async getLegacyCategories(): Promise<LegacyOverviewDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/categories/legacy`)

    if (!response.ok) {
      throw new Error('Impossible de charger les anciennes catégories')
    }

    return response.json() as Promise<LegacyOverviewDto>
  },

  /** The server answers 400 with the reason when the arrangement is impossible. */
  async previewLegacyMigration(
    categoryId: string,
    decisions: LegacyDecisionDto[]
  ): Promise<LegacyMigrationPreviewDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/categories/${categoryId}/legacy-migration/preview`,
      { method: 'POST', body: JSON.stringify({ decisions }) }
    )

    if (!response.ok) {
      throw new Error(
        await errorMessageOf(response, 'Impossible de préparer la migration')
      )
    }

    return response.json() as Promise<LegacyMigrationPreviewDto>
  },

  async migrateLegacyCategory(
    categoryId: string,
    decisions: LegacyDecisionDto[]
  ): Promise<LegacyMigrationResultDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/categories/${categoryId}/legacy-migration`,
      { method: 'POST', body: JSON.stringify({ decisions }) }
    )

    if (!response.ok) {
      throw new Error(await errorMessageOf(response, 'La migration a échoué'))
    }

    return response.json() as Promise<LegacyMigrationResultDto>
  },

  async deleteSubcategory(id: string): Promise<SubcategoryDeletionResultDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/subcategories/${id}`,
      { method: 'DELETE' }
    )

    if (!response.ok) {
      throw new Error(
        await errorMessageOf(
          response,
          'Impossible de supprimer la sous-catégorie'
        )
      )
    }

    return response.json() as Promise<SubcategoryDeletionResultDto>
  },

  async getSubcategories(): Promise<SubcategoryDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/subcategories`)

    if (!response.ok) {
      throw new Error('Impossible de charger les sous-catégories')
    }

    return response.json() as Promise<SubcategoryDto[]>
  },

  async getSubcategoriesByCategory(
    categoryId: string
  ): Promise<SubcategoryDto[]> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/subcategories/by-category/${categoryId}`
    )

    if (!response.ok) {
      throw new Error('Impossible de charger les sous-catégories')
    }

    return response.json() as Promise<SubcategoryDto[]>
  },

  async createSubcategory(dto: {
    categoryId: string
    name: string
    nature?: CategoryNature
    rhythm?: CategoryRhythm
  }): Promise<SubcategoryDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/subcategories`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error('Impossible de créer la sous-catégorie')
    }

    return response.json() as Promise<SubcategoryDto>
  },

  async getTransactions(
    params?: TransactionQueryParams
  ): Promise<PaginatedResponse<TransactionDto>> {
    const searchParams = new URLSearchParams()

    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.type) searchParams.set('type', params.type)
    if (params?.startDate) searchParams.set('startDate', params.startDate)
    if (params?.endDate) searchParams.set('endDate', params.endDate)
    if (params?.categoryId) searchParams.set('categoryId', params.categoryId)
    if (params?.subcategoryId)
      searchParams.set('subcategoryId', params.subcategoryId)
    if (params?.isPointed !== undefined)
      searchParams.set('isPointed', params.isPointed.toString())
    if (params?.account) searchParams.set('account', params.account)
    if (params?.tagId) searchParams.set('tagId', params.tagId)
    if (params?.tagFamilyId) searchParams.set('tagFamilyId', params.tagFamilyId)
    if (params?.search) searchParams.set('search', params.search)
    if (params?.amountMin !== undefined)
      searchParams.set('amountMin', params.amountMin.toString())
    if (params?.amountMax !== undefined)
      searchParams.set('amountMax', params.amountMax.toString())
    if (params?.needsBankReview !== undefined)
      searchParams.set('needsBankReview', params.needsBankReview.toString())
    if (params?.recurrence) searchParams.set('recurrence', params.recurrence)
    if (params?.ids && params.ids.length > 0)
      searchParams.set('ids', params.ids.join(','))
    if (params?.personId) searchParams.set('personId', params.personId)
    if (params?.reimbursement)
      searchParams.set('reimbursement', params.reimbursement)
    if (params?.settlementId)
      searchParams.set('settlementId', params.settlementId)
    if (params?.importId) searchParams.set('importId', params.importId)
    if (params?.syncRunId) searchParams.set('syncRunId', params.syncRunId)
    if (params?.exceptional) searchParams.set('exceptional', params.exceptional)
    if (params?.nature) searchParams.set('nature', params.nature)
    if (params?.rhythm) searchParams.set('rhythm', params.rhythm)
    if (params?.categoryIds && params.categoryIds.length > 0)
      searchParams.set('categoryIds', params.categoryIds.join(','))
    if (params?.recurrences && params.recurrences.length > 0)
      searchParams.set('recurrences', params.recurrences.join(','))
    if (params?.amortized) searchParams.set('amortized', 'true')
    if (params?.alsoIds && params.alsoIds.length > 0)
      searchParams.set('alsoIds', params.alsoIds.join(','))
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)

    const queryString = searchParams.toString()
    const url = queryString
      ? `${API_BASE_URL}/transactions?${queryString}`
      : `${API_BASE_URL}/transactions`

    const response = await fetchWithAuth(url)

    if (!response.ok) {
      throw new Error('Impossible de charger les transactions')
    }

    return response.json() as Promise<PaginatedResponse<TransactionDto>>
  },

  async updateTransaction(
    id: string,
    data: {
      note?: string
      /** Null sends the transaction back to "à classer". */
      categoryId?: string | null
      subcategoryId?: string | null
      isPointed?: boolean
      /** Smooth the expense over 2 to 60 months; null stops smoothing it. */
      amortizationMonths?: number | null
    }
  ): Promise<TransactionDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      // A refused smoothing says why (an exceptional tag, an income).
      throw new Error(
        await readErrorMessage(
          response,
          'Impossible de modifier la transaction'
        )
      )
    }

    return response.json() as Promise<TransactionDto>
  },

  /**
   * Apply a change to many transactions at once.
   *
   * The selection is either the ids the user ticked, or the filter the list is
   * showing — the second form so "all 412 results" does not stop at the fifty
   * on screen. A filtered selection carries the count the user was shown, and
   * the server refuses if the database disagrees.
   *
   * `subcategoryId` is deliberately explicit: a subcategory belongs to one
   * category, so moving a transaction elsewhere either files it under a new
   * subcategory or leaves it with none. Omitting the field clears it.
   */
  async bulkUpdateTransactions(
    selection:
      | { ids: string[] }
      | { filters: TransactionQueryParams; expectedCount: number },
    data: {
      categoryId?: string
      subcategoryId?: string | null
      isPointed?: boolean
    }
  ): Promise<{ updated: number }> {
    const response = await fetchWithAuth(`${API_BASE_URL}/transactions/bulk`, {
      method: 'PATCH',
      body: JSON.stringify({ ...selection, ...data }),
    })

    if (!response.ok) {
      // The stale-selection refusal carries a message worth showing.
      const detail = (await response.json().catch(() => null)) as {
        message?: string
      } | null
      throw new Error(
        detail?.message ?? 'Impossible de modifier les transactions'
      )
    }

    return response.json() as Promise<{ updated: number }>
  },

  async getFilterPreferences(): Promise<FilterPreferencesDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/filter-preferences`)

    if (!response.ok) {
      throw new Error('Impossible de charger les préférences de filtre')
    }

    return response.json() as Promise<FilterPreferencesDto>
  },

  async updateFilterPreferences(
    preferences: Partial<FilterPreferencesDto>
  ): Promise<FilterPreferencesDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/filter-preferences`, {
      method: 'PUT',
      body: JSON.stringify(preferences),
    })

    if (!response.ok) {
      throw new Error("Impossible d'enregistrer les préférences de filtre")
    }

    return response.json() as Promise<FilterPreferencesDto>
  },

  // Accounts API
  async getAccounts(): Promise<AccountDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/accounts`)

    if (!response.ok) {
      throw new Error('Impossible de charger les comptes')
    }

    return response.json() as Promise<AccountDto[]>
  },

  async getAccount(id: string): Promise<AccountDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/accounts/${id}`)

    if (!response.ok) {
      throw new Error('Impossible de charger le compte')
    }

    return response.json() as Promise<AccountDto>
  },

  async updateAccount(id: string, dto: UpdateAccountDto): Promise<AccountDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      let message = 'Impossible de modifier le compte'
      try {
        const payload = (await response.json()) as { message?: string }
        if (payload?.message) message = payload.message
      } catch {
        // Body wasn't JSON — fall back to the generic message.
      }
      throw new Error(message)
    }

    return response.json() as Promise<AccountDto>
  },

  async getAccountDeletionSummary(
    id: string
  ): Promise<AccountDeletionSummaryDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/accounts/${id}/deletion-summary`
    )

    if (!response.ok) {
      throw new Error("Impossible de calculer l'impact de la suppression")
    }

    return response.json() as Promise<AccountDeletionSummaryDto>
  },

  /** Deletes a *bank* account; `deleteAccount` above wipes the user itself. */
  async deleteBankAccount(id: string): Promise<AccountDeletionResultDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/accounts/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      let message = 'Impossible de supprimer le compte'
      try {
        const payload = (await response.json()) as { message?: string }
        if (payload?.message) message = payload.message
      } catch {
        // Body wasn't JSON — fall back to the generic message.
      }
      throw new Error(message)
    }

    return response.json() as Promise<AccountDeletionResultDto>
  },

  // Dashboard API
  async getDashboardSummary(
    filters: DashboardFiltersDto
  ): Promise<DashboardSummaryDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/dashboard/summary`, {
      method: 'POST',
      body: JSON.stringify(filters),
    })

    if (!response.ok) {
      throw new Error('Impossible de charger le tableau de bord')
    }

    return response.json() as Promise<DashboardSummaryDto>
  },

  /**
   * « Ce qui change »: its own request, never part of the summary, so the
   * dashboard's figures never wait for it.
   */
  async getSpendingTrends(query: TrendsQuery = {}): Promise<TrendsResponseDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/trends${trendsSearch(query)}`
    )

    if (!response.ok) {
      throw new Error('Impossible de charger les tendances')
    }

    return response.json() as Promise<TrendsResponseDto>
  },

  /**
   * The paragraph under « Ce qui change »: the remembered one, else written
   * now. Asked after the list, never before; null when there is none.
   */
  async getTrendDigest(
    query: TrendsQuery = {}
  ): Promise<TrendDigestDto | null> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/trends/digest${trendsSearch(query)}`
    )

    if (!response.ok) {
      throw new Error('Impossible de charger le bilan rédigé')
    }

    return ((await response.json()) as { digest: TrendDigestDto | null }).digest
  },

  /** « Régénérer »: the paragraph written again; null when it failed. */
  async regenerateTrendDigest(
    query: TrendsQuery = {}
  ): Promise<TrendDigestDto | null> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/trends/digest/regenerate${trendsSearch(query)}`,
      { method: 'POST' }
    )

    if (!response.ok) {
      throw new Error('Impossible de régénérer le bilan rédigé')
    }

    return ((await response.json()) as { digest: TrendDigestDto | null }).digest
  },

  // Persons API
  async getPersons(): Promise<PersonDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/persons`)

    if (!response.ok) {
      throw new Error('Impossible de charger les personnes')
    }

    return response.json() as Promise<PersonDto[]>
  },

  async createPerson(dto: CreatePersonDto): Promise<PersonDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/persons`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error('Impossible de créer la personne')
    }

    return response.json() as Promise<PersonDto>
  },

  async updatePerson(id: string, dto: UpdatePersonDto): Promise<PersonDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/persons/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error('Impossible de modifier la personne')
    }

    return response.json() as Promise<PersonDto>
  },

  async deletePerson(id: string): Promise<void> {
    const response = await fetchWithAuth(`${API_BASE_URL}/persons/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Impossible de supprimer la personne')
    }
  },

  // Tags API
  async getRecurrences(): Promise<RecurrenceListDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/recurrences`)

    if (!response.ok) {
      throw new Error('Impossible de charger les récurrences')
    }

    return response.json() as Promise<RecurrenceListDto>
  },

  async setRecurrenceDecision(dto: {
    merchantKey: string
    amountBucket: number | null
    decision: RecurrenceDecisionKind
  }): Promise<RecurrenceListDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/recurrences/decisions`,
      { method: 'PUT', body: JSON.stringify(dto) }
    )

    if (!response.ok) {
      throw new Error("Impossible d'enregistrer la décision")
    }

    return response.json() as Promise<RecurrenceListDto>
  },

  async renameRecurrence(dto: {
    merchantKey: string
    amountBucket: number
    name: string | null
  }): Promise<RecurrenceListDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/recurrences/name`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error('Impossible de renommer la charge récurrente')
    }

    return response.json() as Promise<RecurrenceListDto>
  },

  async linkTransactionToRecurrence(dto: {
    transactionId: string
    merchantKey: string
    amountBucket: number
  }): Promise<RecurrenceListDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/recurrences/links`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error('Impossible de rattacher la transaction')
    }

    return response.json() as Promise<RecurrenceListDto>
  },

  async unlinkTransactionFromRecurrence(
    transactionId: string
  ): Promise<RecurrenceListDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/recurrences/links/${encodeURIComponent(transactionId)}`,
      { method: 'DELETE' }
    )

    if (!response.ok) {
      throw new Error('Impossible de détacher la transaction')
    }

    return response.json() as Promise<RecurrenceListDto>
  },

  async markTransactionRecurring(dto: {
    transactionId: string
    period: RecurrencePeriod
  }): Promise<RecurrenceListDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/recurrences/from-transaction`,
      { method: 'POST', body: JSON.stringify(dto) }
    )

    if (!response.ok) {
      throw new Error('Impossible de marquer la transaction comme récurrente')
    }

    return response.json() as Promise<RecurrenceListDto>
  },

  /** Forget a subscription: a dismissal taken back, or one without a series. */
  async deleteSubscription(id: string): Promise<RecurrenceListDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/recurrences/subscriptions/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    )

    if (!response.ok) {
      throw new Error("Impossible d'oublier l'abonnement")
    }

    return response.json() as Promise<RecurrenceListDto>
  },

  async getTags(): Promise<TagDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/tags`)

    if (!response.ok) {
      throw new Error('Impossible de charger les étiquettes')
    }

    return response.json() as Promise<TagDto[]>
  },

  async getTagBudgetSummary(params: {
    startDate: string
    endDate: string
  }): Promise<TagBudgetSummaryDto> {
    const query = new URLSearchParams(params).toString()
    const response = await fetchWithAuth(
      `${API_BASE_URL}/tags/budget-summary?${query}`
    )

    if (!response.ok) {
      throw new Error("Impossible de charger le budget de l'étiquette")
    }

    return response.json() as Promise<TagBudgetSummaryDto>
  },

  async createTag(dto: CreateTagDto): Promise<TagDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/tags`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      const message =
        response.status === 409
          ? 'Une étiquette porte déjà ce nom'
          : "Impossible de créer l'étiquette"
      throw new Error(message)
    }

    return response.json() as Promise<TagDto>
  },

  async updateTag(id: string, dto: UpdateTagDto): Promise<TagDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/tags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      // A tag turned exceptional over smoothed purchases is refused with why.
      const message =
        response.status === 409
          ? 'Une étiquette porte déjà ce nom'
          : await readErrorMessage(
              response,
              "Impossible de modifier l'étiquette"
            )
      throw new Error(message)
    }

    return response.json() as Promise<TagDto>
  },

  async deleteTag(id: string): Promise<void> {
    const response = await fetchWithAuth(`${API_BASE_URL}/tags/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error("Impossible de supprimer l'étiquette")
    }
  },

  // Tag families API

  async getTagFamilies(): Promise<TagFamilyDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/tag-families`)

    if (!response.ok) {
      throw new Error("Impossible de charger les familles d'étiquettes")
    }

    return response.json() as Promise<TagFamilyDto[]>
  },

  async createTagFamily(dto: CreateTagFamilyDto): Promise<TagFamilyDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/tag-families`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      const message =
        response.status === 409
          ? 'Une famille porte déjà ce nom'
          : 'Impossible de créer la famille'
      throw new Error(message)
    }

    return response.json() as Promise<TagFamilyDto>
  },

  async updateTagFamily(
    id: string,
    dto: UpdateTagFamilyDto
  ): Promise<TagFamilyDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/tag-families/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      const message =
        response.status === 409
          ? 'Une famille porte déjà ce nom'
          : 'Impossible de modifier la famille'
      throw new Error(message)
    }

    return response.json() as Promise<TagFamilyDto>
  },

  async deleteTagFamily(id: string): Promise<void> {
    const response = await fetchWithAuth(`${API_BASE_URL}/tag-families/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Impossible de supprimer la famille')
    }
  },

  async attachTagToTransactions(
    tagId: string,
    transactionIds: string[]
  ): Promise<{ attached: number }> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/tags/${tagId}/transactions`,
      {
        method: 'POST',
        body: JSON.stringify({ transactionIds }),
      }
    )

    if (!response.ok) {
      // An exceptional tag on a smoothed purchase is refused with why.
      throw new Error(
        await readErrorMessage(response, "Impossible d'ajouter l'étiquette")
      )
    }

    return response.json() as Promise<{ attached: number }>
  },

  async detachTagFromTransaction(
    tagId: string,
    transactionId: string
  ): Promise<void> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/tags/${tagId}/transactions/${transactionId}`,
      { method: 'DELETE' }
    )

    if (!response.ok) {
      throw new Error("Impossible de retirer l'étiquette")
    }
  },

  async getTagAnalysis(id: string): Promise<TagAnalysisDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/tags/${id}/analysis`)

    if (!response.ok) {
      throw new Error("Impossible de charger l'analyse de l'étiquette")
    }

    return response.json() as Promise<TagAnalysisDto>
  },

  async getTagFamilyAnalysis(
    id: string,
    params: { year?: number | null; basis?: TagFamilyAnalysisBasis } = {}
  ): Promise<TagFamilyAnalysisDto> {
    const searchParams = new URLSearchParams()
    if (params.year !== undefined && params.year !== null) {
      searchParams.set('year', String(params.year))
    }
    if (params.basis) searchParams.set('basis', params.basis)
    const query = searchParams.toString()
    const response = await fetchWithAuth(
      `${API_BASE_URL}/tag-families/${id}/analysis${query ? `?${query}` : ''}`
    )

    if (!response.ok) {
      throw new Error("Impossible de charger l'analyse de la famille")
    }

    return response.json() as Promise<TagFamilyAnalysisDto>
  },

  // Reimbursements API
  async getReimbursements(): Promise<ReimbursementDto[]> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/reimbursements?includeTransaction=true`
    )

    if (!response.ok) {
      throw new Error('Impossible de charger les remboursements')
    }

    return response.json() as Promise<ReimbursementDto[]>
  },

  async createReimbursement(
    dto: CreateReimbursementDto
  ): Promise<ReimbursementDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/reimbursements`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error('Impossible de créer le remboursement')
    }

    return response.json() as Promise<ReimbursementDto>
  },

  async updateReimbursement(
    id: string,
    dto: {
      personId?: string
      amount?: number
      categoryId?: string | null
      note?: string
    }
  ): Promise<ReimbursementDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/reimbursements/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(dto),
      }
    )

    if (!response.ok) {
      throw new Error('Impossible de modifier le remboursement')
    }

    return response.json() as Promise<ReimbursementDto>
  },

  async deleteReimbursement(id: string): Promise<void> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/reimbursements/${id}`,
      {
        method: 'DELETE',
      }
    )

    if (!response.ok) {
      throw new Error('Impossible de supprimer le remboursement')
    }
  },

  // Settlements API
  async getSettlements(personId?: string): Promise<SettlementDto[]> {
    const url = personId
      ? `${API_BASE_URL}/settlements?personId=${personId}`
      : `${API_BASE_URL}/settlements`
    const response = await fetchWithAuth(url)

    if (!response.ok) {
      throw new Error('Impossible de charger les règlements')
    }

    return response.json() as Promise<SettlementDto[]>
  },

  async getSettlement(id: string): Promise<SettlementDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/settlements/${id}`)

    if (!response.ok) {
      throw new Error('Impossible de charger le règlement')
    }

    return response.json() as Promise<SettlementDto>
  },

  async getTransactionAvailableAmount(
    id: string
  ): Promise<TransactionAvailableAmountDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/settlements/transaction/${id}/available-amount`
    )

    if (!response.ok) {
      throw new Error(
        'Impossible de lire le montant disponible de la transaction'
      )
    }

    return response.json() as Promise<TransactionAvailableAmountDto>
  },

  async createSettlement(dto: CreateSettlementDto): Promise<SettlementDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/settlements`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      // The server explains *why* it refused — which line overdraws the
      // receipt, which debt is already credited. Swallowing that left the
      // modal showing "Impossible d'enregistrer le règlement" and nothing to act on.
      throw new Error(
        await readErrorMessage(
          response,
          "Impossible d'enregistrer le règlement"
        )
      )
    }

    return response.json() as Promise<SettlementDto>
  },

  async deleteSettlement(id: string): Promise<void> {
    const response = await fetchWithAuth(`${API_BASE_URL}/settlements/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Impossible de supprimer le règlement')
    }
  },

  // Import Histories API
  async getImportHistories(): Promise<ImportHistoryDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/import-histories`)

    if (!response.ok) {
      throw new Error("Impossible de charger l'historique des imports")
    }

    return response.json() as Promise<ImportHistoryDto[]>
  },

  /** One import, read back from the history — the recap's source of truth. */
  async getImportHistory(id: string): Promise<ImportHistoryDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/import-histories/${encodeURIComponent(id)}`
    )

    if (response.status === 404) {
      throw new Error('Cet import est introuvable')
    }
    if (!response.ok) {
      throw new Error("Impossible de charger le récapitulatif de l'import")
    }

    return response.json() as Promise<ImportHistoryDto>
  },

  async getLatestImportDate(): Promise<{ date: string | null }> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/import-histories/latest-date`
    )

    if (!response.ok) {
      throw new Error('Impossible de lire la date du dernier import')
    }

    return response.json() as Promise<{ date: string | null }>
  },

  async createImportHistory(
    dto: CreateImportHistoryDto
  ): Promise<ImportHistoryDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/import-histories`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error("Impossible d'enregistrer l'historique d'import")
    }

    return response.json() as Promise<ImportHistoryDto>
  },

  async startImport(dto: StartImportDto): Promise<ImportHistoryDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/import-histories/start`,
      {
        method: 'POST',
        body: JSON.stringify(dto),
      }
    )

    if (!response.ok) {
      throw new Error("Impossible de démarrer l'import")
    }

    return response.json() as Promise<ImportHistoryDto>
  },

  async finalizeImport(
    id: string,
    dto: FinalizeImportDto
  ): Promise<ImportHistoryDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/import-histories/${id}/finalize`,
      {
        method: 'PUT',
        body: JSON.stringify(dto),
      }
    )

    if (!response.ok) {
      throw new Error("Impossible de finaliser l'import")
    }

    return response.json() as Promise<ImportHistoryDto>
  },

  async deleteImport(id: string): Promise<void> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/import-histories/${id}`,
      {
        method: 'DELETE',
      }
    )

    if (!response.ok) {
      throw new Error("Impossible de supprimer l'import")
    }
  },

  // AI Suggestions API
  // Budget plans API
  async getBudgetPlans(): Promise<BudgetPlanSummaryDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/budget-plans`)
    if (!response.ok) {
      throw new Error('Impossible de charger les budgets')
    }
    return response.json() as Promise<BudgetPlanSummaryDto[]>
  },

  async getCurrentBudgetPlan(): Promise<BudgetPlanDto | null> {
    const response = await fetchWithAuth(`${API_BASE_URL}/budget-plans/current`)
    if (!response.ok) {
      throw new Error('Impossible de charger le budget en cours')
    }
    // The backend returns an empty body when no plan covers today (Express
    // serializes `null` as Content-Length: 0, not the JSON string "null").
    // Handle that case explicitly before attempting to parse.
    const text = await response.text()
    if (!text || text === 'null') return null
    return JSON.parse(text) as BudgetPlanDto
  },

  async getBudgetPlan(id: string): Promise<BudgetPlanDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/budget-plans/${id}`)
    if (!response.ok) {
      throw new Error('Impossible de charger le budget')
    }
    return response.json() as Promise<BudgetPlanDto>
  },

  async createBudgetPlan(dto: CreateBudgetPlanDto): Promise<BudgetPlanDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/budget-plans`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })
    if (!response.ok) {
      const message = await readErrorMessage(
        response,
        'Impossible de créer le budget'
      )
      throw new Error(message)
    }
    return response.json() as Promise<BudgetPlanDto>
  },

  async updateBudgetPlan(
    id: string,
    dto: UpdateBudgetPlanDto
  ): Promise<BudgetPlanDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/budget-plans/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    })
    if (!response.ok) {
      const message = await readErrorMessage(
        response,
        "Impossible d'enregistrer le budget"
      )
      throw new Error(message)
    }
    return response.json() as Promise<BudgetPlanDto>
  },

  async deleteBudgetPlan(id: string): Promise<void> {
    const response = await fetchWithAuth(`${API_BASE_URL}/budget-plans/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error('Impossible de supprimer le budget')
    }
  },

  async getBudgetStatistics(
    filters: BudgetStatisticsFiltersDto
  ): Promise<BudgetStatisticsDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/budgets/statistics`, {
      method: 'POST',
      body: JSON.stringify(filters),
    })

    if (!response.ok) {
      throw new Error('Impossible de charger les statistiques du budget')
    }

    return response.json() as Promise<BudgetStatisticsDto>
  },

  async generateCategoryIcons(): Promise<{ updated: number }> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/categories/generate-icons`,
      {
        method: 'POST',
      }
    )
    if (!response.ok) {
      throw new Error('Impossible de générer les icônes de catégorie')
    }
    return response.json() as Promise<{ updated: number }>
  },
}
