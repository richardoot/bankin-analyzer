import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFiltersStore } from './filters'

const { authState, getFilterPreferences, updateFilterPreferences } = vi.hoisted(
  () => ({
    authState: { isAuthenticated: false },
    getFilterPreferences: vi.fn(),
    updateFilterPreferences: vi.fn(),
  })
)
vi.mock('./auth', () => ({
  useAuthStore: () => authState,
}))
vi.mock('@/lib/api', () => ({
  api: { getFilterPreferences, updateFilterPreferences },
}))

describe('useFiltersStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.mocked(localStorage.setItem).mockClear()
    authState.isAuthenticated = false
    getFilterPreferences.mockReset()
    updateFilterPreferences.mockReset()
  })

  describe('the window of « Ce qui change »', () => {
    it('reads six months by default', () => {
      expect(useFiltersStore().trendsWindow).toBe(6)
    })

    it('is kept with the period, in this browser only', () => {
      const store = useFiltersStore()

      store.setTrendsWindow(12)

      expect(store.trendsWindow).toBe(12)
      const saved = JSON.parse(
        vi.mocked(localStorage.setItem).mock.calls.at(-1)?.[1] ?? '{}'
      )
      expect(saved.trendsWindow).toBe(12)
      expect(updateFilterPreferences).not.toHaveBeenCalled()
    })

    it('comes back from storage, and ignores a window it does not offer', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(
        JSON.stringify({ timePeriod: 'all', trendsWindow: 3 })
      )
      expect(useFiltersStore().trendsWindow).toBe(3)

      setActivePinia(createPinia())
      vi.mocked(localStorage.getItem).mockReturnValue(
        JSON.stringify({ timePeriod: 'all', trendsWindow: 5 })
      )
      expect(useFiltersStore().trendsWindow).toBe(6)
    })
  })

  describe('the reading', () => {
    /** Storage as a key → value map, for the tests that read several keys. */
    function storageOf(entries: Record<string, string>) {
      vi.mocked(localStorage.getItem).mockImplementation(
        key => entries[key] ?? null
      )
    }

    function lastReadingSaved(): unknown {
      const call = vi
        .mocked(localStorage.setItem)
        .mock.calls.filter(([key]) => key === 'reading')
        .at(-1)
      return call ? JSON.parse(call[1]) : undefined
    }

    beforeEach(() => {
      vi.mocked(localStorage.removeItem).mockClear()
    })

    it('reads Vie courante, received reimbursements taken off, by default', () => {
      const store = useFiltersStore()

      expect(store.breakdownMode).toBe('everyday')
      expect(store.deductReimbursements).toBe(true)
      // Nothing to migrate: nothing written.
      expect(lastReadingSaved()).toBeUndefined()
    })

    it('keeps both choices under the one « reading » key, in this browser only', () => {
      const store = useFiltersStore()

      store.setBreakdownMode('real')
      expect(lastReadingSaved()).toEqual({
        breakdownMode: 'real',
        deductReimbursements: true,
      })

      store.setDeductReimbursements(false)
      expect(store.deductReimbursements).toBe(false)
      expect(lastReadingSaved()).toEqual({
        breakdownMode: 'real',
        deductReimbursements: false,
      })
      expect(updateFilterPreferences).not.toHaveBeenCalled()
    })

    it('comes back from the « reading » key, and ignores what it does not know', () => {
      storageOf({
        reading: JSON.stringify({
          breakdownMode: 'real',
          deductReimbursements: false,
        }),
      })
      const store = useFiltersStore()
      expect(store.breakdownMode).toBe('real')
      expect(store.deductReimbursements).toBe(false)

      setActivePinia(createPinia())
      storageOf({
        reading: JSON.stringify({
          breakdownMode: 'tout',
          deductReimbursements: 'non',
        }),
      })
      const fallback = useFiltersStore()
      expect(fallback.breakdownMode).toBe('everyday')
      expect(fallback.deductReimbursements).toBe(true)

      setActivePinia(createPinia())
      storageOf({ reading: '{not json' })
      expect(useFiltersStore().breakdownMode).toBe('everyday')
    })

    it('migrates the dashboard’s old key once, then erases it', () => {
      storageOf({ 'dashboard-breakdown-mode': 'real' })

      const store = useFiltersStore()

      expect(store.breakdownMode).toBe('real')
      expect(store.deductReimbursements).toBe(true)
      expect(lastReadingSaved()).toEqual({
        breakdownMode: 'real',
        deductReimbursements: true,
      })
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'dashboard-breakdown-mode'
      )
    })

    it('prefers the « reading » key to the old one, and erases the old one too', () => {
      storageOf({
        reading: JSON.stringify({
          breakdownMode: 'everyday',
          deductReimbursements: true,
        }),
        'dashboard-breakdown-mode': 'real',
      })

      expect(useFiltersStore().breakdownMode).toBe('everyday')
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'dashboard-breakdown-mode'
      )
    })

    it('ignores and erases the budget’s old key', () => {
      storageOf({ 'budget-breakdown-mode': 'real' })

      const store = useFiltersStore()

      expect(store.breakdownMode).toBe('everyday')
      expect(lastReadingSaved()).toBeUndefined()
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'budget-breakdown-mode'
      )
    })

    it('still reads, by default, when the storage refuses the key', () => {
      vi.mocked(localStorage.getItem).mockImplementation(key => {
        if (key === 'reading') throw new Error('SecurityError')
        return null
      })

      expect(useFiltersStore().breakdownMode).toBe('everyday')
    })
  })

  describe('a debt still owed', () => {
    it('is taken off the spending until the user says otherwise', () => {
      const store = useFiltersStore()
      expect(store.deductPendingReimbursements).toBe(true)
    })

    it('keeps the choice, locally and on the backend', async () => {
      authState.isAuthenticated = true
      updateFilterPreferences.mockResolvedValue({})
      const store = useFiltersStore()

      await store.setDeductPendingReimbursements(false)

      expect(store.deductPendingReimbursements).toBe(false)
      expect(updateFilterPreferences).toHaveBeenCalledWith({
        deductPendingReimbursements: false,
      })
      const saved = JSON.parse(
        vi.mocked(localStorage.setItem).mock.calls.at(-1)?.[1] ?? '{}'
      )
      expect(saved.deductPendingReimbursements).toBe(false)
    })

    it('does not reach the backend when signed out', async () => {
      const store = useFiltersStore()

      await store.setDeductPendingReimbursements(false)

      expect(store.deductPendingReimbursements).toBe(false)
      expect(updateFilterPreferences).not.toHaveBeenCalled()
    })

    it('comes back from the backend with the other settings', async () => {
      authState.isAuthenticated = true
      getFilterPreferences.mockResolvedValue({
        isPanelExpanded: false,
        importCategoriesFromFile: true,
        deductPendingReimbursements: false,
      })
      const store = useFiltersStore()

      await store.loadFromBackend()

      expect(store.deductPendingReimbursements).toBe(false)
    })
  })

  it('should persist the period to localStorage', () => {
    const store = useFiltersStore()

    store.setTimePeriod('1y')

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'bankin-analyzer-filters-v3',
      JSON.stringify({
        timePeriod: '1y',
        customStartDate: null,
        customEndDate: null,
        trendsWindow: 6,
        deductPendingReimbursements: true,
      })
    )
  })

  it('drops the payloads of older versions', () => {
    vi.mocked(localStorage.removeItem).mockClear()

    useFiltersStore()

    expect(localStorage.removeItem).toHaveBeenCalledWith(
      'bankin-analyzer-filters'
    )
    expect(localStorage.removeItem).toHaveBeenCalledWith(
      'bankin-analyzer-filters-v2'
    )
    expect(localStorage.getItem).toHaveBeenCalledWith(
      'bankin-analyzer-filters-v3'
    )
  })

  it('should handle invalid localStorage data gracefully', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('invalid json')

    setActivePinia(createPinia())
    const store = useFiltersStore()

    expect(store.timePeriod).toBe('1y')
    expect(store.deductPendingReimbursements).toBe(true)
  })

  describe('the period', () => {
    it('opens on twelve months when none was picked', () => {
      expect(useFiltersStore().timePeriod).toBe('1y')
    })

    it('keeps the period the user picked before, backend or not', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(
        JSON.stringify({ timePeriod: 'all' })
      )
      authState.isAuthenticated = true
      getFilterPreferences.mockResolvedValue({
        isPanelExpanded: false,
        importCategoriesFromFile: true,
        deductPendingReimbursements: true,
      })
      const store = useFiltersStore()
      expect(store.timePeriod).toBe('all')

      await store.loadFromBackend()

      expect(store.timePeriod).toBe('all')
    })

    it('spans whole calendar months, the current one included', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 24, 12))
      try {
        const store = useFiltersStore()
        expect(store.getDateRangeFromPeriod('1y')).toEqual({
          startDate: '2025-11-01',
          endDate: '2026-10-24',
        })
        expect(store.getDateRangeFromPeriod('6m').startDate).toBe('2026-05-01')
        expect(store.getDateRangeFromPeriod('3m').startDate).toBe('2026-08-01')
        expect(store.getDateRangeFromPeriod('all')).toEqual({
          startDate: null,
          endDate: null,
        })
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('loadFromBackend', () => {
    it('shows the cached global settings until the backend answers', async () => {
      authState.isAuthenticated = true
      vi.mocked(localStorage.getItem).mockReturnValue(
        JSON.stringify({ deductPendingReimbursements: false })
      )
      let answer!: (prefs: unknown) => void
      getFilterPreferences.mockReturnValue(
        new Promise(resolve => {
          answer = resolve
        })
      )
      const store = useFiltersStore()

      const loading = store.loadFromBackend()

      expect(store.deductPendingReimbursements).toBe(false)

      answer({
        isPanelExpanded: false,
        importCategoriesFromFile: true,
        deductPendingReimbursements: true,
      })
      await loading

      expect(store.deductPendingReimbursements).toBe(true)
    })
  })

  describe('time period — custom range', () => {
    it('should default to a 12-month range when switching to custom for the first time', () => {
      const store = useFiltersStore()
      expect(store.customStartDate).toBeNull()
      expect(store.customEndDate).toBeNull()

      store.setTimePeriod('custom')

      expect(store.timePeriod).toBe('custom')
      expect(store.customStartDate).toBeTruthy()
      expect(store.customEndDate).toBeTruthy()
    })

    it('should return the custom range from getDateRangeFromPeriod', () => {
      const store = useFiltersStore()
      store.setTimePeriod('custom')
      store.setCustomDateRange('2024-01-01', '2024-06-30')

      const range = store.getDateRangeFromPeriod('custom')
      expect(range.startDate).toBe('2024-01-01')
      expect(range.endDate).toBe('2024-06-30')
    })

    it('should restore timePeriod and custom dates from localStorage', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(
        JSON.stringify({
          timePeriod: 'custom',
          customStartDate: '2025-01-01',
          customEndDate: '2025-03-31',
        })
      )
      setActivePinia(createPinia())
      const store = useFiltersStore()

      expect(store.timePeriod).toBe('custom')
      expect(store.customStartDate).toBe('2025-01-01')
      expect(store.customEndDate).toBe('2025-03-31')
    })
  })
})
