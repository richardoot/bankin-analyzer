import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import BarChart from './BarChart.vue'
import type { BarChartData, MonthlyData } from '@/composables/useBarChart'

describe('BarChart', () => {
  let wrapper: ReturnType<typeof mount>

  const mockChartData: BarChartData = {
    months: [
      {
        month: 'janvier 2024',
        year: 2024,
        monthKey: '2024-01',
        expenses: 1200,
        income: 2500,
        net: 1300,
        transactionCount: 15,
      },
      {
        month: 'février 2024',
        year: 2024,
        monthKey: '2024-02',
        expenses: 1100,
        income: 2500,
        net: 1400,
        transactionCount: 12,
      },
      {
        month: 'mars 2024',
        year: 2024,
        monthKey: '2024-03',
        expenses: 1300,
        income: 2500,
        net: 1200,
        transactionCount: 18,
      },
    ],
    maxValue: 2750,
    minValue: 0,
    totalExpenses: 3600,
    totalIncome: 7500,
    totalNet: 3900,
  }

  const mockFormatAmount = (amount: number) => `${amount.toFixed(2)}€`

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  describe('Rendu initial', () => {
    it('devrait afficher le titre et la description', () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
        },
      })

      expect(wrapper.find('.chart-title').text()).toContain('Test Chart')
      expect(wrapper.find('.chart-description').text()).toContain('dépenses')
    })

    it('devrait afficher la description correcte selon le type', () => {
      const types = [
        { type: 'expenses', expected: 'dépenses' },
        { type: 'income', expected: 'revenus' },
        { type: 'net', expected: 'flux financiers' },
        { type: 'comparison', expected: 'flux financiers' },
      ] as const

      types.forEach(({ type, expected }) => {
        wrapper = mount(BarChart, {
          props: {
            chartData: mockChartData,
            title: 'Test',
            type,
            formatAmount: mockFormatAmount,
          },
        })

        expect(wrapper.find('.chart-description').text()).toContain(expected)
        wrapper.unmount()
      })
    })

    it('devrait afficher le SVG du graphique', () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
        },
      })

      expect(wrapper.find('.bar-chart-svg').exists()).toBe(true)
      expect(wrapper.find('.x-axis').exists()).toBe(true)
      expect(wrapper.find('.y-axis').exists()).toBe(true)
    })

    it('devrait afficher les graduations des axes', () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
        },
      })

      // Vérifier que les graduations Y existent
      const yTicks = wrapper.findAll('g[class="y-axis"] text')
      expect(yTicks.length).toBeGreaterThan(0)

      // Vérifier que les graduations X existent (une par mois)
      const xTicks = wrapper.findAll('g[class="x-axis"] text')
      expect(xTicks).toHaveLength(mockChartData.months.length)
    })
  })

  describe('Barres du graphique', () => {
    it('devrait afficher les barres de dépenses pour le type expenses', () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
        },
      })

      const expenseBars = wrapper.findAll('.expenses-bar')
      expect(expenseBars).toHaveLength(mockChartData.months.length)
    })

    it('devrait afficher les barres de revenus pour le type income', () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'income',
          formatAmount: mockFormatAmount,
        },
      })

      const incomeBars = wrapper.findAll('.income-bar')
      expect(incomeBars).toHaveLength(mockChartData.months.length)
    })

    it('devrait afficher les barres de solde net pour le type net', () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'net',
          formatAmount: mockFormatAmount,
        },
      })

      const netBars = wrapper.findAll('.net-bar')
      expect(netBars).toHaveLength(mockChartData.months.length)
    })

    it('devrait afficher les deux types de barres pour le type comparison', () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'comparison',
          formatAmount: mockFormatAmount,
        },
      })

      const expenseBars = wrapper.findAll('.expenses-bar')
      const incomeBars = wrapper.findAll('.income-bar')

      expect(expenseBars).toHaveLength(mockChartData.months.length)
      expect(incomeBars).toHaveLength(mockChartData.months.length)
    })

    it('devrait appliquer les bonnes couleurs aux barres', () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'comparison',
          formatAmount: mockFormatAmount,
        },
      })

      const expenseBars = wrapper.findAll('.expenses-bar')
      const incomeBars = wrapper.findAll('.income-bar')

      // Vérifier que les barres de dépenses ont la couleur rouge
      expect(expenseBars[0].attributes('fill')).toBe('#ef4444')

      // Vérifier que les barres de revenus ont la couleur verte
      expect(incomeBars[0].attributes('fill')).toBe('#10b981')
    })
  })

  describe('Légende', () => {
    it('devrait afficher la légende simple pour les types uniques', () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
        },
      })

      expect(wrapper.find('.legend-single').exists()).toBe(true)
      expect(wrapper.find('.legend-items').exists()).toBe(false)
      expect(wrapper.find('.legend-label').text()).toBe('Dépenses')
    })

    it('devrait afficher la légende double pour le type comparison', () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'comparison',
          formatAmount: mockFormatAmount,
        },
      })

      expect(wrapper.find('.legend-items').exists()).toBe(true)
      expect(wrapper.find('.legend-single').exists()).toBe(false)

      const legendLabels = wrapper.findAll('.legend-label')
      expect(legendLabels).toHaveLength(2)
      expect(legendLabels[0].text()).toBe('Dépenses')
      expect(legendLabels[1].text()).toBe('Revenus')
    })

    it('devrait afficher les bonnes couleurs dans la légende', () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'comparison',
          formatAmount: mockFormatAmount,
        },
      })

      const expensesColor = wrapper.find('.legend-color.expenses')
      const incomeColor = wrapper.find('.legend-color.income')

      expect(expensesColor.exists()).toBe(true)
      expect(incomeColor.exists()).toBe(true)
    })
  })

  describe('Filtre par catégorie', () => {
    it('devrait afficher le filtre quand des catégories sont disponibles', () => {
      const availableCategories = ['Alimentation', 'Transport', 'Loisirs']

      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          availableCategories,
        },
      })

      expect(wrapper.find('.category-filter-section').exists()).toBe(true)
      expect(wrapper.find('.category-select').exists()).toBe(true)
    })

    it('ne devrait pas afficher le filtre pour le type comparison', () => {
      const availableCategories = ['Alimentation', 'Transport']

      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'comparison',
          formatAmount: mockFormatAmount,
          availableCategories,
        },
      })

      expect(wrapper.find('.category-filter-section').exists()).toBe(false)
    })

    it('devrait lister toutes les catégories disponibles', () => {
      const availableCategories = ['Alimentation', 'Transport', 'Loisirs']

      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          availableCategories,
        },
      })

      const options = wrapper.findAll('.category-select option')

      // +1 pour l'option "Toutes les catégories"
      expect(options).toHaveLength(availableCategories.length + 1)
      expect(options[0].text()).toBe('Toutes les catégories')
      expect(options[1].text()).toBe('Alimentation')
      expect(options[2].text()).toBe('Transport')
      expect(options[3].text()).toBe('Loisirs')
    })

    it('devrait avoir "all" comme valeur par défaut', () => {
      const availableCategories = ['Alimentation', 'Transport']

      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          availableCategories,
        },
      })

      const select = wrapper.find('.category-select')
      expect(select.element.value).toBe('all')
    })
  })

  describe('Interactions', () => {
    it('devrait émettre monthClick lors du clic sur une barre', async () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
        },
      })

      const firstBar = wrapper.find('.expenses-bar')
      await firstBar.trigger('click')

      expect(wrapper.emitted('monthClick')).toBeTruthy()
      expect(wrapper.emitted('monthClick')?.[0]).toEqual([
        mockChartData.months[0],
        'expenses',
      ])
    })

    it("devrait émettre monthHover lors du survol d'une barre", async () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'income',
          formatAmount: mockFormatAmount,
        },
      })

      const firstBar = wrapper.find('.income-bar')
      await firstBar.trigger('mouseenter')

      expect(wrapper.emitted('monthHover')).toBeTruthy()
      expect(wrapper.emitted('monthHover')?.[0]).toEqual([
        mockChartData.months[0],
        'income',
      ])
    })

    it('devrait émettre monthHover avec null lors de mouseleave', async () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'net',
          formatAmount: mockFormatAmount,
        },
      })

      const firstBar = wrapper.find('.net-bar')
      await firstBar.trigger('mouseleave')

      expect(wrapper.emitted('monthHover')).toBeTruthy()
      expect(wrapper.emitted('monthHover')?.[0]).toEqual([null, null])
    })
  })

  describe('Tooltip', () => {
    it('ne devrait pas afficher le tooltip initialement', () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
        },
      })

      // Le tooltip ne devrait pas être visible car hoveredBar est null
      expect(wrapper.vm.hoveredBar).toBeNull()
    })

    it('devrait afficher le bon contenu pour le type expenses', async () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
        },
      })

      // Simuler le survol d'une barre
      await wrapper.vm.handleBarHover(0, 'expenses', true, {
        clientX: 100,
        clientY: 100,
      } as MouseEvent)

      await wrapper.vm.$nextTick()

      const tooltip = wrapper.find('.chart-tooltip')
      expect(tooltip.element.style.display).not.toBe('none')

      expect(wrapper.find('.tooltip-month').text()).toContain('janvier 2024')
      expect(wrapper.find('.tooltip-label.expenses').text()).toBe(
        '💸 Dépenses:'
      )
    })

    it('devrait afficher le bon contenu pour le type income', async () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'income',
          formatAmount: mockFormatAmount,
        },
      })

      await wrapper.vm.handleBarHover(0, 'income', true, {
        clientX: 100,
        clientY: 100,
      } as MouseEvent)

      await wrapper.vm.$nextTick()

      expect(wrapper.find('.tooltip-label.income').text()).toBe('💰 Revenus:')
    })

    it('devrait afficher le bon contenu pour le type net', async () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'net',
          formatAmount: mockFormatAmount,
        },
      })

      await wrapper.vm.handleBarHover(0, 'net', true, {
        clientX: 100,
        clientY: 100,
      } as MouseEvent)

      await wrapper.vm.$nextTick()

      expect(wrapper.find('.tooltip-label.net').text()).toContain('Solde:')
      expect(wrapper.find('.tooltip-label.net').text()).toContain('📈') // Positif
    })

    it('devrait afficher le bon contenu pour le type comparison', async () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'comparison',
          formatAmount: mockFormatAmount,
        },
      })

      await wrapper.vm.handleBarHover(0, 'expenses', true, {
        clientX: 100,
        clientY: 100,
      } as MouseEvent)

      await wrapper.vm.$nextTick()

      // En mode comparison, le tooltip devrait afficher dépenses ET revenus
      expect(wrapper.find('.tooltip-label.expenses').exists()).toBe(true)
      expect(wrapper.find('.tooltip-label.income').exists()).toBe(true)
    })

    it('devrait masquer le tooltip lors de mouseleave', async () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
        },
      })

      // Afficher le tooltip
      await wrapper.vm.handleBarHover(0, 'expenses', true, {
        clientX: 100,
        clientY: 100,
      } as MouseEvent)

      await wrapper.vm.$nextTick()
      expect(wrapper.vm.hoveredBar).not.toBeNull()

      // Masquer le tooltip
      await wrapper.vm.handleBarHover(0, 'expenses', false)
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.hoveredBar).toBeNull()
    })
  })

  describe('Formatage des données', () => {
    it('devrait formater correctement les montants courts', () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
        },
      })

      expect(wrapper.vm.formatShortAmount(999)).toBe('999€')
      expect(wrapper.vm.formatShortAmount(1000)).toBe('1.0k€')
      expect(wrapper.vm.formatShortAmount(15000)).toBe('15k€')
      expect(wrapper.vm.formatShortAmount(1500000)).toBe('1.5M€')
    })

    it('devrait formater correctement les mois courts', () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
        },
      })

      const monthData: MonthlyData = {
        month: 'janvier 2024',
        year: 2024,
        monthKey: '2024-01',
        expenses: 1000,
        income: 2000,
        net: 1000,
        transactionCount: 10,
      }

      const formatted = wrapper.vm.formatMonthShort(monthData)
      expect(formatted).toMatch(/jan.+24/i)
    })
  })

  describe('État vide', () => {
    it("devrait afficher le message d'état vide quand il n'y a pas de données", () => {
      const emptyChartData: BarChartData = {
        months: [],
        maxValue: 0,
        minValue: 0,
        totalExpenses: 0,
        totalIncome: 0,
        totalNet: 0,
      }

      wrapper = mount(BarChart, {
        props: {
          chartData: emptyChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
        },
      })

      expect(wrapper.find('.empty-state').exists()).toBe(true)
      expect(wrapper.find('.empty-message').text()).toBe(
        'Aucune donnée mensuelle à afficher'
      )
      expect(wrapper.find('.empty-icon').exists()).toBe(true)
    })

    it("ne devrait pas afficher l'état vide quand il y a des données", () => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
        },
      })

      expect(wrapper.find('.empty-state').exists()).toBe(false)
    })
  })

  describe('Calculs géométriques', () => {
    beforeEach(() => {
      wrapper = mount(BarChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
        },
      })
    })

    it('devrait calculer correctement les positions Y', () => {
      const maxValue = mockChartData.maxValue
      const position = wrapper.vm.getYPosition(maxValue)

      // La position Y maximale devrait être proche du padding top
      expect(position).toBeCloseTo(30, 1) // padding.top = 30
    })

    it('devrait calculer correctement les positions X', () => {
      const firstPosition = wrapper.vm.getXPosition(0)
      const secondPosition = wrapper.vm.getXPosition(1)

      // Les positions devraient être différentes et croissantes
      expect(secondPosition).toBeGreaterThan(firstPosition)
    })

    it('devrait calculer correctement les hauteurs des barres', () => {
      const maxHeight = wrapper.vm.getBarHeight(mockChartData.maxValue)
      const halfHeight = wrapper.vm.getBarHeight(mockChartData.maxValue / 2)

      // La hauteur devrait être proportionnelle à la valeur
      expect(halfHeight).toBeCloseTo(maxHeight / 2, 1)
    })

    it('devrait calculer correctement la largeur des barres', () => {
      const barWidth = wrapper.vm.barWidth

      // La largeur devrait être positive et raisonnable
      expect(barWidth).toBeGreaterThan(0)
      expect(barWidth).toBeLessThan(1000) // Pas trop large
    })
  })

  describe('Gestion des valeurs négatives (type net)', () => {
    it('devrait gérer correctement les valeurs négatives pour le solde net', () => {
      const dataWithNegativeNet: BarChartData = {
        months: [
          {
            month: 'janvier 2024',
            year: 2024,
            monthKey: '2024-01',
            expenses: 3000,
            income: 2000,
            net: -1000,
            transactionCount: 10,
          },
        ],
        maxValue: 3000,
        minValue: -1000,
        totalExpenses: 3000,
        totalIncome: 2000,
        totalNet: -1000,
      }

      wrapper = mount(BarChart, {
        props: {
          chartData: dataWithNegativeNet,
          title: 'Test Chart',
          type: 'net',
          formatAmount: mockFormatAmount,
        },
      })

      // Vérifier que la ligne zéro est affichée
      expect(wrapper.find('line[stroke-dasharray="5,5"]').exists()).toBe(true)

      // Vérifier que la barre a la bonne couleur (rouge pour négatif)
      const netBar = wrapper.find('.net-bar')
      expect(netBar.attributes('fill')).toBe('#ef4444')
    })

    it("devrait afficher l'icône négative dans le tooltip pour solde négatif", async () => {
      const dataWithNegativeNet: BarChartData = {
        months: [
          {
            month: 'janvier 2024',
            year: 2024,
            monthKey: '2024-01',
            expenses: 3000,
            income: 2000,
            net: -1000,
            transactionCount: 10,
          },
        ],
        maxValue: 3000,
        minValue: -1000,
        totalExpenses: 3000,
        totalIncome: 2000,
        totalNet: -1000,
      }

      wrapper = mount(BarChart, {
        props: {
          chartData: dataWithNegativeNet,
          title: 'Test Chart',
          type: 'net',
          formatAmount: mockFormatAmount,
        },
      })

      await wrapper.vm.handleBarHover(0, 'net', true, {
        clientX: 100,
        clientY: 100,
      } as MouseEvent)

      await wrapper.vm.$nextTick()

      expect(wrapper.find('.tooltip-label.net').text()).toContain('📉') // Négatif
    })
  })
})
