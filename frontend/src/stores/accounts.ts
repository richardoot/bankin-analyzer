import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, type AccountDto, type AccountType } from '@/lib/api'
import { useAsyncAction } from '@/composables/useAsyncAction'

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref<AccountDto[]>([])
  const { isLoading, error, run } = useAsyncAction()

  // Computed: accounts sorted by name
  const sortedAccounts = computed(() =>
    [...accounts.value].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  )

  // Computed: joint accounts
  const jointAccounts = computed(() =>
    accounts.value.filter(a => a.type === 'JOINT')
  )

  // Computed: investment accounts
  const investmentAccounts = computed(() =>
    accounts.value.filter(a => a.type === 'INVESTMENT')
  )

  // Computed: map of account name -> divisor
  const divisorsByName = computed(
    () => new Map(accounts.value.map(a => [a.name, a.divisor]))
  )

  // Get divisor for an account name
  function getDivisor(accountName: string): number {
    return divisorsByName.value.get(accountName) ?? 1
  }

  // Check if account is joint
  function isJointAccount(accountName: string): boolean {
    const account = accounts.value.find(a => a.name === accountName)
    return account?.type === 'JOINT'
  }

  // Check if account is investment
  function isInvestmentAccount(accountName: string): boolean {
    const account = accounts.value.find(a => a.name === accountName)
    return account?.type === 'INVESTMENT'
  }

  // Check if account is excluded from budget
  function isExcludedFromBudget(accountName: string): boolean {
    const account = accounts.value.find(a => a.name === accountName)
    return account?.isExcludedFromBudget ?? false
  }

  // Check if account is excluded from stats
  function isExcludedFromStats(accountName: string): boolean {
    const account = accounts.value.find(a => a.name === accountName)
    return account?.isExcludedFromStats ?? false
  }

  // Load accounts from backend
  async function load(): Promise<void> {
    await run(async () => {
      accounts.value = await api.getAccounts()
    }, 'Failed to load accounts')
  }

  // Update account type
  async function updateType(
    accountId: string,
    type: AccountType
  ): Promise<boolean> {
    const result = await run(async () => {
      const updated = await api.updateAccount(accountId, { type })
      const index = accounts.value.findIndex(a => a.id === accountId)
      if (index !== -1) {
        accounts.value[index] = updated
      }
      return true
    }, 'Failed to update account')
    return result ?? false
  }

  // Update account settings
  async function updateSettings(
    accountId: string,
    settings: {
      isExcludedFromBudget?: boolean
      isExcludedFromStats?: boolean
      divisor?: number
    }
  ): Promise<boolean> {
    const result = await run(async () => {
      const updated = await api.updateAccount(accountId, settings)
      const index = accounts.value.findIndex(a => a.id === accountId)
      if (index !== -1) {
        accounts.value[index] = updated
      }
      return true
    }, 'Failed to update account')
    return result ?? false
  }

  return {
    accounts,
    sortedAccounts,
    jointAccounts,
    investmentAccounts,
    divisorsByName,
    isLoading,
    error,
    getDivisor,
    isJointAccount,
    isInvestmentAccount,
    isExcludedFromBudget,
    isExcludedFromStats,
    load,
    updateType,
    updateSettings,
  }
})
