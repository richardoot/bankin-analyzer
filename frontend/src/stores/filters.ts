import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'

const STORAGE_KEY = 'bankin-analyzer-filters'

export type TimePeriod = '3m' | '6m' | '1y' | 'all'

export const useFiltersStore = defineStore('filters', () => {
  // === DASHBOARD FILTERS (localStorage only, NOT synced to DB) ===
  const hiddenExpenseCategories = ref<string[]>([])
  const hiddenIncomeCategories = ref<string[]>([])
  const timePeriod = ref<TimePeriod>('all')

  // === GLOBAL SETTINGS (synced to DB) ===
  const jointAccounts = ref<string[]>([])
  const globalHiddenExpenseCategories = ref<string[]>([])
  const globalHiddenIncomeCategories = ref<string[]>([])
  const isPanelExpanded = ref(true)

  // État de synchronisation (for global settings)
  const isSyncing = ref(false)
  const lastSyncError = ref<string | null>(null)
  const hasUnsavedChanges = ref(false)

  // Initialiser depuis localStorage (dashboard filters + cache of global)
  function initFromStorage() {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const data = JSON.parse(stored)
        // Dashboard filters (local only)
        hiddenExpenseCategories.value = data.hiddenExpenseCategories || []
        hiddenIncomeCategories.value = data.hiddenIncomeCategories || []
        // Global settings (cached)
        jointAccounts.value = data.jointAccounts || []
        globalHiddenExpenseCategories.value =
          data.globalHiddenExpenseCategories || []
        globalHiddenIncomeCategories.value =
          data.globalHiddenIncomeCategories || []
        isPanelExpanded.value = data.isPanelExpanded ?? true
      } catch {
        // Ignore parsing errors
      }
    }
  }

  // Sauvegarder dans localStorage
  function saveToStorage() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        // Dashboard filters (local only)
        hiddenExpenseCategories: hiddenExpenseCategories.value,
        hiddenIncomeCategories: hiddenIncomeCategories.value,
        // Global settings (cached)
        jointAccounts: jointAccounts.value,
        globalHiddenExpenseCategories: globalHiddenExpenseCategories.value,
        globalHiddenIncomeCategories: globalHiddenIncomeCategories.value,
        isPanelExpanded: isPanelExpanded.value,
      })
    )
  }

  // Marquer les settings globaux comme modifiés
  function markAsChanged() {
    hasUnsavedChanges.value = true
    saveToStorage()
  }

  // Sauvegarder vers le backend (global settings only)
  async function saveToBackend(): Promise<boolean> {
    try {
      const { useAuthStore } = await import('./auth')
      const authStore = useAuthStore()

      if (!authStore.isAuthenticated) {
        return false
      }

      isSyncing.value = true
      lastSyncError.value = null

      // Only sync global settings, NOT dashboard filters
      await api.updateFilterPreferences({
        jointAccounts: jointAccounts.value,
        globalHiddenExpenseCategories: globalHiddenExpenseCategories.value,
        globalHiddenIncomeCategories: globalHiddenIncomeCategories.value,
        isPanelExpanded: isPanelExpanded.value,
      })

      saveToStorage()
      hasUnsavedChanges.value = false
      return true
    } catch (error) {
      console.error('Failed to save filter preferences:', error)
      lastSyncError.value =
        error instanceof Error ? error.message : 'Sync failed'
      return false
    } finally {
      isSyncing.value = false
    }
  }

  // Charger depuis le backend (global settings)
  async function loadFromBackend() {
    const { useAuthStore } = await import('./auth')
    const authStore = useAuthStore()
    if (!authStore.isAuthenticated) {
      initFromStorage()
      return
    }

    try {
      isSyncing.value = true
      lastSyncError.value = null
      const prefs = await api.getFilterPreferences()

      // Load global settings from backend
      jointAccounts.value = prefs.jointAccounts
      globalHiddenExpenseCategories.value = prefs.globalHiddenExpenseCategories
      globalHiddenIncomeCategories.value = prefs.globalHiddenIncomeCategories
      isPanelExpanded.value = prefs.isPanelExpanded

      // Dashboard filters stay local (from localStorage)
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          const data = JSON.parse(stored)
          hiddenExpenseCategories.value = data.hiddenExpenseCategories || []
          hiddenIncomeCategories.value = data.hiddenIncomeCategories || []
        } catch {
          // Ignore
        }
      }

      saveToStorage()
      hasUnsavedChanges.value = false
    } catch (error) {
      lastSyncError.value =
        error instanceof Error ? error.message : 'Load failed'
      initFromStorage()
    } finally {
      isSyncing.value = false
    }
  }

  // Toggle panel expansion
  function togglePanelExpanded() {
    isPanelExpanded.value = !isPanelExpanded.value
    markAsChanged()
  }

  // === JOINT ACCOUNTS (synced to DB) ===
  function toggleJointAccount(account: string) {
    const index = jointAccounts.value.indexOf(account)
    if (index === -1) {
      jointAccounts.value.push(account)
    } else {
      jointAccounts.value.splice(index, 1)
    }
    markAsChanged()
  }

  function isJointAccount(account: string): boolean {
    return jointAccounts.value.includes(account)
  }

  // === DASHBOARD FILTERS (local only, NOT synced to DB) ===
  function toggleHiddenExpenseCategory(category: string) {
    const index = hiddenExpenseCategories.value.indexOf(category)
    if (index === -1) {
      hiddenExpenseCategories.value.push(category)
    } else {
      hiddenExpenseCategories.value.splice(index, 1)
    }
    // Only save to localStorage, NOT mark as changed for DB sync
    saveToStorage()
  }

  function toggleHiddenIncomeCategory(category: string) {
    const index = hiddenIncomeCategories.value.indexOf(category)
    if (index === -1) {
      hiddenIncomeCategories.value.push(category)
    } else {
      hiddenIncomeCategories.value.splice(index, 1)
    }
    // Only save to localStorage, NOT mark as changed for DB sync
    saveToStorage()
  }

  function isExpenseCategoryHidden(category: string): boolean {
    return hiddenExpenseCategories.value.includes(category)
  }

  function isIncomeCategoryHidden(category: string): boolean {
    return hiddenIncomeCategories.value.includes(category)
  }

  // === GLOBAL HIDDEN CATEGORIES (synced to DB) ===
  function toggleGlobalHiddenExpenseCategory(category: string) {
    const index = globalHiddenExpenseCategories.value.indexOf(category)
    if (index === -1) {
      globalHiddenExpenseCategories.value.push(category)
    } else {
      globalHiddenExpenseCategories.value.splice(index, 1)
    }
    markAsChanged()
  }

  function toggleGlobalHiddenIncomeCategory(category: string) {
    const index = globalHiddenIncomeCategories.value.indexOf(category)
    if (index === -1) {
      globalHiddenIncomeCategories.value.push(category)
    } else {
      globalHiddenIncomeCategories.value.splice(index, 1)
    }
    markAsChanged()
  }

  function isExpenseCategoryGloballyHidden(category: string): boolean {
    return globalHiddenExpenseCategories.value.includes(category)
  }

  function isIncomeCategoryGloballyHidden(category: string): boolean {
    return globalHiddenIncomeCategories.value.includes(category)
  }

  // Computed sets
  const jointAccountsSet = computed(() => new Set(jointAccounts.value))
  const hiddenExpenseCategoriesSet = computed(
    () => new Set(hiddenExpenseCategories.value)
  )
  const hiddenIncomeCategoriesSet = computed(
    () => new Set(hiddenIncomeCategories.value)
  )
  const globalHiddenExpenseCategoriesSet = computed(
    () => new Set(globalHiddenExpenseCategories.value)
  )
  const globalHiddenIncomeCategoriesSet = computed(
    () => new Set(globalHiddenIncomeCategories.value)
  )

  // Computed pour le nombre de filtres dashboard actifs
  const activeFiltersCount = computed(
    () =>
      jointAccounts.value.length +
      hiddenExpenseCategories.value.length +
      hiddenIncomeCategories.value.length
  )

  // Time period functions
  function setTimePeriod(period: TimePeriod) {
    timePeriod.value = period
  }

  function getDateRangeFromPeriod(period: TimePeriod): {
    startDate: string | null
    endDate: string | null
  } {
    if (period === 'all') {
      return { startDate: null, endDate: null }
    }

    const endDate = new Date()
    const startDate = new Date()

    switch (period) {
      case '3m':
        startDate.setMonth(startDate.getMonth() - 3)
        break
      case '6m':
        startDate.setMonth(startDate.getMonth() - 6)
        break
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1)
        break
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    }
  }

  // Init from localStorage at startup
  initFromStorage()

  return {
    // Joint accounts (synced to DB)
    jointAccounts,
    jointAccountsSet,
    toggleJointAccount,
    isJointAccount,
    // Dashboard filters (local only)
    hiddenExpenseCategories,
    hiddenExpenseCategoriesSet,
    toggleHiddenExpenseCategory,
    isExpenseCategoryHidden,
    hiddenIncomeCategories,
    hiddenIncomeCategoriesSet,
    toggleHiddenIncomeCategory,
    isIncomeCategoryHidden,
    // Global hidden categories (synced to DB)
    globalHiddenExpenseCategories,
    globalHiddenExpenseCategoriesSet,
    toggleGlobalHiddenExpenseCategory,
    isExpenseCategoryGloballyHidden,
    globalHiddenIncomeCategories,
    globalHiddenIncomeCategoriesSet,
    toggleGlobalHiddenIncomeCategory,
    isIncomeCategoryGloballyHidden,
    // Panel state
    isPanelExpanded,
    togglePanelExpanded,
    activeFiltersCount,
    // Time period
    timePeriod,
    setTimePeriod,
    getDateRangeFromPeriod,
    // Sync functions
    isSyncing,
    lastSyncError,
    hasUnsavedChanges,
    loadFromBackend,
    saveToBackend,
  }
})
