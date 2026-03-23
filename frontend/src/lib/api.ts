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
  createdAt: string
}

export interface SubcategoryDto {
  id: string
  categoryId: string
  name: string
  createdAt: string
}

export interface TransactionDto {
  id: string
  date: string
  description: string
  amount: number
  type: 'EXPENSE' | 'INCOME'
  account: string
  subcategory?: string | null
  note?: string | null
  isPointed: boolean
  categoryId?: string | null
  categoryName?: string
  subcategoryId?: string | null
  subcategoryName?: string | null
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

export interface TransactionQueryParams {
  page?: number
  limit?: number
  type?: 'EXPENSE' | 'INCOME'
  startDate?: string
  endDate?: string
  categoryId?: string
  isPointed?: boolean
}

export interface FilterPreferencesDto {
  hiddenExpenseCategories: string[]
  hiddenIncomeCategories: string[]
  globalHiddenExpenseCategories: string[]
  globalHiddenIncomeCategories: string[]
  isPanelExpanded: boolean
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
  type?: AccountType
  divisor?: number
  isExcludedFromBudget?: boolean
  isExcludedFromStats?: boolean
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
  categoryId: string | null
  categoryName: string | null
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
  categoryId: string | null
  categoryName: string | null
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
  accounts: string[]
}

export interface CreateImportHistoryDto {
  transactionsImported: number
  categoriesCreated: number
  duplicatesSkipped: number
  totalInFile: number
  dateRangeStart: string
  dateRangeEnd: string
  accounts: string[]
  fileName?: string
}

// Category Associations DTOs (DB-based)
export interface DbCategoryAssociationDto {
  id: string
  expenseCategoryId: string
  expenseCategoryName: string
  incomeCategoryId: string
  incomeCategoryName: string
}

export interface CreateCategoryAssociationDto {
  expenseCategoryId: string
  incomeCategoryId: string
}

export interface CategorySuggestionDto {
  expenseCategoryId: string
  expenseCategoryName: string
  suggestedIncomeCategoryId: string
  suggestedIncomeCategoryName: string
  confidence: number
  reasoning: string
}

// Dashboard DTOs
export interface MonthlyDataDto {
  month: string
  label: string
  expenses: number
  netExpenses: number
  income: number
}

export interface CategoryDataDto {
  category: string
  amount: number
}

export interface DashboardFiltersDto {
  hiddenExpenseCategories?: string[]
  hiddenIncomeCategories?: string[]
  startDate?: string
  endDate?: string
}

export interface DashboardSummaryDto {
  monthlyData: MonthlyDataDto[]
  expensesByCategory: CategoryDataDto[]
  incomeByCategory: CategoryDataDto[]
  totalExpenses: number
  totalIncome: number
  allExpenseCategories: string[]
  allIncomeCategories: string[]
  availableAccounts: string[]
}

// Budget DTOs
export interface BudgetDto {
  id: string
  categoryId: string
  categoryName: string
  amount: number
}

export interface CreateBudgetDto {
  categoryId: string
  amount: number
}

export interface UpsertBudgetsDto {
  budgets: CreateBudgetDto[]
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
  totalAmount: number
  transactionCount: number
  averagePerMonth: number
  subcategories?: SubcategoryAverageDto[]
}

export interface BudgetStatisticsFiltersDto {
  startDate: string
  endDate: string
}

export interface BudgetStatisticsDto {
  periodMonths: number
  expensesByCategory: CategoryAverageDto[]
  incomeByCategory: CategoryAverageDto[]
  totalExpenses: number
  totalIncome: number
  averageMonthlyExpenses: number
  averageMonthlyIncome: number
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

  // Subcategories API
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
    if (params?.isPointed !== undefined)
      searchParams.set('isPointed', params.isPointed.toString())

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

  async bulkUpdateTransactions(
    ids: string[],
    data: { categoryId?: string; isPointed?: boolean }
  ): Promise<{ updated: number }> {
    const response = await fetchWithAuth(`${API_BASE_URL}/transactions/bulk`, {
      method: 'PATCH',
      body: JSON.stringify({ ids, ...data }),
    })

    if (!response.ok) {
      throw new Error('Failed to bulk update transactions')
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
      throw new Error('Failed to update account')
    }

    return response.json() as Promise<AccountDto>
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
  async getCategoryAssociations(): Promise<DbCategoryAssociationDto[]> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/category-associations`
    )

    if (!response.ok) {
      throw new Error('Failed to fetch category associations')
    }

    return response.json() as Promise<DbCategoryAssociationDto[]>
  },

  async createCategoryAssociation(
    dto: CreateCategoryAssociationDto
  ): Promise<DbCategoryAssociationDto> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/category-associations`,
      {
        method: 'POST',
        body: JSON.stringify(dto),
      }
    )

    if (!response.ok) {
      if (response.status === 409) {
        throw new Error('Cette association existe déjà')
      }
      throw new Error('Failed to create category association')
    }

    return response.json() as Promise<DbCategoryAssociationDto>
  },

  async deleteCategoryAssociation(id: string): Promise<void> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/category-associations/${id}`,
      {
        method: 'DELETE',
      }
    )

    if (!response.ok) {
      throw new Error('Failed to delete category association')
    }
  },

  // AI Suggestions API
  async getAiCategorySuggestions(
    expenseCategoryIds: string[]
  ): Promise<CategorySuggestionDto[]> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/ai-suggestions/category-associations`,
      {
        method: 'POST',
        body: JSON.stringify({ expenseCategoryIds }),
      }
    )

    if (!response.ok) {
      throw new Error('Failed to get AI category suggestions')
    }

    return response.json() as Promise<CategorySuggestionDto[]>
  },

  // Budgets API
  async getBudgets(): Promise<BudgetDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/budgets`)

    if (!response.ok) {
      throw new Error('Failed to fetch budgets')
    }

    return response.json() as Promise<BudgetDto[]>
  },

  async upsertBudgets(dto: UpsertBudgetsDto): Promise<BudgetDto[]> {
    const response = await fetchWithAuth(`${API_BASE_URL}/budgets`, {
      method: 'POST',
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error('Failed to save budgets')
    }

    return response.json() as Promise<BudgetDto[]>
  },

  async deleteBudget(categoryId: string): Promise<void> {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/budgets/${categoryId}`,
      {
        method: 'DELETE',
      }
    )

    if (!response.ok) {
      throw new Error('Failed to delete budget')
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
}
