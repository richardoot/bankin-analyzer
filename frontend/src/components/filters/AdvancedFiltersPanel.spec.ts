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

    // 1 header button + 3 account buttons
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBe(4)
    expect(wrapper.text()).toContain('Compte Courant')
    expect(wrapper.text()).toContain('Livret A')
    expect(wrapper.text()).toContain('Compte Joint')
  })

  it('should display empty message when no accounts', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: { availableAccounts: [] },
    })

    expect(wrapper.text()).toContain('Aucun compte disponible')
  })

  it('should toggle account on click', async () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const store = useFiltersStore()
    expect(store.isJointAccount('Compte Courant')).toBe(false)

    // Skip the first button (header toggle), click the first account button
    const accountButtons = wrapper.findAll('button').slice(1)
    await accountButtons[0].trigger('click')

    expect(store.isJointAccount('Compte Courant')).toBe(true)
  })

  it('should highlight joint accounts', async () => {
    const store = useFiltersStore()
    store.toggleJointAccount('Livret A')

    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    // Skip header button, get account buttons
    const accountButtons = wrapper.findAll('button').slice(1)
    const livretAButton = accountButtons[1]

    expect(livretAButton.classes()).toContain('bg-indigo-600')
    expect(livretAButton.text()).toContain('÷2')
  })

  it('should not highlight non-joint accounts', () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    // Skip header button, get account buttons
    const accountButtons = wrapper.findAll('button').slice(1)
    const firstButton = accountButtons[0]

    expect(firstButton.classes()).toContain('bg-gray-100')
    expect(firstButton.text()).not.toContain('÷2')
  })

  it('should toggle panel visibility on header click', async () => {
    const wrapper = mount(AdvancedFiltersPanel, {
      props: defaultProps,
    })

    const store = useFiltersStore()
    expect(store.isPanelExpanded).toBe(true)

    // Click header button
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
})
