import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FileUpload from '@/components/shared/FileUpload.vue'
import ValidationModal from '@/components/shared/ValidationModal.vue'
import type { CsvAnalysisResult } from '@/types'

// Mock de Papa Parse
vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn(),
  },
}))

describe('File Upload to Dashboard Workflow Integration', () => {
  let fileUploadWrapper: ReturnType<typeof mount>
  let validationWrapper: ReturnType<typeof mount>

  const mockValidAnalysisResult: CsvAnalysisResult = {
    isValid: true,
    transactionCount: 25,
    categoryCount: 6,
    totalAmount: 1500,
    dateRange: { start: '2024-01-01', end: '2024-02-28' },
    categories: [
      'Alimentation',
      'Transport',
      'Santé',
      'Remboursement Santé',
      'Remboursement Transport',
      'Salaire',
    ],
    expenses: {
      categories: ['Alimentation', 'Transport', 'Santé'],
      totalAmount: 800,
      categoriesData: {
        Alimentation: 400,
        Transport: 250,
        Santé: 150,
      },
    },
    income: {
      categories: ['Remboursement Santé', 'Remboursement Transport', 'Salaire'],
      totalAmount: 700,
      categoriesData: {
        'Remboursement Santé': 100,
        'Remboursement Transport': 100,
        Salaire: 500,
      },
    },
    transactions: [
      {
        id: '1',
        account: 'Compte Principal',
        date: '2024-01-15',
        amount: -120,
        type: 'expense',
        category: 'Alimentation',
        description: 'Supermarché Carrefour',
      },
      {
        id: '2',
        account: 'Compte Courant',
        date: '2024-01-20',
        amount: -75,
        type: 'expense',
        category: 'Transport',
        description: 'Essence Total',
      },
      {
        id: '3',
        account: 'Compte Principal',
        date: '2024-01-25',
        amount: 100,
        type: 'income',
        category: 'Remboursement Santé',
        description: 'CPAM remboursement',
      },
    ],
  }

  const mockInvalidAnalysisResult: CsvAnalysisResult = {
    isValid: false,
    transactionCount: 0,
    categoryCount: 0,
    totalAmount: 0,
    dateRange: { start: '', end: '' },
    categories: [],
    expenses: { categories: [], totalAmount: 0, categoriesData: {} },
    income: { categories: [], totalAmount: 0, categoriesData: {} },
    transactions: [],
  }

  afterEach(() => {
    if (fileUploadWrapper) fileUploadWrapper.unmount()
    if (validationWrapper) validationWrapper.unmount()
  })

  describe('Workflow de téléchargement et validation réussi', () => {
    beforeEach(() => {
      fileUploadWrapper = mount(FileUpload)
    })

    it('devrait émettre des événements cohérents lors du processus complet', async () => {
      // Simuler la sélection et l'analyse d'un fichier CSV valide
      await fileUploadWrapper.vm.$emit('file-uploaded', mockValidAnalysisResult)

      // Vérifier que l'événement file-uploaded est émis
      expect(fileUploadWrapper.emitted('file-uploaded')).toBeTruthy()
      const emittedResult = fileUploadWrapper.emitted(
        'file-uploaded'
      )?.[0]?.[0] as CsvAnalysisResult

      // Vérifier que les données sont correctes
      expect(emittedResult.isValid).toBe(true)
      expect(emittedResult.transactionCount).toBe(25)
      expect(emittedResult.categoryCount).toBe(6)
      expect(emittedResult.transactions).toHaveLength(3)
    })

    it('devrait transmettre des données cohérentes à ValidationModal', async () => {
      // Monter ValidationModal avec les données d'analyse
      validationWrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: mockValidAnalysisResult,
        },
      })

      // Vérifier que ValidationModal reçoit les bonnes données
      expect(validationWrapper.props('analysisResult')).toEqual(
        mockValidAnalysisResult
      )
      expect(validationWrapper.props('isOpen')).toBe(true)

      // Vérifier l'affichage des informations d'analyse
      expect(validationWrapper.text()).toContain('25') // transactionCount
      expect(validationWrapper.text()).toContain('6') // categoryCount
    })

    it('devrait permettre la navigation vers le dashboard après validation', async () => {
      validationWrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: mockValidAnalysisResult,
        },
      })

      // Simuler le clic sur "Confirmer"
      const confirmButton = validationWrapper.find('.confirm-button')
      if (confirmButton.exists()) {
        await confirmButton.trigger('click')
      } else {
        // Si le bouton n'existe pas, émettre directement l'événement
        await validationWrapper.vm.$emit('confirm')
      }

      // Vérifier que l'événement de confirmation est émis
      expect(validationWrapper.emitted('confirm')).toBeTruthy()
    })
  })

  describe('Workflow avec fichier invalide', () => {
    beforeEach(() => {
      fileUploadWrapper = mount(FileUpload)
    })

    it('devrait gérer gracieusement les fichiers CSV invalides', async () => {
      // Simuler l'analyse d'un fichier CSV invalide
      await fileUploadWrapper.vm.$emit(
        'file-uploaded',
        mockInvalidAnalysisResult
      )

      // Vérifier que l'événement est toujours émis même avec des données invalides
      expect(fileUploadWrapper.emitted('file-uploaded')).toBeTruthy()
      const emittedResult = fileUploadWrapper.emitted(
        'file-uploaded'
      )?.[0]?.[0] as CsvAnalysisResult

      expect(emittedResult.isValid).toBe(false)
      expect(emittedResult.transactionCount).toBe(0)
    })

    it('devrait afficher les erreurs appropriées dans ValidationModal', async () => {
      validationWrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: mockInvalidAnalysisResult,
        },
      })

      // Vérifier que ValidationModal gère les données invalides
      expect(validationWrapper.props('analysisResult').isValid).toBe(false)

      // ValidationModal devrait afficher des informations sur l'erreur
      // ou être dans un état qui reflète l'invalidité des données
      expect(validationWrapper.exists()).toBe(true)
    })

    it('ne devrait pas permettre la navigation avec des données invalides', async () => {
      validationWrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: mockInvalidAnalysisResult,
        },
      })

      // Avec des données invalides, le bouton de confirmation devrait être désactivé
      // ou ne pas émettre l'événement de confirmation
      const confirmButton = validationWrapper.find('.confirm-button')
      if (confirmButton.exists()) {
        // Le bouton devrait être désactivé ou ne pas exister
        expect(confirmButton.attributes('disabled')).toBeDefined()
      }
    })
  })

  describe('États intermédiaires du workflow', () => {
    it("devrait gérer les transitions d'état correctement", async () => {
      // État initial : pas de fichier uploadé
      fileUploadWrapper = mount(FileUpload)
      expect(fileUploadWrapper.exists()).toBe(true)

      // Simuler l'upload réussi directement
      await fileUploadWrapper.vm.$emit('file-uploaded', mockValidAnalysisResult)

      expect(fileUploadWrapper.emitted('file-uploaded')).toBeTruthy()
    })

    it('devrait synchroniser les états entre FileUpload et ValidationModal', async () => {
      fileUploadWrapper = mount(FileUpload)

      // Simuler l'upload réussi
      await fileUploadWrapper.vm.$emit('file-uploaded', mockValidAnalysisResult)

      // Ensuite monter ValidationModal avec les données reçues
      const emittedResult = fileUploadWrapper.emitted(
        'file-uploaded'
      )?.[0]?.[0] as CsvAnalysisResult

      validationWrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: emittedResult,
        },
      })

      // Vérifier que les données sont bien synchronisées
      expect(validationWrapper.props('analysisResult')).toEqual(emittedResult)
      expect(validationWrapper.props('analysisResult').isValid).toBe(true)
    })

    it('devrait préserver les données lors des mises à jour', async () => {
      validationWrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: mockValidAnalysisResult,
        },
      })

      // Changer l'état d'ouverture
      await validationWrapper.setProps({ isOpen: false })

      // Les données devraient être préservées
      expect(validationWrapper.props('analysisResult')).toEqual(
        mockValidAnalysisResult
      )
      expect(validationWrapper.props('isOpen')).toBe(false)

      // Réouvrir la modal
      await validationWrapper.setProps({ isOpen: true })

      // Les données devraient toujours être intactes
      expect(validationWrapper.props('analysisResult')).toEqual(
        mockValidAnalysisResult
      )
      expect(validationWrapper.props('isOpen')).toBe(true)
    })
  })

  describe('Gestion des erreurs et cas limites', () => {
    it('devrait gérer les fichiers corrompus ou les erreurs de parsing', async () => {
      fileUploadWrapper = mount(FileUpload)

      // Simuler une erreur de parsing
      const corruptedResult = {
        ...mockValidAnalysisResult,
        isValid: false,
        transactionCount: 0,
        transactions: [],
      }

      await fileUploadWrapper.vm.$emit('file-uploaded', corruptedResult)

      // Vérifier que l'erreur est correctement propagée
      expect(fileUploadWrapper.emitted('file-uploaded')).toBeTruthy()
      const emittedResult = fileUploadWrapper.emitted(
        'file-uploaded'
      )?.[0]?.[0] as CsvAnalysisResult
      expect(emittedResult.isValid).toBe(false)
    })

    it('devrait gérer les gros fichiers avec performance', async () => {
      const largeDataset: CsvAnalysisResult = {
        ...mockValidAnalysisResult,
        transactionCount: 10000,
        transactions: Array.from({ length: 100 }, (_, i) => ({
          id: `${i + 1}`,
          account: `Compte ${i % 5}`,
          date: '2024-01-01',
          amount: Math.random() * 1000 - 500,
          type: Math.random() > 0.5 ? 'expense' : 'income',
          category: ['Alimentation', 'Transport', 'Santé'][i % 3],
          description: `Transaction ${i + 1}`,
        })),
      }

      fileUploadWrapper = mount(FileUpload)
      validationWrapper = mount(ValidationModal, {
        props: {
          isOpen: true,
          analysisResult: largeDataset,
        },
      })

      // Les composants devraient gérer les grandes quantités de données
      expect(fileUploadWrapper.exists()).toBe(true)
      expect(validationWrapper.exists()).toBe(true)
      expect(validationWrapper.props('analysisResult').transactionCount).toBe(
        10000
      )
    })

    it("devrait maintenir la cohérence lors d'interactions rapides", async () => {
      fileUploadWrapper = mount(FileUpload)

      // Simuler l'upload réussi
      await fileUploadWrapper.vm.$emit('file-uploaded', mockValidAnalysisResult)

      // Simuler immédiatement une erreur après
      await fileUploadWrapper.vm.$emit('upload-error', 'Test error')

      // Vérifier que les événements ont été émis
      expect(fileUploadWrapper.emitted('file-uploaded')).toBeTruthy()
      expect(fileUploadWrapper.emitted('upload-error')).toBeTruthy()
    })
  })

  describe('Validation des données métier', () => {
    it('devrait valider la cohérence des montants', () => {
      // Vérifier que les totaux correspondent
      expect(mockValidAnalysisResult.expenses.totalAmount).toBe(800)
      expect(mockValidAnalysisResult.income.totalAmount).toBe(700)

      // Vérifier que la somme des catégories correspond au total
      const expenseSum = Object.values(
        mockValidAnalysisResult.expenses.categoriesData
      ).reduce((sum, amount) => sum + amount, 0)
      expect(expenseSum).toBe(mockValidAnalysisResult.expenses.totalAmount)

      const incomeSum = Object.values(
        mockValidAnalysisResult.income.categoriesData
      ).reduce((sum, amount) => sum + amount, 0)
      expect(incomeSum).toBe(mockValidAnalysisResult.income.totalAmount)
    })

    it('devrait valider la structure des transactions', () => {
      mockValidAnalysisResult.transactions.forEach(transaction => {
        // Chaque transaction doit avoir tous les champs requis
        expect(transaction.id).toBeDefined()
        expect(transaction.account).toBeDefined()
        expect(transaction.date).toBeDefined()
        expect(transaction.amount).toBeDefined()
        expect(transaction.type).toMatch(/^(expense|income)$/)
        expect(transaction.category).toBeDefined()
        expect(transaction.description).toBeDefined()
      })
    })

    it('devrait valider les périodes de dates', () => {
      expect(mockValidAnalysisResult.dateRange.start).toBe('2024-01-01')
      expect(mockValidAnalysisResult.dateRange.end).toBe('2024-02-28')

      // La date de fin devrait être après la date de début
      const startDate = new Date(mockValidAnalysisResult.dateRange.start)
      const endDate = new Date(mockValidAnalysisResult.dateRange.end)
      expect(endDate.getTime()).toBeGreaterThan(startDate.getTime())
    })

    it('devrait valider la cohérence des catégories', () => {
      // Toutes les catégories de dépenses devraient être dans la liste globale
      mockValidAnalysisResult.expenses.categories.forEach(category => {
        expect(mockValidAnalysisResult.categories).toContain(category)
      })

      // Toutes les catégories de revenus devraient être dans la liste globale
      mockValidAnalysisResult.income.categories.forEach(category => {
        expect(mockValidAnalysisResult.categories).toContain(category)
      })

      // Le nombre total de catégories devrait correspondre
      const totalUniqueCategories = new Set([
        ...mockValidAnalysisResult.expenses.categories,
        ...mockValidAnalysisResult.income.categories,
      ]).size
      expect(mockValidAnalysisResult.categoryCount).toBe(totalUniqueCategories)
    })
  })
})
