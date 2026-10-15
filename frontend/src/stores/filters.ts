import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'

// v3: hidden categories are gone. Older payloads are dropped on read rather
// than parsed: all they would still give is the period, one click to redo.
const STORAGE_KEY = 'bankin-analyzer-filters-v3'
const LEGACY_STORAGE_KEYS = [
  'bankin-analyzer-filters',
  'bankin-analyzer-filters-v2',
]

export type TimePeriod = '3m' | '6m' | '1y' | 'all' | 'custom'

export const useFiltersStore = defineStore('filters', () => {
  // === DASHBOARD FILTERS (localStorage only, NOT synced to DB) ===
  const timePeriod = ref<TimePeriod>('all')
  // Custom range — only used when timePeriod === 'custom'
  const customStartDate = ref<string | null>(null)
  const customEndDate = ref<string | null>(null)

  // === GLOBAL SETTINGS (synced to DB) ===
  // Whether a debt still owed is taken off the spending it hangs off, on the
  // dashboard and in the budget. One preference for both screens, kept by
  // the backend; on until the user says otherwise.
  const deductPendingReimbursements = ref(true)

  // État de synchronisation (for global settings)
  const isSyncing = ref(false)
  const lastSyncError = ref<string | null>(null)

  // Initialiser depuis localStorage (dashboard filters + cache of global)
  function initFromStorage() {
    for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key)
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const data = JSON.parse(stored)
        if (data.timePeriod) {
          timePeriod.value = data.timePeriod as TimePeriod
        }
        customStartDate.value = data.customStartDate ?? null
        customEndDate.value = data.customEndDate ?? null
        // Global settings (cached)
        if (typeof data.deductPendingReimbursements === 'boolean') {
          deductPendingReimbursements.value = data.deductPendingReimbursements
        }
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
        timePeriod: timePeriod.value,
        customStartDate: customStartDate.value,
        customEndDate: customEndDate.value,
        // Global settings (cached)
        deductPendingReimbursements: deductPendingReimbursements.value,
      })
    )
  }

  // Charger depuis le backend (global settings)
  async function loadFromBackend() {
    const { useAuthStore } = await import('./auth')
    const authStore = useAuthStore()
    if (!authStore.isAuthenticated) {
      initFromStorage()
      return
    }

    // The last known settings first, so that a screen rendered while the
    // backend answers filters with what this browser saw last time rather
    // than with nothing at all. The answer overwrites them below.
    initFromStorage()

    try {
      isSyncing.value = true
      lastSyncError.value = null
      const prefs = await api.getFilterPreferences()

      // Load global settings from backend
      deductPendingReimbursements.value =
        prefs.deductPendingReimbursements ?? true

      saveToStorage()
    } catch (error) {
      lastSyncError.value =
        error instanceof Error ? error.message : 'Load failed'
      initFromStorage()
    } finally {
      isSyncing.value = false
    }
  }

  /**
   * Choose whether a debt still owed is taken off the spending. Applied at
   * once, cached for the next load, and kept by the backend so the dashboard
   * and the budget read the same way on every device.
   */
  async function setDeductPendingReimbursements(value: boolean) {
    deductPendingReimbursements.value = value
    saveToStorage()
    try {
      const { useAuthStore } = await import('./auth')
      if (!useAuthStore().isAuthenticated) return
      await api.updateFilterPreferences({ deductPendingReimbursements: value })
      lastSyncError.value = null
    } catch (error) {
      lastSyncError.value =
        error instanceof Error ? error.message : 'Sync failed'
    }
  }

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
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
    }
  }

  // Init from localStorage at startup
  initFromStorage()

  return {
    // Debts still owed
    deductPendingReimbursements,
    setDeductPendingReimbursements,
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
    loadFromBackend,
  }
})
