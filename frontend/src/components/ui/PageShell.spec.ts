import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PageShell from './PageShell.vue'

describe('PageShell', () => {
  it('fills the viewport under the navbar with the page background', () => {
    const wrapper = mount(PageShell, { slots: { default: '<p>Contenu</p>' } })
    const shell = wrapper.find('div')
    expect(shell.classes()).toContain('min-h-[calc(100vh-4rem)]')
    expect(shell.classes()).toContain('bg-gray-50')
    expect(wrapper.text()).toBe('Contenu')
  })

  it('offers three widths and defaults to the middle one', () => {
    const column = (props: { width?: 'wide' | 'default' | 'narrow' }) =>
      mount(PageShell, { props }).findAll('div')[1]?.classes() ?? []
    expect(column({})).toContain('max-w-5xl')
    expect(column({ width: 'wide' })).toContain('max-w-7xl')
    expect(column({ width: 'narrow' })).toContain('max-w-3xl')
  })

  it('centers a lone card when asked', () => {
    const wrapper = mount(PageShell, { props: { center: true } })
    expect(wrapper.find('div').classes()).toContain('items-center')
  })

  it('keeps the attributes a test or a page passes', () => {
    const wrapper = mount(PageShell, { attrs: { 'data-testid': 'shell' } })
    expect(wrapper.find('[data-testid="shell"]').exists()).toBe(true)
  })
})
