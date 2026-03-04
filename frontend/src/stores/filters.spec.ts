import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFiltersStore } from './filters'

describe('useFiltersStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.mocked(localStorage.setItem).mockClear()
  })

  it('should start with empty joint accounts', () => {
    const store = useFiltersStore()
    expect(store.jointAccounts).toEqual([])
  })

  it('should toggle joint account on', () => {
    const store = useFiltersStore()

    store.toggleJointAccount('Compte Courant')

    expect(store.jointAccounts).toContain('Compte Courant')
    expect(store.isJointAccount('Compte Courant')).toBe(true)
  })

  it('should toggle joint account off', () => {
    const store = useFiltersStore()

    store.toggleJointAccount('Compte Courant')
    store.toggleJointAccount('Compte Courant')

    expect(store.jointAccounts).not.toContain('Compte Courant')
    expect(store.isJointAccount('Compte Courant')).toBe(false)
  })

  it('should persist to localStorage when toggling joint account', () => {
    const store = useFiltersStore()

    store.toggleJointAccount('Compte Courant')

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'bankin-analyzer-filters',
      JSON.stringify({
        jointAccounts: ['Compte Courant'],
        hiddenExpenseCategories: [],
        hiddenIncomeCategories: [],
        isPanelExpanded: true,
      })
    )
  })

  it('should restore from localStorage on init', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ jointAccounts: ['Compte Joint'] })
    )

    // Create a new pinia to trigger store init
    setActivePinia(createPinia())
    const store = useFiltersStore()

    expect(store.jointAccounts).toContain('Compte Joint')
    expect(store.isJointAccount('Compte Joint')).toBe(true)
  })

  it('should handle invalid localStorage data gracefully', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('invalid json')

    setActivePinia(createPinia())
    const store = useFiltersStore()

    expect(store.jointAccounts).toEqual([])
  })

  it('should provide jointAccountsSet computed', () => {
    const store = useFiltersStore()

    store.toggleJointAccount('Compte A')
    store.toggleJointAccount('Compte B')

    expect(store.jointAccountsSet.has('Compte A')).toBe(true)
    expect(store.jointAccountsSet.has('Compte B')).toBe(true)
    expect(store.jointAccountsSet.has('Compte C')).toBe(false)
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
        jointAccounts: [],
        hiddenExpenseCategories: [],
        hiddenIncomeCategories: [],
        isPanelExpanded: false,
      })
    )
  })

  it('should restore panel state from localStorage', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ jointAccounts: [], isPanelExpanded: false })
    )

    setActivePinia(createPinia())
    const store = useFiltersStore()

    expect(store.isPanelExpanded).toBe(false)
  })

  it('should provide activeFiltersCount computed', () => {
    const store = useFiltersStore()

    expect(store.activeFiltersCount).toBe(0)

    store.toggleJointAccount('Compte A')
    expect(store.activeFiltersCount).toBe(1)

    store.toggleJointAccount('Compte B')
    expect(store.activeFiltersCount).toBe(2)

    store.toggleJointAccount('Compte A')
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

  it('should include hidden categories in activeFiltersCount', () => {
    const store = useFiltersStore()

    store.toggleHiddenExpenseCategory('Restaurant')
    expect(store.activeFiltersCount).toBe(1)

    store.toggleHiddenIncomeCategory('Salaire')
    expect(store.activeFiltersCount).toBe(2)

    store.toggleJointAccount('Compte A')
    expect(store.activeFiltersCount).toBe(3)
  })

  it('should persist hidden categories to localStorage', () => {
    const store = useFiltersStore()

    store.toggleHiddenExpenseCategory('Restaurant')

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'bankin-analyzer-filters',
      JSON.stringify({
        jointAccounts: [],
        hiddenExpenseCategories: ['Restaurant'],
        hiddenIncomeCategories: [],
        isPanelExpanded: true,
      })
    )
  })

  it('should restore hidden categories from localStorage', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({
        jointAccounts: [],
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
})
