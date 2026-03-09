import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, AuthError } from './api'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Use vi.hoisted to define mocks that will be available in vi.mock
const { mockGetSession, mockRefreshSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRefreshSession: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      refreshSession: mockRefreshSession,
    },
  },
}))

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock for getSession - returns valid token
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token',
        },
      },
    })
  })

  describe('getMe', () => {
    it('should fetch current user with auth headers', async () => {
      const mockUser = {
        id: 'user-123',
        supabaseId: 'supabase-123',
        email: 'test@example.com',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser),
      })

      const result = await api.getMe()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/users/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        })
      )
      expect(result).toEqual(mockUser)
    })

    it('should throw error when request fails', async () => {
      // Use 500 status to test non-401 error handling
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      await expect(api.getMe()).rejects.toThrow('Failed to fetch user')
    })
  })

  describe('importTransactions', () => {
    it('should send transactions to import endpoint', async () => {
      const transactions = [
        {
          date: '2024-01-15T00:00:00.000Z',
          description: 'Test transaction',
          amount: -50.0,
          category: 'Alimentation',
          account: 'Compte Courant',
          type: 'EXPENSE' as const,
        },
      ]

      const mockResult = {
        imported: 1,
        duplicates: 0,
        total: 1,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      })

      const result = await api.importTransactions(transactions)

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/transactions/import',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ transactions }),
        })
      )
      expect(result).toEqual(mockResult)
    })

    it('should handle import with duplicates', async () => {
      const transactions = [
        {
          date: '2024-01-15T00:00:00.000Z',
          description: 'Test 1',
          amount: -50.0,
          category: 'Alimentation',
          account: 'Compte Courant',
          type: 'EXPENSE' as const,
        },
        {
          date: '2024-01-16T00:00:00.000Z',
          description: 'Test 2',
          amount: -30.0,
          category: 'Transport',
          account: 'Compte Courant',
          type: 'EXPENSE' as const,
        },
      ]

      const mockResult = {
        imported: 1,
        duplicates: 1,
        total: 2,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      })

      const result = await api.importTransactions(transactions)

      expect(result.imported).toBe(1)
      expect(result.duplicates).toBe(1)
      expect(result.total).toBe(2)
    })

    it('should throw error when import fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      await expect(api.importTransactions([])).rejects.toThrow(
        'Failed to import transactions'
      )
    })
  })

  describe('getCategories', () => {
    it('should fetch categories list', async () => {
      const mockCategories = [
        {
          id: 'cat-1',
          name: 'Alimentation',
          type: 'EXPENSE',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'cat-2',
          name: 'Salaires',
          type: 'INCOME',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCategories),
      })

      const result = await api.getCategories()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/categories',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      )
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Alimentation')
    })
  })

  describe('getTransactions', () => {
    it('should fetch transactions list', async () => {
      const mockTransactions = [
        {
          id: 'tx-1',
          date: '2024-01-15T00:00:00.000Z',
          description: 'Restaurant',
          amount: -45.5,
          type: 'EXPENSE',
          account: 'Compte Courant',
          isPointed: false,
          categoryName: 'Alimentation',
          createdAt: '2024-01-15T00:00:00.000Z',
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTransactions),
      })

      const result = await api.getTransactions()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/transactions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      )
      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('Restaurant')
    })
  })

  describe('deleteAccount', () => {
    it('should delete user account', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await api.deleteAccount()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/users/me',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      )
    })
  })

  describe('token refresh on 401', () => {
    it('should retry request after refreshing token on 401', async () => {
      const mockTransactions = [
        {
          id: 'tx-1',
          date: '2024-01-15T00:00:00.000Z',
          description: 'Restaurant',
          amount: -45.5,
          type: 'EXPENSE',
          account: 'Compte Courant',
          isPointed: false,
          categoryName: 'Alimentation',
          createdAt: '2024-01-15T00:00:00.000Z',
        },
      ]

      // First call returns 401, second call succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTransactions),
        })

      // Refresh succeeds and returns new token
      mockRefreshSession.mockResolvedValueOnce({ error: null })
      mockGetSession
        .mockResolvedValueOnce({
          data: { session: { access_token: 'test-token' } },
        })
        .mockResolvedValueOnce({
          data: { session: { access_token: 'new-token' } },
        })

      const result = await api.getTransactions()

      expect(mockRefreshSession).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result).toEqual(mockTransactions)
    })

    it('should throw AuthError when refresh fails', async () => {
      // First call returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      // Refresh fails
      mockRefreshSession.mockResolvedValueOnce({
        error: new Error('Refresh token expired'),
      })

      const error = await api.getTransactions().catch(e => e)
      expect(error).toBeInstanceOf(AuthError)
      expect(error.message).toBe('Session expiree, veuillez vous reconnecter')
    })

    it('should not retry on non-401 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      await expect(api.getTransactions()).rejects.toThrow(
        'Failed to fetch transactions'
      )
      expect(mockRefreshSession).not.toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should throw error if retry also fails with 401', async () => {
      // Both calls return 401
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        })

      // Refresh succeeds
      mockRefreshSession.mockResolvedValueOnce({ error: null })
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'new-token' } },
      })

      // Should throw generic error after retry fails
      await expect(api.getTransactions()).rejects.toThrow(
        'Failed to fetch transactions'
      )
      expect(mockRefreshSession).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
