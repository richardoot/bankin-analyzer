import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAccountsStore } from './accounts'

vi.mock('@/lib/api', () => ({
  api: {
    getAccounts: vi.fn(),
    updateAccount: vi.fn(),
    getAccountDeletionSummary: vi.fn(),
    deleteBankAccount: vi.fn(),
  },
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    toasts: { value: [] },
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    remove: vi.fn(),
  }),
}))

import { api } from '@/lib/api'

const mockedApi = vi.mocked(api)

function makeAccount(
  overrides: Partial<{
    id: string
    name: string
    type: 'STANDARD' | 'JOINT' | 'INVESTMENT'
    divisor: number
    isExcludedFromBudget: boolean
    isExcludedFromStats: boolean
  }> = {}
) {
  return {
    id: overrides.id ?? '1',
    name: overrides.name ?? 'Account',
    type: overrides.type ?? 'STANDARD',
    divisor: overrides.divisor ?? 1,
    isExcludedFromBudget: overrides.isExcludedFromBudget ?? false,
    isExcludedFromStats: overrides.isExcludedFromStats ?? false,
    createdAt: '',
    updatedAt: '',
  }
}

describe('useAccountsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('load() loads accounts from API', async () => {
    const mockAccounts = [
      makeAccount({ id: '1', name: 'Checking' }),
      makeAccount({ id: '2', name: 'Savings' }),
    ]
    mockedApi.getAccounts.mockResolvedValue(mockAccounts)

    const store = useAccountsStore()
    await store.load()

    expect(store.accounts).toEqual(mockAccounts)
    expect(mockedApi.getAccounts).toHaveBeenCalledOnce()
  })

  it('load() sets error on failure', async () => {
    mockedApi.getAccounts.mockRejectedValue(new Error('API down'))

    const store = useAccountsStore()
    await store.load()

    expect(store.error).toBe('API down')
  })

  it('getDivisor() returns divisor for known account id', () => {
    const store = useAccountsStore()
    store.accounts = [makeAccount({ id: 'joint-id', divisor: 2 })]

    expect(store.getDivisor('joint-id')).toBe(2)
  })

  it('getDivisor() returns 1 for unknown account id', () => {
    const store = useAccountsStore()
    store.accounts = [makeAccount({ id: 'known-id' })]

    expect(store.getDivisor('unknown-id')).toBe(1)
  })

  it('updateType() updates account type in list', async () => {
    const store = useAccountsStore()
    store.accounts = [makeAccount({ id: '1', name: 'A', type: 'STANDARD' })]

    const updated = makeAccount({ id: '1', name: 'A', type: 'JOINT' })
    mockedApi.updateAccount.mockResolvedValue(updated)

    const result = await store.updateType('1', 'JOINT')

    expect(result).toBe(true)
    expect(store.accounts[0].type).toBe('JOINT')
  })

  it('updateSettings() updates account settings', async () => {
    const store = useAccountsStore()
    store.accounts = [makeAccount({ id: '1', isExcludedFromBudget: false })]

    const updated = makeAccount({ id: '1', isExcludedFromBudget: true })
    mockedApi.updateAccount.mockResolvedValue(updated)

    const result = await store.updateSettings('1', {
      isExcludedFromBudget: true,
    })

    expect(result).toBe(true)
    expect(store.accounts[0].isExcludedFromBudget).toBe(true)
  })

  it('computed sortedAccounts sorts by name', () => {
    const store = useAccountsStore()
    store.accounts = [
      makeAccount({ id: '1', name: 'Zeta' }),
      makeAccount({ id: '2', name: 'Alpha' }),
      makeAccount({ id: '3', name: 'Middle' }),
    ]

    expect(store.sortedAccounts.map(a => a.name)).toEqual([
      'Alpha',
      'Middle',
      'Zeta',
    ])
  })

  it('computed jointAccounts filters correctly', () => {
    const store = useAccountsStore()
    store.accounts = [
      makeAccount({ id: '1', name: 'Standard', type: 'STANDARD' }),
      makeAccount({ id: '2', name: 'Joint 1', type: 'JOINT' }),
      makeAccount({ id: '3', name: 'Investment', type: 'INVESTMENT' }),
      makeAccount({ id: '4', name: 'Joint 2', type: 'JOINT' }),
    ]

    expect(store.jointAccounts).toHaveLength(2)
    expect(store.jointAccounts.every(a => a.type === 'JOINT')).toBe(true)
  })

  describe('rename()', () => {
    it('updates the local cache with the renamed account', async () => {
      const store = useAccountsStore()
      store.accounts = [makeAccount({ id: '1', name: 'Old name' })]
      mockedApi.updateAccount.mockResolvedValue(
        makeAccount({ id: '1', name: 'New name' })
      )

      await store.rename('1', 'New name')

      expect(mockedApi.updateAccount).toHaveBeenCalledWith('1', {
        name: 'New name',
      })
      expect(store.accounts[0].name).toBe('New name')
    })

    it('does not toast or set shared error state; lets the caller catch', async () => {
      const store = useAccountsStore()
      store.accounts = [makeAccount({ id: '1', name: 'Old name' })]
      const apiError = new Error('An account named "Existing" already exists.')
      mockedApi.updateAccount.mockRejectedValue(apiError)

      await expect(store.rename('1', 'Existing')).rejects.toBe(apiError)

      // Shared store error state stays clean — UI handles inline.
      expect(store.error).toBeNull()
      // Local cache untouched on failure.
      expect(store.accounts[0].name).toBe('Old name')
    })

    it('leaves the local cache unchanged when the renamed id is unknown', async () => {
      const store = useAccountsStore()
      store.accounts = [makeAccount({ id: '1', name: 'A' })]
      mockedApi.updateAccount.mockResolvedValue(
        makeAccount({ id: 'unknown', name: 'B' })
      )

      await store.rename('unknown', 'B')

      expect(store.accounts).toHaveLength(1)
      expect(store.accounts[0].name).toBe('A')
    })
  })

  describe('remove', () => {
    it('drops the account from the cache and reports the transactions deleted', async () => {
      const store = useAccountsStore()
      store.accounts = [makeAccount({ id: '1' }), makeAccount({ id: '2' })]
      mockedApi.deleteBankAccount.mockResolvedValue({ deletedTransactions: 12 })

      const deleted = await store.remove('1')

      expect(deleted).toBe(12)
      expect(store.accounts.map(a => a.id)).toEqual(['2'])
    })

    it('keeps the account on failure and lets the caller catch', async () => {
      const store = useAccountsStore()
      store.accounts = [makeAccount({ id: '1' })]
      const apiError = new Error('Account 1 not found')
      mockedApi.deleteBankAccount.mockRejectedValue(apiError)

      await expect(store.remove('1')).rejects.toBe(apiError)

      expect(store.accounts).toHaveLength(1)
      expect(store.error).toBeNull()
    })
  })
})
