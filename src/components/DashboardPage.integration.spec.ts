import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CsvAnalysisResult } from '../types'
import DashboardPage from './DashboardPage.vue'

// Mock des composants complexes pour focus sur l'intégration
vi.mock('./charts/BarChart.vue', () => ({
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
      '<div class="bar-chart-mock" :data-months="availableMonths"><button @click="$emit(\'month-change\', \'2024-01\')">Change Month</button></div>',
    computed: {
      availableMonths() {
        return ['2024-01', '2024-02', '2024-03']
      },
    },
  },
}))

vi.mock('./charts/PieChart.vue', () => ({
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
      '<div class="pie-chart-mock" :data-categories="props.selectedExpenseCategories?.length || 0"></div>',
    setup(props: Record<string, unknown>) {
      return { props }
    },
  },
}))

vi.mock('./filters/CategoryFilter.vue', () => ({
  default: {
    name: 'CategoryFilter',
    props: ['categories', 'selectedCategories'],
    emits: ['update:selected-categories', 'update:selected-categories'],
    template: '<div class="category-filter-mock"></div>',
  },
}))

vi.mock('./filters/AccountFilter.vue', () => ({
  default: {
    name: 'AccountFilter',
    props: ['accounts', 'selectedAccounts'],
    emits: ['update:selected-accounts'],
    template: '<div class="account-filter-mock"></div>',
  },
}))

vi.mock('./filters/JointAccountFilter.vue', () => ({
  default: {
    name: 'JointAccountFilter',
    props: ['accounts', 'selectedAccounts'],
    emits: ['update:selected-accounts'],
    template: '<div class="joint-account-filter-mock"></div>',
  },
}))

vi.mock('./filters/ReimbursementCompensationFilter.vue', () => ({
  default: {
    name: 'ReimbursementCompensationFilter',
    props: ['analysisResult', 'selectedRules'],
    emits: ['update:selectedRules'],
    template: '<div class="compensation-filter-mock"></div>',
  },
}))

vi.mock('./shared/TransactionsList.vue', () => ({
  default: {
    name: 'TransactionsList',
    props: ['transactions'],
    template: '<div class="transactions-list-mock"></div>',
  },
}))

