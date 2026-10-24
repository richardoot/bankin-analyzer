import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ComparisonSelector from './ComparisonSelector.vue'
import type { ComparisonPreset } from '@/composables/useBudgetComparison'
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

function mountSelector(
  props: Partial<{
    yearAgoAvailable: boolean
    preset: ComparisonPreset
    customStartDate: string
    customEndDate: string
  }> = {}
) {
  return mount(ComparisonSelector, {
    props: {
      plan: samplePlan,
      yearAgoAvailable: false,
      preset: 'none',
      customStartDate: '',
      customEndDate: '',
      ...props,
    },
  })
}

describe('ComparisonSelector', () => {
  it('is a segment of the comparisons, « Aucune » chosen and a null range at first', () => {
    const wrapper = mountSelector()

    const group = wrapper.get('[role="radiogroup"]')
    expect(wrapper.text()).toContain('Comparer avec')
    expect(group.findAll('[role="radio"]').map(o => o.text())).toEqual([
      'Aucune',
      '3 mois',
      '6 mois',
      '12 mois',
      'Dates…',
    ])
    expect(
      group.findAll('[role="radio"]').map(o => o.attributes('aria-checked'))
    ).toEqual(['true', 'false', 'false', 'false', 'false'])
    // The menu button is gone.
    expect(wrapper.find('[data-testid="comparison-trigger"]').exists()).toBe(
      false
    )
    expect(wrapper.emitted('update:range')).toEqual([[null]])
  })

  it('emits a 3-month range anchored to the plan start when « 3 mois » is picked', async () => {
    const wrapper = mountSelector()

    await wrapper.get('[data-testid="comparison-option-3m"]').trigger('click')
    expect(wrapper.emitted('update:preset')).toEqual([['3m']])

    // The parent owns the preset: once it is passed back, the range follows.
    await wrapper.setProps({ preset: '3m' })
    expect(
      wrapper
        .get('[data-testid="comparison-option-3m"]')
        .attributes('aria-checked')
    ).toBe('true')
    expect(wrapper.emitted('update:range')?.at(-1)).toEqual([
      expect.objectContaining({
        // 3 months before plan start (May 2026) → Feb, Mar, Apr 2026
        startDate: '2026-02-01',
        endDate: '2026-04-30',
        startMonth: '2026-02',
        endMonth: '2026-04',
        source: '3m',
      }),
    ])
  })

  it('does not emit again for the choice already made', async () => {
    const wrapper = mountSelector({ preset: '6m' })

    await wrapper.get('[data-testid="comparison-option-6m"]').trigger('click')

    expect(wrapper.emitted('update:preset')).toBeUndefined()
  })

  it('offers « Il y a un an » only when that year holds data, anchored one year before', () => {
    expect(
      mountSelector()
        .find('[data-testid="comparison-option-year-ago"]')
        .exists()
    ).toBe(false)

    const wrapper = mountSelector({
      yearAgoAvailable: true,
      preset: 'year-ago',
    })
    expect(
      wrapper.get('[data-testid="comparison-option-year-ago"]').text()
    ).toBe('Il y a un an')
    expect(wrapper.emitted('update:range')?.at(-1)).toEqual([
      expect.objectContaining({
        startDate: '2025-05-01',
        endDate: '2025-05-31',
        source: 'year-ago',
      }),
    ])
  })

  it('shows the two dates under the segment once « Dates… » is chosen, and passes them up', async () => {
    const wrapper = mountSelector()
    expect(
      wrapper.find('[data-testid="comparison-custom-start"]').exists()
    ).toBe(false)

    await wrapper
      .get('[data-testid="comparison-option-custom"]')
      .trigger('click')
    expect(wrapper.emitted('update:preset')).toEqual([['custom']])
    await wrapper.setProps({ preset: 'custom' })

    await wrapper
      .get('[data-testid="comparison-custom-start"]')
      .setValue('2024-01-01')
    await wrapper
      .get('[data-testid="comparison-custom-end"]')
      .setValue('2024-03-31')
    expect(wrapper.emitted('update:customStartDate')).toEqual([['2024-01-01']])
    expect(wrapper.emitted('update:customEndDate')).toEqual([['2024-03-31']])
  })

  it('resolves a custom range from the two dates', () => {
    const wrapper = mountSelector({
      preset: 'custom',
      customStartDate: '2024-01-01',
      customEndDate: '2024-03-31',
    })

    expect(wrapper.emitted('update:range')?.at(-1)).toEqual([
      expect.objectContaining({
        startDate: '2024-01-01',
        endDate: '2024-03-31',
        startMonth: '2024-01',
        endMonth: '2024-03',
        source: 'custom',
      }),
    ])
    expect(wrapper.get('[data-testid="comparison-range"]').text()).toMatch(
      /2024/
    )
  })

  it('refuses an inverted custom range and says why', () => {
    const wrapper = mountSelector({
      preset: 'custom',
      customStartDate: '2026-03-01',
      customEndDate: '2026-01-31',
    })

    expect(
      wrapper.find('[data-testid="comparison-custom-inverted"]').exists()
    ).toBe(true)
    expect(wrapper.emitted('update:range')?.at(-1)).toEqual([null])
  })

  it('takes the comparison off with « Aucune »', async () => {
    const wrapper = mountSelector({ preset: '6m' })
    expect(wrapper.emitted('update:range')?.at(-1)?.[0]).not.toBeNull()

    await wrapper.get('[data-testid="comparison-option-none"]').trigger('click')
    expect(wrapper.emitted('update:preset')).toEqual([['none']])
    await wrapper.setProps({ preset: 'none' })
    expect(wrapper.emitted('update:range')?.at(-1)).toEqual([null])
    expect(
      wrapper
        .get('[data-testid="comparison-option-none"]')
        .attributes('aria-checked')
    ).toBe('true')
  })
})
