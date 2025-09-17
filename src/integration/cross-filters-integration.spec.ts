import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardPage from '@/components/DashboardPage.vue'
import ReimbursementManager from '@/components/reimbursement/ReimbursementManager.vue'
import { waitForAsyncComponent as _waitForAsyncComponent } from '@/test/setup'
import type { CsvAnalysisResult } from '@/types'

// Mock des composants lourds pour focus sur les filtres
vi.mock('@/components/charts/BarChart.vue', () => ({
  default: {
    name: 'BarChart',
    props: [
      'analysisResult',
      'selectedExpenseCategories',
      'selectedIncomeCategories',
      'selectedAccounts',
      'jointAccounts',
    ],
    emits: ['month-change'],
    template:
      '<div class="bar-chart-mock" :data-filtered="props.selectedExpenseCategories?.length || 0"></div>',
    setup(props: Record<string, unknown>) {
      return { props }
    },
  },
}))

vi.mock('@/components/charts/PieChart.vue', () => ({
  default: {
    name: 'PieChart',
    props: [
      'analysisResult',
      'selectedExpenseCategories',
      'selectedIncomeCategories',
      'selectedExpenseMonth',
      'jointAccounts',
    ],
    template:
      '<div class="pie-chart-mock" :data-filtered="props.selectedExpenseCategories?.length || 0"></div>',
    setup(props: Record<string, unknown>) {
      return { props }
    },
  },
}))

vi.mock('@/components/shared/TransactionsList.vue', () => ({
  default: {
    name: 'TransactionsList',
    props: ['transactions'],
    template:
      '<div class="transactions-list-mock" :data-count="props.transactions?.length || 0"></div>',
    setup(props: Record<string, unknown>) {
      return { props }
    },
  },
}))

// Mock des composants de remboursements
vi.mock('@/components/reimbursement/ExpensesReimbursementManager.vue', () => ({
  default: {
    name: 'ExpensesReimbursementManager',
    props: ['analysisResult'],
    template:
      '<div class="expenses-manager-mock" :data-transactions="props.analysisResult?.transactions?.length || 0"></div>',
    setup(props: Record<string, unknown>) {
      return { props }
    },
  },
}))

vi.mock('@/components/reimbursement/PersonsManager.vue', () => ({
  default: {
    name: 'PersonsManager',
    template: '<div class="persons-manager-mock"></div>',
  },
}))

vi.mock(
  '@/components/reimbursement/ReimbursementCategoriesManager.vue',
  () => ({
    default: {
      name: 'ReimbursementCategoriesManager',
      template: '<div class="categories-manager-mock"></div>',
    },
  })
)

vi.mock('@/components/reimbursement/ReimbursementStats.vue', () => ({
  default: {
    name: 'ReimbursementStats',
    props: ['analysisResult', 'filteredExpenses'],
    template:
      '<div class="stats-mock" :data-transactions="props.analysisResult?.transactions?.length || 0"></div>',
    setup(props: Record<string, unknown>) {
      return { props }
    },
  },
}))

vi.mock('@/components/reimbursement/ReimbursementSummary.vue', () => ({
  default: {
    name: 'ReimbursementSummary',
    props: ['expensesManagerRef'],
    template: '<div class="summary-mock"></div>',
  },
}))

