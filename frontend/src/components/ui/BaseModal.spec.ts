import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import BaseModal from './BaseModal.vue'

enableAutoUnmount(afterEach)

afterEach(() => {
  document.body.innerHTML = ''
})

const dialog = () => document.body.querySelector('[role="dialog"]')

const buttonByLabel = (label: string) =>
  Array.from(document.body.querySelectorAll('button')).find(
    b =>
      b.getAttribute('aria-label') === label || b.textContent?.trim() === label
  ) as HTMLButtonElement | undefined

function mountModal(
  props: Partial<InstanceType<typeof BaseModal>['$props']> = {},
  slots: Record<string, string> = {}
) {
  return mount(BaseModal, {
    props: { open: true, title: 'Un titre', ...props },
    slots: { default: '<p>Corps</p>', ...slots },
    attachTo: document.body,
  })
}

describe('BaseModal', () => {
  it('is named by its title, with the subtitle under it', () => {
    mountModal({ subtitle: 'Un sous-titre' })

    const id = dialog()?.getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(id)?.textContent?.trim()).toBe('Un titre')
    expect(dialog()?.textContent).toContain('Un sous-titre')
  })

  it('leaves room in its scroll area for a ring on edge-to-edge content', () => {
    mountModal({}, { default: '<p data-testid="body-content">Corps</p>' })

    const scroller = document.body.querySelector(
      '[data-testid="body-content"]'
    )?.parentElement
    // A scroll area clips its overflow: the gutter keeps a 2px ring plus
    // its 1px offset visible, the negative margin keeps the content in place.
    expect(scroller?.classList.contains('overflow-y-auto')).toBe(true)
    expect(scroller?.classList.contains('p-1')).toBe(true)
    expect(scroller?.classList.contains('-m-1')).toBe(true)
  })

  it('hands its attributes to the dialog element', () => {
    mount(BaseModal, {
      props: { open: true, title: 'T' },
      attrs: { 'data-testid': 'my-dialog' },
      attachTo: document.body,
    })

    expect(dialog()?.getAttribute('data-testid')).toBe('my-dialog')
  })

  it('closes from the cross, the backdrop and Escape', async () => {
    const wrapper = mountModal()

    buttonByLabel('Fermer')?.click()
    ;(
      document.body.querySelector('.fixed.inset-0.bg-black\\/50') as HTMLElement
    ).click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(wrapper.emitted('close')).toHaveLength(3)
  })

  it('stays put while not closable', () => {
    const wrapper = mountModal({ closable: false })

    expect(buttonByLabel('Fermer')).toBeUndefined()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('offers a back arrow for a wizard and emits back', async () => {
    const wrapper = mountModal({
      backLabel: 'Retour',
      backTestId: 'back-arrow',
    })

    const back = document.body.querySelector(
      '[data-testid="back-arrow"]'
    ) as HTMLButtonElement
    expect(back.getAttribute('aria-label')).toBe('Retour')
    back.click()

    expect(wrapper.emitted('back')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('opens on a warning badge when the tone says so', () => {
    mountModal({ tone: 'danger' })

    expect(
      document.body.querySelector('[data-testid="modal-tone"]')
    ).not.toBeNull()
  })

  it('lays the footer start beside the buttons', () => {
    mountModal(
      {},
      {
        'footer-start': '<span>3 à importer</span>',
        footer: '<button type="button">OK</button>',
      }
    )

    expect(
      document.body.querySelector('[data-testid="modal-footer-start"]')
        ?.textContent
    ).toContain('3 à importer')
  })

  describe('with a draft', () => {
    it('asks before closing, and keeps the draft on cancel', async () => {
      const wrapper = mountModal({ dirty: true })

      buttonByLabel('Fermer')?.click()
      await flushPromises()

      expect(wrapper.emitted('close')).toBeUndefined()
      const guard = document.body.querySelector(
        '[data-testid="modal-dirty-guard"]'
      )
      expect(guard?.textContent).toContain('Modifications non enregistrées')

      buttonByLabel('Continuer la saisie')?.click()
      await flushPromises()

      expect(
        document.body.querySelector('[data-testid="modal-dirty-guard"]')
      ).toBeNull()
      expect(wrapper.emitted('close')).toBeUndefined()
      expect(dialog()).not.toBeNull()
    })

    it('closes once the user confirms the loss', async () => {
      const wrapper = mountModal({ dirty: true })

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()
      ;(
        document.body.querySelector(
          '[data-testid="modal-dirty-discard"]'
        ) as HTMLButtonElement
      ).click()
      await flushPromises()

      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('lets Escape reach the guard only, not the dialog underneath', async () => {
      const wrapper = mountModal({ dirty: true })

      buttonByLabel('Fermer')?.click()
      await flushPromises()
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()

      expect(
        document.body.querySelector('[data-testid="modal-dirty-guard"]')
      ).toBeNull()
      expect(dialog()).not.toBeNull()
      expect(wrapper.emitted('close')).toBeUndefined()
    })
  })

  it('renders nothing while closed', () => {
    const Host = defineComponent({
      render: () => h(BaseModal, { open: false, title: 'T' }),
    })
    mount(Host, { attachTo: document.body })

    expect(dialog()).toBeNull()
  })
})
