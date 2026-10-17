import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseCard from './BaseCard.vue'

describe('BaseCard', () => {
  it('is a white rounded surface with the responsive padding by default', () => {
    const wrapper = mount(BaseCard, { slots: { default: 'x' } })
    const classes = wrapper.classes()
    expect(wrapper.element.tagName).toBe('DIV')
    expect(classes).toEqual(
      expect.arrayContaining([
        'bg-white',
        'rounded-xl',
        'shadow-sm',
        'p-4',
        'sm:p-6',
      ])
    )
  })

  it('renders the element it is asked for', () => {
    const wrapper = mount(BaseCard, { props: { as: 'section' } })
    expect(wrapper.element.tagName).toBe('SECTION')
  })

  it('raises the card that is the page', () => {
    const wrapper = mount(BaseCard, {
      props: { variant: 'raised', padding: 'lg' },
    })
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['rounded-2xl', 'shadow-lg', 'p-6', 'sm:p-8'])
    )
  })

  it('can drop its padding or add a border', () => {
    const bare = mount(BaseCard, { props: { padding: 'none', bordered: true } })
    expect(bare.classes()).not.toContain('p-4')
    expect(bare.classes()).toContain('border')
  })
})
