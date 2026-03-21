import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AdvancedFiltersPanel from './AdvancedFiltersPanel.vue'
import { useFiltersStore } from '@/stores/filters'

describe('AdvancedFiltersPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const defaultProps = {
    allExpenseCategories: ['Restaurant', 'Transport', 'Loisirs'],
    allIncomeCategories: ['Salaire', 'Prime'],
  }

  it('should display the panel title', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    expect(wrapper.text()).toContain('Filtres avancés')
  })

  it('should toggle panel visibility on header click', async () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const store = useFiltersStore()
    expect(store.isPanelExpanded).toBe(true)

    // Click header button (first button)
    const headerButton = wrapper.findAll('button')[0]
    await headerButton.trigger('click')

    expect(store.isPanelExpanded).toBe(false)
  })

  it('should show chevron rotated when expanded', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const chevron = wrapper.find('svg.rotate-180')
    expect(chevron.exists()).toBe(true)
  })

  it('should display expense categories section', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    expect(wrapper.text()).toContain('Catégories de dépenses masquées')
    expect(wrapper.text()).toContain('Restaurant')
    expect(wrapper.text()).toContain('Transport')
    expect(wrapper.text()).toContain('Loisirs')
  })

  it('should display income categories section', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    expect(wrapper.text()).toContain('Catégories de revenus masquées')
    expect(wrapper.text()).toContain('Salaire')
    expect(wrapper.text()).toContain('Prime')
  })

  it('should toggle hidden expense category on click', async () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const store = useFiltersStore()
    expect(store.isExpenseCategoryHidden('Restaurant')).toBe(false)

    const buttons = wrapper.findAll('button')
    const restaurantButton = buttons.find(b => b.text().includes('Restaurant'))
    await restaurantButton?.trigger('click')

    expect(store.isExpenseCategoryHidden('Restaurant')).toBe(true)
  })

  it('should toggle hidden income category on click', async () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const store = useFiltersStore()
    expect(store.isIncomeCategoryHidden('Salaire')).toBe(false)

    const buttons = wrapper.findAll('button')
    const salaireButton = buttons.find(b => b.text().includes('Salaire'))
    await salaireButton?.trigger('click')

    expect(store.isIncomeCategoryHidden('Salaire')).toBe(true)
  })

  it('should highlight hidden expense categories in red', () => {
    const store = useFiltersStore()
    store.toggleHiddenExpenseCategory('Restaurant')

    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const buttons = wrapper.findAll('button')
    const restaurantButton = buttons.find(b => b.text().includes('Restaurant'))

    expect(restaurantButton?.classes()).toContain('bg-red-600')
  })

  it('should highlight hidden income categories in red', () => {
    const store = useFiltersStore()
    store.toggleHiddenIncomeCategory('Salaire')

    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const buttons = wrapper.findAll('button')
    const salaireButton = buttons.find(b => b.text().includes('Salaire'))

    expect(salaireButton?.classes()).toContain('bg-red-600')
  })

  it('should show active filters count badge', async () => {
    const store = useFiltersStore()
    store.toggleHiddenExpenseCategory('Restaurant')
    store.toggleHiddenIncomeCategory('Salaire')

    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    // Should show badge with count 2
    const badge = wrapper.find('.bg-indigo-100.text-indigo-700')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('2')
  })

  it('should display empty message when no expense categories', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: {
        allExpenseCategories: [],
        allIncomeCategories: [],
      },
    })

    expect(wrapper.text()).toContain('Aucune catégorie de dépenses disponible')
  })

  it('should display empty message when no income categories', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: {
        allExpenseCategories: ['Restaurant'],
        allIncomeCategories: [],
      },
    })

    expect(wrapper.text()).toContain('Aucune catégorie de revenus disponible')
  })

  it('should not show globally hidden categories in expense list', () => {
    const store = useFiltersStore()
    store.toggleGlobalHiddenExpenseCategory('Restaurant')

    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    // Restaurant should not appear in the list since it's globally hidden
    const buttons = wrapper.findAll('button')
    const restaurantButton = buttons.find(b => b.text().includes('Restaurant'))
    expect(restaurantButton).toBeUndefined()
  })

  it('should not show globally hidden categories in income list', () => {
    const store = useFiltersStore()
    store.toggleGlobalHiddenIncomeCategory('Salaire')

    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    // Salaire should not appear in the list since it's globally hidden
    const buttons = wrapper.findAll('button')
    const salaireButton = buttons.find(b => b.text().includes('Salaire'))
    expect(salaireButton).toBeUndefined()
  })
})
