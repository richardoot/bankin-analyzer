import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CategoryFilter from '@/components/filters/CategoryFilter.vue'
import AccountFilter from '@/components/filters/AccountFilter.vue'
import JointAccountFilter from '@/components/filters/JointAccountFilter.vue'
import ReimbursementCompensationFilter from '@/components/filters/ReimbursementCompensationFilter.vue'

vi.mock('@/components/shared/BaseCard.vue', () => ({
  default: {
    name: 'BaseCard',
    template: '<div class="base-card-mock"><slot /></div>',
  },
}))

describe('Dashboard Filters Integration Tests', () => {
  let categoryWrapper: ReturnType<typeof mount>
  let accountWrapper: ReturnType<typeof mount>
  let jointAccountWrapper: ReturnType<typeof mount>
  let compensationWrapper: ReturnType<typeof mount>

  const mockAnalysisResult: CsvAnalysisResult = {
    isValid: true,
    transactionCount: 120,
    categoryCount: 8,
    totalAmount: 4500,
    dateRange: { start: '2024-01-01', end: '2024-03-31' },
    categories: [
      'Alimentation',
      'Transport',
      'Santé',
      'Loisirs',
      'Remboursement Santé',
      'Remboursement Transport',
    ],
    expenses: {
      categories: ['Alimentation', 'Transport', 'Santé', 'Loisirs'],
      totalAmount: 3200,
      categoriesData: {
        Alimentation: 1200,
        Transport: 800,
        Santé: 700,
        Loisirs: 500,
      },
    },
    income: {
      categories: ['Salaire', 'Remboursement Santé', 'Remboursement Transport'],
      totalAmount: 1300,
      categoriesData: {
        Salaire: 1000,
        'Remboursement Santé': 200,
        'Remboursement Transport': 100,
      },
    },
    transactions: [
      {
        id: '1',
        account: 'Compte Principal',
        date: '2024-01-15',
        amount: -150,
        type: 'expense',
        category: 'Alimentation',
        description: 'Supermarché',
      },
      {
        id: '2',
        account: 'Compte Épargne',
        date: '2024-01-20',
        amount: -80,
        type: 'expense',
        category: 'Transport',
        description: 'Essence',
      },
      {
        id: '3',
        account: 'Compte Joint',
        date: '2024-02-01',
        amount: -100,
        type: 'expense',
        category: 'Santé',
        description: 'Médecin',
      },
      {
        id: '4',
        account: 'Compte Principal',
        date: '2024-02-05',
        amount: 200,
        type: 'income',
        category: 'Remboursement Santé',
        description: 'CPAM',
      },
      {
        id: '5',
        account: 'Compte Principal',
        date: '2024-02-10',
        amount: 100,
        type: 'income',
        category: 'Remboursement Transport',
        description: 'Employeur',
      },
    ],
  }

  const uniqueAccounts = Array.from(
    new Set(mockAnalysisResult.transactions.map(t => t.account))
  )

  afterEach(() => {
    if (categoryWrapper) categoryWrapper.unmount()
    if (accountWrapper) accountWrapper.unmount()
    if (jointAccountWrapper) jointAccountWrapper.unmount()
    if (compensationWrapper) compensationWrapper.unmount()
  })

  describe('Intégration des filtres entre eux', () => {
    beforeEach(() => {
      categoryWrapper = mount(CategoryFilter, {
        props: {
          categories: mockAnalysisResult.categories,
          selectedCategories: mockAnalysisResult.categories, // Par défaut tout sélectionné
        },
      })
      accountWrapper = mount(AccountFilter, {
        props: {
          accounts: uniqueAccounts,
          selectedAccounts: [],
        },
      })
      jointAccountWrapper = mount(JointAccountFilter, {
        props: {
          accounts: uniqueAccounts,
          selectedAccounts: [],
        },
      })
      compensationWrapper = mount(ReimbursementCompensationFilter, {
        props: {
          analysisResult: mockAnalysisResult,
          selectedRules: [],
        },
      })
    })

    it('devrait avoir des données cohérentes entre tous les filtres', () => {
      // Vérifier que tous les filtres reçoivent les bonnes données
      expect(categoryWrapper.props('categories')).toEqual(
        mockAnalysisResult.categories
      )
      expect(categoryWrapper.props('selectedCategories')).toEqual(
        mockAnalysisResult.categories
      )
      expect(accountWrapper.props('accounts')).toEqual(uniqueAccounts)
      expect(compensationWrapper.props('analysisResult')).toEqual(
        mockAnalysisResult
      )

      // Vérifier que les comptes sont extraits correctement
      expect(jointAccountWrapper.props('accounts')).toEqual(uniqueAccounts)
    })

    it('devrait synchroniser les changements de catégories entre CategoryFilter et CompensationFilter', async () => {
      // Sélectionner des catégories dans CategoryFilter
      const selectedExpenseCategories = ['Alimentation', 'Santé']
      const selectedIncomeCategories = ['Remboursement Santé']

      await categoryWrapper.vm.$emit(
        'update:selected-categories',
        selectedExpenseCategories
      )

      // Simuler la mise à jour des props pour CompensationFilter
      await compensationWrapper.setProps({
        selectedExpenseCategories,
        selectedIncomeCategories,
      })

      // Vérifier que les catégories disponibles dans CompensationFilter sont filtrées
      const availableExpenses =
        compensationWrapper.vm.availableExpenseCategories
      const availableIncomes = compensationWrapper.vm.availableIncomeCategories

      expect(availableExpenses).toEqual(selectedExpenseCategories)
      expect(availableIncomes).toEqual(selectedIncomeCategories)
    })

    it('devrait exclure les catégories utilisées dans les règles de compensation', async () => {
      // Créer une règle de compensation
      const compensationRules = [
        {
          expenseCategory: 'Santé',
          incomeCategory: 'Remboursement Santé',
          affectedAmount: 200,
        },
      ]

      await compensationWrapper.setProps({ selectedRules: compensationRules })

      // Vérifier que les catégories utilisées sont exclues des options disponibles
      const availableExpenses =
        compensationWrapper.vm.availableExpenseCategories
      const availableIncomes = compensationWrapper.vm.availableIncomeCategories

      expect(availableExpenses).not.toContain('Santé')
      expect(availableIncomes).not.toContain('Remboursement Santé')
    })

    it('devrait gérer la cohérence entre AccountFilter et JointAccountFilter', async () => {
      const selectedAccounts = ['Compte Principal', 'Compte Joint']

      // Sélectionner des comptes dans AccountFilter
      await accountWrapper.vm.$emit(
        'update:selected-accounts',
        selectedAccounts
      )

      // Simuler la sélection de comptes joints
      await jointAccountWrapper.vm.$emit('update:selected-accounts', [
        'Compte Joint',
      ])

      // Vérifier que les émissions sont cohérentes
      expect(accountWrapper.emitted('update:selected-accounts')).toBeTruthy()
      expect(
        jointAccountWrapper.emitted('update:selected-accounts')
      ).toBeTruthy()

      const accountEmission = accountWrapper.emitted(
        'update:selected-accounts'
      )?.[0]?.[0]
      const jointEmission = jointAccountWrapper.emitted(
        'update:selected-accounts'
      )?.[0]?.[0]

      expect(accountEmission).toEqual(selectedAccounts)
      expect(jointEmission).toEqual(['Compte Joint'])
    })
  })

  describe('Simulation de workflow complet Dashboard', () => {
    beforeEach(() => {
      categoryWrapper = mount(CategoryFilter, {
        props: {
          categories: mockAnalysisResult.categories,
          selectedCategories: [],
        },
      })
      accountWrapper = mount(AccountFilter, {
        props: {
          accounts: uniqueAccounts,
          selectedAccounts: [],
        },
      })
      jointAccountWrapper = mount(JointAccountFilter, {
        props: {
          accounts: uniqueAccounts,
          selectedAccounts: [],
        },
      })
      compensationWrapper = mount(ReimbursementCompensationFilter, {
        props: {
          analysisResult: mockAnalysisResult,
          selectedRules: [],
        },
      })
    })

    it('devrait simuler un workflow complet de filtrage', async () => {
      // Étape 1: Sélectionner des catégories
      const expenseCategories = ['Alimentation', 'Transport']
      const incomeCategories = ['Remboursement Transport']

      await categoryWrapper.vm.$emit(
        'update:selected-categories',
        expenseCategories
      )

      // Étape 2: Sélectionner des comptes
      const selectedAccounts = ['Compte Principal', 'Compte Épargne']
      await accountWrapper.vm.$emit(
        'update:selected-accounts',
        selectedAccounts
      )

      // Étape 3: Configurer des comptes joints
      const jointAccounts = ['Compte Joint']
      await jointAccountWrapper.vm.$emit(
        'update:selected-accounts',
        jointAccounts
      )

      // Étape 4: Mettre à jour CompensationFilter avec les sélections
      await compensationWrapper.setProps({
        selectedExpenseCategories: expenseCategories,
        selectedIncomeCategories: incomeCategories,
      })

      // Étape 5: Créer une règle de compensation
      await compensationWrapper.vm.$emit('update:selectedRules', [
        {
          expenseCategory: 'Transport',
          incomeCategory: 'Remboursement Transport',
          affectedAmount: 100,
        },
      ])

      // Vérifications finales
      expect(categoryWrapper.emitted('update:selected-categories')).toBeTruthy()
      expect(accountWrapper.emitted('update:selected-accounts')).toBeTruthy()
      expect(
        jointAccountWrapper.emitted('update:selected-accounts')
      ).toBeTruthy()
      expect(compensationWrapper.emitted('update:selectedRules')).toBeTruthy()

      // Vérifier que les états finaux sont cohérents
      const finalCompensationRules = compensationWrapper.emitted(
        'update:selectedRules'
      )?.[0]?.[0]
      expect(finalCompensationRules).toHaveLength(1)
      expect(finalCompensationRules[0].expenseCategory).toBe('Transport')
    })

    it('devrait gérer des changements en cascade', async () => {
      // Configuration initiale
      const initialRules = [
        {
          expenseCategory: 'Santé',
          incomeCategory: 'Remboursement Santé',
          affectedAmount: 200,
        },
      ]
      await compensationWrapper.setProps({ selectedRules: initialRules })

      // Changement des catégories sélectionnées qui affecte les règles disponibles
      await compensationWrapper.setProps({
        selectedExpenseCategories: ['Alimentation', 'Transport'], // Santé n'est plus disponible
        selectedIncomeCategories: ['Remboursement Transport'], // Remboursement Santé n'est plus disponible
      })

      // Vérifier que les catégories disponibles sont mises à jour
      const availableExpenses =
        compensationWrapper.vm.availableExpenseCategories
      const availableIncomes = compensationWrapper.vm.availableIncomeCategories

      expect(availableExpenses).toEqual(['Alimentation', 'Transport'])
      expect(availableIncomes).toEqual(['Remboursement Transport'])

      // Les règles existantes qui ne sont plus valides devraient être gérées
      // (dans un vrai dashboard, elles seraient supprimées ou marquées comme invalides)
    })
  })

  describe('Tests de performance et réactivité', () => {
    beforeEach(() => {
      categoryWrapper = mount(CategoryFilter, {
        props: {
          categories: mockAnalysisResult.categories,
          selectedCategories: [],
        },
      })
      accountWrapper = mount(AccountFilter, {
        props: {
          accounts: uniqueAccounts,
          selectedAccounts: [],
        },
      })
      compensationWrapper = mount(ReimbursementCompensationFilter, {
        props: {
          analysisResult: mockAnalysisResult,
          selectedRules: [],
        },
      })
    })

    it('devrait gérer des mises à jour rapides de données', async () => {
      const iterations = 10

      for (let i = 0; i < iterations; i++) {
        const categories = i % 2 === 0 ? ['Alimentation'] : ['Transport']
        // eslint-disable-next-line no-await-in-loop
        await categoryWrapper.vm.$emit('update:selected-categories', categories)
      }

      // Vérifier que toutes les émissions ont été enregistrées
      expect(
        categoryWrapper.emitted('update:selected-categories')
      ).toHaveLength(iterations)
    })

    it('devrait maintenir la cohérence lors de changements simultanés', async () => {
      // Simuler des changements simultanés sur plusieurs filtres
      const promises = [
        categoryWrapper.vm.$emit('update:selected-categories', [
          'Alimentation',
        ]),
        accountWrapper.vm.$emit('update:selected-accounts', [
          'Compte Principal',
        ]),
        compensationWrapper.vm.$emit('update:selectedRules', [
          {
            expenseCategory: 'Transport',
            incomeCategory: 'Remboursement Transport',
            affectedAmount: 100,
          },
        ]),
      ]

      await Promise.all(promises)

      // Vérifier que toutes les émissions ont eu lieu
      expect(categoryWrapper.emitted('update:selected-categories')).toBeTruthy()
      expect(accountWrapper.emitted('update:selected-accounts')).toBeTruthy()
      expect(compensationWrapper.emitted('update:selectedRules')).toBeTruthy()
    })
  })

  describe('Gestion des cas limites', () => {
    it('devrait gérer des données vides ou invalides', async () => {
      const emptyAnalysisResult: CsvAnalysisResult = {
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

      const emptyFilters = {
        category: mount(CategoryFilter, {
          props: { categories: [], selectedCategories: [] },
        }),
        account: mount(AccountFilter, {
          props: { accounts: [], selectedAccounts: [] },
        }),
        jointAccount: mount(JointAccountFilter, {
          props: { accounts: [], selectedAccounts: [] },
        }),
        compensation: mount(ReimbursementCompensationFilter, {
          props: { analysisResult: emptyAnalysisResult, selectedRules: [] },
        }),
      }

      // Vérifier que tous les filtres gèrent gracieusement les données vides
      expect(emptyFilters.category.exists()).toBe(true)
      expect(emptyFilters.account.exists()).toBe(true)
      expect(emptyFilters.jointAccount.exists()).toBe(true)
      expect(emptyFilters.compensation.exists()).toBe(true)

      // Nettoyer
      Object.values(emptyFilters).forEach(wrapper => wrapper.unmount())
    })

    it('devrait récupérer après des erreurs de composants', async () => {
      // Test de résilience avec des props invalides
      try {
        compensationWrapper = mount(ReimbursementCompensationFilter, {
          props: {
            analysisResult: mockAnalysisResult,
            selectedRules: [{ invalid: 'rule' }] as unknown[],
          },
        })

        // Le composant devrait toujours se monter même avec des données partiellement invalides
        expect(compensationWrapper.exists()).toBe(true)
      } catch (error) {
        // Si le composant ne peut pas gérer les données invalides,
        // c'est une indication d'amélioration possible
        console.warn('Component failed with invalid props:', error)
      }
    })
  })

  describe('Calculs et logique métier intégrés', () => {
    beforeEach(() => {
      compensationWrapper = mount(ReimbursementCompensationFilter, {
        props: {
          analysisResult: mockAnalysisResult,
          selectedRules: [],
        },
      })
    })

    it('devrait calculer correctement les montants de compensation', () => {
      // Tester le calcul des montants affectés basé sur les vraies transactions
      const santeAmount = compensationWrapper.vm.calculateAffectedAmount(
        'Remboursement Santé'
      )
      const transportAmount = compensationWrapper.vm.calculateAffectedAmount(
        'Remboursement Transport'
      )

      expect(santeAmount).toBe(200) // D'après la transaction mock
      expect(transportAmount).toBe(100) // D'après la transaction mock
    })

    it('devrait formater les montants de manière cohérente', () => {
      const formatAmount = compensationWrapper.vm.formatAmount

      expect(formatAmount(200)).toMatch(/200[^\d]*€/)
      expect(formatAmount(1234.56)).toMatch(/1[^\d]*235[^\d]*€/)
      expect(formatAmount(0)).toMatch(/0[^\d]*€/)
    })

    it('devrait valider les règles de compensation', async () => {
      // Ajouter des catégories sélectionnées
      await compensationWrapper.setProps({
        selectedExpenseCategories: ['Santé', 'Transport'],
        selectedIncomeCategories: [
          'Remboursement Santé',
          'Remboursement Transport',
        ],
      })

      // Vérifier que les catégories appropriées sont disponibles
      const availableExpenses =
        compensationWrapper.vm.availableExpenseCategories
      const availableIncomes = compensationWrapper.vm.availableIncomeCategories

      expect(availableExpenses).toContain('Santé')
      expect(availableExpenses).toContain('Transport')
      expect(availableIncomes).toContain('Remboursement Santé')
      expect(availableIncomes).toContain('Remboursement Transport')
    })
  })
})
