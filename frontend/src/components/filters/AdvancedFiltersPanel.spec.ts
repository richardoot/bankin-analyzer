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
    availableAccounts: ['Compte Courant', 'Livret A', 'Compte Joint'],
    allExpenseCategories: ['Restaurant', 'Transport', 'Loisirs'],
    allIncomeCategories: ['Salaire', 'Prime'],
  }

  it('should display the panel title', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    expect(wrapper.text()).toContain('Filtres avancés')
  })

  it('should display joint accounts section when expanded', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    expect(wrapper.text()).toContain('Comptes joints')
    expect(wrapper.text()).toContain('÷2')
  })

  it('should display all available accounts as buttons', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    expect(wrapper.text()).toContain('Compte Courant')
    expect(wrapper.text()).toContain('Livret A')
    expect(wrapper.text()).toContain('Compte Joint')
  })

  it('should display empty message when no accounts', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: {
        availableAccounts: [],
        allExpenseCategories: [],
        allIncomeCategories: [],
      },
    })

    expect(wrapper.text()).toContain('Aucun compte disponible')
  })

  it('should toggle account on click', async () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const store = useFiltersStore()
    expect(store.isJointAccount('Compte Courant')).toBe(false)

    // Find account button by text
    const buttons = wrapper.findAll('button')
    const accountButton = buttons.find(b => b.text().includes('Compte Courant'))
    await accountButton?.trigger('click')

    expect(store.isJointAccount('Compte Courant')).toBe(true)
  })

  it('should highlight joint accounts', async () => {
    const store = useFiltersStore()
    store.toggleJointAccount('Livret A')

    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const buttons = wrapper.findAll('button')
    const livretAButton = buttons.find(b => b.text().includes('Livret A'))

    expect(livretAButton?.classes()).toContain('bg-indigo-600')
    expect(livretAButton?.text()).toContain('÷2')
  })

  it('should not highlight non-joint accounts', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const buttons = wrapper.findAll('button')
    const compteCourantButton = buttons.find(b =>
      b.text().includes('Compte Courant')
    )

    expect(compteCourantButton?.classes()).toContain('bg-gray-100')
    expect(compteCourantButton?.text()).not.toContain('÷2')
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

  it('should show active filters count badge', async () => {
    const store = useFiltersStore()
    store.toggleJointAccount('Compte Courant')
    store.toggleJointAccount('Livret A')

    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    // Should show badge with count 2
    const badge = wrapper.find('.bg-indigo-100.text-indigo-700')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('2')
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

  // Tests pour la section remboursements
  it('should display reimbursements section', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    expect(wrapper.text()).toContain('Remboursements')
    expect(wrapper.text()).toContain('déduits des dépenses')
  })

  it('should display two dropdowns for adding associations', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const selects = wrapper.findAll('select')
    // Should have 2 selects: one for expense, one for income
    expect(selects.length).toBe(2)
  })

  it('should display expense categories in first dropdown', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const selects = wrapper.findAll('select')
    const expenseSelect = selects[0]
    const options = expenseSelect.findAll('option')

    expect(options[0].text()).toBe('Catégorie dépense')
    expect(options.some(o => o.text() === 'Restaurant')).toBe(true)
    expect(options.some(o => o.text() === 'Transport')).toBe(true)
    expect(options.some(o => o.text() === 'Loisirs')).toBe(true)
  })

  it('should display income categories in second dropdown', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const selects = wrapper.findAll('select')
    const incomeSelect = selects[1]
    const options = incomeSelect.findAll('option')

    expect(options[0].text()).toBe('Remboursement')
    expect(options.some(o => o.text() === 'Salaire')).toBe(true)
    expect(options.some(o => o.text() === 'Prime')).toBe(true)
  })

  it('should display disabled Lier button when no selection', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const lierButton = wrapper
      .findAll('button')
      .find(b => b.text().includes('Lier'))
    expect(lierButton?.attributes('disabled')).toBeDefined()
  })

  it('should enable Lier button when both dropdowns have selection', async () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const selects = wrapper.findAll('select')
    await selects[0].setValue('Restaurant')
    await selects[1].setValue('Salaire')

    const lierButton = wrapper
      .findAll('button')
      .find(b => b.text().includes('Lier'))
    expect(lierButton?.attributes('disabled')).toBeUndefined()
  })

  it('should add association when clicking Lier button', async () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })
    const store = useFiltersStore()

    const selects = wrapper.findAll('select')
    await selects[0].setValue('Restaurant')
    await selects[1].setValue('Salaire')

    const lierButton = wrapper
      .findAll('button')
      .find(b => b.text().includes('Lier'))
    await lierButton?.trigger('click')

    expect(store.getReimbursementCategory('Restaurant')).toBe('Salaire')
  })

  it('should reset dropdowns after adding association', async () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const selects = wrapper.findAll('select')
    await selects[0].setValue('Restaurant')
    await selects[1].setValue('Salaire')

    const lierButton = wrapper
      .findAll('button')
      .find(b => b.text().includes('Lier'))
    await lierButton?.trigger('click')

    expect((selects[0].element as HTMLSelectElement).value).toBe('')
    expect((selects[1].element as HTMLSelectElement).value).toBe('')
  })

  it('should display existing associations in list', () => {
    const store = useFiltersStore()
    store.setCategoryAssociation('Restaurant', 'Salaire')

    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    expect(wrapper.text()).toContain('Restaurant')
    expect(wrapper.text()).toContain('→')
    expect(wrapper.text()).toContain('Salaire')
  })

  it('should not show associated expense category in dropdown', () => {
    const store = useFiltersStore()
    store.setCategoryAssociation('Restaurant', 'Salaire')

    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const selects = wrapper.findAll('select')
    const expenseSelect = selects[0]
    const options = expenseSelect.findAll('option')

    // Restaurant should not be in the dropdown since it's already associated
    expect(options.some(o => o.text() === 'Restaurant')).toBe(false)
  })

  it('should not show associated income category in dropdown', () => {
    const store = useFiltersStore()
    store.setCategoryAssociation('Restaurant', 'Salaire')

    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const selects = wrapper.findAll('select')
    const incomeSelect = selects[1]
    const options = incomeSelect.findAll('option')

    // Salaire should not be in the dropdown since it's already associated
    expect(options.some(o => o.text() === 'Salaire')).toBe(false)
  })

  it('should remove association when clicking delete button', async () => {
    const store = useFiltersStore()
    store.setCategoryAssociation('Restaurant', 'Salaire')

    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    // Find delete button (the one with × icon in the association row)
    const assocRow = wrapper.find('.bg-amber-50')
    const deleteButton = assocRow.find('button')
    await deleteButton.trigger('click')

    expect(store.getReimbursementCategory('Restaurant')).toBeNull()
  })

  it('should include category associations in active filters count', () => {
    const store = useFiltersStore()
    store.setCategoryAssociation('Restaurant', 'Salaire')
    store.setCategoryAssociation('Transport', 'Prime')

    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const badge = wrapper.find('.bg-indigo-100.text-indigo-700')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('2')
  })
})
