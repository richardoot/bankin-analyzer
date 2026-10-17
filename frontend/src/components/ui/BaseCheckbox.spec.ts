import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseCheckbox from './BaseCheckbox.vue'

describe('BaseCheckbox', () => {
  it('is a labelled checkbox whose row is the target', async () => {
    const wrapper = mount(BaseCheckbox, {
      props: {
        label: 'Importer',
        description: 'Cette ligne',
        modelValue: false,
      },
    })
    const input = wrapper.find('input[type="checkbox"]')
    expect(wrapper.find('label').attributes('for')).toBe(input.attributes('id'))
    expect(wrapper.find('label').classes()).toContain(
      'pointer-coarse:min-h-[44px]'
    )
    expect(wrapper.text()).toContain('Importer')
    expect(wrapper.text()).toContain('Cette ligne')
    await input.setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
  })

  it('passes attributes to the box and disables the row', () => {
    const wrapper = mount(BaseCheckbox, {
      props: { label: 'x', disabled: true },
      attrs: { 'data-testid': 'box' },
    })
    expect(wrapper.find('input').attributes('data-testid')).toBe('box')
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('label').classes()).toContain('opacity-50')
  })
})
