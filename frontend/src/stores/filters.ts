import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'

// v2: hidden categories moved from names to Category ids. The old payload is
// dropped on read — resolving stale names would need the category list and
// would reintroduce the very matching this migration removes. Only the
// dashboard-only lists are lost (one click to redo); the global ones come back
// from the backend, which migrated them in SQL.
const STORAGE_KEY = 'bankin-analyzer-filters-v2'
const LEGACY_STORAGE_KEY = 'bankin-analyzer-filters'

export type TimePeriod = '3m' | '6m' | '1y' | 'all' | 'custom'

export const useFiltersStore = defineStore('filters', () => {
  // === DASHBOARD FILTERS (localStorage only, NOT synced to DB) ===
  const hiddenExpenseCategoryIds = ref<string[]>([])
  const hiddenIncomeCategoryIds = ref<string[]>([])
  const timePeriod = ref<TimePeriod>('all')
  // Custom range — only used when timePeriod === 'custom'
  const customStartDate = ref<string | null>(null)
  const customEndDate = ref<string | null>(null)

  // === GLOBAL SETTINGS (synced to DB) ===
  const globalHiddenExpenseCategoryIds = ref<string[]>([])
  const globalHiddenIncomeCategoryIds = ref<string[]>([])
  // Always start collapsed on page load — the user can expand it on demand.
  const isPanelExpanded = ref(false)

  // État de synchronisation (for global settings)
  const isSyncing = ref(false)
  const lastSyncError = ref<string | null>(null)
  const hasUnsavedChanges = ref(false)

  // Initialiser depuis localStorage (dashboard filters + cache of global)
  function initFromStorage() {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const data = JSON.parse(stored)
        // Dashboard filters (local only)
        hiddenExpenseCategoryIds.value = data.hiddenExpenseCategoryIds || []
        hiddenIncomeCategoryIds.value = data.hiddenIncomeCategoryIds || []
        if (data.timePeriod) {
          timePeriod.value = data.timePeriod as TimePeriod
        }
        customStartDate.value = data.customStartDate ?? null
        customEndDate.value = data.customEndDate ?? null
        // Global settings (cached)
        globalHiddenExpenseCategoryIds.value =
          data.globalHiddenExpenseCategoryIds || []
        globalHiddenIncomeCategoryIds.value =
          data.globalHiddenIncomeCategoryIds || []
        // isPanelExpanded is intentionally NOT restored — the panel always
        // starts collapsed on each page load.
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
        hiddenExpenseCategoryIds: hiddenExpenseCategoryIds.value,
        hiddenIncomeCategoryIds: hiddenIncomeCategoryIds.value,
        timePeriod: timePeriod.value,
        customStartDate: customStartDate.value,
        customEndDate: customEndDate.value,
        // Global settings (cached)
        globalHiddenExpenseCategoryIds: globalHiddenExpenseCategoryIds.value,
        globalHiddenIncomeCategoryIds: globalHiddenIncomeCategoryIds.value,
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
        globalHiddenExpenseCategoryIds: globalHiddenExpenseCategoryIds.value,
        globalHiddenIncomeCategoryIds: globalHiddenIncomeCategoryIds.value,
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
      globalHiddenExpenseCategoryIds.value =
        prefs.globalHiddenExpenseCategoryIds
      globalHiddenIncomeCategoryIds.value = prefs.globalHiddenIncomeCategoryIds
      // isPanelExpanded is intentionally NOT restored — the panel always
      // starts collapsed on each page load.

      // Dashboard filters stay local (from localStorage)
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          const data = JSON.parse(stored)
          hiddenExpenseCategoryIds.value = data.hiddenExpenseCategoryIds || []
          hiddenIncomeCategoryIds.value = data.hiddenIncomeCategoryIds || []
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

  // Toggle panel expansion (ephemeral — not persisted)
  function togglePanelExpanded() {
    isPanelExpanded.value = !isPanelExpanded.value
  }

  /** Add or remove an id from a list, in place. */
  function toggleId(list: string[], categoryId: string) {
    const index = list.indexOf(categoryId)
    if (index === -1) {
      list.push(categoryId)
    } else {
      list.splice(index, 1)
    }
  }

  // === DASHBOARD FILTERS (local only, NOT synced to DB) ===
  function toggleHiddenExpenseCategory(categoryId: string) {
    toggleId(hiddenExpenseCategoryIds.value, categoryId)
    // Only save to localStorage, NOT mark as changed for DB sync
    saveToStorage()
  }

  function toggleHiddenIncomeCategory(categoryId: string) {
    toggleId(hiddenIncomeCategoryIds.value, categoryId)
    // Only save to localStorage, NOT mark as changed for DB sync
    saveToStorage()
  }

  function isExpenseCategoryHidden(categoryId: string): boolean {
    return hiddenExpenseCategoryIds.value.includes(categoryId)
  }

  function isIncomeCategoryHidden(categoryId: string): boolean {
    return hiddenIncomeCategoryIds.value.includes(categoryId)
  }

  // === GLOBAL HIDDEN CATEGORIES (synced to DB) ===
  function toggleGlobalHiddenExpenseCategory(categoryId: string) {
    toggleId(globalHiddenExpenseCategoryIds.value, categoryId)
    markAsChanged()
  }

  function toggleGlobalHiddenIncomeCategory(categoryId: string) {
    toggleId(globalHiddenIncomeCategoryIds.value, categoryId)
    markAsChanged()
  }

  function isExpenseCategoryGloballyHidden(categoryId: string): boolean {
    return globalHiddenExpenseCategoryIds.value.includes(categoryId)
  }

  function isIncomeCategoryGloballyHidden(categoryId: string): boolean {
    return globalHiddenIncomeCategoryIds.value.includes(categoryId)
  }

  // Computed sets
  const hiddenExpenseCategoryIdsSet = computed(
    () => new Set(hiddenExpenseCategoryIds.value)
  )
  const hiddenIncomeCategoryIdsSet = computed(
    () => new Set(hiddenIncomeCategoryIds.value)
  )
  const globalHiddenExpenseCategoryIdsSet = computed(
    () => new Set(globalHiddenExpenseCategoryIds.value)
  )
  const globalHiddenIncomeCategoryIdsSet = computed(
    () => new Set(globalHiddenIncomeCategoryIds.value)
  )

  // Computed pour le nombre de filtres dashboard actifs (local filters only)
  const activeFiltersCount = computed(
    () =>
      hiddenExpenseCategoryIds.value.length +
      hiddenIncomeCategoryIds.value.length
  )

  // Time period functions
  function setTimePeriod(period: TimePeriod) {
    timePeriod.value = period
    // Initialize default custom dates the first time the user picks 'custom'
    if (
      period === 'custom' &&
      (!customStartDate.value || !customEndDate.value)
    ) {
      const end = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - 11)
      start.setDate(1)
      customStartDate.value = start.toISOString().split('T')[0] ?? null
      customEndDate.value = end.toISOString().split('T')[0] ?? null
    }
    saveToStorage()
  }

  function setCustomDateRange(start: string | null, end: string | null) {
    customStartDate.value = start
    customEndDate.value = end
    saveToStorage()
  }

  function getDateRangeFromPeriod(period: TimePeriod): {
    startDate: string | null
    endDate: string | null
  } {
    if (period === 'all') {
      return { startDate: null, endDate: null }
    }

    if (period === 'custom') {
      return {
        startDate: customStartDate.value,
        endDate: customEndDate.value,
      }
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
    // Dashboard filters (local only)
    hiddenExpenseCategoryIds,
    hiddenExpenseCategoryIdsSet,
    toggleHiddenExpenseCategory,
    isExpenseCategoryHidden,
    hiddenIncomeCategoryIds,
    hiddenIncomeCategoryIdsSet,
    toggleHiddenIncomeCategory,
    isIncomeCategoryHidden,
    // Global hidden categories (synced to DB)
    globalHiddenExpenseCategoryIds,
    globalHiddenExpenseCategoryIdsSet,
    toggleGlobalHiddenExpenseCategory,
    isExpenseCategoryGloballyHidden,
    globalHiddenIncomeCategoryIds,
    globalHiddenIncomeCategoryIdsSet,
    toggleGlobalHiddenIncomeCategory,
    isIncomeCategoryGloballyHidden,
    // Panel state
    isPanelExpanded,
    togglePanelExpanded,
    activeFiltersCount,
    // Time period
    timePeriod,
    customStartDate,
    customEndDate,
    setTimePeriod,
    setCustomDateRange,
    getDateRangeFromPeriod,
    // Sync functions
    isSyncing,
    lastSyncError,
    hasUnsavedChanges,
    loadFromBackend,
    saveToBackend,
  }
})
