import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ComparisonSelector from './ComparisonSelector.vue'
import type { BudgetPlanDto } from '@/lib/api'

const samplePlan: BudgetPlanDto = {
  id: 'plan-1',
  name: 'Mai 2026',
  startDate: '2026-05-01',
  endDate: '2026-05-31',
  monthCount: 1,
  totalAmount: 0,
  entries: [],
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
}

function openDropdown(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('[data-testid="comparison-trigger"]').trigger('click')
}

describe('ComparisonSelector', () => {
  it('renders "Aucune comparaison" as the initial label and emits a null range', async () => {
    const wrapper = mount(ComparisonSelector, {
      props: {
        plan: samplePlan,
        yearAgoAvailable: true,
        preset: 'none',
        customStartDate: '',
        customEndDate: '',
      },
    })

    expect(wrapper.text()).toContain('Aucune comparaison')
    // The selector emits the resolved range via watch(immediate: true)
    const emitted = wrapper.emitted('update:range')
    expect(emitted?.[0]).toEqual([null])
  })

  it('emits a 3-month range anchored to the plan start when "3m" is picked', async () => {
    const wrapper = mount(ComparisonSelector, {
      props: {
        plan: samplePlan,
        yearAgoAvailable: false,
        preset: 'none',
        customStartDate: '',
        customEndDate: '',
      },
    })

    await openDropdown(wrapper)
    await wrapper.find('[data-testid="comparison-option-3m"]').trigger('click')

    // Last "update:preset" event carries '3m'
    const presetEvents = wrapper.emitted('update:preset')
    expect(presetEvents?.at(-1)).toEqual(['3m'])

    // The selector itself doesn't change its own `preset` prop — the parent
    // would react to the event. Re-mount with the updated preset to assert
    // the resolved range.
    await wrapper.setProps({ preset: '3m' })
    const rangeEvents = wrapper.emitted('update:range')
    const lastRange = rangeEvents?.at(-1)?.[0]
    expect(lastRange).toMatchObject({
      // 3 months before plan start (May 2026) → Feb, Mar, Apr 2026
      startDate: '2026-02-01',
      endDate: '2026-04-30',
      startMonth: '2026-02',
      endMonth: '2026-04',
      source: '3m',
    })
  })

  it('omits the "Année dernière" option when no data is available', async () => {
    const wrapper = mount(ComparisonSelector, {
      props: {
        plan: samplePlan,
        yearAgoAvailable: false,
        preset: 'none',
        customStartDate: '',
        customEndDate: '',
      },
    })

    await openDropdown(wrapper)
    expect(
      wrapper.find('[data-testid="comparison-option-year-ago"]').exists()
    ).toBe(false)
  })

  it('exposes the "Année dernière" option when data exists, anchored one year before', async () => {
    const wrapper = mount(ComparisonSelector, {
      props: {
        plan: samplePlan,
        yearAgoAvailable: true,
        preset: 'year-ago',
        customStartDate: '',
        customEndDate: '',
      },
    })

    await openDropdown(wrapper)
    expect(
      wrapper.find('[data-testid="comparison-option-year-ago"]').exists()
    ).toBe(true)

    const range = wrapper.emitted('update:range')?.at(-1)?.[0]
    expect(range).toMatchObject({
      startDate: '2025-05-01',
      endDate: '2025-05-31',
      source: 'year-ago',
    })
  })

  it('resolves a "custom" range from the provided date inputs', async () => {
    const wrapper = mount(ComparisonSelector, {
      props: {
        plan: samplePlan,
        yearAgoAvailable: false,
        preset: 'custom',
        customStartDate: '2024-01-01',
        customEndDate: '2024-03-31',
      },
    })

    const range = wrapper.emitted('update:range')?.at(-1)?.[0]
    expect(range).toMatchObject({
      startDate: '2024-01-01',
      endDate: '2024-03-31',
      startMonth: '2024-01',
      endMonth: '2024-03',
      source: 'custom',
    })
  })
})
