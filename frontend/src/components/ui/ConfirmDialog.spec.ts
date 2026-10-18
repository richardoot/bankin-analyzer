import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'

enableAutoUnmount(afterEach)

const button = (label: string) =>
  Array.from(document.body.querySelectorAll('button')).find(
    b => b.textContent?.trim() === label
  ) as HTMLButtonElement | undefined

describe('ConfirmDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('is named by its question', () => {
    mount(ConfirmDialog, {
      props: { open: true, title: 'Supprimer cet import ?' },
      slots: { default: 'Les transactions partent avec.' },
      attachTo: document.body,
    })

    const dialog = document.body.querySelector('[role="dialog"]')
    const id = dialog?.getAttribute('aria-labelledby')
    expect(id).toBeTruthy()
    expect(document.getElementById(id ?? '')?.textContent?.trim()).toBe(
      'Supprimer cet import ?'
    )
  })

  it('emits confirm and cancel from its two buttons', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Q ?', confirmLabel: 'Oui' },
      attachTo: document.body,
    })

    button('Oui')?.click()
    button('Annuler')?.click()

    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('keeps the red button locked until the expected text is typed back', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Q ?', typedConfirmation: 'Livret A' },
      attachTo: document.body,
    })

    const confirm = button('Supprimer')
    expect(confirm?.disabled).toBe(true)
    confirm?.click()
    expect(wrapper.emitted('confirm')).toBeUndefined()

    const input = document.body.querySelector(
      '[data-testid="confirm-typed"]'
    ) as HTMLInputElement
    input.value = 'livret a'
    input.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()

    expect(button('Supprimer')?.disabled).toBe(false)
    button('Supprimer')?.click()
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })
})
