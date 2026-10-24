import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, type TrendWindow } from '@/lib/api'
import { DEFAULT_TREND_WINDOW, isTrendWindow } from '@/lib/trends'
import type { BreakdownMode } from '@/composables/useBudgetComparison'

// v3: hidden categories are gone. Older payloads are dropped on read rather
// than parsed: all they would still give is the period, one click to redo.
const STORAGE_KEY = 'bankin-analyzer-filters-v3'
const LEGACY_STORAGE_KEYS = [
  'bankin-analyzer-filters',
  'bankin-analyzer-filters-v2',
]

/**
 * The reading of the figures, one for the dashboard, the trends and the
 * budget: Vie courante or Tout, and whether received reimbursements are
 * taken off the spending. Kept in this browser under its own key, apart
 * from the period: a way of looking, not a window.
 */
const READING_STORAGE_KEY = 'reading'
/** Where the dashboard kept its reading before it was shared: migrated once. */
const LEGACY_DASHBOARD_READING_KEY = 'dashboard-breakdown-mode'
/** Where the budget kept its own: dropped, the dashboard's wins. */
const LEGACY_BUDGET_READING_KEY = 'budget-breakdown-mode'

/** What the `reading` key holds. */
export interface StoredReading {
  breakdownMode: BreakdownMode
  deductReimbursements: boolean
}

/** Vie courante, reimbursements received taken off: the reading by default. */
export const DEFAULT_READING: StoredReading = {
  breakdownMode: 'everyday',
  deductReimbursements: true,
}

function isBreakdownMode(value: unknown): value is BreakdownMode {
  return value === 'everyday' || value === 'real'
}

function writeStoredReading(reading: StoredReading): void {
  try {
    localStorage.setItem(READING_STORAGE_KEY, JSON.stringify(reading))
  } catch {
    // Private browsing: the choice simply does not persist.
  }
}

/**
 * The stored reading, or what the dashboard left before the key existed
 * (migrated, then erased), or the default. The budget's old key is erased
 * either way. Never throws: private browsing only loses the memory.
 */
function readStoredReading(): StoredReading {
  try {
    const stored = localStorage.getItem(READING_STORAGE_KEY)
    if (stored) {
      localStorage.removeItem(LEGACY_DASHBOARD_READING_KEY)
      localStorage.removeItem(LEGACY_BUDGET_READING_KEY)
      const data: unknown = JSON.parse(stored)
      const record =
        data && typeof data === 'object'
          ? (data as Record<string, unknown>)
          : {}
      return {
        breakdownMode: isBreakdownMode(record.breakdownMode)
          ? record.breakdownMode
          : DEFAULT_READING.breakdownMode,
        deductReimbursements:
          typeof record.deductReimbursements === 'boolean'
            ? record.deductReimbursements
            : DEFAULT_READING.deductReimbursements,
      }
    }
    const legacy = localStorage.getItem(LEGACY_DASHBOARD_READING_KEY)
    localStorage.removeItem(LEGACY_DASHBOARD_READING_KEY)
    localStorage.removeItem(LEGACY_BUDGET_READING_KEY)
    if (isBreakdownMode(legacy)) {
      const migrated = { ...DEFAULT_READING, breakdownMode: legacy }
      writeStoredReading(migrated)
      return migrated
    }
  } catch {
    // Unreadable or unavailable storage: the default reading.
  }
  return { ...DEFAULT_READING }
}

export type TimePeriod = '3m' | '6m' | '1y' | 'all' | 'custom'

/** « 12 mois »: the period a dashboard opens on until one is picked. */
export const DEFAULT_TIME_PERIOD: TimePeriod = '1y'

/** How many calendar months each rolling period spans, the current one included. */
const ROLLING_MONTHS: Record<'3m' | '6m' | '1y', number> = {
  '3m': 3,
  '6m': 6,
  '1y': 12,
}

/** A date as the user's calendar reads it, `YYYY-MM-DD`. */
function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const useFiltersStore = defineStore('filters', () => {
  // === DASHBOARD FILTERS (localStorage only, NOT synced to DB) ===
  // Twelve months by default, not the whole history: the averages read a
  // year of the user's life as it is now. A period the user picked before
  // (kept in this browser) still wins.
  const timePeriod = ref<TimePeriod>(DEFAULT_TIME_PERIOD)
  // Custom range — only used when timePeriod === 'custom'
  const customStartDate = ref<string | null>(null)
  const customEndDate = ref<string | null>(null)
  // The reference of « Ce qui change »: the habit of the 3, 6 or 12 months
  // before the month read. A way of looking, kept with the period.
  const trendsWindow = ref<TrendWindow>(DEFAULT_TREND_WINDOW)

  // === READING (localStorage only, its own key) ===
  // One reading for the dashboard, the trends and the budget: what is read
  // in Vie courante on one is followed in Vie courante on the other.
  const initialReading = readStoredReading()
  const breakdownMode = ref<BreakdownMode>(initialReading.breakdownMode)
  const deductReimbursements = ref(initialReading.deductReimbursements)

  function saveReading(): void {
    writeStoredReading({
      breakdownMode: breakdownMode.value,
      deductReimbursements: deductReimbursements.value,
    })
  }

  /** Vie courante or Tout, on every page that reads the figures. */
  function setBreakdownMode(mode: BreakdownMode): void {
    if (!isBreakdownMode(mode)) return
    breakdownMode.value = mode
    saveReading()
  }

  /** Whether a reimbursement received is taken off the spending it hangs off. */
  function setDeductReimbursements(value: boolean): void {
    deductReimbursements.value = value
    saveReading()
  }

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
        if (isTrendWindow(data.trendsWindow)) {
          trendsWindow.value = data.trendsWindow
        }
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
        trendsWindow: trendsWindow.value,
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

  function setTrendsWindow(window: TrendWindow) {
    if (!isTrendWindow(window)) return
    trendsWindow.value = window
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

    // Whole calendar months, the current one included: « 12 mois » on the
    // 24th of October 2026 runs from the 1st of November 2025 to today —
    // eleven closed months and this one, which the averages leave out.
    // Starting on the 24th of the year before, as it used to, opened the
    // period on a partial month that read as a light one.
    const endDate = new Date()
    const startDate = new Date(
      endDate.getFullYear(),
      endDate.getMonth() - (ROLLING_MONTHS[period] - 1),
      1
    )

    return {
      startDate: localDay(startDate),
      endDate: localDay(endDate),
    }
  }

  // Init from localStorage at startup
  initFromStorage()

  return {
    // The reading
    breakdownMode,
    setBreakdownMode,
    deductReimbursements,
    setDeductReimbursements,
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
    // « Ce qui change »
    trendsWindow,
    setTrendsWindow,
    // Sync functions
    isSyncing,
    lastSyncError,
    loadFromBackend,
  }
})
