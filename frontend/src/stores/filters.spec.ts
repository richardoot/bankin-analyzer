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

  it('should start with panel expanded', () => {
    const store = useFiltersStore()
    expect(store.isPanelExpanded).toBe(true)
  })

  it('should toggle panel expansion', () => {
    const store = useFiltersStore()

    store.togglePanelExpanded()
    expect(store.isPanelExpanded).toBe(false)

    store.togglePanelExpanded()
    expect(store.isPanelExpanded).toBe(true)
  })

  it('should persist panel state to localStorage', () => {
    const store = useFiltersStore()

    store.togglePanelExpanded()

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'bankin-analyzer-filters',
      JSON.stringify({
        hiddenExpenseCategories: [],
        hiddenIncomeCategories: [],
        globalHiddenExpenseCategories: [],
        globalHiddenIncomeCategories: [],
        isPanelExpanded: false,
      })
    )
  })

  it('should restore panel state from localStorage', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ isPanelExpanded: false })
    )

    setActivePinia(createPinia())
    const store = useFiltersStore()

    expect(store.isPanelExpanded).toBe(false)
  })

  it('should provide activeFiltersCount computed (dashboard filters only)', () => {
    const store = useFiltersStore()

    expect(store.activeFiltersCount).toBe(0)

    store.toggleHiddenExpenseCategory('Restaurant')
    expect(store.activeFiltersCount).toBe(1)

    store.toggleHiddenIncomeCategory('Salaire')
    expect(store.activeFiltersCount).toBe(2)

    store.toggleHiddenExpenseCategory('Restaurant')
    expect(store.activeFiltersCount).toBe(1)
  })

  it('should start with empty hidden categories', () => {
    const store = useFiltersStore()
    expect(store.hiddenExpenseCategories).toEqual([])
    expect(store.hiddenIncomeCategories).toEqual([])
  })

  it('should toggle hidden expense category', () => {
    const store = useFiltersStore()

    store.toggleHiddenExpenseCategory('Restaurant')
    expect(store.isExpenseCategoryHidden('Restaurant')).toBe(true)

    store.toggleHiddenExpenseCategory('Restaurant')
    expect(store.isExpenseCategoryHidden('Restaurant')).toBe(false)
  })

  it('should toggle hidden income category', () => {
    const store = useFiltersStore()

    store.toggleHiddenIncomeCategory('Salaire')
    expect(store.isIncomeCategoryHidden('Salaire')).toBe(true)

    store.toggleHiddenIncomeCategory('Salaire')
    expect(store.isIncomeCategoryHidden('Salaire')).toBe(false)
  })

  it('should persist hidden categories to localStorage', () => {
    const store = useFiltersStore()

    store.toggleHiddenExpenseCategory('Restaurant')

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'bankin-analyzer-filters',
      JSON.stringify({
        hiddenExpenseCategories: ['Restaurant'],
        hiddenIncomeCategories: [],
        globalHiddenExpenseCategories: [],
        globalHiddenIncomeCategories: [],
        isPanelExpanded: true,
      })
    )
  })

  it('should restore hidden categories from localStorage', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({
        hiddenExpenseCategories: ['Restaurant'],
        hiddenIncomeCategories: ['Salaire'],
        isPanelExpanded: true,
      })
    )

    setActivePinia(createPinia())
    const store = useFiltersStore()

    expect(store.isExpenseCategoryHidden('Restaurant')).toBe(true)
    expect(store.isIncomeCategoryHidden('Salaire')).toBe(true)
  })

  it('should handle invalid localStorage data gracefully', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('invalid json')

    setActivePinia(createPinia())
    const store = useFiltersStore()

    expect(store.hiddenExpenseCategories).toEqual([])
    expect(store.hiddenIncomeCategories).toEqual([])
  })

  describe('global hidden categories', () => {
    it('should start with empty global hidden categories', () => {
      const store = useFiltersStore()
      expect(store.globalHiddenExpenseCategories).toEqual([])
      expect(store.globalHiddenIncomeCategories).toEqual([])
    })

    it('should toggle global hidden expense category', () => {
      const store = useFiltersStore()

      store.toggleGlobalHiddenExpenseCategory('Restaurant')
      expect(store.isExpenseCategoryGloballyHidden('Restaurant')).toBe(true)

      store.toggleGlobalHiddenExpenseCategory('Restaurant')
      expect(store.isExpenseCategoryGloballyHidden('Restaurant')).toBe(false)
    })

    it('should toggle global hidden income category', () => {
      const store = useFiltersStore()

      store.toggleGlobalHiddenIncomeCategory('Salaire')
      expect(store.isIncomeCategoryGloballyHidden('Salaire')).toBe(true)

      store.toggleGlobalHiddenIncomeCategory('Salaire')
      expect(store.isIncomeCategoryGloballyHidden('Salaire')).toBe(false)
    })

    it('should mark as having unsaved changes when toggling global categories', () => {
      const store = useFiltersStore()

      expect(store.hasUnsavedChanges).toBe(false)
      store.toggleGlobalHiddenExpenseCategory('Restaurant')
      expect(store.hasUnsavedChanges).toBe(true)
    })

    it('should restore global hidden categories from localStorage', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(
        JSON.stringify({
          globalHiddenExpenseCategories: ['Restaurant'],
          globalHiddenIncomeCategories: ['Salaire'],
        })
      )

      setActivePinia(createPinia())
      const store = useFiltersStore()

      expect(store.isExpenseCategoryGloballyHidden('Restaurant')).toBe(true)
      expect(store.isIncomeCategoryGloballyHidden('Salaire')).toBe(true)
    })
  })

  describe('computed sets', () => {
    it('should provide hiddenExpenseCategoriesSet', () => {
      const store = useFiltersStore()

      store.toggleHiddenExpenseCategory('Restaurant')
      store.toggleHiddenExpenseCategory('Transport')

      expect(store.hiddenExpenseCategoriesSet.has('Restaurant')).toBe(true)
      expect(store.hiddenExpenseCategoriesSet.has('Transport')).toBe(true)
      expect(store.hiddenExpenseCategoriesSet.has('Loisirs')).toBe(false)
    })

    it('should provide hiddenIncomeCategoriesSet', () => {
      const store = useFiltersStore()

      store.toggleHiddenIncomeCategory('Salaire')

      expect(store.hiddenIncomeCategoriesSet.has('Salaire')).toBe(true)
      expect(store.hiddenIncomeCategoriesSet.has('Prime')).toBe(false)
    })

    it('should provide globalHiddenExpenseCategoriesSet', () => {
      const store = useFiltersStore()

      store.toggleGlobalHiddenExpenseCategory('Restaurant')

      expect(store.globalHiddenExpenseCategoriesSet.has('Restaurant')).toBe(
        true
      )
      expect(store.globalHiddenExpenseCategoriesSet.has('Transport')).toBe(
        false
      )
    })

    it('should provide globalHiddenIncomeCategoriesSet', () => {
      const store = useFiltersStore()

      store.toggleGlobalHiddenIncomeCategory('Salaire')

      expect(store.globalHiddenIncomeCategoriesSet.has('Salaire')).toBe(true)
      expect(store.globalHiddenIncomeCategoriesSet.has('Prime')).toBe(false)
    })
  })
})
