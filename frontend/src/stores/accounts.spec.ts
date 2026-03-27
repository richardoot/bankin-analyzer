import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAccountsStore } from './accounts'

vi.mock('@/lib/api', () => ({
  api: {
    getAccounts: vi.fn(),
    updateAccount: vi.fn(),
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

  it('getDivisor() returns divisor for known account', () => {
    const store = useAccountsStore()
    store.accounts = [makeAccount({ name: 'Joint', divisor: 2 })]

    expect(store.getDivisor('Joint')).toBe(2)
  })

  it('getDivisor() returns 1 for unknown account', () => {
    const store = useAccountsStore()
    store.accounts = [makeAccount({ name: 'Known' })]

    expect(store.getDivisor('Unknown')).toBe(1)
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
})
