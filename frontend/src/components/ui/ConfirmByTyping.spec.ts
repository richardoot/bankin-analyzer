import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import ConfirmByTyping, {
  matchesTypedConfirmation,
} from './ConfirmByTyping.vue'

enableAutoUnmount(afterEach)

describe('matchesTypedConfirmation', () => {
  it('ignores case and surrounding spaces, never an empty expectation', () => {
    expect(matchesTypedConfirmation('  compte joint ', 'Compte Joint')).toBe(
      true
    )
    expect(matchesTypedConfirmation('Compte', 'Compte Joint')).toBe(false)
    expect(matchesTypedConfirmation('', '')).toBe(false)
  })
})

describe('ConfirmByTyping', () => {
  it('names the field after what must be typed', () => {
    const wrapper = mount(ConfirmByTyping, { props: { expected: 'Livret A' } })

    const label = wrapper.get('label')
    expect(label.text()).toContain('Livret A')
    expect(label.attributes('for')).toBe(wrapper.get('input').attributes('id'))
  })

  it('reports the match through confirmed', async () => {
    const wrapper = mount(ConfirmByTyping, {
      props: { expected: 'Livret A', confirmed: false },
    })

    await wrapper.get('input').setValue('livret a')

    const updates = wrapper.emitted('update:confirmed') ?? []
    expect(updates.at(-1)).toEqual([true])
  })

  it('starts over when pointed at another item', async () => {
    const wrapper = mount(ConfirmByTyping, {
      props: { expected: 'Livret A' },
    })
    await wrapper.get('input').setValue('Livret A')

    await wrapper.setProps({ expected: 'Compte Joint' })

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
    expect(wrapper.emitted('update:confirmed')?.at(-1)).toEqual([false])
  })

  it('submits on Enter only once the text matches', async () => {
    const wrapper = mount(ConfirmByTyping, {
      props: { expected: 'SUPPRIMER' },
    })

    await wrapper.get('input').setValue('SUPP')
    await wrapper.get('input').trigger('keyup.enter')
    expect(wrapper.emitted('submit')).toBeUndefined()

    await wrapper.get('input').setValue('supprimer')
    await wrapper.get('input').trigger('keyup.enter')
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('passes a test id through to the input', () => {
    const wrapper = mount(ConfirmByTyping, {
      props: { expected: 'X' },
      attrs: { 'data-testid': 'typed' },
    })

    expect(wrapper.get('input').attributes('data-testid')).toBe('typed')
  })
})