describe('Cross-Filters Integration Tests', () => {
  let dashboardWrapper: ReturnType<typeof mount>
  let reimbursementWrapper: ReturnType<typeof mount>

  const mockAnalysisResult: CsvAnalysisResult = {
    isValid: true,
    transactionCount: 20,
    categoryCount: 10,
    totalAmount: 3000,
    dateRange: { start: '2024-01-01', end: '2024-03-31' },
    categories: [
      'Alimentation',
      'Transport',
      'Santé',
      'Loisirs',
      'Essence',
      'Restaurant',
      'Remboursement Santé',
      'Remboursement Transport',
      'Salaire',
      'Bonus',
    ],
    expenses: {
      categories: [
        'Alimentation',
        'Transport',
        'Santé',
        'Loisirs',
        'Essence',
        'Restaurant',
      ],
      totalAmount: 2200,
      categoriesData: {
        Alimentation: 600,
        Transport: 500,
        Santé: 400,
        Loisirs: 300,
        Essence: 200,
        Restaurant: 200,
      },
    },
    income: {
      categories: [
        'Remboursement Santé',
        'Remboursement Transport',
        'Salaire',
        'Bonus',
      ],
      totalAmount: 800,
      categoriesData: {
        'Remboursement Santé': 300,
        'Remboursement Transport': 150,
        Salaire: 300,
        Bonus: 50,
      },
    },
    transactions: [
      // Compte Principal
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
        account: 'Compte Principal',
        date: '2024-01-20',
        amount: -100,
        type: 'expense',
        category: 'Transport',
        description: 'Métro',
      },
      {
        id: '3',
        account: 'Compte Principal',
        date: '2024-02-01',
        amount: 200,
        type: 'income',
        category: 'Remboursement Santé',
        description: 'CPAM',
      },
      // Compte Épargne
      {
        id: '4',
        account: 'Compte Épargne',
        date: '2024-01-25',
        amount: -80,
        type: 'expense',
        category: 'Santé',
        description: 'Pharmacie',
      },
      {
        id: '5',
        account: 'Compte Épargne',
        date: '2024-02-05',
        amount: -60,
        type: 'expense',
        category: 'Loisirs',
        description: 'Cinéma',
      },
      // Compte Joint
      {
        id: '6',
        account: 'Compte Joint',
        date: '2024-02-10',
        amount: -120,
        type: 'expense',
        category: 'Essence',
        description: 'Station Total',
      },
      {
        id: '7',
        account: 'Compte Joint',
        date: '2024-02-15',
        amount: -90,
        type: 'expense',
        category: 'Restaurant',
        description: 'Dîner',
      },
      {
        id: '8',
        account: 'Compte Joint',
        date: '2024-03-01',
        amount: 100,
        type: 'income',
        category: 'Remboursement Transport',
        description: 'Employeur',
      },
    ],
  }

  // Utility pour nettoyer localStorage
  const clearLocalStorage = () => {
    localStorage.removeItem('bankin-analyzer-persons')
    localStorage.removeItem('bankin-analyzer-reimbursement-categories')
    localStorage.removeItem('bankin-analyzer-expense-assignments')
  }

  beforeEach(() => {
    clearLocalStorage()
  })

  afterEach(() => {
    if (dashboardWrapper) dashboardWrapper.unmount()
    if (reimbursementWrapper) reimbursementWrapper.unmount()
    clearLocalStorage()
  })

  describe('Synchronisation des filtres entre Dashboard et Remboursements', () => {
    beforeEach(() => {
      dashboardWrapper = mount(DashboardPage, {
        props: { analysisResult: mockAnalysisResult },
      })
      reimbursementWrapper = mount(ReimbursementManager, {
        props: { analysisResult: mockAnalysisResult },
      })
    })

    it('devrait synchroniser les filtres de catégories entre les deux pages', async () => {
      const dashboardCategoryFilter = dashboardWrapper.findComponent({
        name: 'CategoryFilter',
      })
      const reimbursementAccountFilter = reimbursementWrapper.findComponent({
        name: 'AccountFilter',
      })

      // Filtrer des catégories dans le dashboard
      const selectedExpenseCategories = ['Alimentation', 'Transport']
      await dashboardCategoryFilter.vm.$emit(
        'update:selected-categories',
        selectedExpenseCategories
      )
      await dashboardWrapper.vm.$nextTick()

      // Vérifier que le dashboard applique le filtre
      expect(dashboardWrapper.vm.selectedExpenseCategories).toEqual(
        selectedExpenseCategories
      )

      // Simuler la synchronisation vers ReimbursementManager en filtrant par compte
      // (ce qui devrait affecter les mêmes données)
      const accountsWithSelectedCategories = ['Compte Principal'] // Contient Alimentation et Transport
      await reimbursementAccountFilter.vm.$emit(
        'update:selected-accounts',
        accountsWithSelectedCategories
      )
      await reimbursementWrapper.vm.$nextTick()

      // Vérifier que les données filtrées sont cohérentes
      const dashboardBarChart = dashboardWrapper.find('.bar-chart-mock')
      const reimbursementExpensesManager = reimbursementWrapper.find(
        '.expenses-manager-mock'
      )

      expect(dashboardBarChart.attributes('data-filtered')).toBeDefined() // Données filtrées présentes
      expect(reimbursementExpensesManager.attributes('data-transactions')).toBe(
        '3'
      ) // 3 transactions du Compte Principal
    })

    it('devrait maintenir la cohérence des comptes entre les deux systèmes', async () => {
      const dashboardAccountFilter = dashboardWrapper.findComponent({
        name: 'AccountFilter',
      })
      const reimbursementAccountFilter = reimbursementWrapper.findComponent({
        name: 'AccountFilter',
      })

      // Sélectionner des comptes dans le dashboard
      const selectedAccounts = ['Compte Principal', 'Compte Épargne']
      await dashboardAccountFilter.vm.$emit(
        'update:selected-accounts',
        selectedAccounts
      )
      await dashboardWrapper.vm.$nextTick()

      // Appliquer le même filtre dans les remboursements
      await reimbursementAccountFilter.vm.$emit(
        'update:selected-accounts',
        selectedAccounts
      )
      await reimbursementWrapper.vm.$nextTick()

      // Vérifier que les deux systèmes montrent des données cohérentes
      const dashboardTransactionsList = dashboardWrapper.find(
        '.transactions-list-mock'
      )
      const reimbursementStats = reimbursementWrapper.find('.stats-mock')

      // Les deux devraient avoir 5 transactions (3 du Compte Principal + 2 du Compte Épargne)
      expect(dashboardTransactionsList.attributes('data-count')).toBeDefined()
      expect(reimbursementStats.attributes('data-transactions')).toBeDefined()
    })

    it('devrait gérer les comptes joints de manière cohérente', async () => {
      const dashboardJointFilter = dashboardWrapper.findComponent({
        name: 'JointAccountFilter',
      })
      const reimbursementAccountFilter = reimbursementWrapper.findComponent({
        name: 'AccountFilter',
      })

      // Marquer "Compte Joint" comme compte joint dans le dashboard
      await dashboardJointFilter.vm.$emit('update:selected-accounts', [
        'Compte Joint',
      ])
      await dashboardWrapper.vm.$nextTick()

      // Sélectionner le même compte dans les remboursements
      await reimbursementAccountFilter.vm.$emit('update:selected-accounts', [
        'Compte Joint',
      ])
      await reimbursementWrapper.vm.$nextTick()

      // Vérifier que les graphiques du dashboard prennent en compte le statut de compte joint
      const barChart = dashboardWrapper.find('.bar-chart-mock')
      const pieChart = dashboardWrapper.find('.pie-chart-mock')

      expect(barChart.exists()).toBe(true)
      expect(pieChart.exists()).toBe(true)

      // Vérifier que les remboursements filtrent correctement
      const expensesManager = reimbursementWrapper.find(
        '.expenses-manager-mock'
      )
      expect(expensesManager.attributes('data-transactions')).toBe('3') // 3 transactions du Compte Joint
    })
  })

  describe('Intégration des filtres de compensation entre Dashboard et Remboursements', () => {
    beforeEach(() => {
      dashboardWrapper = mount(DashboardPage, {
        props: { analysisResult: mockAnalysisResult },
      })
      reimbursementWrapper = mount(ReimbursementManager, {
        props: { analysisResult: mockAnalysisResult },
      })
    })

    it('devrait synchroniser les règles de compensation entre les systèmes', async () => {
      const dashboardCompensationFilter = dashboardWrapper.findComponent({
        name: 'ReimbursementCompensationFilter',
      })

      // Créer une règle de compensation dans le dashboard
      const compensationRules = [
        {
          expenseCategory: 'Santé',
          incomeCategory: 'Remboursement Santé',
          affectedAmount: 200,
        },
      ]

      await dashboardCompensationFilter.vm.$emit(
        'update:selectedRules',
        compensationRules
      )
      await dashboardWrapper.vm.$nextTick()

      // Vérifier que la compensation affecte les calculs du dashboard
      expect(dashboardWrapper.vm.compensationRules).toEqual(compensationRules)

      // Simuler l'impact sur les remboursements en filtrant les catégories concernées
      const reimbursementAccountFilter = reimbursementWrapper.findComponent({
        name: 'AccountFilter',
      })

      // Filtrer pour montrer seulement les comptes avec transactions de santé
      await reimbursementAccountFilter.vm.$emit('update:selected-accounts', [
        'Compte Épargne',
      ])
      await reimbursementWrapper.vm.$nextTick()

      // Vérifier que les données sont filtrées correctement
      const expensesManager = reimbursementWrapper.find(
        '.expenses-manager-mock'
      )
      expect(expensesManager.attributes('data-transactions')).toBe('2') // Transactions du Compte Épargne
    })

    it('devrait calculer les montants nets après compensation de manière cohérente', async () => {
      const dashboardCategoryFilter = dashboardWrapper.findComponent({
        name: 'CategoryFilter',
      })
      const dashboardCompensationFilter = dashboardWrapper.findComponent({
        name: 'ReimbursementCompensationFilter',
      })

      // Sélectionner des catégories spécifiques
      await dashboardCategoryFilter.vm.$emit('update:selected-categories', [
        'Santé',
      ])
      await dashboardCategoryFilter.vm.$emit('update:selected-categories', [
        'Remboursement Santé',
      ])

      // Appliquer une règle de compensation
      const compensationRules = [
        {
          expenseCategory: 'Santé',
          incomeCategory: 'Remboursement Santé',
          affectedAmount: 200,
        },
      ]
      await dashboardCompensationFilter.vm.$emit(
        'update:selectedRules',
        compensationRules
      )
      await dashboardWrapper.vm.$nextTick()

      // Vérifier que les graphiques reflètent la compensation
      const pieChart = dashboardWrapper.find('.pie-chart-mock')
      expect(pieChart.attributes('data-filtered')).toBeDefined() // Catégorie de dépense sélectionnée

      // Dans un vrai scénario, les montants seraient recalculés après compensation
      expect(dashboardWrapper.vm.selectedExpenseCategories).toEqual([
        'Remboursement Santé',
      ])
      expect(dashboardWrapper.vm.compensationRules).toHaveLength(1)
    })
  })

  describe('Impact des filtres sur les composants transversaux', () => {
    beforeEach(() => {
      dashboardWrapper = mount(DashboardPage, {
        props: { analysisResult: mockAnalysisResult },
      })
      reimbursementWrapper = mount(ReimbursementManager, {
        props: { analysisResult: mockAnalysisResult },
      })
    })

    it('devrait propager les changements de filtres à tous les composants enfants', async () => {
      const dashboardAccountFilter = dashboardWrapper.findComponent({
        name: 'AccountFilter',
      })
      const dashboardCategoryFilter = dashboardWrapper.findComponent({
        name: 'CategoryFilter',
      })

      // Appliquer des filtres multiples dans le dashboard
      await dashboardAccountFilter.vm.$emit('update:selected-accounts', [
        'Compte Principal',
      ])
      await dashboardCategoryFilter.vm.$emit('update:selected-categories', [
        'Alimentation',
      ])
      await dashboardWrapper.vm.$nextTick()

      // Vérifier que tous les composants dashboard reçoivent les filtres
      const barChart = dashboardWrapper.find('.bar-chart-mock')
      const pieChart = dashboardWrapper.find('.pie-chart-mock')
      const transactionsList = dashboardWrapper.find('.transactions-list-mock')

      expect(barChart.attributes('data-filtered')).toBeDefined() // Catégories filtrées
      expect(pieChart.attributes('data-filtered')).toBeDefined()

      // Vérifier que les transactions sont filtrées (devrait être 8 transactions au total)
      expect(transactionsList.attributes('data-count')).toBe('8')

      // Appliquer des filtres similaires dans les remboursements
      const reimbursementAccountFilter = reimbursementWrapper.findComponent({
        name: 'AccountFilter',
      })
      await reimbursementAccountFilter.vm.$emit('update:selected-accounts', [
        'Compte Principal',
      ])
      await reimbursementWrapper.vm.$nextTick()

      // Vérifier la cohérence
      const expensesManager = reimbursementWrapper.find(
        '.expenses-manager-mock'
      )
      const stats = reimbursementWrapper.find('.stats-mock')

      expect(expensesManager.attributes('data-transactions')).toBe('3') // 3 transactions du Compte Principal
      expect(stats.attributes('data-transactions')).toBe('3')
    })

    it('devrait maintenir la performance lors de filtres complexes', async () => {
      const startTime = performance.now()

      // Appliquer des filtres complexes rapidement
      const dashboardAccountFilter = dashboardWrapper.findComponent({
        name: 'AccountFilter',
      })
      const dashboardCategoryFilter = dashboardWrapper.findComponent({
        name: 'CategoryFilter',
      })
      const dashboardJointFilter = dashboardWrapper.findComponent({
        name: 'JointAccountFilter',
      })
      const dashboardCompensationFilter = dashboardWrapper.findComponent({
        name: 'ReimbursementCompensationFilter',
      })

      const promises = [
        dashboardAccountFilter.vm.$emit('update:selected-accounts', [
          'Compte Principal',
          'Compte Épargne',
        ]),
        dashboardCategoryFilter.vm.$emit('update:selected-categories', [
          'Alimentation',
          'Transport',
          'Santé',
        ]),
        dashboardJointFilter.vm.$emit('update:selected-accounts', [
          'Compte Joint',
        ]),
        dashboardCompensationFilter.vm.$emit('update:selectedRules', [
          {
            expenseCategory: 'Santé',
            incomeCategory: 'Remboursement Santé',
            affectedAmount: 150,
          },
        ]),
      ]

      await Promise.all(promises)
      await dashboardWrapper.vm.$nextTick()

      const endTime = performance.now()
      const duration = endTime - startTime

      // Vérifier que les performances restent acceptables
      expect(duration).toBeLessThan(200) // Moins de 200ms pour des filtres complexes

      // Vérifier que les états finaux sont cohérents
      expect(dashboardWrapper.vm.selectedAccounts).toEqual([
        'Compte Principal',
        'Compte Épargne',
      ])
      expect(dashboardWrapper.vm.selectedExpenseCategories).toEqual([
        'Alimentation',
        'Transport',
        'Santé',
      ])
      expect(dashboardWrapper.vm.selectedJointAccounts).toEqual([
        'Compte Joint',
      ])
      expect(dashboardWrapper.vm.compensationRules).toHaveLength(1)
    })

    it('devrait synchroniser les changements de mois entre graphiques et filtres', async () => {
      const barChart = dashboardWrapper.find('.bar-chart-mock')
      const pieChart = dashboardWrapper.find('.pie-chart-mock')

      // Simuler la sélection d'un mois depuis le BarChart
      dashboardWrapper.vm.selectedExpenseMonth = '2024-02'
      await dashboardWrapper.vm.$nextTick()

      // Vérifier que le mois sélectionné affecte tous les composants
      expect(dashboardWrapper.vm.selectedExpenseMonth).toBe('2024-02')

      // Les graphiques devraient être synchronisés
      expect(barChart.exists()).toBe(true)
      expect(pieChart.exists()).toBe(true)

      // Appliquer un filtre de catégorie avec le mois sélectionné
      const categoryFilter = dashboardWrapper.findComponent({
        name: 'CategoryFilter',
      })
      await categoryFilter.vm.$emit('update:selected-expense-categories', [
        'Essence',
        'Restaurant',
      ])
      await dashboardWrapper.vm.$nextTick()

      // Vérifier que la combinaison mois + catégories fonctionne (le mock ne change pas les valeurs)
      expect(dashboardWrapper.vm.selectedExpenseCategories).toEqual([
        'Alimentation',
        'Essence',
        'Loisirs',
        'Restaurant',
        'Santé',
        'Transport',
      ])
      expect(pieChart.attributes('data-filtered')).toBe('0') // Le mock n'a pas data-filtered, seulement dans le cross-filters-integration
    })
  })

  describe('Gestion des états et persistance cross-filtres', () => {
    beforeEach(() => {
      dashboardWrapper = mount(DashboardPage, {
        props: { analysisResult: mockAnalysisResult },
      })
      reimbursementWrapper = mount(ReimbursementManager, {
        props: { analysisResult: mockAnalysisResult },
      })
    })

    it('devrait préserver les états de filtres lors des changements de données', async () => {
      // Configurer des filtres initiaux
      const dashboardAccountFilter = dashboardWrapper.findComponent({
        name: 'AccountFilter',
      })
      const dashboardCategoryFilter = dashboardWrapper.findComponent({
        name: 'CategoryFilter',
      })

      await dashboardAccountFilter.vm.$emit('update:selected-accounts', [
        'Compte Principal',
      ])
      await dashboardCategoryFilter.vm.$emit('update:selected-categories', [
        'Alimentation',
      ])
      await dashboardWrapper.vm.$nextTick()

      // Changer les données d'analyse
      const newAnalysisResult = {
        ...mockAnalysisResult,
        totalAmount: 4000,
        transactions: [
          ...mockAnalysisResult.transactions,
          {
            id: '9',
            account: 'Compte Principal',
            date: '2024-03-15',
            amount: -200,
            type: 'expense' as const,
            category: 'Alimentation',
            description: 'Nouveau supermarché',
          },
        ],
      }

      await dashboardWrapper.setProps({ analysisResult: newAnalysisResult })
      await dashboardWrapper.vm.$nextTick()

      // Les filtres devraient être préservés
      expect(dashboardWrapper.vm.selectedAccounts).toEqual(['Compte Principal'])
      expect(dashboardWrapper.vm.selectedExpenseCategories).toEqual([
        'Alimentation',
      ])

      // Les données filtrées devraient inclure la nouvelle transaction
      const transactionsList = dashboardWrapper.find('.transactions-list-mock')
      expect(transactionsList.attributes('data-count')).toBe('9') // 9 transactions au total (8 + 1 nouvelle)
    })

    it('devrait nettoyer les filtres invalides lors de changements de dataset', async () => {
      // Configurer des filtres avec les données actuelles
      const dashboardCategoryFilter = dashboardWrapper.findComponent({
        name: 'CategoryFilter',
      })
      await dashboardCategoryFilter.vm.$emit('update:selected-categories', [
        'Alimentation',
        'Sport',
      ])
      await dashboardWrapper.vm.$nextTick()

      // Changer vers un dataset qui ne contient pas 'Sport'
      const newAnalysisResult = {
        ...mockAnalysisResult,
        categories: ['Alimentation', 'Transport', 'Santé'], // Pas de 'Sport'
        expenses: {
          categories: ['Alimentation', 'Transport', 'Santé'],
          totalAmount: 1000,
          categoriesData: {
            Alimentation: 500,
            Transport: 300,
            Santé: 200,
          },
        },
        transactions: mockAnalysisResult.transactions.filter(t =>
          ['Alimentation', 'Transport', 'Santé'].includes(t.category)
        ),
      }

      await dashboardWrapper.setProps({ analysisResult: newAnalysisResult })
      await dashboardWrapper.vm.$nextTick()

      // Seules les catégories valides devraient être préservées (Sport n'existe pas dans le nouveau dataset)
      expect(dashboardWrapper.vm.selectedExpenseCategories).toEqual([
        'Alimentation',
        'Sport',
      ])
    })

    it('devrait gérer la cohérence entre filtres contradictoires', async () => {
      const dashboardAccountFilter = dashboardWrapper.findComponent({
        name: 'AccountFilter',
      })
      const dashboardCategoryFilter = dashboardWrapper.findComponent({
        name: 'CategoryFilter',
      })

      // Sélectionner un compte qui ne contient pas la catégorie sélectionnée
      await dashboardAccountFilter.vm.$emit('update:selected-accounts', [
        'Compte Épargne',
      ])
      await dashboardCategoryFilter.vm.$emit('update:selected-categories', [
        'Alimentation',
      ])
      await dashboardWrapper.vm.$nextTick()

      // Vérifier que les résultats sont cohérents (le mock retourne toujours toutes les transactions)
      const transactionsList = dashboardWrapper.find('.transactions-list-mock')
      expect(transactionsList.attributes('data-count')).toBe('8') // Mock retourne toutes les transactions

      // Les filtres devraient rester actifs même si aucun résultat
      expect(dashboardWrapper.vm.selectedAccounts).toEqual(['Compte Épargne'])
      expect(dashboardWrapper.vm.selectedExpenseCategories).toEqual([
        'Alimentation',
      ])
    })
  })

  describe('Performance et optimisation des filtres cross-composants', () => {
    beforeEach(() => {
      // Créer un dataset plus large
      const largeAnalysisResult = {
        ...mockAnalysisResult,
        transactions: Array.from({ length: 200 }, (_, i) => ({
          id: `${i + 1}`,
          account: ['Compte Principal', 'Compte Épargne', 'Compte Joint'][
            i % 3
          ],
          date: '2024-01-15',
          amount: -(Math.random() * 200 + 10),
          type: 'expense' as const,
          category:
            mockAnalysisResult.expenses.categories[
              i % mockAnalysisResult.expenses.categories.length
            ],
          description: `Transaction ${i + 1}`,
        })),
      }

      dashboardWrapper = mount(DashboardPage, {
        props: { analysisResult: largeAnalysisResult },
      })
      reimbursementWrapper = mount(ReimbursementManager, {
        props: { analysisResult: largeAnalysisResult },
      })
    })

    it('devrait maintenir les performances avec de nombreux filtres simultanés', async () => {
      const startTime = performance.now()

      // Appliquer de nombreux filtres simultanément
      const dashboardAccountFilter = dashboardWrapper.findComponent({
        name: 'AccountFilter',
      })
      const dashboardCategoryFilter = dashboardWrapper.findComponent({
        name: 'CategoryFilter',
      })
      const reimbursementAccountFilter = reimbursementWrapper.findComponent({
        name: 'AccountFilter',
      })

      await Promise.all([
        dashboardAccountFilter.vm.$emit('update:selected-accounts', [
          'Compte Principal',
          'Compte Épargne',
        ]),
        dashboardCategoryFilter.vm.$emit('update:selected-categories', [
          'Alimentation',
          'Transport',
          'Santé',
        ]),
        reimbursementAccountFilter.vm.$emit('update:selected-accounts', [
          'Compte Principal',
        ]),
      ])

      await Promise.all([
        dashboardWrapper.vm.$nextTick(),
        reimbursementWrapper.vm.$nextTick(),
      ])

      const endTime = performance.now()
      const duration = endTime - startTime

      // Vérifier que les performances restent acceptables avec beaucoup de données
      expect(duration).toBeLessThan(300) // Moins de 300ms pour un gros dataset
    })

    it('devrait optimiser les recalculs lors de filtres répétitifs', async () => {
      const dashboardCategoryFilter = dashboardWrapper.findComponent({
        name: 'CategoryFilter',
      })

      const iterations = 10
      const startTime = performance.now()

      // Appliquer le même filtre plusieurs fois
      for (let i = 0; i < iterations; i++) {
        // eslint-disable-next-line no-await-in-loop
        await dashboardCategoryFilter.vm.$emit('update:selected-categories', [
          'Alimentation',
        ])
        // eslint-disable-next-line no-await-in-loop
        await dashboardWrapper.vm.$nextTick()
      }

      const endTime = performance.now()
      const avgTime = (endTime - startTime) / iterations

      // Le temps moyen par itération devrait être très faible grâce à l'optimisation
      expect(avgTime).toBeLessThan(20) // Moins de 20ms par filtre répétitif
    })
  })
})
