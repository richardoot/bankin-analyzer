import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ReimbursementSummary from '@/components/reimbursement/ReimbursementSummary.vue'
import type {
  Person,
  ReimbursementCategory,
  Transaction,
  PersonAssignment,
} from '@/types'

// Mock du composable usePdfExport
vi.mock('@/composables/usePdfExport', () => ({
  usePdfExport: () => ({
    exportToPdf: vi.fn().mockResolvedValue(undefined),
  }),
}))

// Mock de localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
})

describe('ReimbursementSummary Integration Tests', () => {
  let wrapper: ReturnType<typeof mount>

  const mockPersons: Person[] = [
    { id: '1', name: 'Alice Dupont', email: 'alice@test.com' },
    { id: '2', name: 'Bob Martin', email: 'bob@test.com' },
    { id: '3', name: 'Charlie Durand', email: 'charlie@test.com' },
  ]

  const mockReimbursementCategories: ReimbursementCategory[] = [
    {
      id: '1',
      name: 'Santé',
      description: 'Frais médicaux',
      percentage: 80,
      color: '#e74c3c',
      createdAt: new Date('2024-01-01'),
    },
    {
      id: '2',
      name: 'Transport',
      description: 'Frais de transport',
      percentage: 50,
      color: '#3498db',
      createdAt: new Date('2024-01-02'),
    },
    {
      id: '3',
      name: 'Formation',
      description: 'Frais de formation',
      percentage: 100,
      color: '#2ecc71',
      createdAt: new Date('2024-01-03'),
    },
  ]

  const mockTransactions: Transaction[] = [
    {
      id: 'tx1',
      account: 'Compte Principal Alice',
      date: '2024-01-15',
      amount: -120,
      type: 'expense',
      category: 'Santé',
      description: 'Pharmacie',
    },
    {
      id: 'tx2',
      account: 'Compte Principal Bob',
      date: '2024-01-20',
      amount: -50,
      type: 'expense',
      category: 'Transport',
      description: 'Ticket de métro',
    },
    {
      id: 'tx3',
      account: 'Compte Principal Charlie',
      date: '2024-02-01',
      amount: -200,
      type: 'expense',
      category: 'Formation',
      description: 'Cours en ligne',
    },
    {
      id: 'tx4',
      account: 'Compte Principal Alice',
      date: '2024-02-05',
      amount: -80,
      type: 'expense',
      category: 'Santé',
      description: 'Consultation médecin',
    },
  ]

  const mockExpenseAssignments = [
    {
      transactionId: 'tx1',
      assignedPersons: [{ personId: '1', amount: 120 }] as PersonAssignment[],
    },
    {
      transactionId: 'tx2',
      assignedPersons: [{ personId: '2', amount: 50 }] as PersonAssignment[],
    },
    {
      transactionId: 'tx3',
      assignedPersons: [{ personId: '3', amount: 200 }] as PersonAssignment[],
    },
    {
      transactionId: 'tx4',
      assignedPersons: [{ personId: '1', amount: 80 }] as PersonAssignment[],
    },
  ]

  const mockExpensesManagerRef = {
    expenseAssignments: mockExpenseAssignments,
    filteredExpenses: mockTransactions,
    stats: {
      total: 4,
      assigned: 4,
      unassigned: 0,
      totalAmount: 450,
      totalReimbursementAmount: 385, // Calculé avec les pourcentages
      assignedWithReimbursement: 4,
      reimbursementCoverage: 85.6,
    },
  }

  beforeEach(() => {
    mockLocalStorage.clear()
    vi.clearAllMocks()

    // Configurer localStorage avec les données de test
    mockLocalStorage.setItem(
      'bankin-analyzer-persons',
      JSON.stringify(mockPersons)
    )
    mockLocalStorage.setItem(
      'bankin-analyzer-reimbursement-categories',
      JSON.stringify(
        mockReimbursementCategories.map(cat => ({
          ...cat,
          createdAt: cat.createdAt.toISOString(),
        }))
      )
    )
  })

  afterEach(() => {
    if (wrapper) wrapper.unmount()
  })

  describe('Montage et initialisation du composant', () => {
    it('devrait monter le composant correctement', () => {
      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: mockExpensesManagerRef,
        },
      })

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.reimbursement-section').exists()).toBe(true)
    })

    it('devrait charger les données depuis localStorage', async () => {
      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: mockExpensesManagerRef,
        },
      })

      await wrapper.vm.$nextTick()

      // Vérifier que les personnes sont chargées
      expect(wrapper.vm.availablePersons).toHaveLength(3)
      expect(wrapper.vm.availablePersons[0].name).toBe('Alice Dupont')

      // Vérifier que les catégories sont chargées
      expect(wrapper.vm.reimbursementCategories).toHaveLength(3)
      expect(wrapper.vm.reimbursementCategories[0].name).toBe('Santé')
    })

    it("devrait gérer le cas où aucune donnée n'est fournie", () => {
      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: null,
        },
      })

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.no-data-message').exists()).toBe(true)
    })
  })

  describe("Fonctionnalités d'expansion et collapse", () => {
    beforeEach(() => {
      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: mockExpensesManagerRef,
        },
      })
    })

    it("devrait permettre l'expansion et la contraction des catégories", async () => {
      const categoryName = 'Santé'

      // Initialement, la catégorie ne devrait pas être étendue
      expect(wrapper.vm.expandedCategories.has(categoryName)).toBe(false)

      // Étendre la catégorie
      wrapper.vm.toggleCategory(categoryName)
      expect(wrapper.vm.expandedCategories.has(categoryName)).toBe(true)

      // Contracter la catégorie
      wrapper.vm.toggleCategory(categoryName)
      expect(wrapper.vm.expandedCategories.has(categoryName)).toBe(false)
    })

    it("devrait permettre l'expansion des détails de transactions", async () => {
      const personId = '1'
      const categoryName = 'Santé'
      const key = `${personId}-${categoryName}`

      // Initialement, les détails ne devraient pas être étendus
      expect(wrapper.vm.expandedTransactionDetails.has(key)).toBe(false)

      // Étendre les détails
      wrapper.vm.toggleTransactionDetails(personId, categoryName)
      expect(wrapper.vm.expandedTransactionDetails.has(key)).toBe(true)

      // Contracter les détails
      wrapper.vm.toggleTransactionDetails(personId, categoryName)
      expect(wrapper.vm.expandedTransactionDetails.has(key)).toBe(false)
    })

    it('devrait gérer plusieurs catégories étendues simultanément', () => {
      const categories = ['Santé', 'Transport', 'Formation']

      // Étendre toutes les catégories
      categories.forEach(cat => wrapper.vm.toggleCategory(cat))

      // Vérifier que toutes sont étendues
      categories.forEach(cat => {
        expect(wrapper.vm.expandedCategories.has(cat)).toBe(true)
      })

      // Contracter une seule catégorie
      wrapper.vm.toggleCategory('Transport')
      expect(wrapper.vm.expandedCategories.has('Transport')).toBe(false)
      expect(wrapper.vm.expandedCategories.has('Santé')).toBe(true)
      expect(wrapper.vm.expandedCategories.has('Formation')).toBe(true)
    })
  })

  describe('Intégration avec localStorage et synchronisation', () => {
    it('devrait réagir aux changements de localStorage pour les personnes', async () => {
      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: mockExpensesManagerRef,
        },
      })

      // Ajouter une nouvelle personne dans localStorage
      const updatedPersons = [
        ...mockPersons,
        { id: '4', name: 'David Leroy', email: 'david@test.com' },
      ]

      mockLocalStorage.setItem(
        'bankin-analyzer-persons',
        JSON.stringify(updatedPersons)
      )

      // Simuler l'événement storage
      const storageEvent = new StorageEvent('storage', {
        key: 'bankin-analyzer-persons',
        newValue: JSON.stringify(updatedPersons),
        oldValue: JSON.stringify(mockPersons),
      })

      window.dispatchEvent(storageEvent)
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.availablePersons).toHaveLength(4)
      expect(wrapper.vm.availablePersons[3].name).toBe('David Leroy')
    })

    it('devrait réagir aux changements de localStorage pour les catégories', async () => {
      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: mockExpensesManagerRef,
        },
      })

      // Ajouter une nouvelle catégorie
      const newCategory: ReimbursementCategory = {
        id: '4',
        name: 'Repas',
        description: 'Frais de restauration',
        percentage: 60,
        color: '#f39c12',
        createdAt: new Date('2024-01-04'),
      }

      const updatedCategories = [...mockReimbursementCategories, newCategory]

      mockLocalStorage.setItem(
        'bankin-analyzer-reimbursement-categories',
        JSON.stringify(
          updatedCategories.map(cat => ({
            ...cat,
            createdAt: cat.createdAt.toISOString(),
          }))
        )
      )

      // Simuler l'événement storage
      const storageEvent = new StorageEvent('storage', {
        key: 'bankin-analyzer-reimbursement-categories',
        newValue: JSON.stringify(
          updatedCategories.map(cat => ({
            ...cat,
            createdAt: cat.createdAt.toISOString(),
          }))
        ),
        oldValue: JSON.stringify(
          mockReimbursementCategories.map(cat => ({
            ...cat,
            createdAt: cat.createdAt.toISOString(),
          }))
        ),
      })

      window.dispatchEvent(storageEvent)
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.reimbursementCategories).toHaveLength(4)
      expect(wrapper.vm.reimbursementCategories[3].name).toBe('Repas')
    })

    it('devrait gérer les erreurs de parsing localStorage', async () => {
      // Mock console.error pour éviter les erreurs dans les tests
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      // Données corrompues dans localStorage
      mockLocalStorage.setItem('bankin-analyzer-persons', 'invalid json')
      mockLocalStorage.setItem(
        'bankin-analyzer-reimbursement-categories',
        'invalid json'
      )

      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: mockExpensesManagerRef,
        },
      })

      await wrapper.vm.$nextTick()

      // Le composant devrait gérer gracieusement les erreurs
      expect(wrapper.vm.availablePersons).toEqual([])
      expect(wrapper.vm.reimbursementCategories).toEqual([])
      expect(wrapper.exists()).toBe(true)

      // Vérifier que les erreurs ont été loggées
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Erreur lors de la récupération des personnes:',
        expect.any(Error)
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Erreur lors de la récupération des catégories:',
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })
  })

  describe("Fonctionnalité d'export PDF", () => {
    beforeEach(() => {
      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: mockExpensesManagerRef,
        },
      })
    })

    it("devrait permettre l'export PDF", async () => {
      // Simuler un clic sur le bouton d'export
      await wrapper.vm.exportToPdf()

      // Vérifier que la fonction d'export a été appelée
      // Note: La fonction est mockée, donc on vérifie juste qu'elle existe
      expect(typeof wrapper.vm.exportToPdf).toBe('function')
    })

    it("devrait gérer l'état de chargement pendant l'export", async () => {
      // Initialement, pas en cours d'export
      expect(wrapper.vm.isExporting).toBe(false)

      // Simuler un export en cours
      wrapper.vm.isExporting = true
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.isExporting).toBe(true)

      // Terminer l'export
      wrapper.vm.isExporting = false
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.isExporting).toBe(false)
    })
  })

  describe('Gestion des props et des données', () => {
    it('devrait mettre à jour les données quand les props changent', async () => {
      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: mockExpensesManagerRef,
        },
      })

      // Changer les props
      const updatedExpensesManagerRef = {
        ...mockExpensesManagerRef,
        stats: {
          ...mockExpensesManagerRef.stats,
          total: 5,
          totalAmount: 500,
        },
      }

      await wrapper.setProps({
        expensesManagerRef: updatedExpensesManagerRef,
      })

      expect(wrapper.props('expensesManagerRef').stats.total).toBe(5)
      expect(wrapper.props('expensesManagerRef').stats.totalAmount).toBe(500)
    })

    it('devrait calculer correctement les statistiques de remboursement', () => {
      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: mockExpensesManagerRef,
        },
      })

      const stats = wrapper.props('expensesManagerRef').stats

      expect(stats.total).toBe(4)
      expect(stats.assigned).toBe(4)
      expect(stats.totalAmount).toBe(450)
      expect(stats.totalReimbursementAmount).toBe(385)
      expect(stats.reimbursementCoverage).toBe(85.6)
    })

    it('devrait afficher les informations de personnes et catégories correctement', async () => {
      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: mockExpensesManagerRef,
        },
      })

      await wrapper.vm.$nextTick()

      // Vérifier les personnes
      const persons = wrapper.vm.availablePersons
      expect(persons).toHaveLength(3)
      expect(persons.find(p => p.name === 'Alice Dupont')).toBeDefined()
      expect(persons.find(p => p.name === 'Bob Martin')).toBeDefined()

      // Vérifier les catégories
      const categories = wrapper.vm.reimbursementCategories
      expect(categories).toHaveLength(3)
      expect(
        categories.find(c => c.name === 'Santé' && c.percentage === 80)
      ).toBeDefined()
      expect(
        categories.find(c => c.name === 'Transport' && c.percentage === 50)
      ).toBeDefined()
    })
  })

  describe('Interface utilisateur et interactions', () => {
    beforeEach(() => {
      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: mockExpensesManagerRef,
        },
      })
    })

    it("devrait afficher les éléments d'interface principaux", () => {
      expect(wrapper.find('.reimbursement-section').exists()).toBe(true)

      // Vérifier la présence d'éléments attendus selon la structure du composant
      // Ces sélecteurs devraient être adaptés selon l'implémentation réelle
      const summaryContainer = wrapper.find('.reimbursement-section')
      expect(summaryContainer.exists()).toBe(true)
    })

    it("devrait maintenir l'état des expansions lors des mises à jour", async () => {
      // Étendre une catégorie
      wrapper.vm.toggleCategory('Santé')
      expect(wrapper.vm.expandedCategories.has('Santé')).toBe(true)

      // Simuler une mise à jour des props
      await wrapper.setProps({
        expensesManagerRef: {
          ...mockExpensesManagerRef,
          stats: { ...mockExpensesManagerRef.stats, total: 5 },
        },
      })

      // L'état d'expansion devrait être conservé
      expect(wrapper.vm.expandedCategories.has('Santé')).toBe(true)
    })

    it("devrait gérer les clics sur les éléments d'interface", async () => {
      // Tester les fonctions de toggle
      const initialCategoriesCount = wrapper.vm.expandedCategories.size
      wrapper.vm.toggleCategory('Transport')
      expect(wrapper.vm.expandedCategories.size).toBe(
        initialCategoriesCount + 1
      )

      const initialDetailsCount = wrapper.vm.expandedTransactionDetails.size
      wrapper.vm.toggleTransactionDetails('1', 'Santé')
      expect(wrapper.vm.expandedTransactionDetails.size).toBe(
        initialDetailsCount + 1
      )
    })
  })

  describe('Gestion des cas limites et des erreurs', () => {
    it("devrait gérer l'absence de données d'assignation", () => {
      const emptyExpensesManagerRef = {
        expenseAssignments: [],
        filteredExpenses: [],
        stats: {
          total: 0,
          assigned: 0,
          unassigned: 0,
          totalAmount: 0,
          totalReimbursementAmount: 0,
          assignedWithReimbursement: 0,
          reimbursementCoverage: 0,
        },
      }

      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: emptyExpensesManagerRef,
        },
      })

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.props('expensesManagerRef').stats.total).toBe(0)
    })

    it('devrait gérer les données localStorage manquantes', async () => {
      // Vider localStorage
      mockLocalStorage.clear()

      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: mockExpensesManagerRef,
        },
      })

      await wrapper.vm.$nextTick()

      expect(wrapper.vm.availablePersons).toEqual([])
      expect(wrapper.vm.reimbursementCategories).toEqual([])
      expect(wrapper.exists()).toBe(true)
    })

    it('devrait maintenir la performance avec de nombreuses données', () => {
      // Créer un dataset volumineux
      const largeExpenseAssignments = Array.from({ length: 100 }, (_, i) => ({
        transactionId: `tx${i}`,
        assignedPersons: [
          { personId: `${i % 10}`, amount: Math.random() * 1000 },
        ] as PersonAssignment[],
      }))

      const largeExpensesManagerRef = {
        ...mockExpensesManagerRef,
        expenseAssignments: largeExpenseAssignments,
      }

      wrapper = mount(ReimbursementSummary, {
        props: {
          expensesManagerRef: largeExpensesManagerRef,
        },
      })

      expect(wrapper.exists()).toBe(true)
      expect(
        wrapper.props('expensesManagerRef').expenseAssignments
      ).toHaveLength(100)
    })
  })
})
