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

export interface CategoryDto {
  id: string
  name: string
  type: 'EXPENSE' | 'INCOME'
  icon?: string | null
  isExcludedFromBudget: boolean
  createdAt: string
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
  isGloballyHidden: boolean
  isExcludedFromBudget: boolean
}

/** One decision of the mapping table. */
export interface MigrationActionDto {
  /** Null stands for the transactions with no subcategory. */
  sourceSubcategoryId: string | null
  action: 'MOVE' | 'MERGE' | 'KEEP'
  /** Required by MERGE, meaningless otherwise. */
  targetSubcategoryId?: string
}

export interface MigrationSourceSubcategoryDto {
  id: string
  name: string
  transactionCount: number
  /**
   * The destination already has a subcategory of this name. Moving it would
   * break the unique constraint, so the line has to merge — and the screen
   * says why rather than silently removing the option.
   */
  nameTakenInTarget: boolean
}

export interface CategoryMigrationPreviewDto {
  sourceCategoryId: string
  sourceCategoryName: string
  targetCategoryId: string
  targetCategoryName: string
  type: 'EXPENSE' | 'INCOME'
  sourceSubcategories: MigrationSourceSubcategoryDto[]
  targetSubcategories: { id: string; name: string }[]
  uncategorizedCount: number
  /** Confirming without touching anything sends these back unchanged. */
  defaultActions: MigrationActionDto[]
  budgetPlanEntries: BudgetPlanEntrySummaryDto[]
}

export interface CategoryMigrationResultDto {
  sourceCategoryId: string
  targetCategoryId: string
  movedTransactions: number
  movedSubcategories: number
  mergedSubcategories: number
  keptTransactions: number
  keptSubcategories: number
  /** The source is kept either way; this only says which case it is. */
  sourceLeftEmpty: boolean
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

export interface TransactionDto {
  id: string
  date: string
  description: string
  amount: number
  type: 'EXPENSE' | 'INCOME'
  accountId: string
  account: string
  subcategory?: string | null
  note?: string | null
  isPointed: boolean
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
  createdAt: string
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
  type?: 'EXPENSE' | 'INCOME' | undefined
  startDate?: string | undefined
  endDate?: string | undefined
  categoryId?: string | undefined
  subcategoryId?: string | undefined
  isPointed?: boolean | undefined
  account?: string | undefined
  tagId?: string | undefined
  search?: string | undefined
  amountMin?: number | undefined
  amountMax?: number | undefined
}

/** Hidden categories are addressed by Category id, never by name. */
export interface FilterPreferencesDto {
  hiddenExpenseCategoryIds: string[]
  hiddenIncomeCategoryIds: string[]
  globalHiddenExpenseCategoryIds: string[]
  globalHiddenIncomeCategoryIds: string[]
  isPanelExpanded: boolean
  /**
   * Whether an import adopts the categories written in the file. On by
   * default. Off, the file's filing is ignored and each transaction is placed
   * among the categories that already exist — nothing new is created either
   * way.
   */
  importCategoriesFromFile: boolean
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
  createdAt: string
  updatedAt: string
}

export interface CreateTagDto {
  name: string
  color?: string
  icon?: string
  isExceptional?: boolean
  eventStartDate?: string
  eventEndDate?: string
  budgetAmount?: number
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

export interface TagBudgetSummaryDto {
  items: TagBudgetSummaryItemDto[]
  /** Sum of declared envelopes; projects without one contribute 0 */
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
  /** Income category the user expected the money back on — a hint, no more. */
  categoryId: string | null
  categoryName: string | null
  /** Category of the expense being repaid: where the credit is deducted. */
  expenseCategoryId: string | null
  expenseCategoryName: string | null
  amount: number
  amountReceived: number
  amountRemaining: number
  status: 'PENDING' | 'PARTIAL' | 'COMPLETED'
  note: string | null
  createdAt: string
  updatedAt: string
  transaction?: TransactionSummaryDto
}

export interface CreateReimbursementDto {
  transactionId: string
  personId: string
  amount: number
  categoryId?: string
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
  categoriesCreated: number
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

// Category Associations DTOs (DB-based)
// Dashboard DTOs
export interface MonthlyDataDto {
  month: string
  label: string
  expenses: number
  netExpenses: number
  income: number
  /** Share of the month's expenses tagged as exceptional */
  exceptionalExpenses: number
  /** netExpenses minus the exceptional share */
  everydayNetExpenses: number
}

export interface SubcategoryDataDto {
  subcategory: string
  icon?: string | null
  amount: number
  transactionCount: number
  averagePerMonth: number
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

/** A category as offered in the filter panel: addressed by id, shown by name. */
export interface CategoryOptionDto {
  id: string
  name: string
}

export interface DashboardFiltersDto {
  hiddenExpenseCategoryIds?: string[]
  hiddenIncomeCategoryIds?: string[]
  startDate?: string
  endDate?: string
  deductReimbursements?: boolean
  deductPendingReimbursements?: boolean
  includeCategoryBreakdown?: boolean
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
  subcategory: string
  totalAmount: number
  transactionCount: number
  averagePerMonth: number
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
async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // First attempt
  const headers = await getAuthHeaders()
  let response = await fetch(url, { ...options, headers })

