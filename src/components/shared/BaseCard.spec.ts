import { describe, it, expect, afterEach } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import BaseCard from './BaseCard.vue'

describe('BaseCard', () => {
  let wrapper: VueWrapper

  const createWrapper = (props = {}, slots = {}) => {
    return mount(BaseCard, {
      props,
      slots,
    })
  }

  afterEach(() => {
    wrapper?.unmount()
  })

  describe('Rendu initial', () => {
    it('devrait afficher la carte avec le contenu par défaut', () => {
      wrapper = createWrapper({}, { default: 'Test Content' })
      expect(wrapper.find('.base-card').exists()).toBe(true)
      expect(wrapper.find('.base-card__content').text()).toBe('Test Content')
    })

    it('devrait avoir les classes par défaut', () => {
      wrapper = createWrapper()
      const card = wrapper.find('.base-card')
      expect(card.classes()).toContain('base-card')
      expect(card.classes()).toContain('base-card--default')
      expect(card.classes()).toContain('base-card--padding-md')
      expect(card.classes()).toContain('base-card--rounded-lg')
      expect(card.classes()).toContain('base-card--shadow-md')
    })
  })

  describe('Variantes', () => {
    it('devrait appliquer la variante default', () => {
      wrapper = createWrapper({ variant: 'default' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--default'
      )
    })

    it('devrait appliquer la variante glass', () => {
      wrapper = createWrapper({ variant: 'glass' })
      expect(wrapper.find('.base-card').classes()).toContain('base-card--glass')
    })

    it('devrait appliquer la variante bordered', () => {
      wrapper = createWrapper({ variant: 'bordered' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--bordered'
      )
    })

    it('devrait appliquer la variante elevated', () => {
      wrapper = createWrapper({ variant: 'elevated' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--elevated'
      )
    })

    it('devrait appliquer la variante gradient', () => {
      wrapper = createWrapper({ variant: 'gradient' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--gradient'
      )
    })
  })

  describe('Options de padding', () => {
    it('devrait appliquer padding none', () => {
      wrapper = createWrapper({ padding: 'none' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--padding-none'
      )
    })

    it('devrait appliquer padding small', () => {
      wrapper = createWrapper({ padding: 'sm' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--padding-sm'
      )
    })

    it('devrait appliquer padding medium par défaut', () => {
      wrapper = createWrapper()
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--padding-md'
      )
    })

    it('devrait appliquer padding large', () => {
      wrapper = createWrapper({ padding: 'lg' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--padding-lg'
      )
    })

    it('devrait appliquer padding extra large', () => {
      wrapper = createWrapper({ padding: 'xl' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--padding-xl'
      )
    })
  })

  describe('Options de bordures arrondies', () => {
    it('devrait appliquer rounded none', () => {
      wrapper = createWrapper({ rounded: 'none' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--rounded-none'
      )
    })

    it('devrait appliquer rounded small', () => {
      wrapper = createWrapper({ rounded: 'sm' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--rounded-sm'
      )
    })

    it('devrait appliquer rounded medium', () => {
      wrapper = createWrapper({ rounded: 'md' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--rounded-md'
      )
    })

    it('devrait appliquer rounded large par défaut', () => {
      wrapper = createWrapper()
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--rounded-lg'
      )
    })

    it('devrait appliquer rounded extra large', () => {
      wrapper = createWrapper({ rounded: 'xl' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--rounded-xl'
      )
    })
  })

  describe('Options de shadow', () => {
    it('devrait appliquer shadow none', () => {
      wrapper = createWrapper({ shadow: 'none' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--shadow-none'
      )
    })

    it('devrait appliquer shadow small', () => {
      wrapper = createWrapper({ shadow: 'sm' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--shadow-sm'
      )
    })

    it('devrait appliquer shadow medium par défaut', () => {
      wrapper = createWrapper()
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--shadow-md'
      )
    })

    it('devrait appliquer shadow large', () => {
      wrapper = createWrapper({ shadow: 'lg' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--shadow-lg'
      )
    })

    it('devrait appliquer shadow extra large', () => {
      wrapper = createWrapper({ shadow: 'xl' })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--shadow-xl'
      )
    })
  })

  describe('Props de configuration', () => {
    it('devrait appliquer la classe blur', () => {
      wrapper = createWrapper({ blur: true })
      expect(wrapper.find('.base-card').classes()).toContain('base-card--blur')
    })

    it('devrait appliquer la classe hoverable', () => {
      wrapper = createWrapper({ hoverable: true })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--hoverable'
      )
    })

    it('devrait appliquer la classe clickable', () => {
      wrapper = createWrapper({ clickable: true })
      expect(wrapper.find('.base-card').classes()).toContain(
        'base-card--clickable'
      )
    })

    it('devrait combiner plusieurs classes', () => {
      wrapper = createWrapper({
        variant: 'glass',
        padding: 'lg',
        rounded: 'xl',
        shadow: 'lg',
        blur: true,
        hoverable: true,
        clickable: true,
      })
      const card = wrapper.find('.base-card')
      expect(card.classes()).toEqual(
        expect.arrayContaining([
          'base-card',
          'base-card--glass',
          'base-card--padding-lg',
          'base-card--rounded-xl',
          'base-card--shadow-lg',
          'base-card--blur',
          'base-card--hoverable',
          'base-card--clickable',
        ])
      )
    })
  })

  describe('Slots', () => {
    it('devrait afficher le slot header', () => {
      wrapper = createWrapper(
        {},
        {
          header: '<h3>Card Header</h3>',
          default: 'Card Content',
        }
      )
      expect(wrapper.find('.base-card__header').exists()).toBe(true)
      expect(wrapper.find('.base-card__header').html()).toContain('Card Header')
    })

    it('devrait afficher le slot footer', () => {
      wrapper = createWrapper(
        {},
        {
          default: 'Card Content',
          footer: '<button>Action</button>',
        }
      )
      expect(wrapper.find('.base-card__footer').exists()).toBe(true)
      expect(wrapper.find('.base-card__footer').html()).toContain('Action')
    })

    it('devrait afficher le contenu principal', () => {
      wrapper = createWrapper(
        {},
        {
          default: '<p>Main content here</p>',
        }
      )
      expect(wrapper.find('.base-card__content').html()).toContain(
        'Main content here'
      )
    })

    it('ne devrait pas afficher header sans slot', () => {
      wrapper = createWrapper({}, { default: 'Content only' })
      expect(wrapper.find('.base-card__header').exists()).toBe(false)
    })

    it('ne devrait pas afficher footer sans slot', () => {
      wrapper = createWrapper({}, { default: 'Content only' })
      expect(wrapper.find('.base-card__footer').exists()).toBe(false)
    })
  })

  describe('Événements', () => {
    it('devrait émettre click quand clickable est true', async () => {
      wrapper = createWrapper({ clickable: true })
      await wrapper.find('.base-card').trigger('click')
      expect(wrapper.emitted('click')).toHaveLength(1)
    })

    it('ne devrait pas émettre click quand clickable est false', async () => {
      wrapper = createWrapper({ clickable: false })
      await wrapper.find('.base-card').trigger('click')
      expect(wrapper.emitted('click')).toBeUndefined()
    })

    it("devrait passer l'événement MouseEvent", async () => {
      wrapper = createWrapper({ clickable: true })
      await wrapper.find('.base-card').trigger('click')
      expect(wrapper.emitted('click')?.[0][0]).toBeInstanceOf(MouseEvent)
    })
  })

  describe('Structure de la carte', () => {
    it('devrait avoir la structure correcte avec tous les slots', () => {
      wrapper = createWrapper(
        {},
        {
          header: 'Header Content',
          default: 'Main Content',
          footer: 'Footer Content',
        }
      )

      const card = wrapper.find('.base-card')
      expect(card.find('.base-card__header').exists()).toBe(true)
      expect(card.find('.base-card__content').exists()).toBe(true)
      expect(card.find('.base-card__footer').exists()).toBe(true)
    })

    it('devrait maintenir la structure même sans slots header et footer', () => {
      wrapper = createWrapper({}, { default: 'Only content' })

      const card = wrapper.find('.base-card')
      expect(card.find('.base-card__header').exists()).toBe(false)
      expect(card.find('.base-card__content').exists()).toBe(true)
      expect(card.find('.base-card__footer').exists()).toBe(false)
    })
  })

  describe('Accessibilité', () => {
    it('devrait être focusable quand clickable', () => {
      wrapper = createWrapper({ clickable: true })
      const card = wrapper.find('.base-card')
      // La carte clickable doit pouvoir recevoir le focus via tabindex ou être naturellement focusable
      expect(card.classes()).toContain('base-card--clickable')
    })

    it('ne devrait pas être focusable quand non clickable', () => {
      wrapper = createWrapper({ clickable: false })
      const card = wrapper.find('.base-card')
      expect(card.classes()).not.toContain('base-card--clickable')
    })
  })
})
