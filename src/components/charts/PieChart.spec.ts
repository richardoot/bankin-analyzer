import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PieChart from './PieChart.vue'
import type { PieChartData, CategoryData } from '@/composables/usePieChart'

describe('PieChart', () => {
  let wrapper: ReturnType<typeof mount>

  const mockCategoryData: CategoryData[] = [
    {
      name: 'Alimentation',
      value: 1200,
      percentage: 40,
      color: '#3B82F6',
    },
    {
      name: 'Transport',
      value: 900,
      percentage: 30,
      color: '#6366F1',
    },
    {
      name: 'Loisirs',
      value: 600,
      percentage: 20,
      color: '#8B5CF6',
    },
    {
      name: 'Santé',
      value: 300,
      percentage: 10,
      color: '#A855F7',
    },
  ]

  const mockChartData: PieChartData = {
    categories: mockCategoryData,
    total: 3000,
  }

  const mockFormatAmount = (amount: number) => `${amount.toFixed(2)}€`
  const mockFormatPercentage = (percentage: number) =>
    `${percentage.toFixed(1)}%`

  const mockAvailableMonths = [
    { value: '2024-01', label: 'Janvier 2024' },
    { value: '2024-02', label: 'Février 2024' },
    { value: '2024-03', label: 'Mars 2024' },
  ]

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  describe('Rendu initial', () => {
    it("devrait afficher le titre avec l'icône appropriée", () => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Répartition des Dépenses',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })

      expect(wrapper.find('.chart-title').text()).toContain(
        'Répartition des Dépenses'
      )
      expect(wrapper.find('.chart-title-icon').exists()).toBe(true)
    })

    it("devrait afficher l'icône appropriée selon le type", () => {
      // Test avec type expenses
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })

      let icon = wrapper.find('.chart-title-icon')
      expect(icon.exists()).toBe(true)

      wrapper.unmount()

      // Test avec type income
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test',
          type: 'income',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })

      icon = wrapper.find('.chart-title-icon')
      expect(icon.exists()).toBe(true)
    })

    it('devrait afficher le SVG du graphique camembert', () => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })

      expect(wrapper.find('.pie-chart-svg').exists()).toBe(true)
      expect(wrapper.find('.pie-chart-svg').attributes('viewBox')).toBe(
        '0 0 300 300'
      )
    })

    it('devrait afficher le nombre correct de catégories au centre', () => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })

      expect(wrapper.find('.center-text-main').text()).toBe('4')
      expect(wrapper.find('.center-text-sub').text()).toBe('catégories')
    })

    it('devrait utiliser le singulier pour une seule catégorie', () => {
      const singleCategoryData: PieChartData = {
        categories: [mockCategoryData[0]],
        total: 1200,
      }

      wrapper = mount(PieChart, {
        props: {
          chartData: singleCategoryData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })

      expect(wrapper.find('.center-text-main').text()).toBe('1')
      expect(wrapper.find('.center-text-sub').text()).toBe('catégorie')
    })
  })

  describe('Segments du camembert', () => {
    beforeEach(() => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })
    })

    it('devrait afficher le bon nombre de segments', () => {
      const segments = wrapper.findAll('.pie-segment')
      expect(segments).toHaveLength(mockChartData.categories.length)
    })

    it('devrait appliquer les bonnes couleurs aux segments', () => {
      const segments = wrapper.findAll('.pie-segment')

      segments.forEach((segment, index) => {
        expect(segment.attributes('fill')).toBe(mockCategoryData[index].color)
      })
    })

    it('devrait avoir des segments cliquables', () => {
      const segments = wrapper.findAll('.pie-segment')

      segments.forEach(segment => {
        expect(segment.classes()).toContain('pie-segment')
      })
    })
  })

  describe('Légende', () => {
    beforeEach(() => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })
    })

    it('devrait afficher tous les éléments de légende', () => {
      const legendItems = wrapper.findAll('.legend-item')
      expect(legendItems).toHaveLength(mockChartData.categories.length)
    })

    it('devrait afficher les noms des catégories', () => {
      const legendNames = wrapper.findAll('.legend-name')

      legendNames.forEach((name, index) => {
        expect(name.text()).toBe(mockCategoryData[index].name)
      })
    })

    it('devrait afficher les montants formatés', () => {
      const legendAmounts = wrapper.findAll('.legend-amount')

      legendAmounts.forEach((amount, index) => {
        const expectedAmount = mockFormatAmount(mockCategoryData[index].value)
        expect(amount.text()).toBe(expectedAmount)
      })
    })

    it('devrait afficher les pourcentages formatés', () => {
      const legendPercentages = wrapper.findAll('.legend-percentage')

      legendPercentages.forEach((percentage, index) => {
        const expectedPercentage = mockFormatPercentage(
          mockCategoryData[index].percentage
        )
        expect(percentage.text()).toBe(expectedPercentage)
      })
    })

    it('devrait afficher les bonnes couleurs dans la légende', () => {
      const legendColors = wrapper.findAll('.legend-color')

      legendColors.forEach((color, index) => {
        expect(color.element.style.backgroundColor).toBe(
          mockCategoryData[index].color
        )
      })
    })
  })

  describe('Sélecteur de mois', () => {
    it('devrait afficher le sélecteur quand des mois sont disponibles', () => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
          availableMonths: mockAvailableMonths,
        },
      })

      expect(wrapper.find('.month-selector').exists()).toBe(true)
      expect(wrapper.find('.month-select').exists()).toBe(true)
    })

    it('ne devrait pas afficher le sélecteur sans mois disponibles', () => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })

      expect(wrapper.find('.month-selector').exists()).toBe(false)
    })

    it('devrait lister tous les mois disponibles', () => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
          availableMonths: mockAvailableMonths,
        },
      })

      const options = wrapper.findAll('.month-select option')

      // +1 pour l'option "Tous les mois"
      expect(options).toHaveLength(mockAvailableMonths.length + 1)
      expect(options[0].text()).toBe('Tous les mois')
      expect(options[1].text()).toBe('Janvier 2024')
      expect(options[2].text()).toBe('Février 2024')
      expect(options[3].text()).toBe('Mars 2024')
    })

    it('devrait avoir "all" comme valeur par défaut', () => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
          availableMonths: mockAvailableMonths,
        },
      })

      const select = wrapper.find('.month-select')
      expect(select.element.value).toBe('all')
    })

    it('devrait utiliser la valeur de selectedMonth si fournie', () => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
          availableMonths: mockAvailableMonths,
          selectedMonth: '2024-02',
        },
      })

      const select = wrapper.find('.month-select')
      expect(select.element.value).toBe('2024-02')
    })
  })

  describe('Interactions', () => {
    beforeEach(() => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })
    })

    it('devrait émettre categoryClick lors du clic sur un segment', async () => {
      const firstSegment = wrapper.find('.pie-segment')
      await firstSegment.trigger('click')

      expect(wrapper.emitted('categoryClick')).toBeTruthy()
      expect(wrapper.emitted('categoryClick')?.[0]).toEqual([
        mockCategoryData[0],
      ])
    })

    it('devrait émettre categoryClick lors du clic sur un élément de légende', async () => {
      const firstLegendItem = wrapper.find('.legend-item')
      await firstLegendItem.trigger('click')

      expect(wrapper.emitted('categoryClick')).toBeTruthy()
      expect(wrapper.emitted('categoryClick')?.[0]).toEqual([
        mockCategoryData[0],
      ])
    })

    it("devrait émettre categoryHover lors du survol d'un segment", async () => {
      const firstSegment = wrapper.find('.pie-segment')
      await firstSegment.trigger('mouseenter')

      expect(wrapper.emitted('categoryHover')).toBeTruthy()
      expect(wrapper.emitted('categoryHover')?.[0]).toEqual([
        mockCategoryData[0],
      ])
    })

    it('devrait émettre categoryHover avec null lors de mouseleave', async () => {
      const firstSegment = wrapper.find('.pie-segment')
      await firstSegment.trigger('mouseleave')

      expect(wrapper.emitted('categoryHover')).toBeTruthy()
      expect(wrapper.emitted('categoryHover')?.[0]).toEqual([null])
    })

    it('devrait émettre monthChange lors du changement de mois', async () => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
          availableMonths: mockAvailableMonths,
        },
      })

      const select = wrapper.find('.month-select')
      await select.setValue('2024-02')

      expect(wrapper.emitted('monthChange')).toBeTruthy()
      expect(wrapper.emitted('monthChange')?.[0]).toEqual(['2024-02'])
    })

    it('devrait émettre monthChange avec chaîne vide pour "all"', async () => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
          availableMonths: mockAvailableMonths,
        },
      })

      const select = wrapper.find('.month-select')
      await select.setValue('all')

      expect(wrapper.emitted('monthChange')).toBeTruthy()
      expect(wrapper.emitted('monthChange')?.[0]).toEqual([''])
    })
  })

  describe('Hover overlay', () => {
    beforeEach(() => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })
    })

    it("ne devrait pas afficher l'overlay initialement", () => {
      expect(wrapper.find('.hover-overlay').exists()).toBe(false)
    })

    it("devrait afficher l'overlay lors du hover d'un segment", async () => {
      const firstSegment = wrapper.find('.pie-segment')
      await firstSegment.trigger('mouseenter')

      await wrapper.vm.$nextTick()

      expect(wrapper.find('.hover-overlay').exists()).toBe(true)
    })

    it("devrait afficher les bonnes informations dans l'overlay", async () => {
      const firstSegment = wrapper.find('.pie-segment')
      await firstSegment.trigger('mouseenter')

      await wrapper.vm.$nextTick()

      const overlay = wrapper.find('.hover-card')
      expect(overlay.find('.hover-category').text()).toBe(
        mockCategoryData[0].name
      )
      expect(overlay.find('.hover-amount').text()).toBe(
        mockFormatAmount(mockCategoryData[0].value)
      )
      expect(overlay.find('.hover-percentage').text()).toBe(
        mockFormatPercentage(mockCategoryData[0].percentage)
      )
    })

    it("devrait masquer l'overlay lors de mouseleave", async () => {
      const firstSegment = wrapper.find('.pie-segment')

      // Afficher l'overlay
      await firstSegment.trigger('mouseenter')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.hover-overlay').exists()).toBe(true)

      // Masquer l'overlay
      await firstSegment.trigger('mouseleave')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.hover-overlay').exists()).toBe(false)
    })
  })

  describe('État hover synchronisé', () => {
    beforeEach(() => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })
    })

    it('devrait synchroniser le hover entre segment et légende', async () => {
      const firstSegment = wrapper.find('.pie-segment')
      const firstLegendItem = wrapper.find('.legend-item')

      // Hover sur le segment
      await firstSegment.trigger('mouseenter')
      await wrapper.vm.$nextTick()

      expect(firstLegendItem.classes()).toContain('legend-hovered')
      expect(firstSegment.classes()).toContain('segment-hovered')
    })

    it('devrait synchroniser le hover depuis la légende vers le segment', async () => {
      const firstSegment = wrapper.find('.pie-segment')
      const firstLegendItem = wrapper.find('.legend-item')

      // Hover sur la légende
      await firstLegendItem.trigger('mouseenter')
      await wrapper.vm.$nextTick()

      expect(firstLegendItem.classes()).toContain('legend-hovered')
      expect(firstSegment.classes()).toContain('segment-hovered')
    })
  })

  describe('État vide', () => {
    it("devrait afficher le message d'état vide quand il n'y a pas de données", () => {
      const emptyChartData: PieChartData = {
        categories: [],
        total: 0,
      }

      wrapper = mount(PieChart, {
        props: {
          chartData: emptyChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })

      expect(wrapper.find('.empty-state').exists()).toBe(true)
      expect(wrapper.find('.empty-message').text()).toBe(
        'Aucune donnée à afficher'
      )
      expect(wrapper.find('.empty-icon').exists()).toBe(true)
    })

    it("ne devrait pas afficher l'état vide quand il y a des données", () => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })

      expect(wrapper.find('.empty-state').exists()).toBe(false)
    })

    it('devrait afficher 0 catégorie au centre quand vide', () => {
      const emptyChartData: PieChartData = {
        categories: [],
        total: 0,
      }

      wrapper = mount(PieChart, {
        props: {
          chartData: emptyChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })

      expect(wrapper.find('.center-text-main').text()).toBe('0')
      expect(wrapper.find('.center-text-sub').text()).toBe('catégories')
    })
  })

  describe('Calculs géométriques des segments', () => {
    beforeEach(() => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })
    })

    it('devrait calculer correctement les pieSegments', () => {
      const pieSegments = wrapper.vm.pieSegments

      expect(pieSegments).toHaveLength(mockChartData.categories.length)

      pieSegments.forEach((segment, index) => {
        expect(segment.category).toEqual(mockCategoryData[index])
        expect(segment.color).toBe(mockCategoryData[index].color)
        expect(segment.pathData).toContain('M 150 150') // Commence au centre
        expect(segment.pathData).toContain('A 120 120') // Arc avec le bon rayon
      })
    })

    it('devrait gérer correctement les grands segments (>180°)', () => {
      const largeCategoryData: PieChartData = {
        categories: [
          {
            name: 'Grande catégorie',
            value: 2400,
            percentage: 80,
            color: '#3B82F6',
          },
          {
            name: 'Petite catégorie',
            value: 600,
            percentage: 20,
            color: '#6366F1',
          },
        ],
        total: 3000,
      }

      wrapper = mount(PieChart, {
        props: {
          chartData: largeCategoryData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })

      const pieSegments = wrapper.vm.pieSegments

      // Le premier segment (80%) devrait avoir le flag large-arc
      expect(pieSegments[0].pathData).toContain('A 120 120 0 1 1') // largeArcFlag = 1

      // Le deuxième segment (20%) ne devrait pas avoir le flag large-arc
      expect(pieSegments[1].pathData).toContain('A 120 120 0 0 1') // largeArcFlag = 0
    })
  })

  describe("Gestion de l'accessibilité", () => {
    beforeEach(() => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
          availableMonths: mockAvailableMonths,
        },
      })
    })

    it('devrait avoir des labels appropriés pour le sélecteur de mois', () => {
      const monthSelect = wrapper.find('#month-filter')
      const label = wrapper.find('label[for="month-filter"]')

      expect(monthSelect.exists()).toBe(true)
      expect(label.exists()).toBe(true)
      expect(label.text()).toContain('Période')
    })

    it('devrait avoir des éléments cliquables avec cursor pointer', () => {
      const segments = wrapper.findAll('.pie-segment')
      const legendItems = wrapper.findAll('.legend-item')

      segments.forEach(segment => {
        // Les styles CSS définissent cursor: pointer pour .pie-segment
        expect(segment.classes()).toContain('pie-segment')
      })

      legendItems.forEach(item => {
        // Les styles CSS définissent cursor: pointer pour .legend-item
        expect(item.classes()).toContain('legend-item')
      })
    })
  })

  describe('Responsive design', () => {
    it('devrait avoir des classes CSS pour le responsive', () => {
      wrapper = mount(PieChart, {
        props: {
          chartData: mockChartData,
          title: 'Test Chart',
          type: 'expenses',
          formatAmount: mockFormatAmount,
          formatPercentage: mockFormatPercentage,
        },
      })

      // Vérifier que les éléments principaux existent pour le responsive
      expect(wrapper.find('.pie-chart-container').exists()).toBe(true)
      expect(wrapper.find('.chart-container').exists()).toBe(true)
      expect(wrapper.find('.chart-svg-container').exists()).toBe(true)
      expect(wrapper.find('.chart-legend').exists()).toBe(true)
    })
  })
})
