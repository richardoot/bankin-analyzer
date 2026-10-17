import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseSwitchRow from './BaseSwitchRow.vue'

describe('BaseSwitchRow', () => {
  it('shows the label, the description and a switch named after the label', () => {
    const wrapper = mount(BaseSwitchRow, {
      props: {
        checked: true,
        label: 'Déduire',
        description: 'Les remboursements',
      },
    })
    const toggle = wrapper.find('[role="switch"]')
    expect(toggle.attributes('aria-checked')).toBe('true')
    expect(toggle.attributes('aria-label')).toBe('Déduire')
    expect(wrapper.find('label').attributes('for')).toBe(
      toggle.attributes('id')
    )
    expect(wrapper.text()).toContain('Les remboursements')
  })

  it('emits the next value and respects loading', async () => {
    const wrapper = mount(BaseSwitchRow, {
      props: { checked: false, label: 'x' },
    })
    await wrapper.find('[role="switch"]').trigger('click')
    expect(wrapper.emitted('change')?.[0]).toEqual([true])

    const busy = mount(BaseSwitchRow, {
      props: { checked: false, label: 'x', loading: true },
    })
    expect(busy.find('[role="switch"]').attributes('disabled')).toBeDefined()
  })
})
