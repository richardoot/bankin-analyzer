import { supabase } from './supabase'

const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000'

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
  createdAt: string
}

export interface CategoryAssociationDto {
  expenseCategory: string
  incomeCategory: string
}

export interface FilterPreferencesDto {
  jointAccounts: string[]
  hiddenExpenseCategories: string[]
  hiddenIncomeCategories: string[]
  categoryAssociations: CategoryAssociationDto[]
  isPanelExpanded: boolean
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

async function getAuthHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('No active session')
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  }
}

export const api = {
  async getMe(): Promise<DbUser> {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/users/me`, { headers })

    if (!response.ok) {
      throw new Error('Failed to fetch user')
    }

    return response.json() as Promise<DbUser>
  },

  async deleteAccount(): Promise<void> {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/users/me`, {
      method: 'DELETE',
      headers,
    })

    if (!response.ok) {
      throw new Error('Failed to delete account')
    }
  },

  async importTransactions(
    transactions: ImportTransactionDto[]
  ): Promise<ImportResultDto> {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/transactions/import`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ transactions }),
    })

    if (!response.ok) {
      throw new Error('Failed to import transactions')
    }

    return response.json() as Promise<ImportResultDto>
  },

  async getCategories(): Promise<CategoryDto[]> {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/categories`, { headers })

    if (!response.ok) {
      throw new Error('Failed to fetch categories')
    }

    return response.json() as Promise<CategoryDto[]>
  },

  async getTransactions(): Promise<TransactionDto[]> {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/transactions`, { headers })

    if (!response.ok) {
      throw new Error('Failed to fetch transactions')
    }

    return response.json() as Promise<TransactionDto[]>
  },

  async getFilterPreferences(): Promise<FilterPreferencesDto> {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/filter-preferences`, {
      headers,
    })

    if (!response.ok) {
      throw new Error('Failed to fetch filter preferences')
    }

    return response.json() as Promise<FilterPreferencesDto>
  },

  async updateFilterPreferences(
    preferences: Partial<FilterPreferencesDto>
  ): Promise<FilterPreferencesDto> {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/filter-preferences`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(preferences),
    })

    if (!response.ok) {
      throw new Error('Failed to update filter preferences')
    }

    return response.json() as Promise<FilterPreferencesDto>
  },

  // Persons API
  async getPersons(): Promise<PersonDto[]> {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/persons`, { headers })

    if (!response.ok) {
      throw new Error('Failed to fetch persons')
    }

    return response.json() as Promise<PersonDto[]>
  },

  async createPerson(dto: CreatePersonDto): Promise<PersonDto> {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/persons`, {
      method: 'POST',
      headers,
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error('Failed to create person')
    }

    return response.json() as Promise<PersonDto>
  },

  async updatePerson(id: string, dto: UpdatePersonDto): Promise<PersonDto> {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/persons/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      throw new Error('Failed to update person')
    }

    return response.json() as Promise<PersonDto>
  },

  async deletePerson(id: string): Promise<void> {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/persons/${id}`, {
      method: 'DELETE',
      headers,
    })

    if (!response.ok) {
      throw new Error('Failed to delete person')
    }
  },
}
