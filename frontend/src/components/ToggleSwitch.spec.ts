import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToggleSwitch from './ToggleSwitch.vue'

describe('ToggleSwitch', () => {
  it('reflects the checked state via aria-checked', () => {
    const on = mount(ToggleSwitch, {
      props: { checked: true, label: 'toggle' },
    })
    expect(on.get('button').attributes('aria-checked')).toBe('true')

    const off = mount(ToggleSwitch, {
      props: { checked: false, label: 'toggle' },
    })
    expect(off.get('button').attributes('aria-checked')).toBe('false')
  })

  it('emits change with the negated value when clicked', async () => {
    const wrapper = mount(ToggleSwitch, {
      props: { checked: false, label: 'toggle' },
    })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('change')?.[0]).toEqual([true])
  })

  it('does not emit when disabled', async () => {
    const wrapper = mount(ToggleSwitch, {
      props: { checked: false, disabled: true, label: 'toggle' },
    })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('does not emit while loading', async () => {
    const wrapper = mount(ToggleSwitch, {
      props: { checked: true, loading: true, label: 'toggle' },
    })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('change')).toBeUndefined()
  })
})
