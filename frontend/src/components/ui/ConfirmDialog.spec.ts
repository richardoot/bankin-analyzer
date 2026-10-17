import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'

enableAutoUnmount(afterEach)

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

    const buttons = Array.from(document.body.querySelectorAll('button'))
    buttons.find(b => b.textContent?.trim() === 'Oui')?.click()
    buttons.find(b => b.textContent?.trim() === 'Annuler')?.click()

    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
