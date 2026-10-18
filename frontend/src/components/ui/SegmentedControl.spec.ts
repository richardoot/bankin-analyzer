import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SegmentedControl from './SegmentedControl.vue'

const options = [
  { value: '3m', label: '3 mois', shortLabel: '3M', testId: 'p-3m' },
  { value: '6m', label: '6 mois', testId: 'p-6m' },
  { value: 'all', label: 'Tout', testId: 'p-all', disabled: true },
  { value: 'custom', label: 'Personnalisé', testId: 'p-custom' },
]

function build(modelValue = '6m') {
  return mount(SegmentedControl, {
    props: { options, modelValue, label: 'Période' },
    attachTo: document.body,
  })
}

describe('SegmentedControl', () => {
  it('turns into a tablist whose tabs name their panels', () => {
    const wrapper = mount(SegmentedControl, {
      props: {
        semantics: 'tablist',
        label: 'Abonnements',
        modelValue: 'ended',
        options: [
          {
            value: 'current',
            label: 'En cours',
            id: 't-current',
            controls: 'p-current',
          },
          {
            value: 'ended',
            label: 'Terminés',
            id: 't-ended',
            controls: 'p-ended',
          },
        ],
      },
    })
    expect(wrapper.attributes('role')).toBe('tablist')
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(2)
    expect(tabs.map(t => t.attributes('aria-selected'))).toEqual([
      'false',
      'true',
    ])
    expect(tabs.map(t => t.attributes('aria-controls'))).toEqual([
      'p-current',
      'p-ended',
    ])
    expect(tabs.map(t => t.attributes('id'))).toEqual(['t-current', 't-ended'])
    expect(tabs[0]?.attributes('aria-checked')).toBeUndefined()
    expect(wrapper.find('[role="radio"]').exists()).toBe(false)
  })

  it('is a named radio group whose selection is checked and primary', () => {
    const wrapper = build()
    expect(wrapper.attributes('role')).toBe('radiogroup')
    expect(wrapper.attributes('aria-label')).toBe('Période')
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios.map(r => r.attributes('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ])
    expect(radios[1]?.classes()).toContain('bg-primary-600')
    expect(radios[0]?.classes()).not.toContain('bg-primary-600')
    wrapper.unmount()
  })

  it('keeps one tab stop, on the selection', () => {
    const wrapper = build()
    expect(
      wrapper.findAll('[role="radio"]').map(r => r.attributes('tabindex'))
    ).toEqual(['-1', '0', '-1', '-1'])
    wrapper.unmount()
  })

  it('selects on click and carries the test ids', async () => {
    const wrapper = build()
    await wrapper.get('[data-testid="p-custom"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['custom'])
    wrapper.unmount()
  })

  it('moves with the arrows, skipping a disabled option, and wraps', async () => {
    const wrapper = build()
    const radios = wrapper.findAll('[role="radio"]')
    await radios[1]?.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['custom'])
    await radios[3]?.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['3m'])
    await radios[0]?.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['custom'])
    await radios[0]?.trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['custom'])
    await radios[0]?.trigger('keydown', { key: 'Home' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['3m'])
    wrapper.unmount()
  })

  it('shows the short label on a phone and the full one from sm up', () => {
    const wrapper = build()
    const first = wrapper.findAll('[role="radio"]')[0]
    expect(first?.find('.sm\\:hidden').text()).toBe('3M')
    expect(first?.find('.hidden.sm\\:inline').text()).toBe('3 mois')
    wrapper.unmount()
  })

  it('is 44px tall on a touch screen and can spread across a phone', () => {
    const wrapper = mount(SegmentedControl, {
      props: { options, modelValue: '3m', label: 'x', fullWidth: true },
    })
    expect(wrapper.find('[role="radio"]').classes()).toContain(
      'pointer-coarse:min-h-[44px]'
    )
    expect(wrapper.classes()).toContain('grid')
  })

  it('can be named by a visible caption instead', () => {
    const wrapper = mount(SegmentedControl, {
      props: { options, modelValue: '3m', labelledBy: 'cap' },
    })
    expect(wrapper.attributes('aria-labelledby')).toBe('cap')
    expect(wrapper.attributes('aria-label')).toBeUndefined()
  })
})
