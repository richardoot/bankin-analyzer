import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ValidationModal from './ValidationModal.vue'
import { CsvAnalysisResultFactory } from '@/test/factories'
import type { CsvAnalysisResult } from '@/types'

describe('ValidationModal', () => {
  let wrapper: ReturnType<typeof mount>

  const mockAnalysisResult: CsvAnalysisResult = CsvAnalysisResultFactory.create(
    {
      transactionCount: 150,
      categoryCount: 12,
      totalAmount: 2500.75,
      dateRange: {
        start: '2024-01-01',
        end: '2024-12-31',
      },
      categories: [
        'Alimentation',
        'Transport',
        'Loisirs',
        'Santé',
        'Shopping',
        'Services',
        'Logement',
        'Éducation',
        'Voyage',
        'Autre',
      ],
    }
  )

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  describe('Rendu conditionnel', () => {
    it('ne devrait pas rendre le modal quand isOpen est false', () => {
      wrapper = mount(ValidationModal, {
        props: {
          isOpen: false,
          analysisResult: mockAnalysisResult,
        },
      })

      expect(wrapper.find('.modal-overlay').exists()).toBe(false)
    })

    it('devrait rendre le modal quand isOpen est true', () => {
      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: mockAnalysisResult,
        },
      })

      expect(wrapper.find('.modal-overlay').exists()).toBe(true)
      expect(wrapper.find('.modal-content').exists()).toBe(true)
    })

    it('devrait rendre le modal même avec analysisResult null', () => {
      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: null,
        },
      })

      expect(wrapper.find('.modal-overlay').exists()).toBe(true)
      expect(wrapper.find('.modal-header').exists()).toBe(true)
    })
  })

  describe('En-tête du modal', () => {
    beforeEach(() => {
      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: mockAnalysisResult,
        },
      })
    })

    it('devrait afficher le titre correct', () => {
      expect(wrapper.find('.modal-title').text()).toContain(
        'Fichier CSV analysé avec succès'
      )
    })

    it("devrait afficher l'icône de validation", () => {
      expect(wrapper.find('.check-icon').exists()).toBe(true)
    })

    it('devrait afficher le bouton de fermeture', () => {
      expect(wrapper.find('.close-button').exists()).toBe(true)
    })
  })

  describe('Corps du modal avec données', () => {
    beforeEach(() => {
      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: mockAnalysisResult,
        },
      })
    })

    it("devrait afficher le résumé d'analyse", () => {
      expect(wrapper.find('.analysis-summary').exists()).toBe(true)
      expect(wrapper.find('.summary-grid').exists()).toBe(true)
    })

    it('devrait afficher le nombre de transactions', () => {
      const transactionItem = wrapper.findAll('.summary-item')[0]
      expect(transactionItem.find('.summary-label').text()).toBe('Transactions')
      expect(transactionItem.find('.summary-value').text()).toBe('150')
    })

    it('devrait afficher le nombre de catégories', () => {
      const categoryItem = wrapper.findAll('.summary-item')[1]
      expect(categoryItem.find('.summary-label').text()).toBe('Catégories')
      expect(categoryItem.find('.summary-value').text()).toBe('12')
    })

    it('devrait afficher la période formatée', () => {
      const periodItem = wrapper.findAll('.summary-item')[2]
      expect(periodItem.find('.summary-label').text()).toBe('Période')
      const periodText = periodItem.find('.summary-value').text()
      expect(periodText).toContain('01/01/2024')
      expect(periodText).toContain('31/12/2024')
    })

    it('devrait afficher le montant total formaté', () => {
      const amountItem = wrapper.findAll('.summary-item')[3]
      expect(amountItem.find('.summary-label').text()).toBe('Montant total')
      const amountText = amountItem.find('.summary-value').text()
      expect(amountText).toMatch(/2[\s\u202f]?500,75/)
      expect(amountText).toContain('€')
    })

    it('devrait marquer les montants négatifs', () => {
      const negativeAnalysisResult = CsvAnalysisResultFactory.create({
        totalAmount: -1500.5,
      })

      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: negativeAnalysisResult,
        },
      })

      const amountValue = wrapper
        .findAll('.summary-item')[3]
        .find('.summary-value')
      expect(amountValue.classes()).toContain('negative')
    })

    it('devrait afficher les icônes appropriées pour chaque section', () => {
      const summaryItems = wrapper.findAll('.summary-item')

      summaryItems.forEach(item => {
        expect(item.find('.summary-icon svg').exists()).toBe(true)
      })
    })
  })

  describe('Aperçu des catégories', () => {
    beforeEach(() => {
      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: mockAnalysisResult,
        },
      })
    })

    it('devrait afficher la section des catégories', () => {
      expect(wrapper.find('.categories-preview').exists()).toBe(true)
      expect(wrapper.find('.categories-title').text()).toBe(
        'Catégories détectées'
      )
    })

    it('devrait afficher les 6 premières catégories', () => {
      const categoryBadges = wrapper.findAll('.category-badge')
      expect(categoryBadges).toHaveLength(6)

      categoryBadges.forEach((badge, index) => {
        expect(badge.text()).toBe(mockAnalysisResult.categories[index])
      })
    })

    it('devrait afficher un indicateur pour les catégories supplémentaires', () => {
      const categoryMore = wrapper.find('.category-more')
      expect(categoryMore.exists()).toBe(true)
      expect(categoryMore.text()).toBe('+4 autres') // 10 - 6 = 4
    })

    it('ne devrait pas afficher l\'indicateur "autres" s\'il y a 6 catégories ou moins', () => {
      const smallAnalysisResult = CsvAnalysisResultFactory.create({
        categories: ['Cat1', 'Cat2', 'Cat3'],
      })

      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: smallAnalysisResult,
        },
      })

      expect(wrapper.find('.category-more').exists()).toBe(false)
      expect(wrapper.findAll('.category-badge')).toHaveLength(3)
    })

    it('ne devrait pas afficher la section des catégories si aucune catégorie', () => {
      const emptyAnalysisResult = CsvAnalysisResultFactory.create({
        categories: [],
      })

      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: emptyAnalysisResult,
        },
      })

      expect(wrapper.find('.categories-preview').exists()).toBe(false)
    })
  })

  describe('Pied de page du modal', () => {
    beforeEach(() => {
      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: mockAnalysisResult,
        },
      })
    })

    it("devrait afficher les boutons d'action", () => {
      expect(wrapper.find('.modal-footer').exists()).toBe(true)

      const buttons = wrapper.findAll('.btn')
      expect(buttons).toHaveLength(2)
    })

    it('devrait afficher le bouton "Annuler"', () => {
      const cancelButton = wrapper.find('.btn-secondary')
      expect(cancelButton.exists()).toBe(true)
      expect(cancelButton.text()).toBe('Annuler')
    })

    it('devrait afficher le bouton "Voir le tableau de bord"', () => {
      const confirmButton = wrapper.find('.btn-primary')
      expect(confirmButton.exists()).toBe(true)
      expect(confirmButton.text()).toContain('Voir le tableau de bord')
    })

    it("devrait afficher l'icône dans le bouton principal", () => {
      const confirmButton = wrapper.find('.btn-primary')
      expect(confirmButton.find('svg').exists()).toBe(true)
    })
  })

  describe('Interactions', () => {
    beforeEach(() => {
      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: mockAnalysisResult,
        },
      })
    })

    it('devrait émettre "close" lors du clic sur le bouton de fermeture', async () => {
      await wrapper.find('.close-button').trigger('click')
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('devrait émettre "close" lors du clic sur le bouton Annuler', async () => {
      await wrapper.find('.btn-secondary').trigger('click')
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('devrait émettre "confirm" lors du clic sur le bouton principal', async () => {
      await wrapper.find('.btn-primary').trigger('click')
      expect(wrapper.emitted('confirm')).toBeTruthy()
    })

    it('devrait émettre "close" lors du clic sur l\'overlay', async () => {
      await wrapper.find('.modal-overlay').trigger('click')
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('ne devrait pas émettre "close" lors du clic sur le contenu du modal', async () => {
      await wrapper.find('.modal-content').trigger('click')
      expect(wrapper.emitted('close')).toBeFalsy()
    })
  })

  describe('Formatage des données', () => {
    beforeEach(() => {
      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: mockAnalysisResult,
        },
      })
    })

    it('devrait formater correctement les montants en euros', () => {
      // Test avec différents montants
      expect(wrapper.vm.formatAmount(1234.56)).toMatch(/1[\s\u202f]?234,56/)
      expect(wrapper.vm.formatAmount(1234.56)).toContain('€')
      expect(wrapper.vm.formatAmount(-500)).toContain('-500')
      expect(wrapper.vm.formatAmount(0)).toContain('0')
    })

    it('devrait formater correctement les dates', () => {
      expect(wrapper.vm.formatDate('2024-01-01')).toBe('01/01/2024')
      expect(wrapper.vm.formatDate('2024-12-15')).toBe('15/12/2024')
      expect(wrapper.vm.formatDate('')).toBe('Non défini')
      expect(wrapper.vm.formatDate('invalid-date')).toMatch(/invalid/i)
    })

    it('devrait gérer les dates au format ISO', () => {
      expect(wrapper.vm.formatDate('2024-01-01')).toContain('2024')
      expect(wrapper.vm.formatDate('2024-12-15')).toContain('2024')
    })
  })

  describe('États spéciaux', () => {
    it("devrait gérer l'absence de données d'analyse", () => {
      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: null,
        },
      })

      expect(wrapper.find('.modal-header').exists()).toBe(true)
      expect(wrapper.find('.modal-body').exists()).toBe(false)
      expect(wrapper.find('.modal-footer').exists()).toBe(true)
    })

    it('devrait gérer les données partielles', () => {
      const partialResult = CsvAnalysisResultFactory.create({
        transactionCount: 0,
        categoryCount: 0,
        totalAmount: 0,
        categories: [],
        dateRange: {
          start: '',
          end: '',
        },
      })

      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: partialResult,
        },
      })

      expect(wrapper.find('.analysis-summary').exists()).toBe(true)
      expect(wrapper.find('.categories-preview').exists()).toBe(false)

      // Vérifier que les valeurs zéro sont affichées
      const summaryItems = wrapper.findAll('.summary-item')
      expect(summaryItems[0].find('.summary-value').text()).toBe('0')
      expect(summaryItems[1].find('.summary-value').text()).toBe('0')
    })
  })

  describe('Accessibilité', () => {
    beforeEach(() => {
      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: mockAnalysisResult,
        },
      })
    })

    it('devrait avoir une structure sémantique appropriée', () => {
      expect(wrapper.find('h2').exists()).toBe(true)
      expect(wrapper.find('h3').exists()).toBe(true)
    })

    it('devrait avoir des boutons avec du texte lisible', () => {
      const closeButton = wrapper.find('.close-button')
      const cancelButton = wrapper.find('.btn-secondary')
      const confirmButton = wrapper.find('.btn-primary')

      expect(closeButton.exists()).toBe(true)
      expect(cancelButton.text()).toContain('Annuler')
      expect(confirmButton.text()).toContain('Voir le tableau de bord')
    })

    it('devrait avoir une overlay qui permet la fermeture', () => {
      const overlay = wrapper.find('.modal-overlay')
      expect(overlay.exists()).toBe(true)
    })
  })

  describe('Responsive design', () => {
    it('devrait avoir des classes CSS pour le responsive', () => {
      wrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: mockAnalysisResult,
        },
      })

      // Vérifier que les éléments principaux existent pour le responsive
      expect(wrapper.find('.modal-overlay').exists()).toBe(true)
      expect(wrapper.find('.modal-content').exists()).toBe(true)
      expect(wrapper.find('.summary-grid').exists()).toBe(true)
      expect(wrapper.find('.modal-footer').exists()).toBe(true)
    })
  })
})
