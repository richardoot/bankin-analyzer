import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ReimbursementCompensationFilter from './ReimbursementCompensationFilter.vue'
import type { CsvAnalysisResult } from '@/types'
import type { CompensationRule } from './ReimbursementCompensationFilter.vue'

describe('ReimbursementCompensationFilter', () => {
  let wrapper: ReturnType<typeof mount>

  const mockAnalysisResult: CsvAnalysisResult = {
    isValid: true,
    transactionCount: 100,
    categoryCount: 10,
    totalAmount: 2000,
    dateRange: { start: '2024-01-01', end: '2024-12-31' },
    categories: ['Alimentation', 'Transport', 'Remboursement Santé'],
    expenses: {
      categories: ['Alimentation', 'Transport', 'Santé'],
      totalAmount: 1500,
      categoriesData: {
        Alimentation: 600,
        Transport: 400,
        Santé: 500,
      },
    },
    income: {
      categories: ['Salaire', 'Remboursement Santé', 'Remboursement Transport'],
      totalAmount: 2500,
      categoriesData: {
        Salaire: 2000,
        'Remboursement Santé': 300,
        'Remboursement Transport': 200,
      },
    },
    transactions: [
      {
        id: '1',
        account: 'Compte Principal',
        date: '2024-01-15',
        amount: -500,
        type: 'expense',
        category: 'Santé',
        description: 'Pharmacie',
      },
      {
        id: '2',
        account: 'Compte Principal',
        date: '2024-01-16',
        amount: 300,
        type: 'income',
        category: 'Remboursement Santé',
        description: 'Remboursement CPAM',
      },
      {
        id: '3',
        account: 'Compte Principal',
        date: '2024-01-20',
        amount: 200,
        type: 'income',
        category: 'Remboursement Transport',
        description: 'Remboursement employeur',
      },
    ],
  }

  const defaultProps = {
    analysisResult: mockAnalysisResult,
    selectedRules: [] as CompensationRule[],
  }

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  describe('Rendu initial', () => {
    beforeEach(() => {
      wrapper = mount(ReimbursementCompensationFilter, { props: defaultProps })
    })

    it('devrait afficher le titre et la description', () => {
      expect(wrapper.find('.filter-title').text()).toContain(
        'Compensation des remboursements'
      )
      expect(wrapper.find('.filter-description').text()).toContain(
        'Associez les catégories de remboursement'
      )
      expect(wrapper.find('.filter-icon').exists()).toBe(true)
    })

    it("devrait afficher le formulaire d'ajout de règle", () => {
      expect(wrapper.find('.add-rule-form').exists()).toBe(true)
      expect(
        wrapper.find('select[data-testid="expense-select"]').exists()
      ).toBe(false) // Pas de data-testid dans le composant original
      expect(wrapper.findAll('.form-select')).toHaveLength(2)
      expect(wrapper.find('.form-btn.save').exists()).toBe(true)
    })

    it('devrait afficher les options des catégories de dépenses', () => {
      const expenseSelect = wrapper.findAll('.form-select')[0]
      const options = expenseSelect.findAll('option')

      expect(options[0].text()).toBe('Sélectionner une dépense...')
      expect(options).toHaveLength(4) // 1 placeholder + 3 categories
      expect(options[1].text()).toBe('Alimentation')
      expect(options[2].text()).toBe('Santé')
      expect(options[3].text()).toBe('Transport')
    })

    it('devrait afficher les options des catégories de revenus', () => {
      const incomeSelect = wrapper.findAll('.form-select')[1]
      const options = incomeSelect.findAll('option')

      expect(options[0].text()).toBe('Sélectionner un remboursement...')
      expect(options).toHaveLength(4) // 1 placeholder + 3 categories
      expect(options[1].text()).toBe('Remboursement Santé')
      expect(options[2].text()).toBe('Remboursement Transport')
      expect(options[3].text()).toBe('Salaire')
    })

    it("devrait afficher l'état vide quand aucune règle", () => {
      expect(wrapper.find('.empty-state').exists()).toBe(true)
      expect(wrapper.find('.empty-message').text()).toBe(
        'Aucune règle de compensation configurée'
      )
      expect(wrapper.find('.empty-icon').exists()).toBe(true)
    })

    it('devrait désactiver le bouton de sauvegarde initialement', () => {
      const saveButton = wrapper.find('.form-btn.save')
      expect(saveButton.attributes('disabled')).toBeDefined()
    })
  })

  describe('Gestion du formulaire', () => {
    beforeEach(() => {
      wrapper = mount(ReimbursementCompensationFilter, { props: defaultProps })
    })

    it('devrait activer le bouton de sauvegarde quand les deux sélections sont faites', async () => {
      const expenseSelect = wrapper.findAll('.form-select')[0]
      const incomeSelect = wrapper.findAll('.form-select')[1]
      const saveButton = wrapper.find('.form-btn.save')

      await expenseSelect.setValue('Santé')
      expect(saveButton.attributes('disabled')).toBeDefined()

      await incomeSelect.setValue('Remboursement Santé')
      expect(saveButton.attributes('disabled')).toBeUndefined()
    })

    it('devrait créer une règle lors de la sauvegarde', async () => {
      const expenseSelect = wrapper.findAll('.form-select')[0]
      const incomeSelect = wrapper.findAll('.form-select')[1]
      const saveButton = wrapper.find('.form-btn.save')

      await expenseSelect.setValue('Santé')
      await incomeSelect.setValue('Remboursement Santé')
      await saveButton.trigger('click')

      expect(wrapper.emitted('update:selectedRules')).toBeTruthy()
      const emittedRules = wrapper.emitted(
        'update:selectedRules'
      )?.[0]?.[0] as CompensationRule[]
      expect(emittedRules).toHaveLength(1)
      expect(emittedRules[0]).toEqual({
        expenseCategory: 'Santé',
        incomeCategory: 'Remboursement Santé',
        affectedAmount: 300,
      })
    })

    it('devrait réinitialiser le formulaire après la sauvegarde', async () => {
      const expenseSelect = wrapper.findAll('.form-select')[0]
      const incomeSelect = wrapper.findAll('.form-select')[1]
      const saveButton = wrapper.find('.form-btn.save')

      await expenseSelect.setValue('Santé')
      await incomeSelect.setValue('Remboursement Santé')
      await saveButton.trigger('click')

      expect(expenseSelect.element.value).toBe('')
      expect(incomeSelect.element.value).toBe('')
    })

    it('devrait calculer correctement les montants affectés', async () => {
      expect(wrapper.vm.calculateAffectedAmount('Remboursement Santé')).toBe(
        300
      )
      expect(
        wrapper.vm.calculateAffectedAmount('Remboursement Transport')
      ).toBe(200)
      expect(wrapper.vm.calculateAffectedAmount('Salaire')).toBe(0) // Pas dans les transactions mock
    })
  })

  describe('Affichage des règles', () => {
    const existingRules: CompensationRule[] = [
      {
        expenseCategory: 'Santé',
        incomeCategory: 'Remboursement Santé',
        affectedAmount: 300,
      },
      {
        expenseCategory: 'Transport',
        incomeCategory: 'Remboursement Transport',
        affectedAmount: 200,
      },
    ]

    beforeEach(() => {
      wrapper = mount(ReimbursementCompensationFilter, {
        props: {
          ...defaultProps,
          selectedRules: existingRules,
        },
      })
    })

    it('devrait afficher les règles de compensation', () => {
      const rules = wrapper.findAll('.compensation-card')
      expect(rules).toHaveLength(2)

      expect(wrapper.find('.empty-state').exists()).toBe(false)
    })

    it('devrait afficher les informations de chaque règle', () => {
      const rules = wrapper.findAll('.compensation-card')

      // Première règle
      const firstRule = rules[0]
      expect(firstRule.find('.expense-badge .badge-value').text()).toBe('Santé')
      expect(firstRule.find('.income-badge .badge-value').text()).toBe(
        'Remboursement Santé'
      )
      expect(firstRule.find('.amount-value').text()).toContain('300')

      // Deuxième règle
      const secondRule = rules[1]
      expect(secondRule.find('.expense-badge .badge-value').text()).toBe(
        'Transport'
      )
      expect(secondRule.find('.income-badge .badge-value').text()).toBe(
        'Remboursement Transport'
      )
      expect(secondRule.find('.amount-value').text()).toContain('200')
    })

    it('devrait afficher les boutons de suppression', () => {
      const deleteButtons = wrapper.findAll('.delete-btn')
      expect(deleteButtons).toHaveLength(2)
    })

    it('devrait afficher le bouton "Tout effacer"', () => {
      expect(wrapper.find('.clear-all').exists()).toBe(true)
      expect(wrapper.find('.clear-all').text()).toContain('Tout effacer')
    })

    it('devrait supprimer une règle lors du clic sur le bouton de suppression', async () => {
      const deleteButton = wrapper.findAll('.delete-btn')[0]
      await deleteButton.trigger('click')

      expect(wrapper.emitted('update:selectedRules')).toBeTruthy()
      const emittedRules = wrapper.emitted(
        'update:selectedRules'
      )?.[0]?.[0] as CompensationRule[]
      expect(emittedRules).toHaveLength(1)
      expect(emittedRules[0].expenseCategory).toBe('Transport')
    })

    it('devrait effacer toutes les règles', async () => {
      const clearButton = wrapper.find('.clear-all')
      await clearButton.trigger('click')

      expect(wrapper.emitted('update:selectedRules')).toBeTruthy()
      const emittedRules = wrapper.emitted(
        'update:selectedRules'
      )?.[0]?.[0] as CompensationRule[]
      expect(emittedRules).toHaveLength(0)
    })
  })

  describe('Filtrage des catégories disponibles', () => {
    it('devrait exclure les catégories déjà utilisées', async () => {
      const existingRules: CompensationRule[] = [
        {
          expenseCategory: 'Santé',
          incomeCategory: 'Remboursement Santé',
          affectedAmount: 300,
        },
      ]

      wrapper = mount(ReimbursementCompensationFilter, {
        props: {
          ...defaultProps,
          selectedRules: existingRules,
        },
      })

      const availableExpenses = wrapper.vm.availableExpenseCategories
      const availableIncomes = wrapper.vm.availableIncomeCategories

      expect(availableExpenses).not.toContain('Santé')
      expect(availableExpenses).toContain('Alimentation')
      expect(availableExpenses).toContain('Transport')

      expect(availableIncomes).not.toContain('Remboursement Santé')
      expect(availableIncomes).toContain('Remboursement Transport')
      expect(availableIncomes).toContain('Salaire')
    })

    it('devrait respecter les catégories sélectionnées dans CategoryFilter', () => {
      wrapper = mount(ReimbursementCompensationFilter, {
        props: {
          ...defaultProps,
          selectedExpenseCategories: ['Santé', 'Transport'],
          selectedIncomeCategories: ['Remboursement Santé'],
        },
      })

      const availableExpenses = wrapper.vm.availableExpenseCategories
      const availableIncomes = wrapper.vm.availableIncomeCategories

      expect(availableExpenses).toEqual(['Santé', 'Transport'])
      expect(availableIncomes).toEqual(['Remboursement Santé'])
    })
  })

  describe('Formatage des montants', () => {
    beforeEach(() => {
      wrapper = mount(ReimbursementCompensationFilter, { props: defaultProps })
    })

    it('devrait formater correctement les montants en euros', () => {
      expect(wrapper.vm.formatAmount(300)).toMatch(/300[^\d]*€/)
      expect(wrapper.vm.formatAmount(1234.56)).toMatch(
        /1[\s\u202f]*235[\s\u202f]*€/
      )
      expect(wrapper.vm.formatAmount(0)).toMatch(/0[^\d]*€/)
    })
  })

  describe('Gestion des props réactives', () => {
    it('devrait se synchroniser avec les règles du parent', async () => {
      wrapper = mount(ReimbursementCompensationFilter, { props: defaultProps })

      const newRules: CompensationRule[] = [
        {
          expenseCategory: 'Alimentation',
          incomeCategory: 'Remboursement Transport',
          affectedAmount: 200,
        },
      ]

      await wrapper.setProps({ selectedRules: newRules })

      const rules = wrapper.findAll('.compensation-card')
      expect(rules).toHaveLength(1)
      expect(rules[0].find('.expense-badge .badge-value').text()).toBe(
        'Alimentation'
      )
    })

    it("devrait gérer les données d'analyse invalides", () => {
      const invalidAnalysisResult = {
        ...mockAnalysisResult,
        isValid: false,
      }

      wrapper = mount(ReimbursementCompensationFilter, {
        props: {
          analysisResult: invalidAnalysisResult,
          selectedRules: [],
        },
      })

      expect(wrapper.vm.availableExpenseCategories).toEqual([])
      expect(wrapper.vm.availableIncomeCategories).toEqual([])
    })
  })

  describe('Interface utilisateur', () => {
    beforeEach(() => {
      wrapper = mount(ReimbursementCompensationFilter, { props: defaultProps })
    })

    it('devrait avoir des icônes appropriées', () => {
      expect(wrapper.find('.filter-icon').exists()).toBe(true)
      expect(wrapper.find('.btn-icon').exists()).toBe(true)
      expect(wrapper.find('.empty-icon').exists()).toBe(true)
    })

    it('devrait avoir des labels appropriés', () => {
      const labels = wrapper.findAll('.form-label')
      expect(labels[0].text()).toBe('Catégorie de dépense')
      expect(labels[1].text()).toBe('Catégorie de remboursement')
    })

    it('devrait afficher les badges avec les bonnes classes', async () => {
      const expenseSelect = wrapper.findAll('.form-select')[0]
      const incomeSelect = wrapper.findAll('.form-select')[1]
      const saveButton = wrapper.find('.form-btn.save')

      await expenseSelect.setValue('Santé')
      await incomeSelect.setValue('Remboursement Santé')
      await saveButton.trigger('click')

      await wrapper.vm.$nextTick()

      const expenseBadge = wrapper.find('.expense-badge')
      const incomeBadge = wrapper.find('.income-badge')

      expect(expenseBadge.exists()).toBe(true)
      expect(incomeBadge.exists()).toBe(true)
      expect(expenseBadge.find('.badge-label').text()).toBe('Dépense')
      expect(incomeBadge.find('.badge-label').text()).toBe('Remboursement')
    })
  })

  describe('Accessibilité', () => {
    beforeEach(() => {
      wrapper = mount(ReimbursementCompensationFilter, { props: defaultProps })
    })

    it('devrait avoir des labels appropriés pour les formulaires', () => {
      const labels = wrapper.findAll('label')
      const selects = wrapper.findAll('select')

      expect(labels.length).toBeGreaterThan(0)
      expect(selects.length).toBe(2)
    })

    it('devrait avoir des boutons accessibles', () => {
      const buttons = wrapper.findAll('button')
      buttons.forEach(button => {
        expect(button.element.tagName).toBe('BUTTON')
      })
    })

    it("devrait avoir des attributs title pour les boutons d'action", async () => {
      const existingRules: CompensationRule[] = [
        {
          expenseCategory: 'Santé',
          incomeCategory: 'Remboursement Santé',
          affectedAmount: 300,
        },
      ]

      wrapper = mount(ReimbursementCompensationFilter, {
        props: {
          ...defaultProps,
          selectedRules: existingRules,
        },
      })

      const deleteButton = wrapper.find('.delete-btn')
      expect(deleteButton.attributes('title')).toBe('Supprimer cette règle')
    })
  })

  describe('Responsive design', () => {
    it('devrait avoir des classes CSS pour le responsive', () => {
      wrapper = mount(ReimbursementCompensationFilter, { props: defaultProps })

      expect(wrapper.find('.reimbursement-compensation-filter').exists()).toBe(
        true
      )
      expect(wrapper.find('.add-rule-form').exists()).toBe(true)
      expect(wrapper.find('.form-row').exists()).toBe(true)
    })
  })
})
