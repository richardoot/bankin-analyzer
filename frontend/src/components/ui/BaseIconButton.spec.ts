import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseIconButton from './BaseIconButton.vue'

describe('BaseIconButton', () => {
  it('names itself for assistive technology and the tooltip', () => {
    const wrapper = mount(BaseIconButton, {
      props: { label: 'Supprimer' },
      slots: { default: '<svg />' },
    })
    expect(wrapper.attributes('aria-label')).toBe('Supprimer')
    expect(wrapper.attributes('title')).toBe('Supprimer')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('builds the touch halo into the button', () => {
    const wrapper = mount(BaseIconButton, { props: { label: 'x' } })
    expect(wrapper.classes()).toContain('relative')
    expect(
      wrapper.classes().some(c => c.startsWith('pointer-coarse:before:'))
    ).toBe(true)
  })

  it('shrinks to 32px without losing the halo', () => {
    const wrapper = mount(BaseIconButton, { props: { label: 'x', size: 'sm' } })
    expect(wrapper.classes()).toContain('h-8')
    expect(wrapper.classes()).toContain('pointer-coarse:before:-inset-1.5')
  })

  it('swaps the icon for a spinner while loading, and cannot be clicked', () => {
    const wrapper = mount(BaseIconButton, {
      props: { label: 'x', loading: true },
      slots: { default: '<i data-icon />' },
    })
    expect(wrapper.find('[data-icon]').exists()).toBe(false)
    expect(wrapper.find('svg.animate-spin').exists()).toBe(true)
    expect(wrapper.attributes('disabled')).toBeDefined()
  })

  it('tints a destructive one red on hover', () => {
    const wrapper = mount(BaseIconButton, {
      props: { label: 'x', variant: 'danger' },
    })
    expect(wrapper.classes()).toContain('hover:text-red-600')
  })
})
