import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  api,
  type AccountDeletionSummaryDto,
  type AccountDto,
  type AccountType,
} from '@/lib/api'
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

  // Computed: map of account id -> divisor
  const divisorsById = computed(
    () => new Map(accounts.value.map(a => [a.id, a.divisor]))
  )

  // Get divisor for an account id (defaults to 1 if unknown)
  function getDivisor(accountId: string): number {
    return divisorsById.value.get(accountId) ?? 1
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

  /**
   * Rename an account. Lets the caller handle errors inline (no toast, no
   * shared store error state) so that the UI can surface the conflict
   * message next to the input being edited.
   */
  async function rename(accountId: string, name: string): Promise<void> {
    const updated = await api.updateAccount(accountId, { name })
    const index = accounts.value.findIndex(a => a.id === accountId)
    if (index !== -1) {
      accounts.value[index] = updated
    }
  }

  /**
   * Deleting an account also deletes its transactions, so both the preview and
   * the deletion itself bubble their errors up to the caller: the confirmation
   * dialog shows them in place rather than as a toast that could be missed.
   */
  async function deletionSummary(
    accountId: string
  ): Promise<AccountDeletionSummaryDto> {
    return api.getAccountDeletionSummary(accountId)
  }

  async function remove(accountId: string): Promise<number> {
    const { deletedTransactions } = await api.deleteBankAccount(accountId)
    accounts.value = accounts.value.filter(a => a.id !== accountId)
    return deletedTransactions
  }

  return {
    accounts,
    sortedAccounts,
    jointAccounts,
    investmentAccounts,
    divisorsById,
    isLoading,
    error,
    getDivisor,
    load,
    updateType,
    updateSettings,
    rename,
    deletionSummary,
    remove,
  }
})
