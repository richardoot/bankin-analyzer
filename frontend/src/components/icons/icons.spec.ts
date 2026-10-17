import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import * as icons from './index'

describe('icons', () => {
  const entries = Object.entries(icons)

  it('exports a set', () => {
    expect(entries.length).toBeGreaterThan(15)
  })

  it.each(entries)('%s is a decorative, sized-by-caller svg', (_name, Icon) => {
    const wrapper = mount(Icon, { attrs: { class: 'h-4 w-4' } })
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.classes()).toContain('h-4')
    expect(svg.attributes('viewBox')).toBe('0 0 24 24')
    expect(svg.find('path').exists()).toBe(true)
  })

  it('draws outlines in the current colour', () => {
    const wrapper = mount(icons.IconClose)
    expect(wrapper.find('svg').attributes('stroke')).toBe('currentColor')
    expect(wrapper.find('svg').attributes('fill')).toBe('none')
  })

  it('lets a caller thin the stroke', () => {
    const wrapper = mount(icons.IconCheck, { props: { strokeWidth: 2.5 } })
    expect(wrapper.find('svg').attributes('stroke-width')).toBe('2.5')
  })

  it('spins the spinner through CSS', () => {
    const wrapper = mount(icons.IconSpinner)
    expect(wrapper.find('svg').classes()).toContain('animate-spin')
  })
})
