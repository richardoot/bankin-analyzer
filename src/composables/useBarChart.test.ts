import { describe, it, expect, beforeEach } from 'vitest'
import { computed, ref } from 'vue'
import { useBarChart } from './useBarChart'
import { TransactionFactory, CsvAnalysisResultFactory } from '@/test/factories'
import type { CsvAnalysisResult } from '@/types'

describe('useBarChart', () => {
  let analysisResult: ReturnType<typeof ref<CsvAnalysisResult>>
  let barChart: ReturnType<typeof useBarChart>

  beforeEach(() => {
    analysisResult = ref(CsvAnalysisResultFactory.create())
    barChart = useBarChart(computed(() => analysisResult.value))
  })

  describe('Génération des données mensuelles', () => {
    it('devrait créer des données mensuelles à partir des transactions', () => {
      const transactions = [
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -100,
          type: 'expense',
        }),
        TransactionFactory.create({
          date: '20/01/2024',
          amount: -50,
          type: 'expense',
        }),
        TransactionFactory.create({
          date: '25/01/2024',
          amount: 2500,
          type: 'income',
        }),
        TransactionFactory.create({
          date: '10/02/2024',
          amount: -200,
          type: 'expense',
        }),
        TransactionFactory.create({
          date: '25/02/2024',
          amount: 2500,
          type: 'income',
        }),
      ]

      analysisResult.value = CsvAnalysisResultFactory.create({ transactions })

      const chartData = barChart.monthlyChartData.value

      expect(chartData.months).toHaveLength(2)

      // Janvier 2024
      const january = chartData.months.find(m => m.monthKey === '2024-01')
      expect(january).toBeDefined()
      expect(january?.expenses).toBe(150)
      expect(january?.income).toBe(2500)
      expect(january?.net).toBe(2350)
      expect(january?.transactionCount).toBe(3)

      // Février 2024
      const february = chartData.months.find(m => m.monthKey === '2024-02')
      expect(february).toBeDefined()
      expect(february?.expenses).toBe(200)
      expect(february?.income).toBe(2500)
      expect(february?.net).toBe(2300)
      expect(february?.transactionCount).toBe(2)
    })

    it('devrait trier les mois par ordre chronologique', () => {
      const transactions = [
        TransactionFactory.create({
          date: '15/03/2024',
          amount: -100,
          type: 'expense',
        }),
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -100,
          type: 'expense',
        }),
        TransactionFactory.create({
          date: '15/02/2024',
          amount: -100,
          type: 'expense',
        }),
      ]

      analysisResult.value = CsvAnalysisResultFactory.create({ transactions })

      const chartData = barChart.monthlyChartData.value

      expect(chartData.months[0].monthKey).toBe('2024-01')
      expect(chartData.months[1].monthKey).toBe('2024-02')
      expect(chartData.months[2].monthKey).toBe('2024-03')
    })

    it('devrait calculer correctement les totaux globaux', () => {
      const transactions = [
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -100,
          type: 'expense',
        }),
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -200,
          type: 'expense',
        }),
        TransactionFactory.create({
          date: '15/01/2024',
          amount: 3000,
          type: 'income',
        }),
        TransactionFactory.create({
          date: '15/02/2024',
          amount: -150,
          type: 'expense',
        }),
        TransactionFactory.create({
          date: '15/02/2024',
          amount: 2500,
          type: 'income',
        }),
      ]

      analysisResult.value = CsvAnalysisResultFactory.create({ transactions })

      const chartData = barChart.monthlyChartData.value

      expect(chartData.totalExpenses).toBe(450)
      expect(chartData.totalIncome).toBe(5500)
      expect(chartData.totalNet).toBe(5050)
    })

    it('devrait calculer les valeurs min/max avec une marge', () => {
      const transactions = [
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -1000,
          type: 'expense',
        }),
        TransactionFactory.create({
          date: '15/01/2024',
          amount: 3000,
          type: 'income',
        }),
      ]

      analysisResult.value = CsvAnalysisResultFactory.create({ transactions })

      const chartData = barChart.monthlyChartData.value

      // MaxValue devrait être le plus grand des 3 valeurs (dépenses, revenus, net absolu) + 10% de marge
      expect(chartData.maxValue).toBeGreaterThan(3000)
      expect(chartData.maxValue).toBeCloseTo(3300, 1) // 3000 * 1.1 = 3300, approximation pour éviter les erreurs de floating point

      // MinValue pour net négatif
      expect(chartData.minValue).toBeLessThanOrEqual(0)
    })
  })

  describe('Filtrage par catégories', () => {
    it('devrait filtrer les dépenses par catégories sélectionnées', () => {
      const transactions = [
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -100,
          type: 'expense',
          category: 'Alimentation',
        }),
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -200,
          type: 'expense',
          category: 'Transport',
        }),
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -150,
          type: 'expense',
          category: 'Loisirs',
        }),
      ]

      analysisResult.value = CsvAnalysisResultFactory.create({ transactions })

      const selectedExpenseCategories = ref(['Alimentation', 'Transport'])
      const filteredBarChart = useBarChart(
        computed(() => analysisResult.value),
        computed(() => selectedExpenseCategories.value)
      )

      const chartData = filteredBarChart.monthlyChartData.value

      // Seules les dépenses d'Alimentation et Transport doivent être incluses
      expect(chartData.months[0].expenses).toBe(300) // 100 + 200
      expect(chartData.totalExpenses).toBe(300)
    })

    it('devrait filtrer les revenus par catégories sélectionnées', () => {
      const transactions = [
        TransactionFactory.create({
          date: '15/01/2024',
          amount: 2500,
          type: 'income',
          category: 'Salaire',
        }),
        TransactionFactory.create({
          date: '15/01/2024',
          amount: 500,
          type: 'income',
          category: 'Freelance',
        }),
        TransactionFactory.create({
          date: '15/01/2024',
          amount: 100,
          type: 'income',
          category: 'Investissements',
        }),
      ]

      analysisResult.value = CsvAnalysisResultFactory.create({ transactions })

      const selectedIncomeCategories = ref(['Salaire'])
      const filteredBarChart = useBarChart(
        computed(() => analysisResult.value),
        undefined,
        computed(() => selectedIncomeCategories.value)
      )

      const chartData = filteredBarChart.monthlyChartData.value

      // Seuls les revenus de Salaire doivent être inclus
      expect(chartData.months[0].income).toBe(2500)
      expect(chartData.totalIncome).toBe(2500)
    })

    it("devrait inclure toutes les transactions quand aucun filtre n'est appliqué", () => {
      const transactions = [
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -100,
          type: 'expense',
          category: 'Alimentation',
        }),
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -200,
          type: 'expense',
          category: 'Transport',
        }),
        TransactionFactory.create({
          date: '15/01/2024',
          amount: 2500,
          type: 'income',
          category: 'Salaire',
        }),
      ]

      analysisResult.value = CsvAnalysisResultFactory.create({ transactions })

      const chartData = barChart.monthlyChartData.value

      expect(chartData.months[0].expenses).toBe(300)
      expect(chartData.months[0].income).toBe(2500)
      expect(chartData.months[0].transactionCount).toBe(3)
    })
  })

  describe('Gestion des comptes joints', () => {
    it('devrait diviser par 2 les montants des comptes joints', () => {
      const transactions = [
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -200,
          type: 'expense',
          account: 'Compte Joint',
        }),
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -100,
          type: 'expense',
          account: 'Compte Personnel',
        }),
      ]

      analysisResult.value = CsvAnalysisResultFactory.create({ transactions })

      const jointAccounts = ref(['Compte Joint'])
      const jointBarChart = useBarChart(
        computed(() => analysisResult.value),
        undefined,
        undefined,
        computed(() => jointAccounts.value)
      )

      const chartData = jointBarChart.monthlyChartData.value

      // Compte joint: 200 / 2 = 100, Compte personnel: 100
      expect(chartData.months[0].expenses).toBe(200) // 100 + 100
      expect(chartData.totalExpenses).toBe(200)
    })
  })

  describe('Gestion des cas limites', () => {
    it('devrait retourner des données vides pour un résultat invalide', () => {
      analysisResult.value = CsvAnalysisResultFactory.createInvalid()

      const chartData = barChart.monthlyChartData.value

      expect(chartData.months).toHaveLength(0)
      expect(chartData.maxValue).toBe(0)
      expect(chartData.minValue).toBe(0)
      expect(chartData.totalExpenses).toBe(0)
      expect(chartData.totalIncome).toBe(0)
      expect(chartData.totalNet).toBe(0)
    })

    it("devrait retourner des données vides quand il n'y a pas de transactions", () => {
      analysisResult.value = CsvAnalysisResultFactory.create({
        transactions: [],
      })

      const chartData = barChart.monthlyChartData.value

      expect(chartData.months).toHaveLength(0)
      expect(chartData.maxValue).toBe(0)
      expect(chartData.minValue).toBe(0)
      expect(chartData.totalExpenses).toBe(0)
      expect(chartData.totalIncome).toBe(0)
      expect(chartData.totalNet).toBe(0)
    })

    it('devrait ignorer les transactions avec des dates invalides', () => {
      const transactions = [
        TransactionFactory.create({
          date: 'invalid-date',
          amount: -100,
          type: 'expense',
        }), // Date invalide
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -200,
          type: 'expense',
        }), // Date valide
        TransactionFactory.create({ date: '', amount: -50, type: 'expense' }), // Date vide
        TransactionFactory.create({
          date: 'null',
          amount: -75,
          type: 'expense',
        }), // Date non-valide
      ]

      // Créer sans transactions par défaut pour éviter les interférences
      analysisResult.value = CsvAnalysisResultFactory.create({
        transactions,
        transactionCount: transactions.length,
        totalAmount: -425,
      })

      const chartData = barChart.monthlyChartData.value

      // Seule la transaction avec une date valide doit être incluse (les autres dates invalides sont ignorées)
      expect(chartData.months.length).toBeGreaterThanOrEqual(1)

      // Vérifier qu'il y a au moins une transaction valide
      const validMonth = chartData.months.find(m => m.monthKey === '2024-01')
      expect(validMonth).toBeDefined()
      expect(validMonth?.expenses).toBe(200)
      expect(validMonth?.transactionCount).toBe(1)
    })

    it('devrait gérer un minimum de valeur max pour éviter les graphiques trop petits', () => {
      const transactions = [
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -10,
          type: 'expense',
        }),
      ]

      analysisResult.value = CsvAnalysisResultFactory.create({ transactions })

      const chartData = barChart.monthlyChartData.value

      // La valeur max devrait être au minimum 1000 avec la marge
      expect(chartData.maxValue).toBeGreaterThanOrEqual(1000)
    })
  })

  describe('Parsing des dates', () => {
    it('devrait parser les dates au format DD/MM/YYYY', () => {
      const transactions = [
        TransactionFactory.create({
          date: '31/12/2024',
          amount: -100,
          type: 'expense',
        }),
      ]

      analysisResult.value = CsvAnalysisResultFactory.create({ transactions })

      const chartData = barChart.monthlyChartData.value

      expect(chartData.months).toHaveLength(1)
      expect(chartData.months[0].monthKey).toBe('2024-12')
      expect(chartData.months[0].year).toBe(2024)
    })

    it('devrait parser les dates au format ISO YYYY-MM-DD', () => {
      const transactions = [
        TransactionFactory.create({
          date: '2024-12-31',
          amount: -100,
          type: 'expense',
        }),
      ]

      analysisResult.value = CsvAnalysisResultFactory.create({ transactions })

      const chartData = barChart.monthlyChartData.value

      expect(chartData.months).toHaveLength(1)
      expect(chartData.months[0].monthKey).toBe('2024-12')
      expect(chartData.months[0].year).toBe(2024)
    })
  })

  describe('Fonctions utilitaires', () => {
    it('formatAmount devrait formater les montants en euros', () => {
      const formatted = barChart.formatAmount(1234.56)
      // Vérifier que le montant contient les éléments attendus
      expect(formatted).toMatch(/1.?235\s?€/)
      expect(formatted).toContain('1')
      expect(formatted).toContain('235')
      expect(formatted).toContain('€')
    })

    it('formatAmount devrait gérer les montants négatifs', () => {
      const formatted = barChart.formatAmount(-1234.56)
      // Vérifier que le montant contient les éléments attendus
      expect(formatted).toMatch(/-1.?235\s?€/)
      expect(formatted).toContain('-1')
      expect(formatted).toContain('235')
      expect(formatted).toContain('€')
    })

    it('formatMonth devrait retourner le nom du mois', () => {
      const monthData = {
        month: 'janvier 2024',
        year: 2024,
        monthKey: '2024-01',
        expenses: 0,
        income: 0,
        net: 0,
        transactionCount: 0,
      }

      const formatted = barChart.formatMonth(monthData)
      expect(formatted).toBe('janvier 2024')
    })

    it('getBarColor devrait retourner les bonnes couleurs', () => {
      expect(barChart.getBarColor('expenses')).toBe('#ef4444')
      expect(barChart.getBarColor('income')).toBe('#10b981')
      expect(barChart.getBarColor('net', 100)).toBe('#10b981')
      expect(barChart.getBarColor('net', -100)).toBe('#ef4444')
    })
  })

  describe('Réactivité', () => {
    it('devrait se mettre à jour quand analysisResult change', () => {
      // Commencer avec des données initiales
      const initialTransactions = TransactionFactory.createMultiple(3)
      analysisResult.value = CsvAnalysisResultFactory.create({
        transactions: initialTransactions,
      })

      const initialData = barChart.monthlyChartData.value
      expect(initialData.months.length).toBeGreaterThan(0)

      // Changer les données vers un état vide
      analysisResult.value = CsvAnalysisResultFactory.create({
        transactions: [],
      })

      const updatedData = barChart.monthlyChartData.value
      expect(updatedData.months).toHaveLength(0)
    })

    it('devrait se mettre à jour quand les filtres de catégories changent', () => {
      const transactions = [
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -100,
          type: 'expense',
          category: 'Alimentation',
        }),
        TransactionFactory.create({
          date: '15/01/2024',
          amount: -200,
          type: 'expense',
          category: 'Transport',
        }),
      ]

      analysisResult.value = CsvAnalysisResultFactory.create({ transactions })

      const selectedCategories = ref<string[]>([])
      const filteredBarChart = useBarChart(
        computed(() => analysisResult.value),
        computed(() => selectedCategories.value)
      )

      // Initialement, toutes les transactions
      expect(filteredBarChart.monthlyChartData.value.totalExpenses).toBe(300)

      // Filtrer par une catégorie
      selectedCategories.value = ['Alimentation']
      expect(filteredBarChart.monthlyChartData.value.totalExpenses).toBe(100)

      // Filtrer par les deux catégories
      selectedCategories.value = ['Alimentation', 'Transport']
      expect(filteredBarChart.monthlyChartData.value.totalExpenses).toBe(300)
    })
  })
})
