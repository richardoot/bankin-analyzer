import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Footer from './Footer.vue'

describe('Footer', () => {
  it('links the legal pages', () => {
    const wrapper = mount(Footer, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    })

    expect(
      wrapper.get('[data-testid="footer-privacy-link"]').attributes('href')
    ).toBe('/privacy')
    expect(
      wrapper.get('[data-testid="footer-terms-link"]').attributes('href')
    ).toBe('/terms')
  })
})