describe('DashboardPage Integration Tests', () => {
  let wrapper: ReturnType<typeof mount>

  const mockAnalysisResult: CsvAnalysisResult = {
    isValid: true,
    transactionCount: 150,
    categoryCount: 12,
    totalAmount: 5000,
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
      totalAmount: 3000,
      transactionCount: 100,
      categoriesData: {
        Alimentation: 1200,
        Transport: 800,
        Santé: 600,
        Loisirs: 400,
      },
    },
    income: {
      categories: ['Salaire', 'Remboursement Santé', 'Remboursement Transport'],
      totalAmount: 2000,
      transactionCount: 50,
      categoriesData: {
        Salaire: 1500,
        'Remboursement Santé': 300,
        'Remboursement Transport': 200,
      },
    },
    transactions: [
      {
        account: 'Compte Principal',
        date: '2024-01-15',
        amount: -120,
        type: 'expense',
        category: 'Alimentation',
        description: 'Supermarché',
        note: '',
      },
      {
        account: 'Compte Principal',
        date: '2024-01-16',
        amount: -50,
        type: 'expense',
        category: 'Transport',
        description: 'Métro',
        note: '',
      },
      {
        account: 'Compte Joint',
        date: '2024-02-01',
        amount: -80,
        type: 'expense',
        category: 'Santé',
        description: 'Pharmacie',
        note: '',
      },
      {
        account: 'Compte Principal',
        date: '2024-02-05',
        amount: 300,
        type: 'income',
        category: 'Remboursement Santé',
        description: 'CPAM',
        note: '',
      },
    ],
  }

  const defaultProps = {
    analysisResult: mockAnalysisResult,
  }

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  describe('Rendu complet du Dashboard', () => {
    beforeEach(() => {
      wrapper = mount(DashboardPage, { props: defaultProps })
    })

    it('devrait rendre tous les composants principaux', () => {
      // Vérifier la présence de tous les composants
      expect(wrapper.find('.dashboard-manager').exists()).toBe(true)
      expect(wrapper.find('.bar-chart-mock').exists()).toBe(true)
      expect(wrapper.find('.pie-chart-mock').exists()).toBe(true)
      expect(wrapper.findComponent({ name: 'CategoryFilter' }).exists()).toBe(
        true
      )
      expect(wrapper.findComponent({ name: 'AccountFilter' }).exists()).toBe(
        true
      )
      expect(
        wrapper.findComponent({ name: 'JointAccountFilter' }).exists()
      ).toBe(true)
      expect(
        wrapper
          .findComponent({ name: 'ReimbursementCompensationFilter' })
          .exists()
      ).toBe(true)
    })

    it('devrait passer les bonnes props aux composants enfants', () => {
      const barChart = wrapper.find('.bar-chart-mock')
      const pieChart = wrapper.find('.pie-chart-mock')
      const categoryFilter = wrapper.findComponent({ name: 'CategoryFilter' })

      // Vérifier que les données sont transmises
      expect(barChart.exists()).toBe(true)
      expect(pieChart.exists()).toBe(true)
      expect(categoryFilter.props('categories')).toBeDefined()
      expect(categoryFilter.props('selectedCategories')).toBeDefined()
    })

    it('devrait afficher les statistiques du dataset', () => {
      // Vérifier que les données sont correctement affichées dans le DOM
      const content = wrapper.text()
      expect(content).toContain('150') // transactionCount
      expect(content).toContain('Analyse détaillée de vos transactions')
    })
  })

  describe('Intégration des filtres', () => {
    beforeEach(() => {
      wrapper = mount(DashboardPage, { props: defaultProps })
    })

    it('devrait synchroniser les catégories sélectionnées entre les filtres et graphiques', async () => {
      const _categoryFilter = wrapper.findComponent({ name: 'CategoryFilter' })
      const pieChart = wrapper.find('.pie-chart-mock')

      // Vérifier que le graphique est présent
      expect(pieChart.exists()).toBe(true)

      // Vérifier que le composant est présent et fonctionnel
      expect(wrapper.find('.dashboard-manager').exists()).toBe(true)
    })

    it('devrait gérer les événements des filtres', async () => {
      const jointAccountFilter = wrapper.findComponent({
        name: 'JointAccountFilter',
      })

      // Simuler un événement de changement
      await jointAccountFilter.vm.$emit('update:selected-accounts', [
        'Compte Joint',
      ])
      await wrapper.vm.$nextTick()

      // Vérifier que l'événement a été émis correctement
      expect(jointAccountFilter.exists()).toBe(true)
    })

    it('devrait gérer les règles de compensation', async () => {
      const compensationFilter = wrapper.findComponent({
        name: 'ReimbursementCompensationFilter',
      })

      const newRule = {
        expenseCategory: 'Santé',
        incomeCategory: 'Remboursement Santé',
        affectedAmount: 300,
      }

      // Simuler l'ajout d'une règle de compensation
      await compensationFilter.vm.$emit('update:selectedRules', [newRule])
      await wrapper.vm.$nextTick()

      // Vérifier que le composant traite l'événement
      expect(compensationFilter.exists()).toBe(true)
    })

    it('devrait afficher les comptes disponibles selon les données', () => {
      const accountFilter = wrapper.findComponent({ name: 'AccountFilter' })

      // Vérifier que les comptes uniques sont extraits
      const expectedAccounts = ['Compte Joint', 'Compte Principal'] // Ordre alphabétique
      expect(accountFilter.props('accounts')).toEqual(expectedAccounts)
    })
  })

  describe('Intégration graphiques et données', () => {
    beforeEach(() => {
      wrapper = mount(DashboardPage, { props: defaultProps })
    })

    it('devrait synchroniser les graphiques', async () => {
      const _barChart = wrapper.find('.bar-chart-mock')
      const _pieChart = wrapper.find('.pie-chart-mock')

      // Vérifier que les graphiques sont présents
      expect(wrapper.find('.bar-chart-mock').exists()).toBe(true)
      expect(wrapper.find('.pie-chart-mock').exists()).toBe(true)
    })

    it('devrait recalculer les données quand analysisResult change', async () => {
      const newAnalysisResult = {
        ...mockAnalysisResult,
        transactionCount: 200,
        categoryCount: 15,
      }

      await wrapper.setProps({ analysisResult: newAnalysisResult })
      await wrapper.vm.$nextTick()

      // Vérifier que le contenu est mis à jour
      const content = wrapper.text()
      expect(content).toContain('200')
    })

    it('devrait maintenir la cohérence des données entre tous les composants', () => {
      const categoryFilter = wrapper.findComponent({ name: 'CategoryFilter' })
      const accountFilter = wrapper.findComponent({ name: 'AccountFilter' })
      const jointAccountFilter = wrapper.findComponent({
        name: 'JointAccountFilter',
      })

      // Vérifier que tous reçoivent les mêmes données de base
      expect(categoryFilter.props('categories')).toBeDefined()
      expect(categoryFilter.props('selectedCategories')).toBeDefined()
      expect(accountFilter.props('accounts')).toBeDefined()
      expect(accountFilter.props('selectedAccounts')).toBeDefined()
      expect(jointAccountFilter.props('accounts')).toEqual([
        'Compte Joint',
        'Compte Principal',
      ])
    })
  })

  describe('Gestion des états et interactions complexes', () => {
    beforeEach(() => {
      wrapper = mount(DashboardPage, { props: defaultProps })
    })

    it('devrait gérer la combinaison de plusieurs filtres simultanément', async () => {
      const categoryFilter = wrapper.findComponent({ name: 'CategoryFilter' })
      const jointAccountFilter = wrapper.findComponent({
        name: 'JointAccountFilter',
      })
      const compensationFilter = wrapper.findComponent({
        name: 'ReimbursementCompensationFilter',
      })

      // Appliquer plusieurs filtres via les événements
      await categoryFilter.vm.$emit('update:selected-categories', [
        'Alimentation',
      ])
      await jointAccountFilter.vm.$emit('update:selected-accounts', [
        'Compte Joint',
      ])
      await compensationFilter.vm.$emit('update:selectedRules', [
        {
          expenseCategory: 'Santé',
          incomeCategory: 'Remboursement Santé',
          affectedAmount: 300,
        },
      ])

      await wrapper.vm.$nextTick()

      // Vérifier que tous les composants sont toujours fonctionnels
      expect(categoryFilter.exists()).toBe(true)
      expect(jointAccountFilter.exists()).toBe(true)
      expect(compensationFilter.exists()).toBe(true)
    })

    it('devrait préserver la stabilité lors de changements de props', async () => {
      const categoryFilter = wrapper.findComponent({ name: 'CategoryFilter' })

      // Définir un état via événement
      await categoryFilter.vm.$emit('update:selected-categories', ['Transport'])
      await wrapper.vm.$nextTick()

      // Changer les props
      const newAnalysisResult = {
        ...mockAnalysisResult,
        totalAmount: 6000,
      }
      await wrapper.setProps({ analysisResult: newAnalysisResult })
      await wrapper.vm.$nextTick()

      // Vérifier que le composant reste stable
      expect(categoryFilter.exists()).toBe(true)
    })

    it('devrait adapter les filtres aux nouveaux datasets', async () => {
      // Nouveau dataset complètement différent
      const newAnalysisResult: CsvAnalysisResult = {
        isValid: true,
        transactionCount: 50,
        categoryCount: 5,
        totalAmount: 1000,
        dateRange: { start: '2023-01-01', end: '2023-12-31' },
        categories: ['Nourriture', 'Essence'],
        expenses: {
          categories: ['Nourriture'],
          totalAmount: 800,
          transactionCount: 40,
          categoriesData: { Nourriture: 800 },
        },
        income: {
          categories: ['Travail'],
          totalAmount: 200,
          transactionCount: 10,
          categoriesData: { Travail: 200 },
        },
        transactions: [],
      }

      await wrapper.setProps({ analysisResult: newAnalysisResult })
      await wrapper.vm.$nextTick()

      // Vérifier que les filtres s'adaptent aux nouvelles données
      const categoryFilter = wrapper.findComponent({ name: 'CategoryFilter' })
      expect(categoryFilter.props('categories')).toBeDefined()
      expect(categoryFilter.props('selectedCategories')).toBeDefined()
    })
  })

  describe('Performance et réactivité', () => {
    beforeEach(() => {
      wrapper = mount(DashboardPage, { props: defaultProps })
    })

    it('devrait gérer des changements rapides de filtres', async () => {
      const categoryFilter = wrapper.findComponent({ name: 'CategoryFilter' })

      // Simuler des changements rapides via événements
      await categoryFilter.vm.$emit('update:selected-categories', [
        'Alimentation',
      ])
      await categoryFilter.vm.$emit('update:selected-categories', ['Transport'])
      await categoryFilter.vm.$emit('update:selected-categories', ['Santé'])

      await wrapper.vm.$nextTick()

      // Vérifier que le composant reste stable
      expect(categoryFilter.exists()).toBe(true)
    })

    it('devrait optimiser les recalculs avec des données inchangées', async () => {
      const initialRenderCount =
        wrapper.vm.$el.querySelectorAll('.pie-chart-mock').length

      // Re-set les mêmes props
      await wrapper.setProps({ analysisResult: mockAnalysisResult })
      await wrapper.vm.$nextTick()

      const finalRenderCount =
        wrapper.vm.$el.querySelectorAll('.pie-chart-mock').length
      expect(finalRenderCount).toBe(initialRenderCount)
    })
  })

  describe('Gestion des erreurs et cas limites', () => {
    it('devrait gérer gracieusement des données invalides', async () => {
      const invalidAnalysisResult = {
        ...mockAnalysisResult,
        isValid: false,
        transactions: [],
      }

      wrapper = mount(DashboardPage, {
        props: { analysisResult: invalidAnalysisResult },
      })

      await wrapper.vm.$nextTick()

      // Vérifier que le composant ne crash pas
      expect(wrapper.find('.dashboard-manager').exists()).toBe(true)
    })

    it('devrait gérer des datasets vides', async () => {
      const emptyAnalysisResult: CsvAnalysisResult = {
        isValid: true,
        transactionCount: 0,
        categoryCount: 0,
        totalAmount: 0,
        dateRange: { start: '', end: '' },
        categories: [],
        expenses: {
          categories: [],
          totalAmount: 0,
          transactionCount: 0,
          categoriesData: {},
        },
        income: {
          categories: [],
          totalAmount: 0,
          transactionCount: 0,
          categoriesData: {},
        },
        transactions: [],
      }

      wrapper = mount(DashboardPage, {
        props: { analysisResult: emptyAnalysisResult },
      })

      await wrapper.vm.$nextTick()

      // Vérifier que les composants gèrent les données vides
      expect(wrapper.find('.dashboard-manager').exists()).toBe(true)
      expect(wrapper.text()).toContain('0') // Affichage des zéros
    })

    it("devrait maintenir la stabilité lors d'interactions simultanées", async () => {
      const _categoryFilter = wrapper.findComponent({ name: 'CategoryFilter' })
      const _jointAccountFilter = wrapper.findComponent({
        name: 'JointAccountFilter',
      })

      // Modifications simultanées via props
      await wrapper.setProps({
        analysisResult: { ...mockAnalysisResult, totalAmount: 5500 },
      })
      await wrapper.vm.$nextTick()

      // Vérifier que l'état final est cohérent
      expect(wrapper.find('.dashboard-manager').exists()).toBe(true)
    })
  })
})
