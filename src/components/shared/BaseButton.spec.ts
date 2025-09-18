import { describe, it, expect, afterEach, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import BaseButton from './BaseButton.vue'

describe('BaseButton', () => {
  let wrapper: VueWrapper

  const createWrapper = (props = {}, slots = {}) => {
    return mount(BaseButton, {
      props,
      slots,
    })
  }

  afterEach(() => {
    wrapper?.unmount()
  })

  describe('Rendu initial', () => {
    it('devrait afficher un bouton avec le contenu par défaut', () => {
      wrapper = createWrapper({}, { default: 'Test Button' })
      expect(wrapper.find('button').exists()).toBe(true)
      expect(wrapper.text()).toBe('Test Button')
    })

    it('devrait avoir les classes par défaut', () => {
      wrapper = createWrapper()
      const button = wrapper.find('button')
      expect(button.classes()).toContain('base-btn')
      expect(button.classes()).toContain('base-btn--primary')
      expect(button.classes()).toContain('base-btn--md')
    })

    it('devrait avoir le type button par défaut', () => {
      wrapper = createWrapper()
      expect(wrapper.find('button').attributes('type')).toBe('button')
    })
  })

  describe('Variantes', () => {
    it('devrait appliquer la variante primary', () => {
      wrapper = createWrapper({ variant: 'primary' })
      expect(wrapper.find('button').classes()).toContain('base-btn--primary')
    })

    it('devrait appliquer la variante secondary', () => {
      wrapper = createWrapper({ variant: 'secondary' })
      expect(wrapper.find('button').classes()).toContain('base-btn--secondary')
    })

    it('devrait appliquer la variante danger', () => {
      wrapper = createWrapper({ variant: 'danger' })
      expect(wrapper.find('button').classes()).toContain('base-btn--danger')
    })

    it('devrait appliquer la variante ghost', () => {
      wrapper = createWrapper({ variant: 'ghost' })
      expect(wrapper.find('button').classes()).toContain('base-btn--ghost')
    })
  })

  describe('Tailles', () => {
    it('devrait appliquer la taille small', () => {
      wrapper = createWrapper({ size: 'sm' })
      expect(wrapper.find('button').classes()).toContain('base-btn--sm')
    })

    it('devrait appliquer la taille medium par défaut', () => {
      wrapper = createWrapper()
      expect(wrapper.find('button').classes()).toContain('base-btn--md')
    })

    it('devrait appliquer la taille large', () => {
      wrapper = createWrapper({ size: 'lg' })
      expect(wrapper.find('button').classes()).toContain('base-btn--lg')
    })
  })

  describe('Props de configuration', () => {
    it('devrait être désactivé quand disabled est true', () => {
      wrapper = createWrapper({ disabled: true })
      const button = wrapper.find('button')
      expect(button.attributes('disabled')).toBeDefined()
      expect(button.classes()).toContain('base-btn--disabled')
    })

    it('devrait afficher le spinner quand loading est true', () => {
      wrapper = createWrapper({ loading: true })
      expect(wrapper.find('.base-btn__spinner').exists()).toBe(true)
      expect(wrapper.find('button').classes()).toContain('base-btn--loading')
    })

    it('devrait appliquer la classe fullWidth', () => {
      wrapper = createWrapper({ fullWidth: true })
      expect(wrapper.find('button').classes()).toContain('base-btn--full-width')
    })

    it('devrait appliquer la classe icon', () => {
      wrapper = createWrapper({ icon: true })
      expect(wrapper.find('button').classes()).toContain('base-btn--icon')
    })

    it('devrait définir le type de bouton', () => {
      wrapper = createWrapper({ type: 'submit' })
      expect(wrapper.find('button').attributes('type')).toBe('submit')
    })
  })

  describe('Slots', () => {
    it('devrait afficher le slot icon', () => {
      wrapper = createWrapper(
        {},
        {
          icon: '<svg data-testid="icon"><path /></svg>',
          default: 'Button Text',
        }
      )
      expect(wrapper.find('[data-testid="icon"]').exists()).toBe(true)
    })

    it('ne devrait pas afficher le slot icon quand loading', () => {
      wrapper = createWrapper(
        { loading: true },
        {
          icon: '<svg data-testid="icon"><path /></svg>',
          default: 'Button Text',
        }
      )
      expect(wrapper.find('[data-testid="icon"]').exists()).toBe(false)
      expect(wrapper.find('.base-btn__spinner').exists()).toBe(true)
    })

    it('ne devrait pas afficher le contenu pour un bouton icon seulement', () => {
      wrapper = createWrapper({ icon: true })
      expect(wrapper.find('.base-btn__content').exists()).toBe(false)
    })

    it('devrait afficher le contenu même pour un bouton icon si slot default existe', () => {
      wrapper = createWrapper({ icon: true }, { default: 'Text' })
      expect(wrapper.find('.base-btn__content').exists()).toBe(true)
    })
  })

  describe('Événements', () => {
    it('devrait émettre click lors du clic', async () => {
      wrapper = createWrapper()
      await wrapper.find('button').trigger('click')
      expect(wrapper.emitted('click')).toHaveLength(1)
    })

    it('ne devrait pas émettre click quand disabled', async () => {
      wrapper = createWrapper({ disabled: true })
      await wrapper.find('button').trigger('click')
      expect(wrapper.emitted('click')).toBeUndefined()
    })

    it('ne devrait pas émettre click quand loading', async () => {
      wrapper = createWrapper({ loading: true })
      await wrapper.find('button').trigger('click')
      expect(wrapper.emitted('click')).toBeUndefined()
    })

    it("devrait passer l'événement MouseEvent", async () => {
      wrapper = createWrapper()
      const clickSpy = vi.fn()
      wrapper.vm.$emit = clickSpy

      await wrapper.find('button').trigger('click')
      expect(wrapper.emitted('click')).toBeTruthy()
      expect(wrapper.emitted('click')?.[0][0]).toBeInstanceOf(MouseEvent)
    })
  })

  describe('Accessibilité', () => {
    it('devrait avoir la gestion du focus', () => {
      wrapper = createWrapper()
      const button = wrapper.find('button')
      expect(button.attributes('tabindex')).toBeUndefined() // Comportement par défaut du bouton
    })

    it('devrait avoir les attributs appropriés quand disabled', () => {
      wrapper = createWrapper({ disabled: true })
      const button = wrapper.find('button')
      expect(button.attributes('disabled')).toBeDefined()
    })

    it('devrait gérer les différents types de bouton', () => {
      wrapper = createWrapper({ type: 'submit' })
      expect(wrapper.find('button').attributes('type')).toBe('submit')
    })
  })

  describe('États visuels', () => {
    it("devrait avoir les bonnes classes pour l'état loading", () => {
      wrapper = createWrapper({ loading: true })
      const button = wrapper.find('button')
      expect(button.classes()).toContain('base-btn--loading')
      expect(button.attributes('disabled')).toBeDefined()
    })

    it("devrait avoir les bonnes classes pour l'état disabled", () => {
      wrapper = createWrapper({ disabled: true })
      const button = wrapper.find('button')
      expect(button.classes()).toContain('base-btn--disabled')
    })

    it('devrait combiner les classes correctement', () => {
      wrapper = createWrapper({
        variant: 'secondary',
        size: 'lg',
        fullWidth: true,
        loading: true,
      })
      const button = wrapper.find('button')
      expect(button.classes()).toEqual(
        expect.arrayContaining([
          'base-btn',
          'base-btn--secondary',
          'base-btn--lg',
          'base-btn--full-width',
          'base-btn--loading',
        ])
      )
    })
  })

  describe('Contenu conditionnel', () => {
    it('devrait cacher le slot icon pendant le loading', () => {
      wrapper = createWrapper(
        { loading: false },
        { icon: '<svg data-testid="test-icon"></svg>' }
      )
      expect(wrapper.find('[data-testid="test-icon"]').exists()).toBe(true)

      wrapper = createWrapper(
        { loading: true },
        { icon: '<svg data-testid="test-icon"></svg>' }
      )
      expect(wrapper.find('[data-testid="test-icon"]').exists()).toBe(false)
    })
  })
})
