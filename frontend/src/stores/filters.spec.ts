import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFiltersStore } from './filters'

// Mock auth store to return not authenticated
vi.mock('./auth', () => ({
  useAuthStore: () => ({
    isAuthenticated: false,
  }),
}))

describe('useFiltersStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.mocked(localStorage.setItem).mockClear()
  })

  it('should start with panel collapsed on load', () => {
    const store = useFiltersStore()
    expect(store.isPanelExpanded).toBe(false)
  })

  it('should toggle panel expansion', () => {
    const store = useFiltersStore()

    store.togglePanelExpanded()
    expect(store.isPanelExpanded).toBe(true)

    store.togglePanelExpanded()
    expect(store.isPanelExpanded).toBe(false)
  })

  it('should always start collapsed even when localStorage stored expanded=true', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ isPanelExpanded: true })
    )

    setActivePinia(createPinia())
    const store = useFiltersStore()

    // The persisted panel state is intentionally ignored on load.
    expect(store.isPanelExpanded).toBe(false)
  })

  it('should provide activeFiltersCount computed (dashboard filters only)', () => {
    const store = useFiltersStore()

    expect(store.activeFiltersCount).toBe(0)

    store.toggleHiddenExpenseCategory('cat-restaurant')
    expect(store.activeFiltersCount).toBe(1)

    store.toggleHiddenIncomeCategory('cat-salaire')
    expect(store.activeFiltersCount).toBe(2)

    store.toggleHiddenExpenseCategory('cat-restaurant')
    expect(store.activeFiltersCount).toBe(1)
  })

  it('should start with empty hidden categories', () => {
    const store = useFiltersStore()
    expect(store.hiddenExpenseCategoryIds).toEqual([])
    expect(store.hiddenIncomeCategoryIds).toEqual([])
  })

  it('should toggle hidden expense category', () => {
    const store = useFiltersStore()

    store.toggleHiddenExpenseCategory('cat-restaurant')
    expect(store.isExpenseCategoryHidden('cat-restaurant')).toBe(true)

    store.toggleHiddenExpenseCategory('cat-restaurant')
    expect(store.isExpenseCategoryHidden('cat-restaurant')).toBe(false)
  })

  it('should toggle hidden income category', () => {
    const store = useFiltersStore()

    store.toggleHiddenIncomeCategory('cat-salaire')
    expect(store.isIncomeCategoryHidden('cat-salaire')).toBe(true)

    store.toggleHiddenIncomeCategory('cat-salaire')
    expect(store.isIncomeCategoryHidden('cat-salaire')).toBe(false)
  })

  it('should persist hidden categories to localStorage', () => {
    const store = useFiltersStore()

    store.toggleHiddenExpenseCategory('cat-restaurant')

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'bankin-analyzer-filters-v2',
      JSON.stringify({
        hiddenExpenseCategoryIds: ['cat-restaurant'],
        hiddenIncomeCategoryIds: [],
        timePeriod: 'all',
        customStartDate: null,
        customEndDate: null,
        globalHiddenExpenseCategoryIds: [],
        globalHiddenIncomeCategoryIds: [],
        isPanelExpanded: false,
      })
    )
  })

  it('should restore hidden categories from localStorage', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({
        hiddenExpenseCategoryIds: ['cat-restaurant'],
        hiddenIncomeCategoryIds: ['cat-salaire'],
        isPanelExpanded: true,
      })
    )

    setActivePinia(createPinia())
    const store = useFiltersStore()

    expect(store.isExpenseCategoryHidden('cat-restaurant')).toBe(true)
    expect(store.isIncomeCategoryHidden('cat-salaire')).toBe(true)
  })

  it('should handle invalid localStorage data gracefully', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('invalid json')

    setActivePinia(createPinia())
    const store = useFiltersStore()

    expect(store.hiddenExpenseCategoryIds).toEqual([])
    expect(store.hiddenIncomeCategoryIds).toEqual([])
  })

  describe('global hidden categories', () => {
    it('should start with empty global hidden categories', () => {
      const store = useFiltersStore()
      expect(store.globalHiddenExpenseCategoryIds).toEqual([])
      expect(store.globalHiddenIncomeCategoryIds).toEqual([])
    })

    it('should toggle global hidden expense category', () => {
      const store = useFiltersStore()

      store.toggleGlobalHiddenExpenseCategory('cat-restaurant')
      expect(store.isExpenseCategoryGloballyHidden('cat-restaurant')).toBe(true)

      store.toggleGlobalHiddenExpenseCategory('cat-restaurant')
      expect(store.isExpenseCategoryGloballyHidden('cat-restaurant')).toBe(
        false
      )
    })

    it('should toggle global hidden income category', () => {
      const store = useFiltersStore()

      store.toggleGlobalHiddenIncomeCategory('cat-salaire')
      expect(store.isIncomeCategoryGloballyHidden('cat-salaire')).toBe(true)

      store.toggleGlobalHiddenIncomeCategory('cat-salaire')
      expect(store.isIncomeCategoryGloballyHidden('cat-salaire')).toBe(false)
    })

    it('should mark as having unsaved changes when toggling global categories', () => {
      const store = useFiltersStore()

      expect(store.hasUnsavedChanges).toBe(false)
      store.toggleGlobalHiddenExpenseCategory('cat-restaurant')
      expect(store.hasUnsavedChanges).toBe(true)
    })

    it('should restore global hidden categories from localStorage', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(
        JSON.stringify({
          globalHiddenExpenseCategoryIds: ['cat-restaurant'],
          globalHiddenIncomeCategoryIds: ['cat-salaire'],
        })
      )

      setActivePinia(createPinia())
      const store = useFiltersStore()

      expect(store.isExpenseCategoryGloballyHidden('cat-restaurant')).toBe(true)
      expect(store.isIncomeCategoryGloballyHidden('cat-salaire')).toBe(true)
    })
  })

  describe('computed sets', () => {
    it('should provide hiddenExpenseCategoryIdsSet', () => {
      const store = useFiltersStore()

      store.toggleHiddenExpenseCategory('cat-restaurant')
      store.toggleHiddenExpenseCategory('cat-transport')

      expect(store.hiddenExpenseCategoryIdsSet.has('cat-restaurant')).toBe(true)
      expect(store.hiddenExpenseCategoryIdsSet.has('cat-transport')).toBe(true)
      expect(store.hiddenExpenseCategoryIdsSet.has('cat-loisirs')).toBe(false)
    })

    it('should provide hiddenIncomeCategoryIdsSet', () => {
      const store = useFiltersStore()

      store.toggleHiddenIncomeCategory('cat-salaire')

      expect(store.hiddenIncomeCategoryIdsSet.has('cat-salaire')).toBe(true)
      expect(store.hiddenIncomeCategoryIdsSet.has('cat-prime')).toBe(false)
    })

    it('should provide globalHiddenExpenseCategoryIdsSet', () => {
      const store = useFiltersStore()

      store.toggleGlobalHiddenExpenseCategory('cat-restaurant')

      expect(
        store.globalHiddenExpenseCategoryIdsSet.has('cat-restaurant')
      ).toBe(true)
      expect(store.globalHiddenExpenseCategoryIdsSet.has('cat-transport')).toBe(
        false
      )
    })

    it('should provide globalHiddenIncomeCategoryIdsSet', () => {
      const store = useFiltersStore()

      store.toggleGlobalHiddenIncomeCategory('cat-salaire')

      expect(store.globalHiddenIncomeCategoryIdsSet.has('cat-salaire')).toBe(
        true
      )
      expect(store.globalHiddenIncomeCategoryIdsSet.has('cat-prime')).toBe(
        false
      )
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
