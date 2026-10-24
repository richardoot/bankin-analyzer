import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import ReadingMenu from './ReadingMenu.vue'

const phone = vi.hoisted(() => ({ value: false }))
vi.mock('@/composables/useMediaQuery', () => ({
  useMediaQuery: () => ref(phone.value),
}))

enableAutoUnmount(afterEach)

afterEach(() => {
  document.body.innerHTML = ''
})

type Props = InstanceType<typeof ReadingMenu>['$props']

function mountMenu(props: Partial<Props> = {}) {
  return mount(ReadingMenu, {
    props: {
      breakdownMode: 'everyday',
      deductReimbursements: true,
      deductPendingReimbursements: true,
      hasExceptionalExpenses: true,
      ...props,
    },
    attachTo: document.body,
  })
}

const button = (wrapper: ReturnType<typeof mountMenu>) =>
  wrapper.get('[data-testid="reading-menu-button"]')

describe('ReadingMenu', () => {
  beforeEach(() => {
    phone.value = false
  })

  describe('the button says the state', () => {
    it('reads the default: vie courante, both reimbursements taken off', () => {
      const wrapper = mountMenu()

      expect(button(wrapper).text()).toBe(
        'Lecture : vie courante · remboursements déduits'
      )
      expect(button(wrapper).attributes('aria-haspopup')).toBe('dialog')
      expect(button(wrapper).attributes('aria-expanded')).toBe('false')
    })

    it.each([
      [false, true, 'Lecture : tout · remboursements en attente déduits'],
      [true, false, 'Lecture : tout · remboursements reçus déduits'],
      [false, false, 'Lecture : tout · remboursements non déduits'],
    ])(
      'names which reimbursements come off (reçus %s, en attente %s)',
      (received, pending, label) => {
        const wrapper = mountMenu({
          breakdownMode: 'real',
          deductReimbursements: received,
          deductPendingReimbursements: pending,
        })

        expect(button(wrapper).text()).toBe(label)
      }
    )

    it('leaves the reading out when the two readings are the same figures', async () => {
      const wrapper = mountMenu({ hasExceptionalExpenses: false })

      expect(button(wrapper).text()).toBe('Lecture : remboursements déduits')
      await button(wrapper).trigger('click')
      expect(
        wrapper.find('[data-testid="breakdown-mode-everyday"]').exists()
      ).toBe(false)
    })
  })

  describe('the panel', () => {
    it('opens on the three commands, each handing its change back', async () => {
      const wrapper = mountMenu()

      await button(wrapper).trigger('click')

      expect(button(wrapper).attributes('aria-expanded')).toBe('true')
      const panel = wrapper.get('[data-testid="reading-menu-panel"]')
      expect(panel.attributes('role')).toBe('dialog')
      expect(button(wrapper).attributes('aria-controls')).toBe(
        panel.attributes('id')
      )

      await wrapper.get('[data-testid="breakdown-mode-real"]').trigger('click')
      await wrapper
        .get('[data-testid="toggle-deduct-reimbursements"]')
        .trigger('click')
      await wrapper
        .get('[data-testid="toggle-deduct-pending"]')
        .trigger('click')

      expect(wrapper.emitted('update:breakdownMode')).toEqual([['real']])
      expect(wrapper.emitted('update:deductReimbursements')).toEqual([[false]])
      expect(wrapper.emitted('update:deductPendingReimbursements')).toEqual([
        [false],
      ])
    })

    it('tells the saved preference from the reading of the moment', async () => {
      const wrapper = mountMenu()
      await button(wrapper).trigger('click')

      expect(
        wrapper.get('[data-testid="reading-menu-panel"]').text()
      ).toContain(
        'Ces réglages valent pour le tableau de bord, les tendances et le budget. « Reçus » est retenu par ce navigateur, « en attente » est enregistré sur votre compte.'
      )
    })

    it('says when the « en attente » preference could not be kept', async () => {
      const wrapper = mountMenu({ pendingSyncError: 'Réseau indisponible' })
      await button(wrapper).trigger('click')

      const alert = wrapper.get('[data-testid="dashboard-pending-sync-error"]')
      expect(alert.text()).toContain('Réseau indisponible')
    })

    it('has no alert while the preference is kept', async () => {
      const wrapper = mountMenu()
      await button(wrapper).trigger('click')

      expect(
        wrapper.find('[data-testid="dashboard-pending-sync-error"]').exists()
      ).toBe(false)
    })

    it('carries the note on smoothed purchases, in the reading it follows', async () => {
      const wrapper = mountMenu({
        hasExceptionalExpenses: false,
        hasAmortizedExpenses: true,
      })
      await button(wrapper).trigger('click')

      expect(
        wrapper.get('[data-testid="dashboard-amortized-note"]').text()
      ).toContain('tranches mensuelles')
      await wrapper.setProps({ breakdownMode: 'real' })
      expect(
        wrapper.get('[data-testid="dashboard-amortized-note"]').text()
      ).toBe('Les achats lissés comptent en entier à leur date.')
    })

    it('closes on Escape and hands the keyboard back to the button', async () => {
      const wrapper = mountMenu()
      await button(wrapper).trigger('click')

      await wrapper
        .get('[data-testid="reading-menu-panel"]')
        .trigger('keydown', { key: 'Escape' })
      await flushPromises()

      expect(wrapper.find('[data-testid="reading-menu-panel"]').exists()).toBe(
        false
      )
      expect(document.activeElement).toBe(button(wrapper).element)
    })

    it('closes on a click elsewhere', async () => {
      const wrapper = mountMenu()
      await button(wrapper).trigger('click')

      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true })
      )
      await flushPromises()

      expect(wrapper.find('[data-testid="reading-menu-panel"]').exists()).toBe(
        false
      )
    })

    it('rises as a sheet on a phone', async () => {
      phone.value = true
      const wrapper = mountMenu()
      await button(wrapper).trigger('click')
      await flushPromises()

      const sheet = document.body.querySelector(
        '[data-testid="reading-menu-panel"]'
      )
      expect(sheet?.getAttribute('role')).toBe('dialog')
      expect(sheet?.textContent).toContain('Lecture des chiffres')
      expect(
        sheet?.querySelector('[data-testid="toggle-deduct-pending"]')
      ).not.toBeNull()
    })
  })
})
