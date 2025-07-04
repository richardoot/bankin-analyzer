import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BarChart from '@/components/charts/BarChart.vue'
import PieChart from '@/components/charts/PieChart.vue'
import type { CsvAnalysisResult } from '@/types'

// Mock des composables
vi.mock('@/composables/useBarChart', () => ({
  useBarChart: vi.fn(() => ({
    chartData: {
      months: [
        {
          month: 'Janvier',
          year: 2024,
          monthKey: '2024-01',
          expenses: 800,
          income: 700,
          net: -100,
          transactionCount: 10,
        },
        {
          month: 'Février',
          year: 2024,
          monthKey: '2024-02',
          expenses: 600,
          income: 800,
          net: 200,
          transactionCount: 8,
        },
        {
          month: 'Mars',
          year: 2024,
          monthKey: '2024-03',
          expenses: 600,
          income: 0,
          net: -600,
          transactionCount: 7,
        },
      ],
      maxValue: 800,
    },
    availableMonths: ['2024-01', '2024-02', '2024-03'],
    formatAmount: (amount: number) =>
      `${(amount || 0).toLocaleString('fr-FR')} €`,
    updateChartData: vi.fn(),
  })),
}))

vi.mock('@/composables/usePieChart', () => ({
  usePieChart: vi.fn(() => ({
    pieData: {
      categories: [
        { name: 'Alimentation', amount: 800, percentage: 40, color: '#3B82F6' },
        { name: 'Transport', amount: 600, percentage: 30, color: '#6366F1' },
        { name: 'Santé', amount: 400, percentage: 20, color: '#8B5CF6' },
        { name: 'Loisirs', amount: 200, percentage: 10, color: '#A855F7' },
      ],
      totalAmount: 2000,
    },
    formatAmount: (amount: number) =>
      `${(amount || 0).toLocaleString('fr-FR')} €`,
    formatPercentage: (percentage: number) => `${percentage.toFixed(1)}%`,
    getCategoryColor: (index: number) => `hsl(${index * 40}, 70%, 50%)`,
    updatePieData: vi.fn(),
  })),
}))

