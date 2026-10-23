import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TimePeriodSelector from './TimePeriodSelector.vue'
import { useFiltersStore } from '@/stores/filters'

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ isAuthenticated: false }),
}))
vi.mock('@/lib/api', () => ({
  api: { getFilterPreferences: vi.fn(), updateFilterPreferences: vi.fn() },
}))

describe('TimePeriodSelector', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('says which period is on, and moves it on click', async () => {
    const wrapper = mount(TimePeriodSelector)
    const store = useFiltersStore()
    store.setTimePeriod('6m')
    await wrapper.vm.$nextTick()

    const pressed = () =>
      wrapper
        .findAll('[data-testid^="period-"]')
        .filter(b => b.attributes('aria-checked') === 'true')
        .map(b => b.attributes('data-testid'))
    expect(pressed()).toEqual(['period-6m'])
    expect(wrapper.get('[role="radiogroup"]').attributes('aria-label')).toBe(
      'Période'
    )

    await wrapper.get('[data-testid="period-1y"]').trigger('click')
    expect(pressed()).toEqual(['period-1y'])
  })

  it('names a year « 12 mois », and opens on it', () => {
    const wrapper = mount(TimePeriodSelector)
    const year = wrapper.get('[data-testid="period-1y"]')

    expect(year.text()).toContain('12 mois')
    expect(year.attributes('aria-checked')).toBe('true')
  })

  it('says when a custom range is inverted', async () => {
    const wrapper = mount(TimePeriodSelector)
    const store = useFiltersStore()
    store.setTimePeriod('custom')
    store.setCustomDateRange('2026-03-01', '2026-01-31')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="custom-range-inverted"]').exists()).toBe(
      true
    )

    store.setCustomDateRange('2026-01-01', '2026-01-31')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="custom-range-inverted"]').exists()).toBe(
      false
    )
  })
})
