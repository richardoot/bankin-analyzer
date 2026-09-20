import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FeaturesSection from './FeaturesSection.vue'

describe('FeaturesSection', () => {
  it('is the target of the hero’s secondary action', () => {
    const wrapper = mount(FeaturesSection)

    expect(wrapper.find('#fonctionnalites').exists()).toBe(true)
  })

  it('explains the product in three steps, the first being the bank connection', () => {
    const wrapper = mount(FeaturesSection)

    const steps = wrapper.findAll('[data-testid="steps"] > li')
    expect(steps).toHaveLength(3)
    expect(steps[0]?.text()).toContain('Connectez votre banque')
  })

  it('gives bank synchronisation its own spotlight before the feature grid', () => {
    const wrapper = mount(FeaturesSection)

    const spotlight = wrapper.find('[data-testid="sync-spotlight"]')
    expect(spotlight.exists()).toBe(true)
    expect(spotlight.text()).toContain('Chaque nuit')
    expect(spotlight.text()).toContain('DSP2')
    expect(spotlight.text()).toContain('sans doublon')
  })

  it('lists synchronisation first among the features', () => {
    const wrapper = mount(FeaturesSection)

    const features = wrapper.findAll('[data-testid="features"] > li')
    expect(features[0]?.text()).toContain('Synchronisation bancaire')
    expect(features.map(f => f.find('h3').text())).toEqual(
      expect.arrayContaining([
        'Catégorisation automatique',
        'Budget prévisionnel',
        'Remboursements partagés',
        'Import CSV Bankin',
      ])
    )
  })
})