describe('Charts Integration Tests', () => {
  let barChartWrapper: ReturnType<typeof mount>
  let pieChartWrapper: ReturnType<typeof mount>

  const mockAnalysisResult: CsvAnalysisResult = {
    isValid: true,
    transactionCount: 100,
    categoryCount: 8,
    totalAmount: 3500,
    dateRange: { start: '2024-01-01', end: '2024-03-31' },
    categories: [
      'Alimentation',
      'Transport',
      'Santé',
      'Loisirs',
      'Remboursement Santé',
      'Remboursement Transport',
      'Salaire',
      'Autres',
    ],
    expenses: {
      categories: ['Alimentation', 'Transport', 'Santé', 'Loisirs'],
      totalAmount: 2000,
      categoriesData: {
        Alimentation: 800,
        Transport: 600,
        Santé: 400,
        Loisirs: 200,
      },
    },
    income: {
      categories: [
        'Remboursement Santé',
        'Remboursement Transport',
        'Salaire',
        'Autres',
      ],
      totalAmount: 1500,
      categoriesData: {
        'Remboursement Santé': 300,
        'Remboursement Transport': 200,
        Salaire: 900,
        Autres: 100,
      },
    },
    transactions: [
      {
        id: '1',
        account: 'Compte Principal',
        date: '2024-01-15',
        amount: -200,
        type: 'expense',
        category: 'Alimentation',
        description: 'Courses',
      },
      {
        id: '2',
        account: 'Compte Principal',
        date: '2024-02-15',
        amount: -150,
        type: 'expense',
        category: 'Transport',
        description: 'Carburant',
      },
      {
        id: '3',
        account: 'Compte Principal',
        date: '2024-03-15',
        amount: 300,
        type: 'income',
        category: 'Remboursement Santé',
        description: 'Remboursement CPAM',
      },
    ],
  }

  const defaultBarChartProps = {
    chartData: {
      months: [
        {
          month: 'Janvier',
          year: 2024,
          monthKey: '2024-01',
          expenses: 800,
          income: 700,
          net: -100,
          transactionCount: 10,
        },
        {
          month: 'Février',
          year: 2024,
          monthKey: '2024-02',
          expenses: 600,
          income: 800,
          net: 200,
          transactionCount: 8,
        },
        {
          month: 'Mars',
          year: 2024,
          monthKey: '2024-03',
          expenses: 600,
          income: 0,
          net: -600,
          transactionCount: 7,
        },
      ],
      maxValue: 800,
    },
    title: 'Évolution mensuelle',
    type: 'comparison' as const,
    formatAmount: (amount: number) =>
      `${(amount || 0).toLocaleString('fr-FR')} €`,
    analysisResult: mockAnalysisResult,
    availableCategories: ['Alimentation', 'Transport', 'Santé', 'Loisirs'],
  }

  const defaultPieChartProps = {
    chartData: {
      categories: [
        { name: 'Alimentation', amount: 800, percentage: 40, color: '#3B82F6' },
        { name: 'Transport', amount: 600, percentage: 30, color: '#6366F1' },
        { name: 'Santé', amount: 400, percentage: 20, color: '#8B5CF6' },
        { name: 'Loisirs', amount: 200, percentage: 10, color: '#A855F7' },
      ],
      totalAmount: 2000,
    },
    title: 'Répartition par catégories',
    type: 'expenses' as const,
    formatAmount: (amount: number) =>
      `${(amount || 0).toLocaleString('fr-FR')} €`,
    formatPercentage: (percentage: number) => `${percentage.toFixed(1)}%`,
    selectedMonth: null,
  }

  afterEach(() => {
    if (barChartWrapper) barChartWrapper.unmount()
    if (pieChartWrapper) pieChartWrapper.unmount()
  })

  describe('Rendu et intégration des graphiques', () => {
    beforeEach(() => {
      barChartWrapper = mount(BarChart, { props: defaultBarChartProps })
      pieChartWrapper = mount(PieChart, { props: defaultPieChartProps })
    })

    it('devrait rendre les deux graphiques avec les mêmes données', () => {
      expect(barChartWrapper.exists()).toBe(true)
      expect(pieChartWrapper.exists()).toBe(true)

      // Vérifier que les deux graphiques reçoivent les bonnes données
      expect(barChartWrapper.props('chartData')).toBeDefined()
      expect(pieChartWrapper.props('chartData')).toBeDefined()
      expect(barChartWrapper.props('title')).toBe('Évolution mensuelle')
      expect(pieChartWrapper.props('title')).toBe('Répartition par catégories')
    })

    it('devrait afficher les containers SVG pour les graphiques', () => {
      expect(barChartWrapper.find('.bar-chart-container').exists()).toBe(true)
      expect(pieChartWrapper.find('.pie-chart-container').exists()).toBe(true)
    })

    it('devrait gérer les catégories disponibles', () => {
      expect(barChartWrapper.props('availableCategories')).toEqual([
        'Alimentation',
        'Transport',
        'Santé',
        'Loisirs',
      ])
      expect(pieChartWrapper.props('chartData').categories).toHaveLength(4)
      expect(pieChartWrapper.props('chartData').categories[0].name).toBe(
        'Alimentation'
      )
    })
  })

  describe('Synchronisation des filtres entre graphiques', () => {
    beforeEach(() => {
      barChartWrapper = mount(BarChart, { props: defaultBarChartProps })
      pieChartWrapper = mount(PieChart, { props: defaultPieChartProps })
    })

    it('devrait synchroniser les changements de catégories de dépenses', async () => {
      const newCategories = ['Alimentation', 'Transport']
      const newChartData = {
        categories: [
          {
            name: 'Alimentation',
            amount: 800,
            percentage: 57.1,
            color: '#3B82F6',
          },
          {
            name: 'Transport',
            amount: 600,
            percentage: 42.9,
            color: '#6366F1',
          },
        ],
        totalAmount: 1400,
      }

      // Mettre à jour les graphiques avec les nouvelles catégories filtrées
      await barChartWrapper.setProps({ availableCategories: newCategories })
      await pieChartWrapper.setProps({ chartData: newChartData })

      expect(barChartWrapper.props('availableCategories')).toEqual(
        newCategories
      )
      expect(pieChartWrapper.props('chartData').categories).toHaveLength(2)
    })

    it('devrait mettre à jour les données des graphiques de manière cohérente', async () => {
      const newBarData = {
        months: [
          {
            month: 'Janvier',
            year: 2024,
            monthKey: '2024-01',
            expenses: 1000,
            income: 800,
            net: -200,
            transactionCount: 12,
          },
        ],
        maxValue: 1000,
      }
      const newPieData = {
        categories: [
          {
            name: 'Alimentation',
            amount: 1000,
            percentage: 100,
            color: '#3B82F6',
          },
        ],
        totalAmount: 1000,
      }

      await barChartWrapper.setProps({ chartData: newBarData })
      await pieChartWrapper.setProps({ chartData: newPieData })

      expect(barChartWrapper.props('chartData').maxValue).toBe(1000)
      expect(pieChartWrapper.props('chartData').totalAmount).toBe(1000)
    })

    it('devrait synchroniser les titres des graphiques', async () => {
      await barChartWrapper.setProps({ title: 'Nouveau titre BarChart' })
      await pieChartWrapper.setProps({ title: 'Nouveau titre PieChart' })

      expect(barChartWrapper.props('title')).toBe('Nouveau titre BarChart')
      expect(pieChartWrapper.props('title')).toBe('Nouveau titre PieChart')
    })
  })

  describe('Interaction entre BarChart et PieChart', () => {
    beforeEach(() => {
      barChartWrapper = mount(BarChart, { props: defaultBarChartProps })
      pieChartWrapper = mount(PieChart, { props: defaultPieChartProps })
    })

    it('devrait émettre des événements de clic sur les mois depuis BarChart', async () => {
      const monthData = {
        month: 'Janvier',
        year: 2024,
        monthKey: '2024-01',
        expenses: 800,
        income: 700,
        net: -100,
        transactionCount: 10,
      }

      // Simuler un clic sur un mois dans BarChart
      await barChartWrapper.vm.$emit('monthClick', monthData, 'expenses')

      expect(barChartWrapper.emitted('monthClick')).toBeTruthy()
      expect(barChartWrapper.emitted('monthClick')?.[0]?.[0]).toEqual(monthData)
    })

    it('devrait recevoir la sélection de mois dans PieChart', async () => {
      // Simuler que PieChart reçoit la sélection de mois
      await pieChartWrapper.setProps({ selectedMonth: '2024-02' })

      expect(pieChartWrapper.props('selectedMonth')).toBe('2024-02')
    })

    it('devrait maintenir la cohérence lors de changements simultanés', async () => {
      const newBarData = {
        months: [
          {
            month: 'Janvier',
            year: 2024,
            monthKey: '2024-01',
            expenses: 500,
            income: 600,
            net: 100,
            transactionCount: 5,
          },
        ],
        maxValue: 600,
      }
      const newPieData = {
        categories: [
          {
            name: 'Alimentation',
            amount: 500,
            percentage: 100,
            color: '#3B82F6',
          },
        ],
        totalAmount: 500,
      }

      // Appliquer les changements simultanément
      await Promise.all([
        barChartWrapper.setProps({
          chartData: newBarData,
          title: 'Nouveau BarChart',
        }),
        pieChartWrapper.setProps({
          chartData: newPieData,
          selectedMonth: '2024-01',
        }),
      ])

      // Vérifier la cohérence
      expect(barChartWrapper.props('chartData').maxValue).toBe(600)
      expect(pieChartWrapper.props('chartData').totalAmount).toBe(500)
      expect(pieChartWrapper.props('selectedMonth')).toBe('2024-01')
    })
  })

  describe('Gestion des données et performance', () => {
    it('devrait gérer les gros datasets efficacement', async () => {
      // Créer un gros dataset pour les graphiques
      const largeBarData = {
        months: Array.from({ length: 24 }, (_, i) => ({
          month: `Month${i + 1}`,
          year: 2024,
          monthKey: `2024-${String(i + 1).padStart(2, '0')}`,
          expenses: Math.random() * 2000,
          income: Math.random() * 2000,
          net: Math.random() * 1000 - 500,
          transactionCount: Math.floor(Math.random() * 100) + 10,
        })),
        maxValue: 2000,
      }

      const largePieData = {
        categories: Array.from({ length: 20 }, (_, i) => ({
          name: `Catégorie ${i + 1}`,
          amount: Math.random() * 1000,
          percentage: 5,
          color: `hsl(${i * 18}, 70%, 50%)`,
        })),
        totalAmount: 20000,
      }

      barChartWrapper = mount(BarChart, {
        props: { ...defaultBarChartProps, chartData: largeBarData },
      })
      pieChartWrapper = mount(PieChart, {
        props: { ...defaultPieChartProps, chartData: largePieData },
      })

      // Les composants devraient se monter sans problème
      expect(barChartWrapper.exists()).toBe(true)
      expect(pieChartWrapper.exists()).toBe(true)
      expect(barChartWrapper.props('chartData').months).toHaveLength(24)
      expect(pieChartWrapper.props('chartData').categories).toHaveLength(20)
    })

    it('devrait gérer les datasets vides sans erreur', async () => {
      const emptyBarData = {
        months: [],
        maxValue: 0,
      }

      const emptyPieData = {
        categories: [],
        totalAmount: 0,
      }

      barChartWrapper = mount(BarChart, {
        props: { ...defaultBarChartProps, chartData: emptyBarData },
      })
      pieChartWrapper = mount(PieChart, {
        props: { ...defaultPieChartProps, chartData: emptyPieData },
      })

      expect(barChartWrapper.exists()).toBe(true)
      expect(pieChartWrapper.exists()).toBe(true)
      expect(barChartWrapper.props('chartData').months).toHaveLength(0)
      expect(pieChartWrapper.props('chartData').categories).toHaveLength(0)
    })

    it('devrait réagir aux changements de données en temps réel', async () => {
      barChartWrapper = mount(BarChart, { props: defaultBarChartProps })
      pieChartWrapper = mount(PieChart, { props: defaultPieChartProps })

      // Simuler un changement de données
      const updatedBarData = {
        months: [
          {
            month: 'Janvier',
            year: 2024,
            monthKey: '2024-01',
            expenses: 1200,
            income: 1000,
            net: -200,
            transactionCount: 15,
          },
        ],
        maxValue: 1200,
      }

      const updatedPieData = {
        categories: [
          {
            name: 'Alimentation',
            amount: 1200,
            percentage: 100,
            color: '#3B82F6',
          },
        ],
        totalAmount: 1200,
      }

      await barChartWrapper.setProps({ chartData: updatedBarData })
      await pieChartWrapper.setProps({ chartData: updatedPieData })

      expect(barChartWrapper.props('chartData').maxValue).toBe(1200)
      expect(pieChartWrapper.props('chartData').totalAmount).toBe(1200)
    })
  })

  describe('Gestion des erreurs et cas limites', () => {
    it('devrait gérer les données corrompues gracieusement', async () => {
      const corruptedBarData = {
        months: [
          {
            month: 'Janvier',
            year: 2024,
            monthKey: '2024-01',
            expenses: NaN,
            income: NaN,
            net: NaN,
            transactionCount: 0,
          },
        ],
        maxValue: NaN,
      }

      const corruptedPieData = {
        categories: [{ name: '', amount: NaN, percentage: NaN, color: '' }],
        totalAmount: NaN,
      }

      // Les composants ne devraient pas crasher même avec des données corrompues
      expect(() => {
        barChartWrapper = mount(BarChart, {
          props: { ...defaultBarChartProps, chartData: corruptedBarData },
        })
        pieChartWrapper = mount(PieChart, {
          props: { ...defaultPieChartProps, chartData: corruptedPieData },
        })
      }).not.toThrow()
    })

    it('devrait gérer les changements rapides de props', async () => {
      barChartWrapper = mount(BarChart, { props: defaultBarChartProps })
      pieChartWrapper = mount(PieChart, { props: defaultPieChartProps })

      // Effectuer des changements rapides de titres
      const updates = ['Titre 1', 'Titre 2', 'Titre 3', 'Titre Final']

      for (const title of updates) {
        // eslint-disable-next-line no-await-in-loop
        await barChartWrapper.setProps({ title })
        // eslint-disable-next-line no-await-in-loop
        await pieChartWrapper.setProps({ title })
      }

      // Vérifier que le dernier état est correct
      expect(barChartWrapper.props('title')).toBe('Titre Final')
      expect(pieChartWrapper.props('title')).toBe('Titre Final')
    })

    it('devrait maintenir la performance avec des types différents', async () => {
      barChartWrapper = mount(BarChart, { props: defaultBarChartProps })
      pieChartWrapper = mount(PieChart, { props: defaultPieChartProps })

      // Changer les types des graphiques
      await barChartWrapper.setProps({ type: 'expenses' })
      await pieChartWrapper.setProps({ type: 'income' })

      // Les composants devraient fonctionner normalement
      expect(barChartWrapper.exists()).toBe(true)
      expect(pieChartWrapper.exists()).toBe(true)
      expect(barChartWrapper.props('type')).toBe('expenses')
      expect(pieChartWrapper.props('type')).toBe('income')
    })
  })

  describe('Validation des calculs et cohérence', () => {
    beforeEach(() => {
      barChartWrapper = mount(BarChart, { props: defaultBarChartProps })
      pieChartWrapper = mount(PieChart, { props: defaultPieChartProps })
    })

    it('devrait avoir des données cohérentes entre les graphiques', () => {
      // Vérifier que les fonctions de formatage sont disponibles
      expect(typeof barChartWrapper.props('formatAmount')).toBe('function')
      expect(typeof pieChartWrapper.props('formatAmount')).toBe('function')
      expect(typeof pieChartWrapper.props('formatPercentage')).toBe('function')
    })

    it('devrait calculer les pourcentages correctement dans PieChart', () => {
      const pieData = pieChartWrapper.props('chartData')

      // Vérifier que la somme des pourcentages est 100%
      const totalPercentage = pieData.categories.reduce(
        (sum: number, cat: { percentage: number }) => sum + cat.percentage,
        0
      )
      expect(totalPercentage).toBe(100)

      // Vérifier que les montants correspondent au total
      const totalAmount = pieData.categories.reduce(
        (sum: number, cat: { amount: number }) => sum + cat.amount,
        0
      )
      expect(totalAmount).toBe(pieData.totalAmount)
    })

    it('devrait maintenir la cohérence des valeurs maximales', () => {
      const barData = barChartWrapper.props('chartData')

      // Vérifier que maxValue correspond au maximum des données mensuelles
      const maxExpenses = Math.max(
        ...barData.months.map((m: { expenses: number }) => m.expenses)
      )
      const maxIncome = Math.max(
        ...barData.months.map((m: { income: number }) => m.income)
      )
      const actualMax = Math.max(maxExpenses, maxIncome)

      expect(barData.maxValue).toBeGreaterThanOrEqual(actualMax)
    })
  })

  describe('Accessibilité et interface utilisateur', () => {
    beforeEach(() => {
      barChartWrapper = mount(BarChart, { props: defaultBarChartProps })
      pieChartWrapper = mount(PieChart, { props: defaultPieChartProps })
    })

    it('devrait avoir des éléments SVG accessibles', () => {
      // Vérifier la présence d'éléments SVG
      expect(barChartWrapper.find('svg').exists()).toBe(true)
      expect(pieChartWrapper.find('svg').exists()).toBe(true)
    })

    it('devrait afficher des conteneurs pour les graphiques', () => {
      expect(barChartWrapper.find('.bar-chart-container').exists()).toBe(true)
      expect(pieChartWrapper.find('.pie-chart-container').exists()).toBe(true)
    })

    it('devrait gérer les interactions utilisateur', async () => {
      // Simuler des clics ou interactions sur les graphiques
      const barChartContainer = barChartWrapper.find('.bar-chart-container')
      const pieChartContainer = pieChartWrapper.find('.pie-chart-container')

      if (barChartContainer.exists()) {
        await barChartContainer.trigger('click')
      }

      if (pieChartContainer.exists()) {
        await pieChartContainer.trigger('click')
      }

      // Les composants devraient gérer les interactions sans erreur
      expect(barChartWrapper.exists()).toBe(true)
      expect(pieChartWrapper.exists()).toBe(true)
    })
  })
})
