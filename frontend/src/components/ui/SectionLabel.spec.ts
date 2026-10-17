import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SectionLabel from './SectionLabel.vue'

describe('SectionLabel', () => {
  it('is a small uppercase paragraph by default', () => {
    const wrapper = mount(SectionLabel, { slots: { default: 'Période' } })
    expect(wrapper.element.tagName).toBe('P')
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['text-xs', 'uppercase', 'font-semibold'])
    )
    expect(wrapper.text()).toBe('Période')
  })

  it('becomes a heading or a span, and keeps an id to be pointed at', () => {
    const heading = mount(SectionLabel, {
      props: { as: 'h3' },
      attrs: { id: 'cap' },
    })
    expect(heading.element.tagName).toBe('H3')
    expect(heading.attributes('id')).toBe('cap')
  })
})