  // If 401, try to refresh token and retry
  if (response.status === 401) {
    const { error } = await supabase.auth.refreshSession()

    if (error) {
      // Refresh failed - session is invalid
      throw new AuthError('Session expiree, veuillez vous reconnecter')
    }

    // Retry with new token
    const newHeaders = await getAuthHeaders()
    response = await fetch(url, { ...options, headers: newHeaders })
  }

  return response
}

/**
 * Try to extract a NestJS error message from a non-OK response. Falls back
 * to a generic message if the body is empty or not JSON.
 */
async function readErrorMessage(
  response: Response,
  fallbackAction: string
): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] }
    if (Array.isArray(body.message)) return body.message.join(', ')
    if (typeof body.message === 'string') return body.message
  } catch {
    // body wasn't JSON; ignore
  }
  return `Failed to ${fallbackAction}`
}

export const api = {
  async getMe(): Promise<DbUser> {
    const response = await fetchWithAuth(`${API_BASE_URL}/users/me`)

    if (!response.ok) {
      throw new Error('Failed to fetch user')
    }

    return response.json() as Promise<DbUser>
  },

  async deleteAccount(): Promise<void> {
    const response = await fetchWithAuth(`${API_BASE_URL}/users/me`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Failed to delete account')
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
      throw new Error('Failed to preview import')
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
      throw new Error('Failed to import transactions')
    }

    return response.json() as Promise<ImportResultDto>
  },

  async getCategories(): Promise<CategoryDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/categories`)

    if (!response.ok) {
      throw new Error('Failed to fetch categories')
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
      throw new Error('Failed to create category')
    }

    return response.json() as Promise<CategoryDto>
  },

  async updateCategory(
    id: string,
    dto: { name?: string; isExcludedFromBudget?: boolean }
  ): Promise<CategoryDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      // A rename can clash with an existing category; the server explains
      // which one, so the message is worth surfacing verbatim.
      let message = 'Failed to update category'
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

  async getCategoryMigrationPreview(
    id: string,
    targetCategoryId: string
  ): Promise<CategoryMigrationPreviewDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/categories/${id}/migration-preview?targetCategoryId=${encodeURIComponent(targetCategoryId)}`
    )

    if (!response.ok) {
      throw new Error('Impossible de preparer le deplacement')
    }

    return response.json() as Promise<CategoryMigrationPreviewDto>
  },

  async migrateCategory(
    id: string,
    targetCategoryId: string,
    actions: MigrationActionDto[]
  ): Promise<CategoryMigrationResultDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/categories/${id}/migrate`,
      {
        method: 'POST',
        body: JSON.stringify({ targetCategoryId, actions }),
      }
    )

    if (!response.ok) {
      // A refused arrangement carries a message the user can act on.
      const detail = (await response.json().catch(() => null)) as {
        message?: string | string[]
      } | null
      const message = Array.isArray(detail?.message)
        ? detail.message.join(', ')
        : detail?.message
      throw new Error(message ?? 'Echec du deplacement')
    }

    return response.json() as Promise<CategoryMigrationResultDto>
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
  async getSubcategories(): Promise<SubcategoryDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/subcategories`)

    if (!response.ok) {
      throw new Error('Failed to fetch subcategories')
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
      throw new Error('Failed to fetch subcategories')
    }

    return response.json() as Promise<SubcategoryDto[]>
  },

  async createSubcategory(dto: {
    categoryId: string
    name: string
  }): Promise<SubcategoryDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/subcategories`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error('Failed to create subcategory')
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
    if (params?.search) searchParams.set('search', params.search)
    if (params?.amountMin !== undefined)
      searchParams.set('amountMin', params.amountMin.toString())
    if (params?.amountMax !== undefined)
      searchParams.set('amountMax', params.amountMax.toString())

    const queryString = searchParams.toString()
    const url = queryString
      ? `${API_BASE_URL}/transactions?${queryString}`
      : `${API_BASE_URL}/transactions`

    const response = await fetchWithAuth(url)

    if (!response.ok) {
      throw new Error('Failed to fetch transactions')
    }

    return response.json() as Promise<PaginatedResponse<TransactionDto>>
  },

  async updateTransaction(
    id: string,
    data: {
      note?: string
      categoryId?: string
      subcategoryId?: string | null
      isPointed?: boolean
    }
  ): Promise<TransactionDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error('Failed to update transaction')
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
      throw new Error(detail?.message ?? 'Failed to bulk update transactions')
    }

    return response.json() as Promise<{ updated: number }>
  },

  async getFilterPreferences(): Promise<FilterPreferencesDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/filter-preferences`)

    if (!response.ok) {
      throw new Error('Failed to fetch filter preferences')
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
      throw new Error('Failed to update filter preferences')
    }

    return response.json() as Promise<FilterPreferencesDto>
  },

  // Accounts API
  async getAccounts(): Promise<AccountDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/accounts`)

    if (!response.ok) {
      throw new Error('Failed to fetch accounts')
    }

    return response.json() as Promise<AccountDto[]>
  },

  async getAccount(id: string): Promise<AccountDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/accounts/${id}`)

    if (!response.ok) {
      throw new Error('Failed to fetch account')
    }

    return response.json() as Promise<AccountDto>
  },

  async updateAccount(id: string, dto: UpdateAccountDto): Promise<AccountDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      let message = 'Failed to update account'
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
      let message = 'Failed to delete account'
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
      throw new Error('Failed to fetch dashboard summary')
    }

    return response.json() as Promise<DashboardSummaryDto>
  },

  // Persons API
  async getPersons(): Promise<PersonDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/persons`)

    if (!response.ok) {
      throw new Error('Failed to fetch persons')
    }

    return response.json() as Promise<PersonDto[]>
  },

  async createPerson(dto: CreatePersonDto): Promise<PersonDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/persons`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error('Failed to create person')
    }

    return response.json() as Promise<PersonDto>
  },

  async updatePerson(id: string, dto: UpdatePersonDto): Promise<PersonDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/persons/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error('Failed to update person')
    }

    return response.json() as Promise<PersonDto>
  },

  async deletePerson(id: string): Promise<void> {
    const response = await fetchWithAuth(`${API_BASE_URL}/persons/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Failed to delete person')
    }
  },

  // Tags API
  async getTags(): Promise<TagDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/tags`)

    if (!response.ok) {
      throw new Error('Failed to fetch tags')
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
      throw new Error('Failed to fetch tag budget summary')
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
          : 'Failed to create tag'
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
      const message =
        response.status === 409
          ? 'Une étiquette porte déjà ce nom'
          : 'Failed to update tag'
      throw new Error(message)
    }

    return response.json() as Promise<TagDto>
  },

  async deleteTag(id: string): Promise<void> {
    const response = await fetchWithAuth(`${API_BASE_URL}/tags/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Failed to delete tag')
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
      throw new Error('Failed to attach tag')
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
      throw new Error('Failed to detach tag')
    }
  },

  async getTagAnalysis(id: string): Promise<TagAnalysisDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/tags/${id}/analysis`)

    if (!response.ok) {
      throw new Error('Failed to fetch tag analysis')
    }

    return response.json() as Promise<TagAnalysisDto>
  },

  // Reimbursements API
  async getReimbursements(): Promise<ReimbursementDto[]> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/reimbursements?includeTransaction=true`
    )

    if (!response.ok) {
      throw new Error('Failed to fetch reimbursements')
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
      throw new Error('Failed to create reimbursement')
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
      throw new Error('Failed to update reimbursement')
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
      throw new Error('Failed to delete reimbursement')
    }
  },

  // Settlements API
  async getSettlements(personId?: string): Promise<SettlementDto[]> {
    const url = personId
      ? `${API_BASE_URL}/settlements?personId=${personId}`
      : `${API_BASE_URL}/settlements`
    const response = await fetchWithAuth(url)

    if (!response.ok) {
      throw new Error('Failed to fetch settlements')
    }

    return response.json() as Promise<SettlementDto[]>
  },

  async getSettlement(id: string): Promise<SettlementDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/settlements/${id}`)

    if (!response.ok) {
      throw new Error('Failed to fetch settlement')
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
      throw new Error('Failed to fetch transaction available amount')
    }

    return response.json() as Promise<TransactionAvailableAmountDto>
  },

  async createSettlement(dto: CreateSettlementDto): Promise<SettlementDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/settlements`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error('Failed to create settlement')
    }

    return response.json() as Promise<SettlementDto>
  },

  async deleteSettlement(id: string): Promise<void> {
    const response = await fetchWithAuth(`${API_BASE_URL}/settlements/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Failed to delete settlement')
    }
  },

  // Import Histories API
  async getImportHistories(): Promise<ImportHistoryDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/import-histories`)

    if (!response.ok) {
      throw new Error('Failed to fetch import histories')
    }

    return response.json() as Promise<ImportHistoryDto[]>
  },

  async getLatestImportDate(): Promise<{ date: string | null }> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/import-histories/latest-date`
    )

    if (!response.ok) {
      throw new Error('Failed to fetch latest import date')
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
      throw new Error('Failed to create import history')
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
      throw new Error('Failed to start import')
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
      throw new Error('Failed to finalize import')
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
      throw new Error('Failed to delete import')
    }
  },

  // Category Associations API
  // AI Suggestions API
  // Budget plans API
  async getBudgetPlans(): Promise<BudgetPlanSummaryDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/budget-plans`)
    if (!response.ok) {
      throw new Error('Failed to fetch budget plans')
    }
    return response.json() as Promise<BudgetPlanSummaryDto[]>
  },

  async getCurrentBudgetPlan(): Promise<BudgetPlanDto | null> {
    const response = await fetchWithAuth(`${API_BASE_URL}/budget-plans/current`)
    if (!response.ok) {
      throw new Error('Failed to fetch current budget plan')
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
      throw new Error('Failed to fetch budget plan')
    }
    return response.json() as Promise<BudgetPlanDto>
  },

  async createBudgetPlan(dto: CreateBudgetPlanDto): Promise<BudgetPlanDto> {
    const response = await fetchWithAuth(`${API_BASE_URL}/budget-plans`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })
    if (!response.ok) {
      const message = await readErrorMessage(response, 'create budget plan')
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
      const message = await readErrorMessage(response, 'update budget plan')
      throw new Error(message)
    }
    return response.json() as Promise<BudgetPlanDto>
  },

  async deleteBudgetPlan(id: string): Promise<void> {
    const response = await fetchWithAuth(`${API_BASE_URL}/budget-plans/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error('Failed to delete budget plan')
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
      throw new Error('Failed to fetch budget statistics')
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
      throw new Error('Failed to generate category icons')
    }
    return response.json() as Promise<{ updated: number }>
  },
}
