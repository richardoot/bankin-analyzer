import { describe, it, expect, afterEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import BudgetMonthRead from './BudgetMonthRead.vue'

const phone = vi.hoisted(() => ({ value: false }))
vi.mock('@/composables/useMediaQuery', () => ({
  useMediaQuery: () => ref(phone.value),
}))

enableAutoUnmount(afterEach)
afterEach(() => {
  phone.value = false
  document.body.innerHTML = ''
})

const OPTIONS = [
  {
    value: null,
    label: 'Le plan',
    testId: 'budget-month-average',
    title: 'Le plan entier, en moyenne par mois',
  },
  {
    value: '2026-05',
    label: 'Mai',
    testId: 'budget-month-2026-05',
    title: 'Mai 2026',
  },
  {
    value: '2026-06',
    label: 'Juin',
    testId: 'budget-month-2026-06',
    title: 'Juin 2026',
  },
]

function mountRead(modelValue: string | null = null, runningValue?: string) {
  return mount(BudgetMonthRead, {
    props: { options: OPTIONS, modelValue, runningValue },
    attachTo: document.body,
  })
}

const sheet = () =>
  document.body.querySelector('[data-testid="budget-month-read-sheet"]')

describe('BudgetMonthRead', () => {
  it('is a labelled segment on a desk, the running month dotted', async () => {
    const wrapper = mountRead(null, '2026-06')
    const segment = wrapper.get('[data-testid="budget-month-read"]')
    expect(segment.attributes('aria-labelledby')).toBe(
      'budget-month-read-label'
    )
    expect(
      wrapper
        .get('[data-testid="budget-month-2026-06"]')
        .find('[data-testid="budget-month-running-mark"]')
        .exists()
    ).toBe(true)
    await wrapper.get('[data-testid="budget-month-2026-05"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['2026-05']])
  })

  it('is a link saying the choice on a phone, and a sheet to change it', async () => {
    phone.value = true
    const wrapper = mountRead(null)
    expect(wrapper.find('[data-testid="budget-month-read"]').exists()).toBe(
      false
    )
    const trigger = wrapper.get('[data-testid="budget-month-read-trigger"]')
    expect(trigger.text().replace(/\s+/g, ' ')).toBe('Mois lu : le plan ▾')
    expect(trigger.attributes('aria-expanded')).toBe('false')

    await trigger.trigger('click')
    expect(sheet()).not.toBeNull()
    expect(trigger.attributes('aria-expanded')).toBe('true')

    // Picking the month read again changes nothing, and closes.
    sheet()
      ?.querySelector<HTMLButtonElement>('[data-testid="budget-month-average"]')
      ?.click()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await trigger.trigger('click')
    sheet()
      ?.querySelector<HTMLButtonElement>('[data-testid="budget-month-2026-06"]')
      ?.click()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toEqual([['2026-06']])
    expect(trigger.attributes('aria-expanded')).toBe('false')
  })

  it('draws nothing without a month to offer', () => {
    const wrapper = mount(BudgetMonthRead, {
      props: { options: [], modelValue: null },
    })
    expect(wrapper.find('[data-testid="budget-month-selector"]').exists()).toBe(
      false
    )
  })
})
