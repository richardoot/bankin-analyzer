import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import HeroSection from './HeroSection.vue'

function mountHero() {
  return mount(HeroSection, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('HeroSection', () => {
  it('leads with bank synchronisation', () => {
    const wrapper = mountHero()

    expect(wrapper.find('h1').text()).toContain('synchronisés')
    expect(wrapper.text()).toContain('synchronisation bancaire')
  })

  it('offers sign-up as the one primary action — the page is for visitors only', () => {
    const wrapper = mountHero()

    const cta = wrapper.findComponent<typeof RouterLinkStub>(
      '[data-testid="hero-primary-cta"]'
    )
    expect(cta.props('to')).toBe('/login?signup=true')
    expect(cta.text()).toContain('Connecter ma banque')
  })

  it('points the secondary action at the features section', () => {
    const wrapper = mountHero()

    expect(
      wrapper.find('[data-testid="hero-secondary-cta"]').attributes('href')
    ).toBe('#fonctionnalites')
  })

  it('keeps the CSV import as the visible fallback', () => {
    expect(mountHero().text()).toContain('CSV Bankin')
  })
})
