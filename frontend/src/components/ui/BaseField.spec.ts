import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseField from './BaseField.vue'

describe('BaseField', () => {
  it('ties the label to the input and passes attributes through', () => {
    const wrapper = mount(BaseField, {
      props: { label: 'E-mail' },
      attrs: {
        type: 'email',
        placeholder: 'vous@exemple.fr',
        'data-testid': 'f',
      },
    })
    const input = wrapper.find('input')
    expect(wrapper.find('label').attributes('for')).toBe(input.attributes('id'))
    expect(input.attributes('type')).toBe('email')
    expect(input.attributes('data-testid')).toBe('f')
    expect(wrapper.find('label').classes()).not.toContain('sr-only')
  })

  it('describes the field by its error and announces it', () => {
    const wrapper = mount(BaseField, {
      props: { label: 'Nom', error: 'Ce champ est requis' },
    })
    const input = wrapper.find('input')
    expect(input.attributes('aria-invalid')).toBe('true')
    const described = input.attributes('aria-describedby')
    expect(described).toBeDefined()
    expect(wrapper.find(`#${CSS.escape(described ?? '')}`).text()).toBe(
      'Ce champ est requis'
    )
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true)
  })

  it('shows a hint until an error replaces it', async () => {
    const wrapper = mount(BaseField, {
      props: { label: 'Nom', hint: 'Facultatif' },
    })
    expect(wrapper.text()).toContain('Facultatif')
    await wrapper.setProps({ error: 'Trop long' })
    expect(wrapper.text()).not.toContain('Facultatif')
    expect(wrapper.text()).toContain('Trop long')
  })

  it('renders a select with the given options, bound to the model', async () => {
    const wrapper = mount(BaseField, {
      props: { label: 'Tri', as: 'select', modelValue: 'b' },
      slots: {
        default: '<option value="a">A</option><option value="b">B</option>',
      },
    })
    const select = wrapper.find('select')
    expect(select.exists()).toBe(true)
    expect(select.element.value).toBe('b')
    await select.setValue('a')
    expect(wrapper.emitted('update:modelValue')?.map(e => e[0])).toEqual(['a'])
  })

  it('renders a textarea', () => {
    const wrapper = mount(BaseField, {
      props: { label: 'Note', as: 'textarea' },
    })
    expect(wrapper.find('textarea').exists()).toBe(true)
  })

  it('hides the label visually when its neighbour already says it', () => {
    const wrapper = mount(BaseField, {
      props: { label: 'Catégorie', labelHidden: true },
    })
    expect(wrapper.find('label').classes()).toContain('sr-only')
  })

  it('is compact in sm, still 16px on a phone', () => {
    const wrapper = mount(BaseField, { props: { label: 'x', size: 'sm' } })
    expect(wrapper.find('input').classes()).toEqual(
      expect.arrayContaining(['py-2', 'text-base', 'sm:text-sm'])
    )
  })

  describe('amount', () => {
    it('types with a decimal keyboard and hands back a number', async () => {
      const wrapper = mount(BaseField, {
        props: { label: 'Montant', amount: true, modelValue: null },
      })
      const input = wrapper.find('input')
      expect(input.attributes('type')).toBe('text')
      expect(input.attributes('inputmode')).toBe('decimal')
      await input.setValue('12,5')
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([12.5])
    })

    it('hands back null for an empty or unreadable field', async () => {
      const wrapper = mount(BaseField, {
        props: { label: 'Montant', amount: true, modelValue: 3 },
      })
      expect(wrapper.find('input').element.value).toBe('3')
      await wrapper.find('input').setValue('')
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
    })

    it('rewrites the text when the parent changes the value', async () => {
      const wrapper = mount(BaseField, {
        props: { label: 'Montant', amount: true, modelValue: 3 },
      })
      await wrapper.setProps({ modelValue: 42.5 })
      await nextTick()
      expect(wrapper.find('input').element.value).toBe('42,5')
    })

    it('with lazy, commits on change and shows the value the parent kept', async () => {
      const wrapper = mount(BaseField, {
        // A parent that listens but clamps everything back to 30.
        props: {
          label: 'Montant',
          amount: true,
          lazy: true,
          modelValue: 30,
          'onUpdate:modelValue': () => {},
        },
      })
      const input = wrapper.find('input')
      input.element.value = '100'
      await input.trigger('input')
      // Nothing yet: the keystrokes stay in the field.
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
      await input.trigger('change')
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([100])
      // The parent clamped back to the value it already had: the text follows.
      await nextTick()
      expect(input.element.value).toBe('30')
    })

    it('keeps what the user typed while it parses to the same number', async () => {
      const wrapper = mount(BaseField, {
        props: { label: 'Montant', amount: true, modelValue: null },
      })
      await wrapper.find('input').setValue('12,50')
      await wrapper.setProps({ modelValue: 12.5 })
      expect(wrapper.find('input').element.value).toBe('12,50')
    })
  })
})
