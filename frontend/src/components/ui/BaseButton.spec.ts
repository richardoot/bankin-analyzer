import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import BaseButton from './BaseButton.vue'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/transactions', component: { template: '<div />' } },
  ],
})

describe('BaseButton', () => {
  it('is a primary button by default', () => {
    const wrapper = mount(BaseButton, { slots: { default: 'Valider' } })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.classes()).toContain('bg-primary-600')
    expect(wrapper.text()).toBe('Valider')
  })

  it('offers the tinted variant for a quieter primary action', () => {
    const wrapper = mount(BaseButton, { props: { variant: 'tinted' } })
    expect(wrapper.classes()).toContain('bg-primary-50')
    expect(wrapper.classes()).toContain('text-primary-700')
  })

  it('has one disabled state, shared with loading', () => {
    const disabled = mount(BaseButton, { props: { disabled: true } })
    expect(disabled.attributes('disabled')).toBeDefined()
    expect(disabled.classes()).toContain('disabled:opacity-50')

    const loading = mount(BaseButton, { props: { loading: true } })
    expect(loading.attributes('disabled')).toBeDefined()
    expect(loading.find('svg.animate-spin').exists()).toBe(true)
  })

  it('renders a RouterLink when given a route, with the same look', async () => {
    const wrapper = mount(BaseButton, {
      props: { to: '/transactions', variant: 'secondary' },
      slots: { default: 'Voir les transactions' },
      global: { plugins: [router] },
    })
    await router.isReady()
    const link = wrapper.find('a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/transactions')
    expect(link.classes()).toContain('rounded-lg')
    expect(link.classes()).toContain('border-gray-300')
    expect(link.attributes('aria-disabled')).toBeUndefined()
  })

  it('takes a disabled link out of the tab order', async () => {
    const wrapper = mount(BaseButton, {
      props: { to: '/', disabled: true },
      global: { plugins: [router] },
    })
    await router.isReady()
    expect(wrapper.find('a').attributes('aria-disabled')).toBe('true')
    expect(wrapper.find('a').attributes('tabindex')).toBe('-1')
  })

  it('stretches with block', () => {
    const wrapper = mount(BaseButton, { props: { block: true } })
    expect(wrapper.classes()).toContain('w-full')
  })
})
