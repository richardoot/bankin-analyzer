import { describe, it, expect, afterEach, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import BaseModal from './BaseModal.vue'

describe('BaseModal', () => {
  let wrapper: VueWrapper

  const createWrapper = (props = {}, slots = {}) => {
    return mount(BaseModal, {
      props: {
        isOpen: true,
        title: 'Test Modal',
        ...props,
      },
      slots,
    })
  }

  afterEach(() => {
    wrapper?.unmount()
  })

  describe('Rendu initial', () => {
    it('ne devrait pas afficher la modale quand isOpen est false', () => {
      wrapper = createWrapper({ isOpen: false })
      expect(wrapper.find('.modal-overlay').exists()).toBe(false)
    })

    it('devrait afficher la modale quand isOpen est true', () => {
      wrapper = createWrapper()
      expect(wrapper.find('.modal-overlay').exists()).toBe(true)
      expect(wrapper.find('.modal-content').exists()).toBe(true)
    })

    it('devrait afficher le titre par défaut', () => {
      wrapper = createWrapper()
      expect(wrapper.find('.modal-title').text()).toBe('Test Modal')
    })

    it('devrait afficher le bouton de fermeture par défaut', () => {
      wrapper = createWrapper()
      expect(wrapper.find('.modal-close-button').exists()).toBe(true)
    })

    it('ne devrait pas afficher le bouton de fermeture si showCloseButton est false', () => {
      wrapper = createWrapper({ showCloseButton: false })
      expect(wrapper.find('.modal-close-button').exists()).toBe(false)
    })
  })

  describe('Props de configuration', () => {
    it('devrait appliquer la maxWidth personnalisée', () => {
      wrapper = createWrapper({ maxWidth: '800px' })
      expect(wrapper.find('.modal-content').attributes('style')).toContain(
        'max-width: 800px'
      )
    })

    it('devrait utiliser la maxWidth par défaut', () => {
      wrapper = createWrapper()
      expect(wrapper.find('.modal-content').attributes('style')).toContain(
        'max-width: 600px'
      )
    })

    it('ne devrait pas afficher le header si pas de titre ni de bouton fermer', () => {
      wrapper = createWrapper({ title: '', showCloseButton: false })
      expect(wrapper.find('.modal-header').exists()).toBe(false)
    })
  })

  describe('Slots', () => {
    it('devrait afficher le contenu du slot par défaut', () => {
      wrapper = createWrapper(
        {},
        {
          default: '<p>Contenu personnalisé</p>',
        }
      )
      expect(wrapper.find('.modal-body').html()).toContain(
        'Contenu personnalisé'
      )
    })

    it('devrait afficher le slot header personnalisé', () => {
      wrapper = createWrapper(
        {},
        {
          header: '<h1>Titre personnalisé</h1>',
        }
      )
      expect(wrapper.find('.modal-header').html()).toContain(
        'Titre personnalisé'
      )
    })

    it('devrait afficher le slot footer', () => {
      wrapper = createWrapper(
        {},
        {
          footer: '<button>Action personnalisée</button>',
        }
      )
      expect(wrapper.find('.modal-footer').exists()).toBe(true)
      expect(wrapper.find('.modal-footer').html()).toContain(
        'Action personnalisée'
      )
    })

    it('ne devrait pas afficher le footer sans slot', () => {
      wrapper = createWrapper()
      expect(wrapper.find('.modal-footer').exists()).toBe(false)
    })
  })

  describe('Événements', () => {
    it('devrait émettre close lors du clic sur le bouton fermer', async () => {
      wrapper = createWrapper()
      await wrapper.find('.modal-close-button').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('devrait émettre close lors du clic sur overlay par défaut', async () => {
      wrapper = createWrapper()
      await wrapper.find('.modal-overlay').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('ne devrait pas émettre close lors du clic sur overlay si closeOnOverlay est false', async () => {
      wrapper = createWrapper({ closeOnOverlay: false })
      await wrapper.find('.modal-overlay').trigger('click')
      expect(wrapper.emitted('close')).toBeUndefined()
    })

    it('ne devrait pas émettre close lors du clic sur le contenu', async () => {
      wrapper = createWrapper()
      await wrapper.find('.modal-content').trigger('click')
      expect(wrapper.emitted('close')).toBeUndefined()
    })
  })

  describe('Accessibilité', () => {
    it("devrait avoir les attributs appropriés pour l'accessibilité", () => {
      wrapper = createWrapper()

      const closeButton = wrapper.find('.modal-close-button')
      expect(closeButton.attributes('type')).toBe('button')
    })

    it('devrait fournir la fonction close dans les slots', () => {
      const mockSlot = vi.fn()
      wrapper = createWrapper(
        {},
        {
          default: mockSlot,
        }
      )

      expect(mockSlot).toHaveBeenCalledWith(
        expect.objectContaining({
          close: expect.any(Function),
        })
      )
    })
  })

  describe('Styles responsives', () => {
    it('devrait avoir les classes CSS appropriées', () => {
      wrapper = createWrapper()

      expect(wrapper.find('.modal-overlay').classes()).toContain(
        'modal-overlay'
      )
      expect(wrapper.find('.modal-content').classes()).toContain(
        'modal-content'
      )
      expect(wrapper.find('.modal-header').classes()).toContain('modal-header')
      expect(wrapper.find('.modal-body').classes()).toContain('modal-body')
    })
  })
})
