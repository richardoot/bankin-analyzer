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

    expect(store.timePeriod).toBe('all')
    expect(store.deductPendingReimbursements).toBe(true)
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
