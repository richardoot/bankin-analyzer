import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import InlineAlert from './InlineAlert.vue'

describe('InlineAlert', () => {
  it('announces an error at once', () => {
    const wrapper = mount(InlineAlert, {
      slots: { default: 'Le chargement a échoué.' },
    })
    expect(wrapper.attributes('role')).toBe('alert')
    expect(wrapper.classes()).toContain('border-red-200')
    expect(wrapper.text()).toContain('Le chargement a échoué.')
  })

  it('lets the other variants wait their turn', () => {
    for (const variant of ['warning', 'info', 'success'] as const) {
      const wrapper = mount(InlineAlert, { props: { variant } })
      expect(wrapper.attributes('role')).toBe('status')
    }
    expect(
      mount(InlineAlert, { props: { variant: 'warning' } }).classes()
    ).toContain('border-amber-200')
  })

  it('puts the title above the message', () => {
    const wrapper = mount(InlineAlert, {
      props: { title: 'Impossible de charger' },
      slots: { default: 'Réseau indisponible' },
    })
    expect(wrapper.find('p.font-medium').text()).toBe('Impossible de charger')
  })

  it('offers a retry inside the message, busy while it runs', async () => {
    const wrapper = mount(InlineAlert, {
      props: { retryLabel: 'Réessayer' },
    })
    const button = wrapper.find('button')
    expect(button.text()).toBe('Réessayer')
    await button.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)

    await wrapper.setProps({ retrying: true })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('has no button when nothing can be retried', () => {
    expect(mount(InlineAlert).find('button').exists()).toBe(false)
  })
})
