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
}
