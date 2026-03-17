import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'

const STORAGE_KEY = 'bankin-analyzer-filters'

export type TimePeriod = '3m' | '6m' | '1y' | 'all'

export const useFiltersStore = defineStore('filters', () => {
  // État
  const jointAccounts = ref<string[]>([])
  const hiddenExpenseCategories = ref<string[]>([])
  const hiddenIncomeCategories = ref<string[]>([])
  const isPanelExpanded = ref(true)
  const timePeriod = ref<TimePeriod>('all')

  // État de synchronisation
  const isSyncing = ref(false)
  const lastSyncError = ref<string | null>(null)
  const hasUnsavedChanges = ref(false)

  // Initialiser depuis localStorage
  function initFromStorage() {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const data = JSON.parse(stored)
        jointAccounts.value = data.jointAccounts || []
        hiddenExpenseCategories.value = data.hiddenExpenseCategories || []
        hiddenIncomeCategories.value = data.hiddenIncomeCategories || []
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
        jointAccounts: jointAccounts.value,
        hiddenExpenseCategories: hiddenExpenseCategories.value,
        hiddenIncomeCategories: hiddenIncomeCategories.value,
        isPanelExpanded: isPanelExpanded.value,
      })
    )
  }

  // Marquer comme modifié et sauvegarder en localStorage
  function markAsChanged() {
    hasUnsavedChanges.value = true
    saveToStorage()
  }

  // Sauvegarder vers le backend (appelé manuellement via bouton)
  async function saveToBackend(): Promise<boolean> {
    try {
      // Import dynamique pour éviter la dépendance circulaire
      const { useAuthStore } = await import('./auth')
      const authStore = useAuthStore()

      if (!authStore.isAuthenticated) {
        return false
      }

      isSyncing.value = true
      lastSyncError.value = null

      await api.updateFilterPreferences({
        jointAccounts: jointAccounts.value,
        hiddenExpenseCategories: hiddenExpenseCategories.value,
        hiddenIncomeCategories: hiddenIncomeCategories.value,
        isPanelExpanded: isPanelExpanded.value,
      })

      // Sync localStorage avec les données sauvegardées
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

  // Charger depuis le backend (priorité DB > localStorage)
  async function loadFromBackend() {
    // Import dynamique pour éviter la dépendance circulaire
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
      jointAccounts.value = prefs.jointAccounts
      hiddenExpenseCategories.value = prefs.hiddenExpenseCategories
      hiddenIncomeCategories.value = prefs.hiddenIncomeCategories
      isPanelExpanded.value = prefs.isPanelExpanded
      // Sync localStorage avec les données backend
      saveToStorage()
      hasUnsavedChanges.value = false
    } catch (error) {
      lastSyncError.value =
        error instanceof Error ? error.message : 'Load failed'
      // Fallback localStorage
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

  // Actions
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

  // Actions pour catégories masquées
  function toggleHiddenExpenseCategory(category: string) {
    const index = hiddenExpenseCategories.value.indexOf(category)
    if (index === -1) {
      hiddenExpenseCategories.value.push(category)
    } else {
      hiddenExpenseCategories.value.splice(index, 1)
    }
    markAsChanged()
  }

  function toggleHiddenIncomeCategory(category: string) {
    const index = hiddenIncomeCategories.value.indexOf(category)
    if (index === -1) {
      hiddenIncomeCategories.value.push(category)
    } else {
      hiddenIncomeCategories.value.splice(index, 1)
    }
    markAsChanged()
  }

  function isExpenseCategoryHidden(category: string): boolean {
    return hiddenExpenseCategories.value.includes(category)
  }

  function isIncomeCategoryHidden(category: string): boolean {
    return hiddenIncomeCategories.value.includes(category)
  }

  // Computed
  const jointAccountsSet = computed(() => new Set(jointAccounts.value))
  const hiddenExpenseCategoriesSet = computed(
    () => new Set(hiddenExpenseCategories.value)
  )
  const hiddenIncomeCategoriesSet = computed(
    () => new Set(hiddenIncomeCategories.value)
  )

  // Computed pour le nombre de filtres actifs
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

  // Init - charger depuis localStorage au démarrage
  // Le chargement depuis le backend sera fait après l'initialisation de l'auth
  initFromStorage()

  return {
    jointAccounts,
    jointAccountsSet,
    toggleJointAccount,
    isJointAccount,
    hiddenExpenseCategories,
    hiddenExpenseCategoriesSet,
    toggleHiddenExpenseCategory,
    isExpenseCategoryHidden,
    hiddenIncomeCategories,
    hiddenIncomeCategoriesSet,
    toggleHiddenIncomeCategory,
    isIncomeCategoryHidden,
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
