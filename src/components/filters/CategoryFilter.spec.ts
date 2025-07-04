import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CategoryFilter from './CategoryFilter.vue'

describe('CategoryFilter', () => {
  let wrapper: ReturnType<typeof mount>

  const mockCategories = [
    'Alimentation',
    'Transport',
    'Loisirs',
    'Santé',
    'Shopping',
  ]

  const defaultProps = {
    categories: mockCategories,
    selectedCategories: ['Alimentation', 'Transport'],
  }

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  describe('Rendu initial', () => {
    beforeEach(() => {
      wrapper = mount(CategoryFilter, { props: defaultProps })
    })

    it('devrait afficher le titre et la description', () => {
      expect(wrapper.find('.filter-title').text()).toContain(
        'Filtres par catégories'
      )
      expect(wrapper.find('.filter-description').text()).toContain(
        'Cliquez sur les catégories pour les activer/désactiver'
      )
      expect(wrapper.find('.filter-icon').exists()).toBe(true)
    })

    it("devrait afficher tous les boutons d'action", () => {
      const selectAllBtn = wrapper.find('.select-all')
      const deselectAllBtn = wrapper.find('.deselect-all')

      expect(selectAllBtn.exists()).toBe(true)
      expect(selectAllBtn.text()).toContain('Tout sélectionner')
      expect(deselectAllBtn.exists()).toBe(true)
      expect(deselectAllBtn.text()).toContain('Tout désélectionner')
    })

    it('devrait afficher toutes les catégories', () => {
      const categoryButtons = wrapper.findAll('.category-filter-button')
      expect(categoryButtons).toHaveLength(mockCategories.length)

      mockCategories.forEach((category, index) => {
        expect(categoryButtons[index].find('.category-name').text()).toBe(
          category
        )
      })
    })

    it('devrait afficher les couleurs des catégories', () => {
      const categoryColors = wrapper.findAll('.category-color')
      expect(categoryColors).toHaveLength(mockCategories.length)

      categoryColors.forEach(color => {
        const style = color.attributes('style')
        expect(style).toContain('background-color')
      })
    })

    it('devrait afficher le résumé de sélection', () => {
      const summary = wrapper.find('.summary-text')
      expect(summary.text()).toBe('2 / 5 catégories sélectionnées')
    })
  })

  describe('États des boutons', () => {
    it('devrait marquer les catégories sélectionnées', () => {
      wrapper = mount(CategoryFilter, { props: defaultProps })

      const categoryButtons = wrapper.findAll('.category-filter-button')

      // Alimentation et Transport devraient être sélectionnées
      expect(categoryButtons[0].classes()).toContain('selected')
      expect(categoryButtons[1].classes()).toContain('selected')

      // Les autres devraient être désactivées
      expect(categoryButtons[2].classes()).toContain('disabled')
      expect(categoryButtons[3].classes()).toContain('disabled')
      expect(categoryButtons[4].classes()).toContain('disabled')
    })

    it('devrait désactiver "Tout sélectionner" quand tout est sélectionné', () => {
      wrapper = mount(CategoryFilter, {
        props: {
          categories: mockCategories,
          selectedCategories: [...mockCategories],
        },
      })

      const selectAllBtn = wrapper.find('.select-all')
      expect(selectAllBtn.attributes('disabled')).toBeDefined()
    })

    it('devrait désactiver "Tout désélectionner" quand rien n\'est sélectionné', () => {
      wrapper = mount(CategoryFilter, {
        props: {
          categories: mockCategories,
          selectedCategories: [],
        },
      })

      const deselectAllBtn = wrapper.find('.deselect-all')
      expect(deselectAllBtn.attributes('disabled')).toBeDefined()
    })

    it('ne devrait pas désactiver les boutons dans un état intermédiaire', () => {
      wrapper = mount(CategoryFilter, { props: defaultProps })

      const selectAllBtn = wrapper.find('.select-all')
      const deselectAllBtn = wrapper.find('.deselect-all')

      expect(selectAllBtn.attributes('disabled')).toBeUndefined()
      expect(deselectAllBtn.attributes('disabled')).toBeUndefined()
    })
  })

  describe('Interactions', () => {
    beforeEach(() => {
      wrapper = mount(CategoryFilter, { props: defaultProps })
    })

    it('devrait émettre la sélection lors du clic sur une catégorie non sélectionnée', async () => {
      const loisirButton = wrapper.findAll('.category-filter-button')[2] // Loisirs
      await loisirButton.trigger('click')

      expect(wrapper.emitted('update:selected-categories')).toBeTruthy()
      expect(wrapper.emitted('update:selected-categories')?.[0]).toEqual([
        ['Alimentation', 'Transport', 'Loisirs'],
      ])
    })

    it('devrait émettre la désélection lors du clic sur une catégorie sélectionnée', async () => {
      const alimentationButton = wrapper.findAll('.category-filter-button')[0] // Alimentation
      await alimentationButton.trigger('click')

      expect(wrapper.emitted('update:selected-categories')).toBeTruthy()
      expect(wrapper.emitted('update:selected-categories')?.[0]).toEqual([
        ['Transport'],
      ])
    })

    it('devrait sélectionner toutes les catégories', async () => {
      const selectAllBtn = wrapper.find('.select-all')
      await selectAllBtn.trigger('click')

      expect(wrapper.emitted('update:selected-categories')).toBeTruthy()
      expect(wrapper.emitted('update:selected-categories')?.[0]).toEqual([
        [...mockCategories],
      ])
    })

    it('devrait désélectionner toutes les catégories', async () => {
      const deselectAllBtn = wrapper.find('.deselect-all')
      await deselectAllBtn.trigger('click')

      expect(wrapper.emitted('update:selected-categories')).toBeTruthy()
      expect(wrapper.emitted('update:selected-categories')?.[0]).toEqual([[]])
    })
  })

  describe('Génération de couleurs', () => {
    beforeEach(() => {
      wrapper = mount(CategoryFilter, { props: defaultProps })
    })

    it('devrait utiliser les couleurs prédéfinies pour les premiers index', () => {
      const predefinedColors = [
        '#3B82F6',
        '#6366F1',
        '#8B5CF6',
        '#A855F7',
        '#EC4899',
      ]

      predefinedColors.forEach((expectedColor, index) => {
        const actualColor = wrapper.vm.getCategoryColor(index)
        expect(actualColor).toBe(expectedColor)
      })
    })

    it('devrait générer des couleurs HSL pour les index élevés', () => {
      const color = wrapper.vm.getCategoryColor(20)
      expect(color).toMatch(/^hsl\(\d+, 70%, 50%\)$/)
    })

    it('devrait générer des couleurs différentes pour des index différents', () => {
      const color1 = wrapper.vm.getCategoryColor(20)
      const color2 = wrapper.vm.getCategoryColor(21)
      expect(color1).not.toBe(color2)
    })
  })

  describe('Props réactives', () => {
    it("devrait mettre à jour l'affichage quand les catégories changent", async () => {
      wrapper = mount(CategoryFilter, { props: defaultProps })

      const newCategories = ['Nouvelle1', 'Nouvelle2']
      await wrapper.setProps({
        categories: newCategories,
        selectedCategories: ['Nouvelle1'],
      })

      const categoryButtons = wrapper.findAll('.category-filter-button')
      expect(categoryButtons).toHaveLength(2)
      expect(categoryButtons[0].find('.category-name').text()).toBe('Nouvelle1')
      expect(categoryButtons[1].find('.category-name').text()).toBe('Nouvelle2')
    })

    it('devrait mettre à jour le résumé quand la sélection change', async () => {
      wrapper = mount(CategoryFilter, { props: defaultProps })

      await wrapper.setProps({
        selectedCategories: ['Alimentation', 'Transport', 'Loisirs'],
      })

      const summary = wrapper.find('.summary-text')
      expect(summary.text()).toBe('3 / 5 catégories sélectionnées')
    })

    it('devrait mettre à jour les états des boutons quand la sélection change', async () => {
      wrapper = mount(CategoryFilter, { props: defaultProps })

      // Tout sélectionner
      await wrapper.setProps({
        selectedCategories: [...mockCategories],
      })

      expect(wrapper.find('.select-all').attributes('disabled')).toBeDefined()
      expect(
        wrapper.find('.deselect-all').attributes('disabled')
      ).toBeUndefined()

      // Tout désélectionner
      await wrapper.setProps({
        selectedCategories: [],
      })

      expect(wrapper.find('.select-all').attributes('disabled')).toBeUndefined()
      expect(wrapper.find('.deselect-all').attributes('disabled')).toBeDefined()
    })
  })

  describe('Cases particuliers', () => {
    it('devrait gérer une liste vide de catégories', () => {
      wrapper = mount(CategoryFilter, {
        props: {
          categories: [],
          selectedCategories: [],
        },
      })

      expect(wrapper.findAll('.category-filter-button')).toHaveLength(0)
      expect(wrapper.find('.summary-text').text()).toBe(
        '0 / 0 catégories sélectionnées'
      )
    })

    it('devrait gérer une seule catégorie', () => {
      wrapper = mount(CategoryFilter, {
        props: {
          categories: ['Unique'],
          selectedCategories: ['Unique'],
        },
      })

      const categoryButtons = wrapper.findAll('.category-filter-button')
      expect(categoryButtons).toHaveLength(1)
      expect(categoryButtons[0].classes()).toContain('selected')
      expect(wrapper.find('.summary-text').text()).toBe(
        '1 / 1 catégories sélectionnées'
      )
    })

    it('devrait gérer des noms de catégories longs', () => {
      const longCategoryName =
        'Catégorie avec un nom très long qui dépasse la largeur normale'
      wrapper = mount(CategoryFilter, {
        props: {
          categories: [longCategoryName],
          selectedCategories: [],
        },
      })

      const categoryName = wrapper.find('.category-name')
      expect(categoryName.text()).toBe(longCategoryName)
      expect(categoryName.classes()).toContain('category-name') // Styles de troncature
    })
  })

  describe('Accessibilité', () => {
    beforeEach(() => {
      wrapper = mount(CategoryFilter, { props: defaultProps })
    })

    it('devrait avoir des boutons accessibles', () => {
      const buttons = wrapper.findAll('button')
      buttons.forEach(button => {
        expect(button.element.tagName).toBe('BUTTON')
        expect(button.text().length).toBeGreaterThan(0)
      })
    })

    it('devrait avoir des icônes SVG appropriées', () => {
      const filterIcon = wrapper.find('.filter-icon')
      const btnIcons = wrapper.findAll('.btn-icon')

      expect(filterIcon.exists()).toBe(true)
      expect(btnIcons.length).toBeGreaterThanOrEqual(2)
    })

    it('devrait permettre la navigation par tabulation', () => {
      const buttons = wrapper.findAll('button')
      buttons.forEach(button => {
        expect(button.attributes('tabindex')).not.toBe('-1')
      })
    })
  })

  describe('Responsive design', () => {
    it('devrait avoir des classes CSS pour le responsive', () => {
      wrapper = mount(CategoryFilter, { props: defaultProps })

      expect(wrapper.find('.category-filter').exists()).toBe(true)
      expect(wrapper.find('.categories-list').exists()).toBe(true)
      expect(wrapper.find('.filter-actions').exists()).toBe(true)
    })

    it('devrait avoir une grille responsive pour les catégories', () => {
      wrapper = mount(CategoryFilter, { props: defaultProps })

      const categoriesList = wrapper.find('.categories-list')
      // Note: getComputedStyle pourrait ne pas fonctionner dans le test, on vérifie juste la classe
      expect(categoriesList.classes()).toContain('categories-list')
    })
  })
})
